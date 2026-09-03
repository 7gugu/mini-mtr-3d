// [已废弃] 本脚本曾从 OpenStreetMap (Overpass API) 抓取港铁轨道走向 (WGS84)。
// 现已改用 scripts/fetch-amap-lines.mjs: 直接采用高德官方线路数据 (GCJ02, 与底图同源),
// 保证走线/站点与高德底图完全重合。本脚本保留仅供参考; 如需重跑请改跑 fetch-amap-lines.mjs
// (前置: 用浏览器打开 scripts/amap-dump.html 抓取 .cache-amap-lines.json)。

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const UA = 'mini-greater-bay-area-3d/1.0 (track alignment sync)';
const BBOX = '22.13,113.82,22.58,114.45';

// --- 站点坐标 (读自 stations.generated.ts) ---
const { readFileSync, writeFileSync } = await import('node:fs');
const stationTs = readFileSync(new URL('../src/mtr/stations.generated.ts', import.meta.url), 'utf8');
const stationCoords = JSON.parse(stationTs.match(/stationCoords[^=]*= (\{[\s\S]*?\n\});/)[1]);

// --- 各轨道的有序站点 (与 hk_mtr_data.ts lineMetas 一致) ---
const TRACKS = {
    track_ISL: { api: 'ISL', match: /(^|\b)(mtr\s+)?island\s+line\b/i, stations: ['ISL_KET','ISL_HKU','ISL_SYP','ISL_SHW','ISL_CEN','ISL_ADM','ISL_WAC','ISL_CAB','ISL_TIH','ISL_FOH','ISL_NOP','ISL_QUB','ISL_TAK','ISL_SWH','ISL_SKW','ISL_HFC','ISL_CHW'] },
    track_TWL: { api: 'TWL', match: /tsuen\s*wan\s*line/i, stations: ['TWL_CEN','TWL_ADM','TWL_TST','TWL_JOR','TWL_YMT','TWL_MOK','TWL_PRE','TWL_SSP','TWL_CSW','TWL_LCK','TWL_MEF','TWL_LAK','TWL_KWF','TWL_KWH','TWL_TWH','TWL_TSW'] },
    track_KTL: { api: 'KTL', match: /kwun\s*tong\s*line/i, stations: ['KTL_WHA','KTL_HOM','KTL_YMT','KTL_MOK','KTL_PRE','KTL_SKM','KTL_KOT','KTL_LOF','KTL_WTS','KTL_DIH','KTL_CHH','KTL_KOB','KTL_NTK','KTL_KWT','KTL_LAT','KTL_YAT','KTL_TIK'] },
    track_TKL: { api: 'TKL', match: /tseung\s*kwan\s*o/i, stations: ['TKL_NOP','TKL_QUB','TKL_YAT','TKL_TIK','TKL_TKO','TKL_HAH','TKL_POA'] },
    track_TKL_LHP: { api: 'TKL', match: /tseung\s*kwan\s*o/i, stations: ['TKL_TIK','TKL_TKO','TKL_LHP'] },
    track_EAL: { api: 'EAL', match: /east\s*rail/i, stations: ['EAL_ADM','EAL_EXC','EAL_HUH','EAL_MKK','EAL_KOT','EAL_TAW','EAL_SHT','EAL_FOT','EAL_RAC','EAL_UNI','EAL_TAP','EAL_TWO','EAL_FAN','EAL_SHS','EAL_LOW'] },
    track_EAL_LMC: { api: 'EAL', match: /east\s*rail/i, stations: ['EAL_SHS','EAL_LMC'] },
    track_TML: { api: 'TML', match: /tuen\s*ma/i, stations: ['TML_WKS','TML_MOS','TML_HEO','TML_TSH','TML_SHM','TML_CIO','TML_STW','TML_CKT','TML_TAW','TML_HIK','TML_DIH','TML_KAT','TML_SUW','TML_TKW','TML_HOM','TML_HUH','TML_ETS','TML_AUS','TML_NAC','TML_MEF','TML_TWW','TML_KSR','TML_YUL','TML_LOP','TML_TIS','TML_SIH','TML_TUM'] },
    track_TCL: { api: 'TCL', match: /tung\s*chung/i, stations: ['TCL_HOK','TCL_KOW','TCL_OLY','TCL_NAC','TCL_LAK','TCL_TSY','TCL_SUN','TCL_TUC'] },
    track_AEL: { api: 'AEL', match: /airport\s*express/i, stations: ['AEL_HOK','AEL_KOW','AEL_TSY','AEL_AIR','AEL_AWE'] },
    track_DRL: { api: 'DRL', match: /disneyland/i, stations: ['DRL_SUN','DRL_DIS'] },
    track_SIL: { api: 'SIL', match: /south\s*island/i, stations: ['SIL_ADM','SIL_OCP','SIL_WCH','SIL_LET','SIL_SOH'] },
};

// --- 人工修正: OSM 缺失详细几何的隧道段走廊 (WGS84) ---
// SIL 金鐘→海洋公园过山段: OSM 仅有粗略直线 (1.9-2.6km 单段), 真实线位经
// 灣仔峽/中峽/班納山/黃泥涌峽 (SIL 施工竖井位于黃泥涌峽警队博物馆旁)。
const TUNNEL_FIXES = {
    track_SIL: [
        // 北行: 金鐘端缺口 → 寶雲道東/INTEROCEAN COURT 西 → 警队博物馆北 → 海洋公园端缺口
        [[114.16337, 22.27329], [114.1655, 22.2715], [114.1680, 22.2695], [114.1715, 22.2680],
         [114.1755, 22.2658], [114.1790, 22.2628], [114.1805, 22.2598],
         [114.1800, 22.2568], [114.1798, 22.2530], [114.17654, 22.25332]],
        // 南行: 同走廊, 接另一端缺口
        [[114.16331, 22.27326], [114.1655, 22.2715], [114.1680, 22.2695], [114.1715, 22.2680],
         [114.1755, 22.2658], [114.1790, 22.2628], [114.1805, 22.2598],
         [114.1800, 22.2568], [114.1798, 22.2530], [114.1755, 22.2558], [114.1732, 22.25826]],
    ],
};

// --- 抓取 route relations + 带名的独立轨道 way (隧道等常未入 relation) ---
const query = `
[out:json][timeout:180];
(
  rel["route"="subway"]["network"~"港鐵|MTR"](${BBOX});
  rel["route"="train"]["operator"~"港鐵|MTR"](${BBOX});
  way["railway"~"^(subway|rail)$"]["name"](${BBOX});
);
out geom;`;

const CACHE = new URL('../.cache-overpass-mtr.json', import.meta.url);
const { existsSync } = await import('node:fs');

let json;
if (existsSync(CACHE) && !process.env.REFRESH) {
    json = JSON.parse(readFileSync(CACHE, 'utf8'));
    console.error(`relations from cache: ${json.elements.length}`);
} else {
    let lastErr;
    for (let attempt = 1; attempt <= 8; attempt++) {
        const OVERPASS = OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length];
        try {
            console.error(`attempt ${attempt} via ${new URL(OVERPASS).host} ...`);
            const res = await fetch(OVERPASS, {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }
            });
            if (!res.ok) { console.error(await res.text()); throw new Error(`Overpass HTTP ${res.status}`); }
            json = await res.json(); // 解析失败(截断)会抛错, 不写入缓存
            break;
        } catch (e) {
            lastErr = e;
            console.error(`attempt ${attempt} failed: ${e.message}`);
            await new Promise(r => setTimeout(r, 5000 * attempt));
        }
    }
    if (!json) throw lastErr;
    writeFileSync(CACHE, JSON.stringify(json));
}
const rels = (json.elements || []).filter(e => e.type === 'relation');
// 带名的独立轨道 way (隧道等), 按线名并入对应线路图
const standaloneWays = (json.elements || []).filter(e => e.type === 'way' && (e.tags?.name || e.tags?.['name:en']));
console.error(`relations fetched: ${rels.length}, standalone named ways: ${standaloneWays.length}`);

// --- 几何工具 ---
const R = 6371000;
function dist(a, b) {
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const la = a[1] * Math.PI / 180, lb = b[1] * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const key = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

function buildGraph(edgeSources) {
    const adj = new Map();   // nodeKey -> [{to, len, a:[lon,lat], b:[lon,lat]}]
    const nodeCoord = new Map();
    const relNodes = new Set(); // relation 来源节点: 车站锚点只允许落在这里
    const addEdge = (a, b, costScale = 1, isRel = false) => {
        const ka = key(a[1], a[0]), kb = key(b[1], b[0]);
        nodeCoord.set(ka, a); nodeCoord.set(kb, b);
        if (isRel) { relNodes.add(ka); relNodes.add(kb); }
        const len = dist(a, b);
        if (len <= 0) return;
        // 超长段 (>500m) 多为 OSM 粗略直线隧道, 加 2x 成本让真实细节走线优先
        // (倍率不能过高: 有些站间唯一的连通边就是长直线段)
        const longPenalty = len > 500 ? 2 : 1;
        if (!adj.has(ka)) adj.set(ka, []);
        if (!adj.has(kb)) adj.set(kb, []);
        adj.get(ka).push({ to: kb, len: len * costScale * longPenalty, a, b });
        adj.get(kb).push({ to: ka, len: len * costScale * longPenalty, a: b, b: a });
    };
    const wayEnds = [];
    for (const src of edgeSources) {
        if (src.type === 'relation') {
            for (const m of src.members || []) {
                if (m.type !== 'way' || !m.geometry) continue;
                const pts = m.geometry.filter(g => g && g.lat != null).map(g => [g.lon, g.lat]);
                for (let i = 0; i < pts.length - 1; i++) addEdge(pts[i], pts[i + 1], 1, true);
                if (pts.length) { wayEnds.push(pts[0], pts[pts.length - 1]); }
            }
        } else if (src.type === 'way') {
            const pts = (src.geometry || []).filter(g => g && g.lat != null).map(g => [g.lon, g.lat]);
            for (let i = 0; i < pts.length - 1; i++) addEdge(pts[i], pts[i + 1]);
            if (pts.length) { wayEnds.push(pts[0], pts[pts.length - 1]); }
        }
    }
    // 顶点空间索引 (~40m 网格), 供近距桥接与端点接驳查询
    {
        const CELL2 = 0.00036; // ~40m
        const grid = new Map();
        for (const [k, c] of nodeCoord) {
            const ck = `${Math.floor(c[0] / CELL2)},${Math.floor(c[1] / CELL2)}`;
            if (!grid.has(ck)) grid.set(ck, []);
            grid.get(ck).push([k, c]);
        }
        // 桥接 1: 不同顶点 40m 内互连 (成本 x2) —— 平行/穿过的轨道处处无缝衔接
        for (const [k, c] of nodeCoord) {
            const cx = Math.floor(c[0] / CELL2), cy = Math.floor(c[1] / CELL2);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                const bucket = grid.get(`${cx + dx},${cy + dy}`);
                if (!bucket) continue;
                for (const [k2, c2] of bucket) {
                    if (k2 <= k) continue;
                    if (dist(c, c2) <= 40) addEdge(c, c2, 2);
                }
            }
        }
        // 桥接 2: 每个 way 端点连到 500m 内最近的轨道顶点 (成本 x2), 弥合数据缺口 (如隧道端口)
        const CELL5 = 0.0045; // ~500m
        const grid5 = new Map();
        for (const [k, c] of nodeCoord) {
            const ck = `${Math.floor(c[0] / CELL5)},${Math.floor(c[1] / CELL5)}`;
            if (!grid5.has(ck)) grid5.set(ck, []);
            grid5.get(ck).push([k, c]);
        }
        for (const e of wayEnds) {
            const cx = Math.floor(e[0] / CELL5), cy = Math.floor(e[1] / CELL5);
            let best = null;
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                const bucket = grid5.get(`${cx + dx},${cy + dy}`);
                if (!bucket) continue;
                for (const [k2, c2] of bucket) {
                    const d = dist(e, c2);
                    if (d > 0.5 && d <= 500 && (!best || d < best.d)) best = { d, c: c2 };
                }
            }
            if (best) addEdge(e, best.c, 2);
        }
    }
    return { adj, nodeCoord, relNodes };
}

function dijkstraMulti(graph, fromKeys, toKeySet) {
    const distMap = new Map();
    const prev = new Map();
    const visited = new Set();
    const pq = [];
    for (const k of fromKeys) { distMap.set(k, 0); pq.push([0, k]); }
    let endKey = null;
    while (pq.length) {
        pq.sort((x, y) => x[0] - y[0]);
        const [d, u] = pq.shift();
        if (visited.has(u)) continue;
        visited.add(u);
        // 终点不能是起点候选 (站距近时候选集会重叠, 否则返回空路径)
        if (toKeySet.has(u) && !fromKeys.includes(u)) { endKey = u; break; }
        for (const e of graph.adj.get(u) || []) {
            const nd = d + e.len;
            if (nd < (distMap.get(e.to) ?? Infinity)) {
                distMap.set(e.to, nd);
                prev.set(e.to, { from: u, edge: e });
                pq.push([nd, e.to]);
            }
        }
    }
    if (endKey === null) return null;
    const path = [];
    let cur = endKey;
    while (distMap.get(cur) !== 0 || !fromKeys.includes(cur)) {
        const p = prev.get(cur);
        if (!p) return null;
        path.push(p.edge);
        cur = p.from;
        if (path.length > 100000) return null;
    }
    path.reverse();
    const pts = [];
    for (const e of path) {
        if (pts.length === 0) pts.push(e.a);
        pts.push(e.b);
    }
    return { pts, length: distMap.get(endKey) };
}

// --- 逐轨道生成对齐折线 ---
const CAND_MAX = 12;
function largestComponent(graph) {
    const seen = new Set();
    let best = null, bestN = 0;
    for (const k of graph.nodeCoord.keys()) {
        if (seen.has(k)) continue;
        const comp = new Set([k]);
        seen.add(k);
        const st = [k];
        while (st.length) {
            const u = st.pop();
            for (const e of graph.adj.get(u) || []) {
                if (!comp.has(e.to)) { comp.add(e.to); seen.add(e.to); st.push(e.to); }
            }
        }
        if (comp.size > bestN) { bestN = comp.size; best = comp; }
    }
    return best;
}
function candidates(graph, comp, lonlat, maxM = 600, relNodes = null) {
    const arr = [];
    for (const [k, c] of graph.nodeCoord) {
        if (comp && !comp.has(k)) continue; // 只锚定主连通分量, 避免车厂/支线抢锚点
        if (relNodes && !relNodes.has(k)) continue; // 优先权威路线 (relation) 节点
        const d = dist(lonlat, c);
        if (d <= maxM) arr.push({ k, d });
    }
    arr.sort((a, b) => a.d - b.d);
    return arr.slice(0, CAND_MAX).map(x => x.k);
}

const out = {};
for (const [trackId, def] of Object.entries(TRACKS)) {
    const relList = rels.filter(r => {
        const t = r.tags || {};
        const en = t['name:en'] || t.name || '';
        return def.match.test(en);
    });
    // 正线顶点空间索引 (网格 ~250m): 供独立 way 邻近性判断
    const CELL = 0.011; // ~1.2km: 深隧道中段离粗略直线可远达 1km, 不能卡太紧 (锚点已限定 relation 节点, 无需担心杂线)
    const relCells = new Set();
    for (const rel of relList) {
        for (const m of rel.members || []) {
            if (m.type !== 'way' || !m.geometry) continue;
            for (const g of m.geometry) {
                if (!g || g.lat == null) continue;
                relCells.add(`${Math.floor(g.lon / CELL)},${Math.floor(g.lat / CELL)}`);
            }
        }
    }
    const nearRelationVertex = (lon, lat) => {
        const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            if (relCells.has(`${cx + dx},${cy + dy}`)) return true;
        }
        return false;
    };
    // 带名独立轨道 way (隧道细节常不在 relation 里) 同名并入;
    // 邻近性过滤: 只保留紧贴正线 (250m 内) 的 way, 避免车厂/侧线把寻路带偏
    const extraWays = standaloneWays.filter(w => {
        const t = w.tags || {};
        const en = t['name:en'] || t.name || '';
        if (!def.match.test(en)) return false;
        // 排除车厂/侧线: 它们常比正线更靠近站坐标, 会抢走锚点导致绕远
        if (['siding', 'yard', 'spur'].includes(t.service)) return false;
        const pts = (w.geometry || []).filter(g => g && g.lat != null);
        return pts.some(g => nearRelationVertex(g.lon, g.lat));
    });
    // 隧道修正走廊 → 合成 way (每段 <500m, 不触发长边惩罚, 成本低于 OSM 粗略直线)
    const fixWays = (TUNNEL_FIXES[trackId] || []).map(pts => ({
        type: 'way',
        geometry: pts.map(p => ({ lon: p[0], lat: p[1] })),
    }));
    if (relList.length === 0 && extraWays.length === 0 && fixWays.length === 0) { console.error(`${trackId}: no relation matched`); out[trackId] = null; continue; }
    const graph = buildGraph([...relList, ...extraWays, ...fixWays]);
    const mainComp = largestComponent(graph);

    let ok = true;
    const align = [];
    const anchorIdx = {};
    let prevCands = null, prevCoord = null;
    for (let si = 0; si < def.stations.length; si++) {
        const sk = def.stations[si];
        const coord = stationCoords[sk.split('_')[1]]; // 站键为 `${line}_${code}`, 坐标表按裸站码索引
        if (!coord) { console.error(`${trackId}: ${sk} missing in stationCoords`); ok = false; break; }
        let cands = candidates(graph, mainComp, coord, 600, graph.relNodes);
        if (cands.length === 0) cands = candidates(graph, mainComp, coord); // 兜底
        if (cands.length === 0) { console.error(`${trackId}: ${sk} no node within 600m`); ok = false; break; }
        if (prevCands === null) {
            align.push(graph.nodeCoord.get(cands[0]));
            anchorIdx[sk] = 0;
        } else {
            const seg = dijkstraMulti(graph, prevCands, new Set(cands));
            if (!seg || seg.length > dist(coord, prevCoord) * 3 + 2000) {
                console.error(`${trackId}: path ${sk} failed (len=${seg ? Math.round(seg.length) : 'n/a'}m)`);
                ok = false; break;
            }
            // 追加 (去重首点)
            for (const p of seg.pts) {
                const last = align[align.length - 1];
                if (!last || dist(last, p) > 3) align.push(p);
            }
            // 校验整体单调: 站点投影应落在折线末段附近
            const lastPt = align[align.length - 1];
            if (dist(lastPt, coord) > 600) { console.error(`${trackId}: ${sk} endpoint off by ${Math.round(dist(lastPt, coord))}m`); ok = false; break; }
            anchorIdx[sk] = align.length - 1;
        }
        prevCands = cands; prevCoord = coord;
    }
    if (!ok) { out[trackId] = null; continue; }

    // 方向校正: 站点锚点应递增
    const firstIdx = anchorIdx[def.stations[0]];
    const lastIdx = anchorIdx[def.stations[def.stations.length - 1]];
    if (firstIdx > lastIdx) {
        align.reverse();
        for (const sk of def.stations) anchorIdx[sk] = align.length - 1 - anchorIdx[sk];
    }

    // --- 站点贴合: 把每站锚点精确投影到折线上 (单调递增), 保证站点圆点严格落线 ---
    {
        const projections = [];
        let startSeg = 0;
        for (const sk of def.stations) {
            const coord = stationCoords[sk.split('_')[1]];
            let best = null;
            for (let i = startSeg; i < align.length - 1; i++) {
                const a = align[i], b = align[i + 1];
                const abx = b[0] - a[0], aby = b[1] - a[1];
                const ab2 = abx * abx + aby * aby;
                const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, ((coord[0] - a[0]) * abx + (coord[1] - a[1]) * aby) / ab2));
                const d = dist(coord, [a[0] + abx * t, a[1] + aby * t]);
                if (!best || d < best.d) best = { i, t, d };
            }
            const lastD = dist(coord, align[align.length - 1]);
            if (lastD < best.d) best = { i: align.length - 2, t: 1, d: lastD };
            projections.push({ sk, ...best });
            startSeg = best.i; // 单调约束: 后一站只能投影在更靠后的段上
        }
        // 重建折线: 命名锚点 = 投影点 (t≈0/1 时直接命名既有顶点)
        const outPts = [];
        const newAnchors = {};
        let vi = 0;               // 下一个待 push 的原始顶点
        let pendingAnchor = null; // t≈1 的站, 等下一顶点 push 时结算
        for (const st of projections) {
            while (vi <= st.i) {
                const last = outPts[outPts.length - 1];
                if (!last || dist(last, align[vi]) >= 0.05) {
                    outPts.push(align[vi]);
                    if (pendingAnchor) { newAnchors[pendingAnchor] = outPts.length - 1; pendingAnchor = null; }
                }
                vi++;
            }
            if (st.t <= 0.001) {
                const idx = outPts.length - 1;
                if (pendingAnchor) { // 上一站 t≈1 与本站 t≈0 指向同一顶点: 微移避免零长区间
                    newAnchors[pendingAnchor] = idx; pendingAnchor = null;
                    outPts.push([align[st.i][0] + 1e-6, align[st.i][1] + 1e-6]);
                    newAnchors[st.sk] = outPts.length - 1;
                } else {
                    newAnchors[st.sk] = idx;
                }
            } else if (st.t >= 0.999) {
                pendingAnchor = st.sk;
            } else {
                const a = align[st.i], b = align[st.i + 1];
                outPts.push([a[0] + (b[0] - a[0]) * st.t, a[1] + (b[1] - a[1]) * st.t]);
                if (pendingAnchor) { newAnchors[pendingAnchor] = outPts.length - 1; pendingAnchor = null; } // 兜底
                newAnchors[st.sk] = outPts.length - 1;
            }
        }
        while (vi < align.length) {
            const last = outPts[outPts.length - 1];
            if (!last || dist(last, align[vi]) >= 0.05) {
                outPts.push(align[vi]);
                if (pendingAnchor) { newAnchors[pendingAnchor] = outPts.length - 1; pendingAnchor = null; }
            }
            vi++;
        }
        if (pendingAnchor) newAnchors[pendingAnchor] = outPts.length - 1;
        align.length = 0;
        align.push(...outPts);
        for (const sk of def.stations) anchorIdx[sk] = newAnchors[sk];
    }

    // 距离校验: 每个锚点间折线长度 vs 站间直线距离
    let totalKm = 0;
    for (let i = 1; i < align.length; i++) totalKm += dist(align[i - 1], align[i]);
    out[trackId] = { points: align.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]), anchors: anchorIdx };
    console.error(`${trackId}: ${def.stations.length} stations, ${align.length} pts, ${(totalKm / 1000).toFixed(1)} km ✓`);
}

const header = `// 本文件由 scripts/fetch-mtr-lines.mjs 生成 (数据来源: OpenStreetMap route relations, ${new Date().toISOString().slice(0, 10)})。
// 勿手改; 如需更新请重跑脚本。null = 该轨道未抓到真实走向 (运行时回退为站间直线)。

export interface TrackAlignment {
    /** 真实走向折线 [lng, lat] (WGS84), 已按站点顺序定向 */
    points: [number, number][];
    /** 站键 -> points 下标 */
    anchors: Record<string, number>;
}

export const trackAlignments: Record<string, TrackAlignment | null> = ${JSON.stringify(out, null, 2)};
`;

writeFileSync(new URL('../src/mtr/tracks.generated.ts', import.meta.url), header);
console.error('written to src/mtr/tracks.generated.ts');
