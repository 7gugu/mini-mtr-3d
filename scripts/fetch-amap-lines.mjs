// 一次性数据抓取脚本: 直接采用高德官方线路数据 (AMap.LineSearch, type=地铁) 作为
// 轨道几何与站点坐标 —— 数据本身即 GCJ02, 与高德底图绘制完全同源, 不做任何坐标系
// 数学转换, 保证走线/站点与高德底图逐点重合。
// 前置: node scripts/fetch-amap-lines.mjs 读取 .cache-amap-lines.json
//       (由 scripts/amap-dump.html 在浏览器内执行 LineSearch 抓取后落盘)
// 输出: src/mtr/tracks.generated.ts (勿手改, 重跑脚本再生成)

const { readFileSync, writeFileSync, existsSync } = await import('node:fs');

const CACHE = new URL('../.cache-amap-lines.json', import.meta.url);
if (!existsSync(CACHE)) {
    console.error('缺少 .cache-amap-lines.json: 先用浏览器打开 scripts/amap-dump.html 抓取高德数据');
    process.exit(1);
}
const dump = JSON.parse(readFileSync(CACHE, 'utf8'));

// --- 站点坐标 (读自 stations.generated.ts, WGS84, 仅用于匹配校验/缺失兜底) ---
const stationTs = readFileSync(new URL('../src/mtr/stations.generated.ts', import.meta.url), 'utf8');
const stationCoords = JSON.parse(stationTs.match(/stationCoords[^=]*= (\{[\s\S]*?\n\});/)[1]);

// --- 各轨道的有序站点 (与 hk_mtr_data.ts lineMetas 一致) ---
// variantHint: 同线多走向变体 (东铁罗湖/落马洲, 将军澳宝琳/康城) 的选线提示
const TRACKS = {
    track_ISL: { match: /港岛线/, stations: ['ISL_KET','ISL_HKU','ISL_SYP','ISL_SHW','ISL_CEN','ISL_ADM','ISL_WAC','ISL_CAB','ISL_TIH','ISL_FOH','ISL_NOP','ISL_QUB','ISL_TAK','ISL_SWH','ISL_SKW','ISL_HFC','ISL_CHW'], endpoints: { ISL_KET: '坚尼地城', ISL_CHW: '柴湾' } },
    track_TWL: { match: /荃湾线/, stations: ['TWL_CEN','TWL_ADM','TWL_TST','TWL_JOR','TWL_YMT','TWL_MOK','TWL_PRE','TWL_SSP','TWL_CSW','TWL_LCK','TWL_MEF','TWL_LAK','TWL_KWF','TWL_KWH','TWL_TWH','TWL_TSW'], endpoints: { TWL_CEN: '中环', TWL_TSW: '荃湾' } },
    track_KTL: { match: /观塘线/, stations: ['KTL_WHA','KTL_HOM','KTL_YMT','KTL_MOK','KTL_PRE','KTL_SKM','KTL_KOT','KTL_LOF','KTL_WTS','KTL_DIH','KTL_CHH','KTL_KOB','KTL_NTK','KTL_KWT','KTL_LAT','KTL_YAT','KTL_TIK'], endpoints: { KTL_WHA: '黄埔', KTL_TIK: '调景岭' } },
    track_TKL: { match: /将军澳线/, variantHint: /宝琳/, stations: ['TKL_NOP','TKL_QUB','TKL_YAT','TKL_TIK','TKL_TKO','TKL_HAH','TKL_POA'], endpoints: { TKL_NOP: '北角', TKL_POA: '宝琳' } },
    track_TKL_LHP: { match: /将军澳线/, variantHint: /康城/, stations: ['TKL_TIK','TKL_TKO','TKL_LHP'], endpoints: { TKL_TIK: '调景岭', TKL_LHP: '康城' } },
    track_EAL: { match: /东铁线/, variantHint: /罗湖/, skip: ['EAL_RAC'], stations: ['EAL_ADM','EAL_EXC','EAL_HUH','EAL_MKK','EAL_KOT','EAL_TAW','EAL_SHT','EAL_FOT','EAL_RAC','EAL_UNI','EAL_TAP','EAL_TWO','EAL_FAN','EAL_SHS','EAL_LOW'], endpoints: { EAL_ADM: '金钟', EAL_LOW: '罗湖' } },
    track_EAL_LMC: { match: /东铁线/, variantHint: /落马洲/, stations: ['EAL_SHS','EAL_LMC'], endpoints: { EAL_SHS: '上水', EAL_LMC: '落马洲' } },
    track_TML: { match: /屯马线/, stations: ['TML_WKS','TML_MOS','TML_HEO','TML_TSH','TML_SHM','TML_CIO','TML_STW','TML_CKT','TML_TAW','TML_HIK','TML_DIH','TML_KAT','TML_SUW','TML_TKW','TML_HOM','TML_HUH','TML_ETS','TML_AUS','TML_NAC','TML_MEF','TML_TWW','TML_KSR','TML_YUL','TML_LOP','TML_TIS','TML_SIH','TML_TUM'], endpoints: { TML_WKS: '乌溪沙', TML_TUM: '屯门' } },
    track_TCL: { match: /东涌线/, stations: ['TCL_HOK','TCL_KOW','TCL_OLY','TCL_NAC','TCL_LAK','TCL_TSY','TCL_SUN','TCL_TUC'], endpoints: { TCL_HOK: '香港', TCL_TUC: '东涌' } },
    track_AEL: { match: /机场快线/, stations: ['AEL_HOK','AEL_KOW','AEL_TSY','AEL_AIR','AEL_AWE'], endpoints: { AEL_HOK: '香港', AEL_AWE: '博览馆' } },
    track_DRL: { match: /迪士尼线/, stations: ['DRL_SUN','DRL_DIS'], endpoints: { DRL_SUN: '欣澳', DRL_DIS: '迪士尼' } },
    track_SIL: { match: /南港岛线/, stations: ['SIL_ADM','SIL_OCP','SIL_WCH','SIL_LET','SIL_SOH'], endpoints: { SIL_ADM: '金钟', SIL_SOH: '海怡半岛' } },
};

// --- 汇总去重全部地铁线路 (双向变体各自保留, 匹配时按方向取用) ---
const allLines = [];
const seenNames = new Set();
for (const v of Object.values(dump)) {
    for (const l of v.lines || []) {
        if (l.type !== '地铁') continue;          // 过滤小巴/巴士噪音
        if (seenNames.has(l.name)) continue;
        seenNames.add(l.name);
        if (l.path.length < 2 || l.via_stops.length < 2) continue;
        allLines.push(l);
    }
}
console.error(`AMap metro line variants: ${allLines.length}`);

// --- 距离工具 (米) ---
const R = 6371000;
function dist(a, b) {
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const la = a[1] * Math.PI / 180, lb = b[1] * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const r6 = (p) => [+p[0].toFixed(6), +p[1].toFixed(6)];

// 站间直线距离序列 (WGS84 与 GCJ02 的局部偏移一致, 距离可直接对比)
function pairDistances(coords) {
    const d = [];
    for (let i = 1; i < coords.length; i++) d.push(dist(coords[i - 1], coords[i]));
    return d;
}

// 在 via_stops (含 name/location) 中为站点列表找最佳对齐窗口
// firstHint/lastHint: 端点站的高德站名 (简体) —— 两站轨道距离对称, 必须靠站名定向
function bestWindow(stops, stationPts, firstHint, lastHint) {
    const n = stationPts.length;
    if (stops.length < n) return null;
    const locs = stops.map(s => s.location);
    const w = pairDistances(stationPts);
    const wSum = w.reduce((a, b) => a + b, 0);
    let best = null;
    for (const dir of [1, -1]) {
        const idxs = dir === 1 ? locs.map((_, i) => i) : locs.map((_, i) => locs.length - 1 - i);
        const seqLocs = idxs.map(i => locs[i]);
        const gAll = pairDistances(seqLocs);
        for (let j = 0; j + n - 1 < idxs.length; j++) {
            if (firstHint && stops[idxs[j]].name !== firstHint) continue;
            if (lastHint && stops[idxs[j + n - 1]].name !== lastHint) continue;
            const g = gAll.slice(j, j + n - 1);
            const gSum = g.reduce((a, b) => a + b, 0);
            if (gSum <= 0) continue;
            let err = 0;
            for (let i = 0; i < w.length; i++) err += Math.abs(w[i] - g[i]);
            err /= wSum;
            if (!best || err < best.err) best = { err, dir, windowStart: j, stops: idxs.slice(j, j + n).map(i => stops[i]) };
        }
    }
    return best;
}

// 最近路径顶点下标
function nearestVertex(points, coord, fromIdx = 0, toIdx = points.length - 1) {
    let best = -1, bestD = Infinity;
    for (let i = fromIdx; i <= toIdx; i++) {
        const d = dist(points[i], coord);
        if (d < bestD) { bestD = d; best = i; }
    }
    return { idx: best, d: bestD };
}

const out = {};
const amapStationCoords = {};
for (const [trackId, def] of Object.entries(TRACKS)) {
    const cand = allLines.filter(l => def.match.test(l.name) && (!def.variantHint || def.variantHint.test(l.name)));
    if (cand.length === 0) { console.error(`${trackId}: no AMap line matched`); out[trackId] = null; continue; }

    const stationPts = def.stations.map(sk => stationCoords[sk.split('_')[1]]);
    const skip = new Set(def.skip || []);
    const matchPts = stationPts.filter((_, i) => !skip.has(def.stations[i]));
    // 端点站名 (简体) 用于定向/校验
    const endpointHints = def.endpoints || {};
    const firstHint = endpointHints[def.stations.filter(s => !skip.has(s))[0]];
    const lastHint = endpointHints[def.stations.filter(s => !skip.has(s)).pop()];
    let chosen = null;
    for (const line of cand) {
        const bw = bestWindow(line.via_stops, matchPts, firstHint, lastHint);
        if (bw && (!chosen || bw.err < chosen.bw.err)) chosen = { line, bw };
    }
    if (!chosen) { console.error(`${trackId}: station sequence failed to align`); out[trackId] = null; continue; }
    const { line, bw } = chosen;

    // 走线: 按站点顺序定向
    let points = line.path.map(r6);
    if (bw.dir === -1) points = points.reverse();

    // 站点锚定: via_stops 坐标本身就是高德站位 (通常就是 path 顶点)。
    // bw.stops 按匹配顺序对应"非跳过"站点, 这里还原回完整站点序列。
    const anchors = {};
    const matchedLoc = new Array(def.stations.length).fill(null);
    {
        let m = 0;
        for (let i = 0; i < def.stations.length; i++) {
            if (!skip.has(def.stations[i])) matchedLoc[i] = r6(bw.stops[m++].location);
        }
    }
    const missing = [];
    let prevAnchor = 0;
    for (let i = 0; i < def.stations.length; i++) {
        const loc = matchedLoc[i];
        if (!loc) { missing.push(i); continue; }
        const { idx, d } = nearestVertex(points, loc, prevAnchor, points.length - 1);
        if (idx < 0) { missing.push(i); continue; }
        if (d > 120) {
            // via_stop 不在 path 顶点上: 插入到最近段, 保证站点圆点严格在高德走线上
            let segIdx = prevAnchor, segBest = Infinity;
            for (let s = prevAnchor; s < points.length - 1; s++) {
                const dd = Math.min(dist(points[s], loc), dist(points[s + 1], loc));
                if (dd < segBest) { segBest = dd; segIdx = s; }
            }
            points.splice(segIdx + 1, 0, loc);
            anchors[def.stations[i]] = segIdx + 1;
        } else {
            anchors[def.stations[i]] = idx;
        }
        prevAnchor = anchors[def.stations[i]];
        amapStationCoords[def.stations[i].split('_')[1]] = loc;
    }
    // 缺失站 (高德 via_stops 未收录, 如东铁马场): 用邻站局部偏移 (GCJ-WGS) 推算坐标,
    // 再在前后锚点区间内取最近顶点
    for (let i = 0; i < def.stations.length; i++) {
        if (!missing.includes(i)) continue;
        const sk = def.stations[i];
        const prev = anchors[def.stations[i - 1]];
        const next = anchors[def.stations[i + 1]];
        const wgs = stationCoords[sk.split('_')[1]];
        let dx = 0, dy = 0, cnt = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(def.stations.length - 1, i + 2); j++) {
            if (missing.includes(j)) continue;
            const w = stationCoords[def.stations[j].split('_')[1]];
            const g = matchedLoc[j];
            dx += g[0] - w[0]; dy += g[1] - w[1]; cnt++;
        }
        const pseudo = cnt ? [wgs[0] + dx / cnt, wgs[1] + dy / cnt] : wgs;
        // 只在 [prev, next) 区间取点, 避免抢占下一站的锚点顶点
        const { idx, d } = nearestVertex(points, pseudo, prev, Math.max(prev, next - 1));
        anchors[sk] = idx >= 0 ? idx : prev;
        amapStationCoords[sk.split('_')[1]] = r6(pseudo);
        console.error(`${trackId}: station ${sk} not in AMap via_stops, projected to path vertex (d=${Math.round(d)}m)`);
    }
    // 锚点单调保护: 相邻站锚落在同一/更早顶点时插入微移点, 并整体平移受影响的锚点下标
    for (let i = 1; i < def.stations.length; i++) {
        const a = anchors[def.stations[i - 1]], b = anchors[def.stations[i]];
        if (b > a) continue;
        const loc = matchedLoc[i] || [points[a][0] + 1e-6, points[a][1] + 1e-6];
        points.splice(a + 1, 0, r6(loc));
        for (const k of Object.keys(anchors)) if (anchors[k] > a) anchors[k]++;
        anchors[def.stations[i]] = a + 1;
    }

    const km = (() => { let t = 0; for (let i = 1; i < points.length; i++) t += dist(points[i - 1], points[i]); return t / 1000; })();
    // 锚点按站序输出, 便于人工阅读/校验
    const orderedAnchors = {};
    for (const sk of def.stations) orderedAnchors[sk] = anchors[sk];
    out[trackId] = { points, anchors: orderedAnchors };
    console.error(`${trackId}: ← ${line.name} [dir=${bw.dir === 1 ? '+' : 'rev'}, err=${(bw.err * 100).toFixed(1)}%] ${points.length} pts, ${def.stations.length} stations, ${km.toFixed(1)} km ✓`);
}

const header = `// 本文件由 scripts/fetch-amap-lines.mjs 生成 (数据来源: 高德 AMap.LineSearch 官方线路数据, ${new Date().toISOString().slice(0, 10)})。
// 坐标即高德 GCJ02, 与高德底图同源, 不做任何转换; 勿手改。

export interface TrackAlignment {
    /** 走线折线 [lng, lat] (GCJ02, 高德原始 path), 已按站点顺序定向 */
    points: [number, number][];
    /** 站键 -> points 下标 */
    anchors: Record<string, number>;
}

export const trackAlignments: Record<string, TrackAlignment | null> = ${JSON.stringify(out, null, 2)};

/** 站码 -> [lng, lat] (GCJ02, 高德站位) */
export const amapStationCoords: Record<string, [number, number]> = ${JSON.stringify(amapStationCoords, null, 2)};
`;

writeFileSync(new URL('../src/mtr/tracks.generated.ts', import.meta.url), header);
console.error('written to src/mtr/tracks.generated.ts');
