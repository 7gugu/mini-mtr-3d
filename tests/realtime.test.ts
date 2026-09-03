import { RealtimeManager, selectMonitors } from '../src/mtr/RealtimeManager';
import { generateLineTrips, lineMetas, stationsSource } from '../src/hk_mtr_data';
import { parseHkDateTime, getServiceDayStart } from '../src/hktime';
import { MtrScheduleResponse } from '../src/mtr/api';

const dayStart = getServiceDayStart(parseHkDateTime('2026-09-02 08:00:00'));

function fmtHk(ms: number): string {
    const d = new Date(ms + 8 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
        `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function buildManager() {
    const twl = lineMetas.find(l => l.id === 'TWL')!;
    const trips = [
        ...generateLineTrips(stationsSource, twl, dayStart, 'UP'),
        ...generateLineTrips(stationsSource, twl, dayStart, 'DOWN')
    ];
    return { mgr: new RealtimeManager(trips), trips };
}

describe('RealtimeManager', () => {
    it('selects one monitor per API line code', () => {
        const monitors = selectMonitors();
        const codes = monitors.map(m => m.apiCode);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes).toEqual(expect.arrayContaining(['ISL', 'TWL', 'KTL', 'TKL', 'EAL', 'TML', 'TCL', 'AEL', 'DRL', 'SIL']));
    });

    it('applies schedule offset corrections from API arrivals', () => {
        const { mgr, trips } = buildManager();
        const twlMonitor = selectMonitors().find(m => m.lineId === 'TWL')!;
        expect(twlMonitor.stationKey).toBe('TWL_MOK');

        // 取一班车在监测站的计划到站时刻
        const target = trips.find(t =>
            t.direction === 'UP' &&
            t.legs.some(leg => leg.toStationId === 'TWL_MOK' && leg.arrivalTime > dayStart + 3 * 3600 * 1000)
        )!;
        const leg = target.legs.find(l => l.toStationId === 'TWL_MOK')!;
        const simArrival = leg.arrivalTime;

        // API 报告该车晚到 2 分钟
        const res: MtrScheduleResponse = {
            status: 1,
            message: 'successful',
            data: {
                'TWL-MOK': {
                    UP: [
                        { time: fmtHk(simArrival + 120000), dest: 'TSW', seq: '1', valid: 'Y' }
                    ],
                    DOWN: []
                }
            }
        };

        mgr.applyPollResult(twlMonitor, res, simArrival);
        // tick 推进偏移平滑收敛 (k = min(1, dt/6000), 10s 后到位)
        mgr.tick(10000);
        // API 时间只精确到秒, 期望值 = 截断到秒后的偏移
        const expectedDelta = parseHkDateTime(fmtHk(simArrival + 120000)) - simArrival;
        expect(mgr.getOffset(target.trainId)).toBeCloseTo(expectedDelta, 0);
    });

    it('ignores deltas beyond the max correction window', () => {
        const { mgr, trips } = buildManager();
        const twlMonitor = selectMonitors().find(m => m.lineId === 'TWL')!;
        const target = trips.find(t =>
            t.direction === 'UP' &&
            t.legs.some(leg => leg.toStationId === 'TWL_MOK' && leg.arrivalTime > dayStart + 3 * 3600 * 1000)
        )!;
        const leg = target.legs.find(l => l.toStationId === 'TWL_MOK')!;
        const simArrival = leg.arrivalTime;

        const res: MtrScheduleResponse = {
            status: 1,
            data: {
                'TWL-MOK': {
                    UP: [{ time: fmtHk(simArrival + 45 * 60 * 1000), dest: 'TSW' }], // 45 分钟 => 班次错位
                    DOWN: []
                }
            }
        };
        mgr.applyPollResult(twlMonitor, res, simArrival);
        expect(mgr.offsets.has(target.trainId)).toBe(false);
    });

    it('publishes and clears line incidents', () => {
        const { mgr } = buildManager();
        const twlMonitor = selectMonitors().find(m => m.lineId === 'TWL')!;
        const events: number[] = [];
        mgr.onIncidentsChange = () => events.push(Date.now());

        mgr.applyPollResult(twlMonitor, {
            status: 0,
            message: '由於信號故障，荃灣綫行車時間延長',
            isdelay: 'Y'
        }, Date.now());
        expect(mgr.incidents.get('TWL')?.message).toContain('信號故障');

        // 恢复正常
        mgr.applyPollResult(twlMonitor, { status: 1, message: 'successful', isdelay: 'N' }, Date.now());
        expect(mgr.incidents.has('TWL')).toBe(false);
        expect(events.length).toBe(2);
    });

    it('clearOffsets moves trains back to timetable', () => {
        const { mgr, trips } = buildManager();
        const twlMonitor = selectMonitors().find(m => m.lineId === 'TWL')!;
        const target = trips.find(t =>
            t.direction === 'UP' &&
            t.legs.some(leg => leg.toStationId === 'TWL_MOK' && leg.arrivalTime > dayStart + 3 * 3600 * 1000)
        )!;
        const leg = target.legs.find(l => l.toStationId === 'TWL_MOK')!;
        mgr.applyPollResult(twlMonitor, {
            status: 1,
            data: { 'TWL-MOK': { UP: [{ time: fmtHk(leg.arrivalTime + 8000), dest: 'TSW' }], DOWN: [] } }
        }, leg.arrivalTime);
        mgr.clearOffsets();
        // target 已清零; current 会向 0 收敛
        const off = mgr.offsets.get(target.trainId)!;
        expect(off.target).toBe(0);
        mgr.tick(10000);
        expect(mgr.getOffset(target.trainId)).toBe(0);
    });
});
