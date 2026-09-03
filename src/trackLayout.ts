// 重合走廊并排偏移: 平行且靠近的轨道在法向上排开, 避免完全叠线。

export const TRACK_LANE_SPACING = 40;
export const TRACK_OVERLAP_PROXIMITY = 100;
const PARALLEL_ABS_DOT = 0.82;
const SMOOTH_RADIUS = 5;
const MIN_OVERLAP_RUN = 3;

/** 主线+支线共用走廊, 视觉上保持单条走线 */
const SINGLE_RIBBON_FAMILIES = new Set(['EAL', 'TKL']);

export function trackLineFamily(trackId: string): string {
    const rest = trackId.replace(/^track_/, '');
    return rest.split('_')[0];
}

function isLanePartner(selfId: string, otherId: string): boolean {
    const a = trackLineFamily(selfId);
    const b = trackLineFamily(otherId);
    if (a === b) {
        return false;
    }
    if (SINGLE_RIBBON_FAMILIES.has(a) || SINGLE_RIBBON_FAMILIES.has(b)) {
        return false;
    }
    return true;
}

export interface StationClusterPoint {
    x: number;
    y: number;
    name: string;
    trackId: string;
    location: [number, number];
}

export interface StationCluster {
    code: string;
    points: StationClusterPoint[];
    cx: number;
    cy: number;
    angle: number;
    spanAlong: number;
    spanAcross: number;
    isInterchange: boolean;
}

interface IndexedPt {
    id: string;
    i: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
}

function hypot(dx: number, dy: number): number {
    return Math.sqrt(dx * dx + dy * dy);
}

function tangentAt(pts: number[][], i: number): [number, number] {
    let dx = 0;
    let dy = 0;
    if (i < pts.length - 1) {
        dx += pts[i + 1][0] - pts[i][0];
        dy += pts[i + 1][1] - pts[i][1];
    }
    if (i > 0) {
        dx += pts[i][0] - pts[i - 1][0];
        dy += pts[i][1] - pts[i - 1][1];
    }
    const len = hypot(dx, dy) || 1;
    return [dx / len, dy / len];
}

/** 世界朝向稳定的左侧法向 (偏向 +Y, 再 +X), 避免对向列车把法向翻反 */
function worldNormal(tx: number, ty: number): [number, number] {
    let nx = -ty;
    let ny = tx;
    if (ny < 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
    }
    return [nx, ny];
}

function cellKey(x: number, y: number, cell: number): string {
    return `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
}

function suppressIsolated(flags: boolean[], minRun: number): boolean[] {
    const out = flags.slice();
    let i = 0;
    while (i < flags.length) {
        if (!flags[i]) {
            i += 1;
            continue;
        }
        let j = i;
        while (j < flags.length && flags[j]) {
            j += 1;
        }
        if (j - i < minRun) {
            for (let k = i; k < j; k++) {
                out[k] = false;
            }
        }
        i = j;
    }
    return out;
}

function smoothSeries(values: number[], radius: number): number[] {
    if (values.length === 0) {
        return values;
    }
    const out = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
        let sum = 0;
        let n = 0;
        const lo = Math.max(0, i - radius);
        const hi = Math.min(values.length - 1, i + radius);
        for (let j = lo; j <= hi; j++) {
            sum += values[j];
            n += 1;
        }
        out[i] = sum / n;
    }
    return out;
}

/**
 * 将互相平行且空间接近的折线沿法向排开。
 * 点数量与下标不变, 可供列车插值继续使用。
 */
export function offsetOverlappingPolylines(
    tracks: Record<string, number[][]>,
    spacing: number = TRACK_LANE_SPACING,
    proximity: number = TRACK_OVERLAP_PROXIMITY
): Record<string, number[][]> {
    const ids = Object.keys(tracks).sort();
    const prox2 = proximity * proximity;
    const cell = proximity;
    const grid = new Map<string, IndexedPt[]>();

    const indexed: Record<string, IndexedPt[]> = {};
    for (const id of ids) {
        const pts = tracks[id];
        const list: IndexedPt[] = pts.map((p, i) => {
            const [tx, ty] = tangentAt(pts, i);
            return { id, i, x: p[0], y: p[1], tx, ty };
        });
        indexed[id] = list;
        for (const pt of list) {
            const key = cellKey(pt.x, pt.y, cell);
            let bucket = grid.get(key);
            if (!bucket) {
                bucket = [];
                grid.set(key, bucket);
            }
            bucket.push(pt);
        }
    }

    const result: Record<string, number[][]> = {};

    for (const id of ids) {
        const pts = tracks[id];
        const list = indexed[id];
        const overlap = list.map((pt) => {
            const nearby = new Set<string>();
            nearby.add(id);
            const cx0 = Math.floor(pt.x / cell);
            const cy0 = Math.floor(pt.y / cell);
            for (let gx = cx0 - 1; gx <= cx0 + 1; gx++) {
                for (let gy = cy0 - 1; gy <= cy0 + 1; gy++) {
                    const bucket = grid.get(`${gx},${gy}`);
                    if (!bucket) {
                        continue;
                    }
                    for (const other of bucket) {
                        if (other.id === id) {
                            continue;
                        }
                        if (!isLanePartner(id, other.id)) {
                            continue;
                        }
                        const dx = other.x - pt.x;
                        const dy = other.y - pt.y;
                        if (dx * dx + dy * dy > prox2) {
                            continue;
                        }
                        const align = Math.abs(pt.tx * other.tx + pt.ty * other.ty);
                        if (align < PARALLEL_ABS_DOT) {
                            continue;
                        }
                        nearby.add(other.id);
                    }
                }
            }
            return nearby;
        });

        const flags = suppressIsolated(overlap.map(s => s.size >= 2), MIN_OVERLAP_RUN);
        const dispX = new Array(pts.length).fill(0);
        const dispY = new Array(pts.length).fill(0);

        for (let i = 0; i < pts.length; i++) {
            if (!flags[i]) {
                continue;
            }
            const group = [...overlap[i]].sort();
            const rank = group.indexOf(id);
            const signed = (rank - (group.length - 1) / 2) * spacing;
            const [nx, ny] = worldNormal(list[i].tx, list[i].ty);
            dispX[i] = nx * signed;
            dispY[i] = ny * signed;
        }

        const smX = smoothSeries(dispX, SMOOTH_RADIUS);
        const smY = smoothSeries(dispY, SMOOTH_RADIUS);
        result[id] = pts.map((p, i) => [p[0] + smX[i], p[1] + smY[i]]);
    }

    return result;
}

function principalFrame(points: StationClusterPoint[]): {
    cx: number;
    cy: number;
    angle: number;
    spanAlong: number;
    spanAcross: number;
} {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const p of points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        xx += dx * dx;
        xy += dx * dy;
        yy += dy * dy;
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy || 1e-9);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    let minAcross = Infinity;
    let maxAcross = -Infinity;
    for (const p of points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const along = dx * c + dy * s;
        const across = -dx * s + dy * c;
        if (along < minAlong) minAlong = along;
        if (along > maxAlong) maxAlong = along;
        if (across < minAcross) minAcross = across;
        if (across > maxAcross) maxAcross = across;
    }
    return {
        cx,
        cy,
        angle,
        spanAlong: Math.max(0, maxAlong - minAlong),
        spanAcross: Math.max(0, maxAcross - minAcross),
    };
}

export function clusterStations(
    tracks: Record<string, { path: { location: [number, number]; name?: string }[] }>,
    offsetCoords: Record<string, number[][]>
): StationCluster[] {
    const byCode = new Map<string, StationClusterPoint[]>();
    for (const [trackId, track] of Object.entries(tracks)) {
        const coords = offsetCoords[trackId];
        if (!coords) {
            continue;
        }
        track.path.forEach((p, idx) => {
            if (!p.name || !coords[idx]) {
                return;
            }
            const code = p.name.split('_')[1] || p.name;
            const list = byCode.get(code) || [];
            list.push({
                x: coords[idx][0],
                y: coords[idx][1],
                name: p.name,
                trackId,
                location: p.location,
            });
            byCode.set(code, list);
        });
    }

    const clusters: StationCluster[] = [];
    byCode.forEach((points, code) => {
        const frame = principalFrame(points);
        const lineIds = new Set(points.map(p => p.name.split('_')[0]));
        clusters.push({
            code,
            points,
            ...frame,
            isInterchange: lineIds.size >= 2,
        });
    });
    return clusters;
}

/** 换乘椭圆黑边粗度: 与普通站 RingGeometry(38→56) 可见外缘 (~8) 两侧合计一致 */
export const STATION_BORDER_WIDTH = 16;

export function interchangeCapsuleSize(cluster: StationCluster): { length: number; width: number } {
    const width = Math.max(64, cluster.spanAcross + 52);
    const length = Math.max(width + 8, cluster.spanAlong + 56);
    return { length, width };
}
