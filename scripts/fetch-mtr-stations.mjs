// 一次性数据抓取脚本: 从 OpenStreetMap (Overpass API) 获取港铁车站真实坐标与中英文名。
// 运行: node scripts/fetch-mtr-stations.mjs
// 输出: src/mtr/stations.generated.ts (勿手改, 重跑脚本再生成)

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// MTR 站码 -> 官方英文名 (用于与 OSM name:en 匹配)
const EN_NAMES = {
    KET: 'Kennedy Town', HKU: 'HKU', SYP: 'Sai Ying Pun', SHW: 'Sheung Wan',
    CEN: 'Central', ADM: 'Admiralty', WAC: 'Wan Chai', CAB: 'Causeway Bay',
    TIH: 'Tin Hau', FOH: 'Fortress Hill', NOP: 'North Point', QUB: 'Quarry Bay',
    TAK: 'Tai Koo', SWH: 'Sai Wan Ho', SKW: 'Shau Kei Wan', HFC: 'Heng Fa Chuen', CHW: 'Chai Wan',
    TSW: 'Tsuen Wan', TWH: 'Tai Wo Hau', KWH: 'Kwai Hing', KWF: 'Kwai Fong',
    LAK: 'Lai King', MEF: 'Mei Foo', LCK: 'Lai Chi Kok', CSW: 'Cheung Sha Wan',
    SSP: 'Sham Shui Po', PRE: 'Prince Edward', MOK: 'Mong Kok', YMT: 'Yau Ma Tei',
    JOR: 'Jordan', TST: 'Tsim Sha Tsui',
    WHA: 'Whampoa', HOM: 'Ho Man Tin', SKM: 'Shek Kip Mei', KOT: 'Kowloon Tong',
    LOF: 'Lok Fu', WTS: 'Wong Tai Sin', DIH: 'Diamond Hill', CHH: 'Choi Hung',
    KOB: 'Kowloon Bay', NTK: 'Ngau Tau Kok', KWT: 'Kwun Tong', LAT: 'Lam Tin', YAT: 'Yau Tong', TIK: 'Tiu Keng Leng',
    TKO: 'Tseung Kwan O', LHP: 'LOHAS Park', HAH: 'Hang Hau', POA: 'Po Lam',
    LOW: 'Lo Wu', LMC: 'Lok Ma Chau', SHS: 'Sheung Shui', FAN: 'Fanling',
    TWO: 'Tai Wo', TAP: 'Tai Po Market', UNI: 'University', RAC: 'Racecourse',
    FOT: 'Fo Tan', SHT: 'Sha Tin', TAW: 'Tai Wai', MKK: 'Mong Kok East', HUH: 'Hung Hom', EXC: 'Exhibition Centre',
    WKS: 'Wu Kai Sha', MOS: 'Ma On Shan', HEO: 'Heng On', TSH: 'Tai Shui Hang',
    SHM: 'Shek Mun', CIO: 'City One', STW: 'Sha Tin Wai', CKT: 'Che Kung Temple',
    HIK: 'Hin Keng', KAT: 'Kai Tak', SUW: 'Sung Wong Toi', TKW: 'To Kwa Wan',
    ETS: 'East Tsim Sha Tsui', AUS: 'Austin', NAC: 'Nam Cheong', TWW: 'Tsuen Wan West',
    KSR: 'Kam Sheung Road', YUL: 'Yuen Long', LOP: 'Long Ping', TIS: 'Tin Shui Wai',
    SIH: 'Siu Hong', TUM: 'Tuen Mun',
    TUC: 'Tung Chung', SUN: 'Sunny Bay', TSY: 'Tsing Yi', OLY: 'Olympic', KOW: 'Kowloon', HOK: 'Hong Kong',
    AIR: 'Airport', AWE: 'AsiaWorld-Expo', DIS: 'Disneyland Resort',
    OCP: 'Ocean Park', WCH: 'Wong Chuk Hang', LET: 'Lei Tung', SOH: 'South Horizons',
};

function norm(s) {
    return (s || '').toLowerCase().replace(/\s*\(mtr\)\s*/i, '').replace(/\s*station\s*$/i, '').replace(/\s+/g, ' ').trim();
}

const query = `
[out:json][timeout:90];
(
  node["railway"="station"]["station"="subway"](22.13,113.82,22.58,114.45);
  node["railway"="station"]["network"~"港鐵|MTR"](22.13,113.82,22.58,114.45);
  way["railway"="station"]["station"="subway"](22.13,113.82,22.58,114.45);
  way["railway"="station"]["network"~"港鐵|MTR"](22.13,113.82,22.58,114.45);
  relation["railway"="station"]["station"="subway"](22.13,113.82,22.58,114.45);
  relation["railway"="station"]["network"~"港鐵|MTR"](22.13,113.82,22.58,114.45);
);
out center;`;

const res = await fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mini-greater-bay-area-3d/1.0 (station data sync)' }
});
if (!res.ok) {
    console.error(await res.text());
    throw new Error(`Overpass HTTP ${res.status}`);
}
const json = await res.json();

const byEnName = new Map();
for (const el of json.elements) {
    const t = el.tags || {};
    const en = t['name:en'] || t.name;
    if (!en) continue;
    const zh = t['name:zh'] || t['name:yue'] || t['name:zh-Hant'] || t['name:zh-HK'] || '';
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const key = norm(en);
    if (!byEnName.has(key)) byEnName.set(key, []);
    byEnName.get(key).push({ lon, lat, zh, en, tags: t });
}

const stations = {};
const names = {};
const missing = [];
for (const [code, en] of Object.entries(EN_NAMES)) {
    const cands = byEnName.get(norm(en)) || [];
    if (cands.length === 0) { missing.push(code + ':' + en); continue; }
    // 取第一个候选 (同名站中优先 subway)
    cands.sort((a, b) => (b.tags.station === 'subway' ? 1 : 0) - (a.tags.station === 'subway' ? 1 : 0));
    const c = cands[0];
    stations[code] = [Number(c.lon.toFixed(6)), Number(c.lat.toFixed(6))];
    names[code] = { en: c.en, zh: c.zh || '' };
}

console.error(`matched ${Object.keys(stations).length}/${Object.keys(EN_NAMES).length}`);
if (missing.length) console.error('MISSING:', missing.join(', '));

const header = `// 本文件由 scripts/fetch-mtr-stations.mjs 生成 (数据来源: OpenStreetMap, ${new Date().toISOString().slice(0, 10)})。
// 勿手改; 如需更新请重跑脚本。

/** 站码 -> [lng, lat] (WGS84) */
export const stationCoords: Record<string, [number, number]> = ${JSON.stringify(stations, null, 4)};

/** 站码 -> 官方名称 */
export const stationNames: Record<string, { en: string; zh: string }> = ${JSON.stringify(names, null, 4)};
`;

const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('../src/mtr/stations.generated.ts', import.meta.url), header);
console.error('written to src/mtr/stations.generated.ts');
