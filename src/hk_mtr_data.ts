import { RailSystemData, TrackGeometry, TrainTrip, TrackPoint, LngLat } from './types/RailData';
import { hkToEpoch, getServiceDayStart } from './hktime';
import { stationCoords, stationNames } from './mtr/stations.generated';
import { trackAlignments, amapStationCoords } from './mtr/tracks.generated';

// ============================================================================
// 线路定义与运营参数
// ============================================================================

export type Direction = 'UP' | 'DOWN';

export interface BranchConfig {
    /** 每隔 branchEvery 班有 1 班走支线 (1/branchEvery) */
    branchEvery: number;
    /** 主线上从哪一站分出 */
    branchFrom: string;
    /** 支线轨道与末段走向 */
    branchTrackId: string;
    branchTo: string;
    /** 支线行程相对主线的额外时间比例 */
    extraTimeRatio?: number;
}

export interface LineMeta {
    id: string;                    // 轨道/线路标识 (track id 后缀)
    trackId: string;               // 物理轨道 id
    apiCode: string;               // data.gov.hk 的 line 参数
    nameEn: string;
    nameZh: string;
    color: string;
    stations: string[];            // 正序站键数组 (UP 方向若 upIsForward)
    upIsForward: boolean;          // API 的 UP 方向是否等于 stations 正序
    /** 首班车/末班车 (服务日 05:30 起的分钟偏移, 05:30 = 0) */
    firstTrainOffsetMin: number;
    lastTrainOffsetMin: number;
    /** 班距 (分钟)：早晚高峰 / 平日日间 / 晚间 / 深夜 */
    headways: { peak: number; normal: number; evening: number; late: number };
    speedKmph: number;
    anchorSta: string;             // 突发事件气泡锚定站
    branch?: BranchConfig;
    /** 支线轨道定义，班次由主线 branch 逻辑生成，不独立发班 */
    skipGeneration?: boolean;
}

const L = (m: LineMeta) => m;

export const lineMetas: LineMeta[] = [
    L({
        id: 'ISL', trackId: 'track_ISL', apiCode: 'ISL', nameEn: 'Island Line', nameZh: '港島綫',
        color: '#007DC5', stations: ['ISL_KET', 'ISL_HKU', 'ISL_SYP', 'ISL_SHW', 'ISL_CEN', 'ISL_ADM', 'ISL_WAC', 'ISL_CAB', 'ISL_TIH', 'ISL_FOH', 'ISL_NOP', 'ISL_QUB', 'ISL_TAK', 'ISL_SWH', 'ISL_SKW', 'ISL_HFC', 'ISL_CHW'],
        upIsForward: true, firstTrainOffsetMin: 10, lastTrainOffsetMin: 19 * 60 + 40,
        headways: { peak: 3, normal: 5, evening: 6, late: 9 }, speedKmph: 70, anchorSta: 'ISL_QUB'
    }),
    L({
        id: 'TWL', trackId: 'track_TWL', apiCode: 'TWL', nameEn: 'Tsuen Wan Line', nameZh: '荃灣綫',
        color: '#ED1D24', stations: ['TWL_CEN', 'TWL_ADM', 'TWL_TST', 'TWL_JOR', 'TWL_YMT', 'TWL_MOK', 'TWL_PRE', 'TWL_SSP', 'TWL_CSW', 'TWL_LCK', 'TWL_MEF', 'TWL_LAK', 'TWL_KWF', 'TWL_KWH', 'TWL_TWH', 'TWL_TSW'],
        upIsForward: true, firstTrainOffsetMin: 5, lastTrainOffsetMin: 19 * 60 + 45,
        headways: { peak: 3, normal: 5, evening: 6, late: 9 }, speedKmph: 70, anchorSta: 'TWL_MOK'
    }),
    L({
        id: 'KTL', trackId: 'track_KTL', apiCode: 'KTL', nameEn: 'Kwun Tong Line', nameZh: '觀塘綫',
        color: '#00AB4E', stations: ['KTL_WHA', 'KTL_HOM', 'KTL_YMT', 'KTL_MOK', 'KTL_PRE', 'KTL_SKM', 'KTL_KOT', 'KTL_LOF', 'KTL_WTS', 'KTL_DIH', 'KTL_CHH', 'KTL_KOB', 'KTL_NTK', 'KTL_KWT', 'KTL_LAT', 'KTL_YAT', 'KTL_TIK'],
        upIsForward: true, firstTrainOffsetMin: 5, lastTrainOffsetMin: 19 * 60 + 55,
        headways: { peak: 3, normal: 5, evening: 6, late: 9 }, speedKmph: 70, anchorSta: 'KTL_CHH'
    }),
    L({
        id: 'TKL', trackId: 'track_TKL', apiCode: 'TKL', nameEn: 'Tseung Kwan O Line', nameZh: '將軍澳綫',
        color: '#7D499D', stations: ['TKL_NOP', 'TKL_QUB', 'TKL_YAT', 'TKL_TIK', 'TKL_TKO', 'TKL_HAH', 'TKL_POA'],
        upIsForward: true, firstTrainOffsetMin: 30, lastTrainOffsetMin: 20 * 60 + 5,
        headways: { peak: 4, normal: 6, evening: 7, late: 10 }, speedKmph: 80, anchorSta: 'TKL_TKO',
        branch: { branchEvery: 3, branchFrom: 'TKL_TKO', branchTrackId: 'track_TKL_LHP', branchTo: 'TKL_LHP', extraTimeRatio: 0.3 }
    }),
    L({
        id: 'TKL_LHP', trackId: 'track_TKL_LHP', apiCode: 'TKL', nameEn: 'Tseung Kwan O Line (LOHAS)', nameZh: '將軍澳綫(康城)',
        color: '#7D499D', stations: ['TKL_TIK', 'TKL_TKO', 'TKL_LHP'],
        upIsForward: true, firstTrainOffsetMin: 0, lastTrainOffsetMin: 0, // 由 TKL 支线班次生成
        headways: { peak: 12, normal: 12, evening: 12, late: 12 }, speedKmph: 80, anchorSta: 'TKL_LHP',
        skipGeneration: true
    }),
    L({
        id: 'EAL', trackId: 'track_EAL', apiCode: 'EAL', nameEn: 'East Rail Line', nameZh: '東鐵綫',
        color: '#53B7E8', stations: ['EAL_ADM', 'EAL_EXC', 'EAL_HUH', 'EAL_MKK', 'EAL_KOT', 'EAL_TAW', 'EAL_SHT', 'EAL_FOT', 'EAL_RAC', 'EAL_UNI', 'EAL_TAP', 'EAL_TWO', 'EAL_FAN', 'EAL_SHS', 'EAL_LOW'],
        upIsForward: true, firstTrainOffsetMin: 5, lastTrainOffsetMin: 19 * 60 + 40,
        headways: { peak: 5, normal: 7, evening: 8, late: 12 }, speedKmph: 110, anchorSta: 'EAL_TAW',
        branch: { branchEvery: 4, branchFrom: 'EAL_SHS', branchTrackId: 'track_EAL_LMC', branchTo: 'EAL_LMC', extraTimeRatio: 0.2 }
    }),
    L({
        id: 'EAL_LMC', trackId: 'track_EAL_LMC', apiCode: 'EAL', nameEn: 'East Rail Line (LMC)', nameZh: '東鐵綫(落馬洲)',
        color: '#53B7E8', stations: ['EAL_SHS', 'EAL_LMC'],
        upIsForward: true, firstTrainOffsetMin: 0, lastTrainOffsetMin: 0,
        headways: { peak: 16, normal: 16, evening: 16, late: 16 }, speedKmph: 110, anchorSta: 'EAL_LMC',
        skipGeneration: true
    }),
    L({
        id: 'TML', trackId: 'track_TML', apiCode: 'TML', nameEn: 'Tuen Ma Line', nameZh: '屯馬綫',
        color: '#923011', stations: ['TML_WKS', 'TML_MOS', 'TML_HEO', 'TML_TSH', 'TML_SHM', 'TML_CIO', 'TML_STW', 'TML_CKT', 'TML_TAW', 'TML_HIK', 'TML_DIH', 'TML_KAT', 'TML_SUW', 'TML_TKW', 'TML_HOM', 'TML_HUH', 'TML_ETS', 'TML_AUS', 'TML_NAC', 'TML_MEF', 'TML_TWW', 'TML_KSR', 'TML_YUL', 'TML_LOP', 'TML_TIS', 'TML_SIH', 'TML_TUM'],
        upIsForward: true, firstTrainOffsetMin: 0, lastTrainOffsetMin: 19 * 60 + 40,
        headways: { peak: 5, normal: 7, evening: 8, late: 12 }, speedKmph: 100, anchorSta: 'TML_HUH'
    }),
    L({
        id: 'TCL', trackId: 'track_TCL', apiCode: 'TCL', nameEn: 'Tung Chung Line', nameZh: '東涌綫',
        color: '#F7943E', stations: ['TCL_HOK', 'TCL_KOW', 'TCL_OLY', 'TCL_NAC', 'TCL_LAK', 'TCL_TSY', 'TCL_SUN', 'TCL_TUC'],
        upIsForward: true, firstTrainOffsetMin: 25, lastTrainOffsetMin: 19 * 60 + 15,
        headways: { peak: 7, normal: 9, evening: 10, late: 12 }, speedKmph: 120, anchorSta: 'TCL_TSY'
    }),
    L({
        id: 'AEL', trackId: 'track_AEL', apiCode: 'AEL', nameEn: 'Airport Express', nameZh: '機場快綫',
        color: '#00888A', stations: ['AEL_HOK', 'AEL_KOW', 'AEL_TSY', 'AEL_AIR', 'AEL_AWE'],
        upIsForward: true, firstTrainOffsetMin: 25, lastTrainOffsetMin: 19 * 60 + 15,
        headways: { peak: 10, normal: 10, evening: 12, late: 15 }, speedKmph: 130, anchorSta: 'AEL_AIR'
    }),
    L({
        id: 'DRL', trackId: 'track_DRL', apiCode: 'DRL', nameEn: 'Disneyland Resort Line', nameZh: '迪士尼綫',
        color: '#F173AC', stations: ['DRL_SUN', 'DRL_DIS'],
        upIsForward: false, firstTrainOffsetMin: 45, lastTrainOffsetMin: 19 * 60 + 15,
        headways: { peak: 10, normal: 10, evening: 10, late: 10 }, speedKmph: 60, anchorSta: 'DRL_DIS'
    }),
    L({
        id: 'SIL', trackId: 'track_SIL', apiCode: 'SIL', nameEn: 'South Island Line', nameZh: '南港島綫',
        color: '#BAC429', stations: ['SIL_ADM', 'SIL_OCP', 'SIL_WCH', 'SIL_LET', 'SIL_SOH'],
        upIsForward: true, firstTrainOffsetMin: 30, lastTrainOffsetMin: 19 * 60 + 10,
        headways: { peak: 4, normal: 6, evening: 7, late: 10 }, speedKmph: 80, anchorSta: 'SIL_OCP'
    }),
];

// ============================================================================
// 站点数据 (WGS84, 由 scripts/fetch-mtr-stations.mjs 从 OpenStreetMap 生成):
// 仅作为高德站位缺失时的转换兜底与初始地图中心; 运行时坐标以高德站位为准。
// ============================================================================

const stationsSource: Record<string, [number, number]> = {};
for (const meta of lineMetas) {
    for (const key of meta.stations) {
        const code = key.split('_')[1];
        const coord = stationCoords[code];
        if (!coord) throw new Error(`Missing OSM coordinate for station ${key}`);
        stationsSource[key] = coord;
    }
}

// ============================================================================
// 坐标策略: 全部直接采用高德官方数据 (GCJ02) —— 轨道走线与站位坐标均来自
// AMap.LineSearch (与高德底图同源), 不做任何坐标系数学转换, 保证与底图重合。
// 仅当高德数据缺失某站时, 才退回 AMap.convertFrom 转换 OSM 的 WGS84 坐标。
// ============================================================================

async function convertCoords(AMap: any, coords: [number, number][]): Promise<[number, number][]> {
    return new Promise((resolve, reject) => {
        AMap.convertFrom(coords, 'gps', (status: string, result: any) => {
            if (status === 'complete' && result.info === 'ok') {
                const converted = result.locations.map((l: any) => [l.getLng(), l.getLat()]);
                resolve(converted);
            } else {
                reject(new Error('Coord conversion failed'));
            }
        });
    });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 单块转换, 失败自动重试; 全部失败则退回 WGS84 原坐标 (可视化仍可用) */
async function convertChunkWithRetry(AMap: any, chunk: [number, number][], retries = 3): Promise<[number, number][]> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await convertCoords(AMap, chunk);
        } catch (e) {
            lastErr = e;
            await sleep(400 * (attempt + 1)); // QPS 限流退避
        }
    }
    console.error('Coord conversion failed after retries, falling back to WGS84', lastErr);
    return chunk;
}

async function convertAllCoords(AMap: any, coords: [number, number][]): Promise<[number, number][]> {
    const CHUNK_SIZE = 40;
    const results: [number, number][] = [];
    for (let i = 0; i < coords.length; i += CHUNK_SIZE) {
        const convertedChunk = await convertChunkWithRetry(AMap, coords.slice(i, i + CHUNK_SIZE));
        results.push(...convertedChunk);
        await sleep(120); // 控制请求频率, 避免触发 QPS 限制
    }
    return results;
}

// ============================================================================
// 全天时刻表生成 (确定性: 同一服务日生成相同班次，支持任意时间点回放)
// ============================================================================

const DWELL_MS = 30 * 1000;             // 中途站停站时间
const TURNAROUND_MS = 2 * 60 * 1000;    // 反向首班相对正向首班的错峰
/** 全网统一 0 点收车: 班次最迟须于午夜 00:00 (服务日 05:30 + 18.5h) 前抵达终点 */
export const SERVICE_END_OFFSET_MIN = 18.5 * 60;

/** 两点间近似地面距离 (米) */
function approxDistance(p1: [number, number], p2: [number, number]): number {
    const dx = (p2[0] - p1[0]) * 111320 * Math.cos(((p1[1] + p2[1]) / 2) * Math.PI / 180);
    const dy = (p2[1] - p1[1]) * 110540;
    return Math.sqrt(dx * dx + dy * dy);
}

/** 服务日 05:30 起的分钟偏移 -> 班距 */
function headwayMinAt(offsetMin: number, meta: LineMeta): number {
    const minOfDay = (5 * 60 + 30 + offsetMin) % (24 * 60);
    const inRange = (from: number, to: number) => {
        const f = from * 60, t = to * 60;
        return f < t ? (minOfDay >= f && minOfDay < t) : (minOfDay >= f || minOfDay < t);
    };
    if (inRange(7, 9.5) || inRange(17.5, 19.5)) return meta.headways.peak;    // 07:00-09:30, 17:30-19:30
    if (inRange(19.5, 21.5)) return meta.headways.evening;                    // 19:30-21:30
    if (inRange(21.5, 1.5)) return meta.headways.late;                        // 21:30-01:30 深夜
    return meta.headways.normal;
}

function buildLegs(
    stations: Record<string, [number, number]>,
    chain: { trackId: string; from: string; to: string }[],
    meta: LineMeta,
    startEpoch: number
) {
    const legs: any[] = [];
    let current = startEpoch;
    for (const seg of chain) {
        const p1 = stations[seg.from];
        const p2 = stations[seg.to];
        if (!p1 || !p2) break;
        const dist = approxDistance(p1, p2);
        const speedMs = meta.speedKmph * 1000 / 3600;
        const travelMs = (dist / speedMs) * 1000 * 1.35; // 含加减速/进站余量
        legs.push({
            trackId: seg.trackId,
            fromStationId: seg.from,
            toStationId: seg.to,
            departureTime: current,
            arrivalTime: current + travelMs
        });
        current += travelMs + DWELL_MS;
    }
    return legs;
}

/**
 * 生成某线路某方向一整天的班次。
 * @param direction 'UP' = API 定义的 up 方向 (见 LineMeta.upIsForward 映射)
 */
export function generateLineTrips(
    stations: Record<string, [number, number]>,
    meta: LineMeta,
    dayStart: number,
    direction: Direction
): TrainTrip[] {
    const trips: TrainTrip[] = [];
    const forwardIsUp = meta.upIsForward;
    const goingForward = direction === 'UP' ? forwardIsUp : !forwardIsUp;

    const ordered = goingForward ? meta.stations : [...meta.stations].reverse();
    const branch = meta.branch;

    const pairs = (list: string[], trackId: string) => {
        const segs: { trackId: string; from: string; to: string }[] = [];
        for (let j = 0; j < list.length - 1; j++) {
            segs.push({ trackId, from: list[j], to: list[j + 1] });
        }
        return segs;
    };

    let offsetMin = meta.firstTrainOffsetMin;
    // UP/DOWN 起始错峰
    offsetMin += direction === 'UP' ? 0 : 1.5;
    let seq = 0;

    while (offsetMin <= meta.lastTrainOffsetMin) {
        const startEpoch = dayStart + offsetMin * 60 * 1000;
        seq++;
        const headway = headwayMinAt(offsetMin, meta);
        const isBranchTrip = !!branch && seq % branch.branchEvery === 0;

        let chain: { trackId: string; from: string; to: string }[];
        let trainId = `${meta.id}-${direction}-${String(seq).padStart(3, '0')}`;

        if (!branch || !isBranchTrip) {
            // 全程主线
            chain = pairs(ordered, meta.trackId);
        } else if (goingForward) {
            // 去程支线: 起点 ->(主线)-> 分岔点 ->(支线)-> 支线终点
            const toBranchIdx = ordered.indexOf(branch.branchFrom);
            chain = [
                ...pairs(ordered.slice(0, toBranchIdx + 1), meta.trackId),
                { trackId: branch.branchTrackId, from: branch.branchFrom, to: branch.branchTo }
            ];
            trainId = `${meta.id}-B${direction}-${String(seq).padStart(3, '0')}`;
        } else {
            // 回程支线: 支线终点 ->(支线)-> 分岔点 ->(主线)-> 主线终点
            const fromBranchIdx = ordered.indexOf(branch.branchFrom);
            chain = [
                { trackId: branch.branchTrackId, from: branch.branchTo, to: branch.branchFrom },
                ...pairs(ordered.slice(fromBranchIdx), meta.trackId)
            ];
            trainId = `${meta.id}-B${direction}-${String(seq).padStart(3, '0')}`;
        }

        const legs = buildLegs(stations, chain, meta, startEpoch);
        if (legs.length > 0) {
            // 0点收车: 午夜前无法抵达终点的班次不生成 (列车全部在 0 点前进站收车)
            if (legs[legs.length - 1].arrivalTime <= dayStart + SERVICE_END_OFFSET_MIN * 60 * 1000) {
                trips.push({ trainId, lineId: meta.id, direction, legs });
            }
        }

        offsetMin += headway;
    }

    return trips;
}

// ============================================================================
// 数据装配
// ============================================================================

/** 线路概要 (气泡锚点/图例使用)，坐标为 GCJ02 (转换后) */
export interface LineInfo {
    id: string;
    apiCode: string;
    nameEn: string;
    nameZh: string;
    color: string;
    anchor: LngLat;
}

export const lineInfoMap: Record<string, LineInfo> = {};

function midStationOf(meta: LineMeta): string {
    if (meta.stations.includes(meta.anchorSta)) return meta.anchorSta;
    return meta.stations[Math.floor(meta.stations.length / 2)];
}

export async function getHkRailData(AMap: any, dayStart: number = getServiceDayStart()): Promise<RailSystemData> {
    const stationKeys = Object.keys(stationsSource);
    // 高德站位 (GCJ02) 直接可用; 缺失站才走 convertFrom 转换 OSM 坐标
    const missingKeys = stationKeys.filter(k => !amapStationCoords[k.split('_')[1]]);
    const convertedMissing = missingKeys.length > 0
        ? await convertAllCoords(AMap, missingKeys.map(k => stationsSource[k]))
        : [];
    const fallback = Object.fromEntries(missingKeys.map((k, i) => [k, convertedMissing[i]]));

    const stations: Record<string, [number, number]> = {};
    stationKeys.forEach((key) => {
        stations[key] = amapStationCoords[key.split('_')[1]] ?? fallback[key];
    });

    const tracks: Record<string, TrackGeometry> = {};
    const trips: TrainTrip[] = [];

    // 物理轨道: 每条 track id 一份几何 (TKL_LHP / EAL_LMC 支线单独轨道)
    // 走线直接使用高德 LineSearch 的 GCJ02 path (tracks.generated.ts);
    // null 回退为站间直线。站点锚点带 name, 列车停靠与站点圆点均以其为准。
    const trackOwners = lineMetas.filter(m => m.trackId === `track_${m.id}` || m.id === 'TKL_LHP' || m.id === 'EAL_LMC');
    const seenTrackIds = new Set<string>();
    for (const meta of trackOwners) {
        if (seenTrackIds.has(meta.trackId)) continue;
        seenTrackIds.add(meta.trackId);
        let path: TrackPoint[];
        const align = trackAlignments[meta.trackId];
        if (align) {
            path = align.points.map(p => ({ location: [p[0], p[1]] as LngLat }));
            for (const [sk, idx] of Object.entries(align.anchors)) {
                if (idx >= 0 && idx < path.length) path[idx] = { ...path[idx], name: sk };
            }
        } else {
            path = meta.stations.map(sid => ({ location: stations[sid], name: sid }));
        }
        tracks[meta.trackId] = { id: meta.trackId, path, color: meta.color };
    }

    for (const meta of lineMetas) {
        if (meta.skipGeneration) {
            continue; // 支线班次由主线分支逻辑生成 (TKL_LHP/EAL_LMC)
        }
        trips.push(...generateLineTrips(stations, meta, dayStart, 'UP'));
        trips.push(...generateLineTrips(stations, meta, dayStart, 'DOWN'));

        lineInfoMap[meta.id] = {
            id: meta.id,
            apiCode: meta.apiCode,
            nameEn: meta.nameEn,
            nameZh: meta.nameZh,
            color: meta.color,
            anchor: stations[midStationOf(meta)]
        };
    }

    return { tracks, trips };
}

/** 站点显示名: 繁体中文优先，缺省退回英文/站码 */
export function stationDisplayName(stationKey: string): string {
    const code = stationKey.split('_')[1];
    const n = stationNames[code];
    return n?.zh || n?.en || code;
}

// Export initial center (WGS84)
export const initialCenterWGS84: [number, number] = stationsSource['ISL_CEN'];

// 测试/工具用途
export { stationsSource, hkToEpoch };
