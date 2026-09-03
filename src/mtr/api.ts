// src/mtr/api.ts
// 港鐵實時數據 (data.gov.hk) 與 天文台天氣 (data.weather.gov.hk) 的 API 客戶端。
// 兩個端點均支持 CORS (Access-Control-Allow-Origin: *)，可由瀏覽器直接調用。
//
// Next Train API: GET https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php
//   ?type=mtr&line=TWL&sta=CEN&lang=TC
//   - 每次只能查詢一個「線+站」組合 (網關不支持 POST / 重複參數)
//   - 返回最多 4 班列車的預計到站時間 (絕對時間 time / 相對分鐘 ttnt)
//   - 線路事故信息內嵌於同一響應: status=0 + message (特別服務安排文案) + url + isdelay

import { parseHkDateTime } from '../hktime';

const MTR_SCHEDULE_URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
const HKO_WEATHER_URL = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';

// ---------------------------------------------------------------------------
// Next Train API
// ---------------------------------------------------------------------------

export interface MtrTrainEta {
    seq?: string;
    /** 目的地站碼, 標明行駛方向 (e.g. ISL 在 CEN 站: UP -> CHW) */
    dest?: string;
    plat?: string;
    /** 預計到站時間 "yyyy-MM-dd HH:mm:ss" (香港時間) */
    time?: string;
    /** 分鐘數 (相對 curr_time) */
    ttnt?: string;
    valid?: string;
    source?: string;
    /** 僅 EAL: "A"=到站 "D"=發車 */
    timetype?: string;
    /** 僅 EAL: "RAC" = 經馬場 */
    route?: string;
}

export interface MtrStationSchedule {
    curr_time?: string;
    sys_time?: string;
    UP?: MtrTrainEta[];
    DOWN?: MtrTrainEta[];
}

export interface MtrScheduleResponse {
    /** 1 = 正常, 0 = 錯誤或特別服務安排 */
    status?: number;
    /** status=0 時為警示/特別服務安排文案 */
    message?: string;
    /** 特別服務安排詳情頁 (optional) */
    url?: string;
    curr_time?: string;
    sys_time?: string;
    /** "Y" = 列車延誤 */
    isdelay?: string;
    data?: Record<string, MtrStationSchedule>;
}

export interface NormalizedArrival {
    /** 到站時刻 (epoch ms) */
    arrivalMs: number;
    dest: string;
    platform?: string;
}

export interface NormalizedStationSchedule {
    key: string; // e.g. "TWL-CEN"
    up: NormalizedArrival[];
    down: NormalizedArrival[];
}

export type MtrLang = 'EN' | 'TC';

export async function fetchMtrSchedule(line: string, sta: string, lang: MtrLang = 'TC', signal?: AbortSignal): Promise<MtrScheduleResponse> {
    const url = `${MTR_SCHEDULE_URL}?type=mtr&line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}&lang=${lang}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`MTR schedule HTTP ${res.status}`);
    return res.json();
}

/** 把 UP/DOWN 中的有效班次規整為按時間排序的到站列表 */
export function normalizeStationSchedule(key: string, raw: MtrStationSchedule | undefined): NormalizedStationSchedule {
    const toArrivals = (list: MtrTrainEta[] | undefined): NormalizedArrival[] => {
        if (!Array.isArray(list)) return [];
        const out: NormalizedArrival[] = [];
        for (const e of list) {
            if (!e || !e.time) continue;
            const arrivalMs = parseHkDateTime(e.time);
            if (!isFinite(arrivalMs)) continue;
            out.push({ arrivalMs, dest: e.dest || '', platform: e.plat });
        }
        out.sort((a, b) => a.arrivalMs - b.arrivalMs);
        return out;
    };
    return {
        key,
        up: toArrivals(raw?.UP),
        down: toArrivals(raw?.DOWN)
    };
}

// ---------------------------------------------------------------------------
// 線路事故 / 特別服務安排判定
// ---------------------------------------------------------------------------

export interface LineIncident {
    /** 事故文案 (lang 對應, TC=繁體) */
    message: string;
    /** 官方詳情鏈接 (特別服務安排時提供) */
    url?: string;
    isdelay: boolean;
    updatedAt: number;
}

const SERVICE_ENDED_RE = /(服務.{0,4}(已)?結束|service has? ended|has? completed (its )?(service|journey))/i;
const SUCCESS_RE = /(successful|正常|no special)/i;

/**
 * 從單次響應判斷線路是否有突發事件。
 * - status=0 + message: 特別服務安排/故障
 * - isdelay=Y: 列車延誤
 */
export function extractIncident(res: MtrScheduleResponse, now: number = Date.now()): LineIncident | null {
    const message = (res.message || '').trim();
    const isdelay = res.isdelay === 'Y';

    if (res.status === 0 && message && !SERVICE_ENDED_RE.test(message)) {
        return { message, url: res.url, isdelay, updatedAt: now };
    }
    if (isdelay) {
        // 有延誤但無文案: 顯示通用延誤提示
        const msg = message && !SUCCESS_RE.test(message) ? message : '列車服務延誤，請留意車站廣播';
        return { message: msg, url: res.url, isdelay, updatedAt: now };
    }
    return null;
}

// ---------------------------------------------------------------------------
// 天文台現時天氣 (rhrread)
// ---------------------------------------------------------------------------

export interface HkWeather {
    icon: number;
    tempC: number;
    humidity: number;
    warnings: string[];
    updateTime: string;
    fetchedAt: number;
}

export async function fetchHkWeather(lang: 'en' | 'tc' = 'tc', signal?: AbortSignal): Promise<HkWeather> {
    const url = `${HKO_WEATHER_URL}?dataType=rhrread&lang=${lang}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HKO weather HTTP ${res.status}`);
    const json: any = await res.json();

    const temps: any[] = json?.temperature?.data || [];
    const hkoTemp = temps.find(t => /Observatory|天文台/.test(t.place || '')) || temps[0];
    const hums: any[] = json?.humidity?.data || [];
    const hkoHum = hums[0];

    return {
        icon: Array.isArray(json?.icon) ? Number(json.icon[0]) : Number(json?.icon) || 0,
        tempC: hkoTemp ? Number(hkoTemp.value) : NaN,
        humidity: hkoHum ? Number(hkoHum.value) : NaN,
        warnings: Array.isArray(json?.warningMessage) ? json.warningMessage : [],
        updateTime: json?.updateTime || '',
        fetchedAt: Date.now()
    };
}

/** HKO 天氣圖標編號 -> emoji (近似映射) */
export function weatherIconEmoji(icon: number): string {
    if (icon === 50) return '☀️';           // 天色明朗
    if (icon === 51) return '🌤️';          // 間中有雲
    if (icon >= 52 && icon <= 54) return '⛅';  // 大致多雲/多雲/天陰
    if (icon === 60 || icon === 61) return '☁️';// 多雲
    if (icon >= 62 && icon <= 64) return '🌦️'; // 驟雨/雨
    if (icon === 65) return '🌧️';          // 大雨
    if (icon >= 70 && icon <= 74) return '🌧️'; // 陣雨/雷雨類
    if (icon >= 75 && icon <= 77) return '⛈️'; // 雷暴
    if (icon >= 80 && icon <= 85) return '🌫️'; // 霧/薄霧/煙霞
    if (icon === 90) return '☀️';          // 炎熱
    if (icon === 91) return '🥶';          // 寒冷
    if (icon === 92) return '💨';          // 大風
    return '🌤️';
}
