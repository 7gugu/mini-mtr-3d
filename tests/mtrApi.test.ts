import { normalizeStationSchedule, extractIncident, weatherIconEmoji, MtrScheduleResponse } from '../src/mtr/api';
import { parseHkDateTime } from '../src/hktime';

describe('mtr api client', () => {
    describe('normalizeStationSchedule', () => {
        it('sorts arrivals and drops invalid entries', () => {
            const n = normalizeStationSchedule('TWL-CEN', {
                UP: [
                    { time: '2026-09-02 08:10:00', dest: 'TSW', seq: '2' },
                    { time: '2026-09-02 08:03:00', dest: 'TSW', seq: '1' },
                    { dest: 'TSW' }, // 缺 time
                    { time: 'bad', dest: 'TSW' } // 无法解析
                ],
                DOWN: []
            });
            expect(n.up.length).toBe(2);
            expect(n.up[0].arrivalMs).toBeLessThan(n.up[1].arrivalMs);
            expect(n.up[0].arrivalMs).toBe(parseHkDateTime('2026-09-02 08:03:00'));
            expect(n.down.length).toBe(0);
        });
    });

    describe('extractIncident', () => {
        const now = parseHkDateTime('2026-09-02 08:00:00');

        it('treats a normal response as no incident', () => {
            const res: MtrScheduleResponse = { status: 1, message: 'successful', isdelay: 'N' };
            expect(extractIncident(res, now)).toBeNull();
        });

        it('extracts special service arrangement (status=0 + message)', () => {
            const res: MtrScheduleResponse = {
                status: 0,
                message: '由於信號故障，荃灣綫列車服務需延長行車時間',
                url: 'https://www.mtr.com.hk/notice',
                isdelay: 'Y'
            };
            const inc = extractIncident(res, now);
            expect(inc).not.toBeNull();
            expect(inc!.message).toContain('信號故障');
            expect(inc!.url).toBe('https://www.mtr.com.hk/notice');
            expect(inc!.isdelay).toBe(true);
        });

        it('extracts generic delay message when only isdelay=Y', () => {
            const res: MtrScheduleResponse = { status: 1, message: 'successful', isdelay: 'Y' };
            const inc = extractIncident(res, now);
            expect(inc).not.toBeNull();
            expect(inc!.message).toContain('延誤');
        });

        it('ignores end-of-service messages', () => {
            const res: MtrScheduleResponse = { status: 0, message: 'The train service has ended for today.' };
            expect(extractIncident(res, now)).toBeNull();
        });
    });

    describe('weatherIconEmoji', () => {
        it('maps common HKO icons', () => {
            expect(weatherIconEmoji(50)).toBe('☀️');
            expect(weatherIconEmoji(54)).toBe('⛅');
            expect(weatherIconEmoji(63)).toBe('🌦️');
            expect(weatherIconEmoji(90)).toBe('☀️');
            expect(weatherIconEmoji(999)).toBe('🌤️');
        });
    });
});
