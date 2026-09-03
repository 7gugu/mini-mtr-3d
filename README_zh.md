# mini mtr

迷你 **香港港铁 (MTR) 全网络 3D 实时可视化**，参考 [Mini Tokyo 3D](https://minitokyo3d.com/) 的交互理念。

[English README](./README.md)

![tech](https://img.shields.io/badge/Three.js-0.160-blue) ![tech](https://img.shields.io/badge/AMap-JS%20API%202.0-green) ![tech](https://img.shields.io/badge/TypeScript-5.7-blue) [![Build & Deploy to GitHub Pages](https://github.com/7gugu/mini-mtr-3d/actions/workflows/webpack.yml/badge.svg)](https://github.com/7gugu/mini-mtr-3d/actions/workflows/webpack.yml)

## 功能

### 🚇 3D 列车 + 地图
- 基于 **高德地图 GLCustomLayer + Three.js** 渲染，MeshLine 发光轨道，覆盖港铁 10 条线路（含将军澳线康城支线、东铁线落马洲支线）
- 全天确定性时刻表：按各线真实服务时段（05:30 → 次日 01:30）、高峰/日间/晚间/深夜班距生成约 4000+ 班次，列车按线路配色渲染，停站时停靠站台
- 列车对象池 (FleetManager)：每帧只渲染在场列车（约 30–400 列），支持全天任意时刻回放

### 📡 港铁实时数据 (data.gov.hk)
- 每 30 秒轮询 [MTR Next Train API](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data)（每线路 1 个监测站）
- 用 API 的真实到站时间与计划时刻表**逐班贪心配对**（按 `dest` 终点站匹配），得出每班车的运行偏差并平滑修正位置
- 从同一响应提取线路突发事件（`status=0` / `isdelay=Y`），**只有实时模式才启用**，拖动时间轴回放时自动断开、恢复实时后自动重连

### ⚠️ 突发事件气泡
- 受影响线路中点站上方弹出脉冲 ⚠ 气泡（线路配色标签），点击展开官方文案 + 更新时间 + 特别服务安排链接

### 🕐 界面
- **左上角**：香港时间（模拟时间）、日期、天文台现时天气 + 天气警告 + 实时数据连接状态
- **底部居中**：当日全天进度条（05:30 → 次日 01:30），可自由左右拖动回放；播放/暂停、1×–60× 倍速、一键「回到现在」
- 站名标签按缩放级别分级显示（低缩放仅显示换乘/端点大站）
- 右下角：关于、轨道/时刻表编辑器、省电模式
- **中/英**界面：按浏览器语言自动切换，也可在界面手动切换

## 开发

```bash
npm install
npm start        # webpack 开发服务器
npm test         # jest 单元测试
npm run build    # 生产构建（GitHub Pages 用 build:prod）
```

- 高德 Key / 安全密钥：环境变量 `AMAP_KEY` / `AMAP_SECURITY_CODE`（默认兜底为空字符串）
- 线路/站点数据：`src/hk_mtr_data.ts`；站点坐标与名称由 `scripts/fetch-mtr-stations.mjs` 生成到 `src/mtr/stations.generated.ts`
- 实时 API：`src/mtr/api.ts`；轮询与偏移：`src/mtr/RealtimeManager.ts`

## 在线演示

https://7gugu.github.io/mini-mtr-3d/
