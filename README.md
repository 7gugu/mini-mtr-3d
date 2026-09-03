# mini mtr

A miniature **3D real-time visualization of the Hong Kong MTR network**, inspired by [Mini Tokyo 3D](https://minitokyo3d.com/).

[中文说明](./README_zh.md)

![tech](https://img.shields.io/badge/Three.js-0.160-blue) ![tech](https://img.shields.io/badge/AMap-JS%20API%202.0-green) ![tech](https://img.shields.io/badge/TypeScript-5.7-blue) [![Build & Deploy to GitHub Pages](https://github.com/7gugu/mini-mtr-3d/actions/workflows/webpack.yml/badge.svg)](https://github.com/7gugu/mini-mtr-3d/actions/workflows/webpack.yml)

## Features

### 3D trains + map
- Rendered with **AMap GLCustomLayer + Three.js**, MeshLine glowing tracks, covering 10 MTR lines (including Tseung Kwan O LOHAS Park branch and East Rail Lok Ma Chau branch)
- Deterministic all-day timetable from real service windows (05:30 → next day 01:30) with peak / daytime / evening / late headways (~4000+ trips), line colors, and platform dwells
- Fleet object pool: only on-map trains are rendered each frame (~30–400), with full-day scrubbing

### Live MTR data (data.gov.hk)
- Polls the [MTR Next Train API](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data) every 30s (one monitor station per line)
- Greedy matching of live arrivals to the planned timetable by destination, then smooth offset correction
- Line incidents (`status=0` / `isdelay=Y`) only in live mode; timeline replay disconnects and reconnects automatically

### Incident bubbles
- Pulsing ⚠ bubbles above mid-line anchors (line-colored tags); click for official text, update time, and special-service links

### UI
- **Top-left**: Hong Kong simulation time, date, HKO weather, warnings, and API health
- **Bottom center**: full-day scrubber (05:30 → 01:30), play/pause, 1×–60× speed, “Go live”
- Station labels by zoom (major / interchange at low zoom)
- Bottom-right tools: About, track/schedule editor, power-save mode
- **zh / en** UI with browser-language auto-detect (override in the UI)

## Develop

```bash
npm install
npm start        # webpack dev server
npm test         # jest
npm run build    # production build (use build:prod for Pages)
```

- AMap key / security code via env: `AMAP_KEY` / `AMAP_SECURITY_CODE` (empty string fallback)
- Line/station data: `src/hk_mtr_data.ts`; coordinates & names from `scripts/fetch-mtr-stations.mjs` → `src/mtr/stations.generated.ts`
- Live API: `src/mtr/api.ts`; polling & offsets: `src/mtr/RealtimeManager.ts`

## Live demo

https://7gugu.github.io/mini-mtr-3d/
