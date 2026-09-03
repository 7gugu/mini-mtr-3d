// src/hktime.ts
// 香港时间 (HKT, UTC+8, 无夏令时) 工具。
// 服务日定义：以 05:30 为界，凌晨 00:00-03:00 仍属于前一天的运营日（通宵尾班）。

export const HK_TZ = 'Asia/Hong_Kong';
const HK_OFFSET_MS = 8 * 3600 * 1000;

export interface HkParts {
    year: number;
    month: number; // 1-12
    day: number;   // 1-31
    hour: number;  // 0-23
    minute: number;
    second: number;
    weekday: number; // 0 = Sunday
}

const partFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: HK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false
});

const WEEKDAYS: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
};

export function getHkParts(epochMs: number = Date.now()): HkParts {
    const parts: Record<string, string> = {};
    for (const p of partFormatter.formatToParts(new Date(epochMs))) {
        if (p.type !== 'literal') parts[p.type] = p.value;
    }
    // hour 可能返回 "24" (midnight, en-US hour12:false 边界情况)
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0;
    return {
        year: parseInt(parts.year, 10),
        month: parseInt(parts.month, 10),
        day: parseInt(parts.day, 10),
        hour,
        minute: parseInt(parts.minute, 10),
        second: parseInt(parts.second, 10),
        weekday: WEEKDAYS[parts.weekday] ?? 0
    };
}

/**
 * 把香港"墙上时间"转成 Unix epoch (ms)。
 * @param year 2026
 * @param month 1-12
 * @param day 1-31 (超出月尾自动进位)
 * @param hour 0-47 (超过 24 进位到下一天)
 */
export function hkToEpoch(year: number, month: number, day: number, hour: number = 0, minute: number = 0): number {
    return Date.UTC(year, month - 1, day, hour, minute, 0) - HK_OFFSET_MS;
}

/** 解析 MTR/HKO API 的时间字符串 "yyyy-MM-dd HH:mm:ss" (香港时间) */
export function parseHkDateTime(s: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
    if (!m) return NaN;
    return Date.UTC(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)
    ) - HK_OFFSET_MS;
}

/**
 * 当前时刻所属"服务日"的起点 (当天 05:30 HKT)。
 * 凌晨 03:00 之前视为前一天的服务日。
 */
export function getServiceDayStart(now: number = Date.now()): number {
    const p = getHkParts(now);
    const dayShift = p.hour < 3 ? -1 : 0;
    return hkToEpoch(p.year, p.month, p.day + dayShift, 5, 30);
}

/** 服务日时长：05:30 -> 次日 01:30 (20 小时) */
export const SERVICE_DAY_SPAN_MS = 20 * 3600 * 1000;

/** 地图深夜配色: 18:00 (含) 至次日 06:00 (不含) */
export const MAP_NIGHT_START_MIN = 18 * 60;
export const MAP_NIGHT_END_MIN = 6 * 60;

export type MapTheme = 'day' | 'night';

export function mapThemeAt(epochMs: number): MapTheme {
    const p = getHkParts(epochMs);
    const minutes = p.hour * 60 + p.minute;
    if (minutes >= MAP_NIGHT_START_MIN || minutes < MAP_NIGHT_END_MIN) {
        return 'night';
    }
    return 'day';
}
