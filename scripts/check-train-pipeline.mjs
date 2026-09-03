// 离线复现列车定位流水线: 构建路径 -> 平滑 -> 按班次切片插值, 验证列车坐标有效。
// 运行: npx tsx scripts/check-train-pipeline.mjs
import * as THREE from 'three';
import { trackAlignments } from '../src/mtr/tracks.generated.ts';
import { stationCoords } from '../src/mtr/stations.generated.ts';

// 复刻 getHkRailData 的路径构建 (投影对切片逻辑无影响, 直接用 WGS84)
function buildPath(trackId) {
    const align = trackAlignments[trackId];
    if (!align) return null;
    const path = align.points.map(p => ({ location: [p[0], p[1]] }));
    for (const [sk, idx] of Object.entries(align.anchors)) {
        if (idx >= 0 && idx < path.length) path[idx] = { ...path[idx], name: sk };
    }
    return path;
}

// 复刻 main.ts 的平滑缓存构建
function smooth(coords) {
    const vec3 = coords.map(p => new THREE.Vector3(p[0], p[1], p[2] || 0));
    const curve = new THREE.CatmullRomCurve3(vec3, false, 'catmullrom', 0.5);
    const pts = curve.getPoints((coords.length - 1) * 10);
    return pts.map(v => [v.x, v.y, v.z]);
}

// 复刻 Train.update 的切片
const SEGMENTS = 10;
function slice(pathCoords, fromIdx, toIdx) {
    if (fromIdx < toIdx) return pathCoords.slice(fromIdx * SEGMENTS, toIdx * SEGMENTS + 1);
    return pathCoords.slice(toIdx * SEGMENTS, fromIdx * SEGMENTS + 1).reverse();
}

const tracks = {
    track_SIL: { stations: ['SIL_ADM', 'SIL_OCP', 'SIL_WCH', 'SIL_LET', 'SIL_SOH'] },
    track_TKL_LHP: { stations: ['TKL_TIK', 'TKL_TKO', 'TKL_LHP'] },
};
for (const [tid, def] of Object.entries(tracks)) {
    const path = buildPath(tid);
    const missing = def.stations.filter(sk => !path.some(p => p.name === sk));
    const dup = def.stations.filter(sk => path.filter(p => p.name === sk).length > 1);
    const coords = path.map(p => p.location);
    const smoothed = smooth(coords);
    console.log(`${tid}: path=${path.length} smoothed=${smoothed.length} missing=[${missing}] dup=[${dup}]`);
    // 相邻站切片
    for (let i = 0; i < def.stations.length - 1; i++) {
        const a = def.stations[i], b = def.stations[i + 1];
        const fromIdx = path.findIndex(p => p.name === a);
        const toIdx = path.findIndex(p => p.name === b);
        const seg = slice(smoothed, fromIdx, toIdx);
        const mid = seg[Math.floor(seg.length / 2)];
        console.log(`  ${a}->${b}: fromIdx=${fromIdx} toIdx=${toIdx} segLen=${seg.length} mid=[${mid ? mid.map(v => v.toFixed(1)) : 'null'}]`);
    }
}
