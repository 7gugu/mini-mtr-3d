// 可视化校验脚本: 把 tracks.generated.ts 的轨道折线叠加到 OSM 瓦片上出图,
// 用于人工核对真实走向是否贴合实际轨道。运行: npx tsx scripts/preview-tracks.mjs
// 输出: /tmp/tracks-preview-*.png

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { trackAlignments } = await import('../src/mtr/tracks.generated.ts');
const { stationCoords } = await import('../src/mtr/stations.generated.ts');

// --- Web Mercator ---
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z;
};

const LINE_COLORS = {
    track_ISL: '#007DC5', track_TWL: '#ED1D24', track_KTL: '#00AB4E',
    track_TKL: '#7D499D', track_TKL_LHP: '#7D499D', track_EAL: '#53B7E8',
    track_EAL_LMC: '#53B7E8', track_TML: '#923011', track_TCL: '#F7943E',
    track_AEL: '#00888A', track_DRL: '#F173AC', track_SIL: '#BAC429',
};

// --- 参数: npx tsx scripts/preview-tracks.mjs <zoom> <lngMin> <latMin> <lngMax> <latMax> [outPrefix] ---
const argv = process.argv.slice(2).map(Number);
const [Z, lngMin, latMin, lngMax, latMax] = argv.length >= 5 ? argv : [14, 114.14, 22.235, 114.26, 22.29];
const prefix = process.argv[7] || 'tracks-preview';

const TILE = 256;
const x0 = Math.floor(lon2x(lngMin, Z)), x1 = Math.floor(lon2x(lngMax, Z));
const y0 = Math.floor(lat2y(latMax, Z)), y1 = Math.floor(lat2y(latMin, Z));
const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
const W = nx * TILE, H = ny * TILE;
const px = new Uint8Array(W * H * 3).fill(18);

// --- 拉取并拼接瓦片 ---
mkdirSync('/tmp/osm-tiles', { recursive: true });
for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
        const f = `/tmp/osm-tiles/${Z}_${tx}_${ty}.png`;
        let buf;
        try {
            buf = readFileSync(f);
        } catch {
            const url = `https://tile.openstreetmap.org/${Z}/${tx}/${ty}.png`;
            const res = await fetch(url, { headers: { 'User-Agent': 'mini-greater-bay-area-3d preview/1.0' } });
            if (!res.ok) { console.error(`tile ${tx},${ty} HTTP ${res.status}`); continue; }
            buf = Buffer.from(await res.arrayBuffer());
            writeFileSync(f, buf);
        }
        // 极简 PNG 解码: 借助 pngjs (若未安装则提示)
        const { PNG } = await import('pngjs');
        const img = PNG.sync.read(buf);
        const ox = (tx - x0) * TILE, oy = (ty - y0) * TILE;
        for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
                const si = (y * TILE + x) * 4, di = ((oy + y) * W + ox + x) * 3;
                px[di] = img.data[si] * 0.35 + 8;   // 压暗底图突出轨道
                px[di + 1] = img.data[si + 1] * 0.35 + 8;
                px[di + 2] = img.data[si + 2] * 0.35 + 8;
            }
        }
    }
}

function setPx(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
}
function drawLine(a, b, col, th = 2) {
    const x1p = lon2x(a[0], Z) * TILE - x0 * TILE, y1p = lat2y(a[1], Z) * TILE - y0 * TILE;
    const x2p = lon2x(b[0], Z) * TILE - x0 * TILE, y2p = lat2y(b[1], Z) * TILE - y0 * TILE;
    const steps = Math.max(Math.abs(x2p - x1p), Math.abs(y2p - y1p)) | 0;
    for (let s = 0; s <= steps; s++) {
        const x = Math.round(x1p + (x2p - x1p) * s / steps);
        const y = Math.round(y1p + (y2p - y1p) * s / steps);
        for (let ddy = -th; ddy <= th; ddy++) for (let ddx = -th; ddx <= th; ddx++) {
            if (ddx * ddx + ddy * ddy <= th * th) setPx(x + ddx, y + ddy, col[0], col[1], col[2]);
        }
    }
}
function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

// --- 画轨道 + 车站锚点 ---
for (const [trackId, align] of Object.entries(trackAlignments)) {
    if (!align) continue;
    const col = hex2rgb(LINE_COLORS[trackId] || '#ff00ff');
    const pts = align.points;
    for (let i = 1; i < pts.length; i++) drawLine(pts[i - 1], pts[i], col, 2);
    // 锚点: 白色圆点
    for (const idx of Object.values(align.anchors)) {
        const p = pts[idx];
        const x = Math.round(lon2x(p[0], Z) * TILE - x0 * TILE), y = Math.round(lat2y(p[1], Z) * TILE - y0 * TILE);
        for (let ddy = -4; ddy <= 4; ddy++) for (let ddx = -4; ddx <= 4; ddx++) {
            if (ddx * ddx + ddy * ddy <= 16) setPx(x + ddx, y + ddy, 255, 255, 255);
        }
    }
}

// --- 输出 PNG (未压缩 zlib 存储) ---
const { PNG: PNGOut } = await import('pngjs');
const out = new PNGOut({ width: W, height: H });
for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    out.data[j] = px[i]; out.data[j + 1] = px[i + 1]; out.data[j + 2] = px[i + 2]; out.data[j + 3] = 255;
}
const outFile = `/tmp/${prefix}-z${Z}.png`;
writeFileSync(outFile, PNGOut.sync.write(out));
console.log(`written ${outFile} (${W}x${H}, tiles ${nx}x${ny})`);
