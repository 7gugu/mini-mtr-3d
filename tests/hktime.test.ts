import { hkToEpoch, parseHkDateTime, getServiceDayStart, getHkParts, mapThemeAt } from '../src/hktime';

describe('hktime', () => {
    describe('hkToEpoch', () => {
        it('converts HK wall clock to epoch (UTC+8)', () => {
            // 2026-09-02 05:30 HKT = 2026-09-01 21:30 UTC
            const epoch = hkToEpoch(2026, 9, 2, 5, 30);
            expect(new Date(epoch).toISOString()).toBe('2026-09-01T21:30:00.000Z');
        });

        it('rolls over month/day boundaries', () => {
            // 2026-09-02 05:30 HKT vs 2026-09-01 29:30 -> 同一时刻
            expect(hkToEpoch(2026, 9, 1, 29, 30)).toBe(hkToEpoch(2026, 9, 2, 5, 30));
        });
    });

    describe('parseHkDateTime', () => {
        it('parses API timestamp strings as HK time', () => {
            const ms = parseHkDateTime('2026-09-02 00:35:46');
            expect(new Date(ms).toISOString()).toBe('2026-09-01T16:35:46.000Z');
        });

        it('returns NaN for malformed input', () => {
            expect(isNaN(parseHkDateTime('nonsense'))).toBe(true);
        });
    });

    describe('getServiceDayStart', () => {
        it('anchors to 05:30 HKT of the same day during daytime', () => {
            const noon = hkToEpoch(2026, 9, 2, 12, 0);
            const start = getServiceDayStart(noon);
            expect(start).toBe(hkToEpoch(2026, 9, 2, 5, 30));
        });

        it('anchors to previous day before 03:00 (overnight service)', () => {
            const lateNight = hkToEpoch(2026, 9, 2, 1, 0);
            const start = getServiceDayStart(lateNight);
            expect(start).toBe(hkToEpoch(2026, 9, 1, 5, 30));
        });
    });

    describe('getHkParts', () => {
        it('returns HK wall clock parts', () => {
            const p = getHkParts(hkToEpoch(2026, 9, 2, 14, 5));
            // 2026-09-02 是星期三
            expect(p.year).toBe(2026);
            expect(p.month).toBe(9);
            expect(p.day).toBe(2);
            expect(p.hour).toBe(14);
            expect(p.minute).toBe(5);
            expect(p.weekday).toBe(3);
        });

        it('treats midnight as hour 0', () => {
            const p = getHkParts(hkToEpoch(2026, 9, 2, 0, 0));
            expect(p.hour).toBe(0);
            expect(p.day).toBe(2);
        });
    });

    describe('mapThemeAt', () => {
        it('uses light map during daytime', () => {
            expect(mapThemeAt(hkToEpoch(2026, 9, 2, 6, 0))).toBe('day');
            expect(mapThemeAt(hkToEpoch(2026, 9, 2, 12, 0))).toBe('day');
            expect(mapThemeAt(hkToEpoch(2026, 9, 2, 17, 59))).toBe('day');
        });

        it('uses dark map from 18:00 to 06:00', () => {
            expect(mapThemeAt(hkToEpoch(2026, 9, 2, 18, 0))).toBe('night');
            expect(mapThemeAt(hkToEpoch(2026, 9, 2, 22, 0))).toBe('night');
            expect(mapThemeAt(hkToEpoch(2026, 9, 3, 1, 0))).toBe('night');
            expect(mapThemeAt(hkToEpoch(2026, 9, 2, 5, 59))).toBe('night');
        });
    });
});
