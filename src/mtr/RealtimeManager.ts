// src/mtr/RealtimeManager.ts
// 实时数据编排器 (只在"实时模式"下运行):
//  1. 每个轮询周期按顺序查询每条线路一个监测站的 Next Train API
//  2. 把 API 的真实到站时间与我们生成的计划时刻表逐班匹配,
//     得出每班车的时间偏移 (target), 并在 tick 中平滑过渡 (current -> target)
//  3. 从响应中提取线路突发事件 (status=0/isdelay=Y), 供气泡展示

import { TrainTrip } from '../types/RailData';
import { lineMetas, LineMeta } from '../hk_mtr_data';
import {
    fetchMtrSchedule, normalizeStationSchedule, extractIncident,
    MtrScheduleResponse, LineIncident
} from './api';

export interface MonitorDef {
    lineId: string;   // 我们系统的线路 id (告警归属)
    apiCode: string;  // API line 参数
    sta: string;      // API sta 参数 (监测站)
    stationKey: string; // 时刻表中的站键 (如 "TWL_MOK")
}

export interface RealtimeSnapshot {
    apiHealthy: boolean;
    lastPollAt: number;
    incidents: Map<string, LineIncident>; // lineId -> incident
}

interface TripArrivalIndex {
    trainId: string;
    lineId: string;
    direction: 'UP' | 'DOWN';
    /** 监测站 -> 计划到站时刻 */
    monitorArrival: number;
    /** 本班终点站码 (e.g. "POA"), 用于与 API dest 精确配对 */
    terminalSta?: string;
}

const POLL_INTERVAL_MS = 30 * 1000;
const REQUEST_GAP_MS = 220;          // 相邻请求间隔, 对开放数据友好
const MATCH_WINDOW_BEFORE_MS = 90 * 1000;
const MATCH_WINDOW_AFTER_MS = 30 * 60 * 1000;
const MAX_DELTA_MS = 10 * 60 * 1000; // 偏差超过 10 分钟视为匹配失败 (班次对不上)
const OFFSET_SNAP_THRESHOLD_MS = 15 * 1000; // 小偏差直接贴上, 避免肉眼可见滑动

export class RealtimeManager {
    private trips: TrainTrip[];
    private monitors: MonitorDef[] = [];
    /** monitorKey(`${apiCode}|${sta}`) -> `${direction}` -> 到站索引 */
    private arrivalsIndex = new Map<string, Map<'UP' | 'DOWN', TripArrivalIndex[]>>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private polling = false;
    private running = false;

    /** trainId -> 平滑中的时间偏移 */
    offsets = new Map<string, { current: number; target: number }>();
    /** lineId -> 最新事件 */
    incidents = new Map<string, LineIncident>();
    apiHealthy = true;
    lastPollAt = 0;

    onIncidentsChange?: (incidents: Map<string, LineIncident>) => void;
    onHealthChange?: (healthy: boolean) => void;

    constructor(trips: TrainTrip[]) {
        this.trips = trips;
        this.buildMonitors();
        this.buildArrivalIndex();
    }

    // -------------------------------------------------------------------------
    // 索引构建
    // -------------------------------------------------------------------------

    private buildMonitors() {
        const seenApiCodes = new Set<string>();
        for (const meta of lineMetas) {
            if (meta.skipGeneration) continue;
            if (seenApiCodes.has(meta.apiCode)) continue;
            seenApiCodes.add(meta.apiCode);
            const staKey = meta.stations.includes(meta.anchorSta)
                ? meta.anchorSta
                : meta.stations[Math.floor(meta.stations.length / 2)];
            const sta = staKey.split('_')[1];
            this.monitors.push({ lineId: meta.id, apiCode: meta.apiCode, sta, stationKey: staKey });
        }
    }

    private buildArrivalIndex() {
        for (const trip of this.trips) {
            if (!trip.lineId || !trip.direction) continue;
            for (const monitor of this.monitors) {
                if (monitor.lineId !== trip.lineId) continue;
                // 找到该班车在监测站的计划到站时刻 (取 toStationId 命中的第一段)
                let arrival: number | null = null;
                for (const leg of trip.legs) {
                    if (leg.toStationId === monitor.stationKey) { arrival = leg.arrivalTime; break; }
                }
                if (arrival === null && trip.legs[0]?.fromStationId === monitor.stationKey) {
                    arrival = trip.legs[0].departureTime; // 监测站恰为始发站
                }
                if (arrival === null) continue;

                const key = `${monitor.apiCode}|${monitor.sta}`;
                let byDir = this.arrivalsIndex.get(key);
                if (!byDir) {
                    byDir = new Map();
                    this.arrivalsIndex.set(key, byDir);
                }
                let list = byDir.get(trip.direction);
                if (!list) {
                    list = [];
                    byDir.set(trip.direction, list);
                }
                list.push({
                    trainId: trip.trainId,
                    lineId: trip.lineId,
                    direction: trip.direction,
                    monitorArrival: arrival,
                    terminalSta: trip.legs[trip.legs.length - 1]?.toStationId?.split('_')[1]
                });
            }
        }
        // 按到站时刻排序, 便于逐班匹配
        this.arrivalsIndex.forEach(byDir => {
            byDir.forEach(list => list.sort((a, b) => a.monitorArrival - b.monitorArrival));
        });
    }

    /** 编辑器改动班次后重建索引 (保留线路事件, 清空偏移) */
    rebuildTrips(trips: TrainTrip[]) {
        this.trips = trips;
        this.offsets.clear();
        this.arrivalsIndex.clear();
        this.buildArrivalIndex();
    }

    // -------------------------------------------------------------------------
    // 轮询控制
    // -------------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        void this.poll();
        this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    }

    stop() {
        this.running = false;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    /** 回放模式: 清零所有偏移, 让列车回到纯时刻表位置 */
    clearOffsets() {
        this.offsets.forEach(o => { o.target = 0; });
    }

    getOffset(trainId: string): number {
        return this.offsets.get(trainId)?.current ?? 0;
    }

    getSnapshot(): RealtimeSnapshot {
        return {
            apiHealthy: this.apiHealthy,
            lastPollAt: this.lastPollAt,
            incidents: this.incidents
        };
    }

    // -------------------------------------------------------------------------
    // 轮询与匹配
    // -------------------------------------------------------------------------

    async poll() {
        if (this.polling || !this.running) return;
        this.polling = true;
        try {
            for (const monitor of this.monitors) {
                if (!this.running) break;
                try {
                    const res = await fetchMtrSchedule(monitor.apiCode, monitor.sta);
                    if (!this.apiHealthy) { this.apiHealthy = true; this.onHealthChange?.(true); }
                    this.applyPollResult(monitor, res, Date.now());
                } catch (e) {
                    if (this.apiHealthy) { this.apiHealthy = false; this.onHealthChange?.(false); }
                    console.warn(`[MTR] schedule fetch failed for ${monitor.apiCode}-${monitor.sta}`, e);
                }
                await new Promise(r => setTimeout(r, REQUEST_GAP_MS));
            }
            this.lastPollAt = Date.now();
        } finally {
            this.polling = false;
        }
    }

    /** 单次响应 -> 偏移 + 线路事件 (公开以便单测) */
    applyPollResult(monitor: MonitorDef, res: MtrScheduleResponse, now: number) {
        // 1) 线路事件
        const incident = extractIncident(res, now);
        const prev = this.incidents.get(monitor.lineId);
        if (incident) {
            // 只有更新的信息才覆盖 (多站查询同一 API 线路时)
            if (!prev || incident.updatedAt >= prev.updatedAt || incident.message !== prev.message) {
                this.incidents.set(monitor.lineId, incident);
                this.onIncidentsChange?.(this.incidents);
            }
        } else if (prev && (res.status === 1 && res.isdelay !== 'Y')) {
            this.incidents.delete(monitor.lineId);
            this.onIncidentsChange?.(this.incidents);
        }

        // 2) 逐班偏移匹配
        const raw = res.data?.[`${monitor.apiCode}-${monitor.sta}`];
        if (!raw) return;
        const normalized = normalizeStationSchedule(`${monitor.apiCode}-${monitor.sta}`, raw);
        const byDir = this.arrivalsIndex.get(`${monitor.apiCode}|${monitor.sta}`);
        if (!byDir) return;

        const windowStart = now - MATCH_WINDOW_BEFORE_MS;
        const windowEnd = now + MATCH_WINDOW_AFTER_MS;

        for (const dir of ['UP', 'DOWN'] as const) {
            const apiArrivals = (dir === 'UP' ? normalized.up : normalized.down)
                .filter(a => a.arrivalMs >= windowStart && a.arrivalMs <= windowEnd);
            const simTrains = (byDir.get(dir) || [])
                .filter(t => t.monitorArrival >= windowStart && t.monitorArrival <= windowEnd);

            // 贪心配对: 优先按终点站 (dest) 匹配, 避免支线车对上主线班次
            const used = new Set<number>();
            for (const sim of simTrains) {
                let idx = -1;
                if (sim.terminalSta) {
                    idx = apiArrivals.findIndex((a, i) => !used.has(i) && a.dest === sim.terminalSta);
                }
                if (idx === -1) {
                    idx = apiArrivals.findIndex((a, i) => !used.has(i));
                }
                if (idx === -1) break;
                used.add(idx);
                const delta = apiArrivals[idx].arrivalMs - sim.monitorArrival;
                if (Math.abs(delta) > MAX_DELTA_MS) continue; // 班次错位, 不强行对齐
                this.setOffset(sim.trainId, delta);
            }
        }
    }

    private setOffset(trainId: string, targetMs: number) {
        const existing = this.offsets.get(trainId);
        if (!existing) {
            // 首次: 若偏差小直接贴齐, 否则渐进过渡
            this.offsets.set(trainId, {
                current: Math.abs(targetMs) <= OFFSET_SNAP_THRESHOLD_MS ? targetMs : 0,
                target: targetMs
            });
        } else {
            existing.target = targetMs;
        }
    }

    /** 每帧调用: 偏移平滑过渡 (约 6 秒收敛) */
    tick(deltaMs: number) {
        if (this.offsets.size === 0) return;
        const k = Math.min(1, deltaMs / 6000);
        this.offsets.forEach(o => {
            if (o.current !== o.target) {
                o.current += (o.target - o.current) * k;
                if (Math.abs(o.target - o.current) < 50) o.current = o.target;
            }
        });
    }
}

/** 导出监测站选择逻辑供测试 */
export function selectMonitors(metas: LineMeta[] = lineMetas): MonitorDef[] {
    const seen = new Set<string>();
    const out: MonitorDef[] = [];
    for (const meta of metas) {
        if (meta.skipGeneration) continue;
        if (seen.has(meta.apiCode)) continue;
        seen.add(meta.apiCode);
        const staKey = meta.stations.includes(meta.anchorSta)
            ? meta.anchorSta
            : meta.stations[Math.floor(meta.stations.length / 2)];
        out.push({ lineId: meta.id, apiCode: meta.apiCode, sta: staKey.split('_')[1], stationKey: staKey });
    }
    return out;
}
