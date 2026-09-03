import { generateLineTrips, lineMetas, stationsSource, LineMeta } from '../src/hk_mtr_data';
import { hkToEpoch, getServiceDayStart } from '../src/hktime';

const dayStart = getServiceDayStart(hkToEpoch(2026, 9, 2, 12, 0));

function metaById(id: string): LineMeta {
    const m = lineMetas.find(l => l.id === id);
    if (!m) throw new Error(`line ${id} not found`);
    return m;
}

describe('schedule generation', () => {
    it('is deterministic for the same service day', () => {
        const a = generateLineTrips(stationsSource, metaById('TWL'), dayStart, 'UP');
        const b = generateLineTrips(stationsSource, metaById('TWL'), dayStart, 'UP');
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('generates full-day service in both directions with line metadata', () => {
        for (const dir of ['UP', 'DOWN'] as const) {
            const trips = generateLineTrips(stationsSource, metaById('TWL'), dayStart, dir);
            expect(trips.length).toBeGreaterThan(100); // 05:30 -> 01:30, ~5min 班距
            for (const t of trips) {
                expect(t.lineId).toBe('TWL');
                expect(t.direction).toBe(dir);
                // 时间单调递增
                for (let i = 1; i < t.legs.length; i++) {
                    expect(t.legs[i].departureTime).toBeGreaterThanOrEqual(t.legs[i - 1].arrivalTime);
                    expect(t.legs[i].arrivalTime).toBeGreaterThan(t.legs[i].departureTime);
                }
            }
            // 首班不早于服务日开始
            const first = trips.reduce((m, t) => Math.min(m, t.legs[0].departureTime), Infinity);
            expect(first).toBeGreaterThanOrEqual(dayStart);
        }
    });

    it('applies peak headway smaller than late-night headway', () => {
        const trips = generateLineTrips(stationsSource, metaById('TWL'), dayStart, 'UP');
        // 找一班 08:00 左右发车 (早高峰) 与 22:00 左右发车 (深夜) 的班次间隔
        const peaks: number[] = [];
        const lates: number[] = [];
        const peakStart = dayStart + (2.5 * 60) * 60 * 1000;  // 08:00
        const lateStart = dayStart + (16.5 * 60) * 60 * 1000; // 22:00
        for (let i = 1; i < trips.length; i++) {
            const dep = trips[i].legs[0].departureTime;
            const gap = dep - trips[i - 1].legs[0].departureTime;
            if (dep >= peakStart && dep < peakStart + 60 * 60 * 1000) peaks.push(gap);
            if (dep >= lateStart && dep < lateStart + 60 * 60 * 1000) lates.push(gap);
        }
        expect(peaks.length).toBeGreaterThan(0);
        expect(lates.length).toBeGreaterThan(0);
        expect(Math.max(...peaks)).toBeLessThanOrEqual(Math.min(...lates));
    });

    it('creates branch trips for TKL heading to LOHAS Park', () => {
        const trips = generateLineTrips(stationsSource, metaById('TKL'), dayStart, 'UP');
        const branch = trips.filter(t => t.trainId.includes('-B'));
        expect(branch.length).toBeGreaterThan(0);
        // 支线班次最后一段位于支线轨道, 终点为康城
        const lastLeg = branch[0].legs[branch[0].legs.length - 1];
        expect(lastLeg.trackId).toBe('track_TKL_LHP');
        expect(lastLeg.toStationId).toBe('TKL_LHP');
        // 主线班次终点为宝琳
        const main = trips.find(t => !t.trainId.includes('-B'));
        expect(main!.legs[main!.legs.length - 1].toStationId).toBe('TKL_POA');
    });

    it('DOWN branch trips originate at the branch terminus', () => {
        const trips = generateLineTrips(stationsSource, metaById('EAL'), dayStart, 'DOWN');
        const branch = trips.filter(t => t.trainId.includes('-B'));
        expect(branch.length).toBeGreaterThan(0);
        const first = branch[0].legs[0];
        expect(first.trackId).toBe('track_EAL_LMC');
        expect(first.fromStationId).toBe('EAL_LMC');
        const last = branch[0].legs[branch[0].legs.length - 1];
        expect(last.toStationId).toBe('EAL_ADM');
    });

    it('uses the corrected MEF station code for Mei Foo', () => {
        expect(stationsSource['TWL_MEF']).toBeDefined();
        expect(stationsSource['TML_MEF']).toBeDefined();
        expect(stationsSource['TWL_MEI']).toBeUndefined();
    });

    it('stops service at midnight (0点收车)', () => {
        const midnight = dayStart + 18.5 * 60 * 60 * 1000;
        for (const meta of lineMetas) {
            if (meta.skipGeneration) continue;
            for (const dir of ['UP', 'DOWN'] as const) {
                const trips = generateLineTrips(stationsSource, meta, dayStart, dir);
                for (const t of trips) {
                    expect(t.legs[t.legs.length - 1].arrivalTime).toBeLessThanOrEqual(midnight);
                }
            }
        }
        // 末班车应贴近午夜收车, 而不是提前数小时收工
        const twl = generateLineTrips(stationsSource, metaById('TWL'), dayStart, 'UP');
        const maxArrival = Math.max(...twl.map(t => t.legs[t.legs.length - 1].arrivalTime));
        expect(maxArrival).toBeGreaterThan(midnight - 10 * 60 * 1000);
    });

    it('DRL maps API UP direction to backward travel (toward Sunny Bay)', () => {
        const drl = metaById('DRL');
        expect(drl.upIsForward).toBe(false);
        const up = generateLineTrips(stationsSource, drl, dayStart, 'UP');
        expect(up[0].legs[up[0].legs.length - 1].toStationId).toBe('DRL_SUN');
        const down = generateLineTrips(stationsSource, drl, dayStart, 'DOWN');
        expect(down[0].legs[down[0].legs.length - 1].toStationId).toBe('DRL_DIS');
    });
});
