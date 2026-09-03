import { railData, loadRailData, initialCenterWGS84 } from './data';
import { config } from './config';
import { Editor } from './Editor';
import { PlaybackController } from './PlaybackController';
import { FleetManager } from './FleetManager';
import { RealtimeManager } from './mtr/RealtimeManager';
import { ClockPanel } from './ui/ClockPanel';
import { Timeline } from './ui/Timeline';
import { AlertBubbles } from './ui/AlertBubbles';
import { getServiceDayStart, SERVICE_DAY_SPAN_MS } from './hktime';
import { lineInfoMap, lineMetas, stationDisplayName } from './hk_mtr_data';
import '../assets/style.css';
import * as THREE from 'three';
import { MeshLine, MeshLineMaterial } from 'three.meshline';

// Set security config before loading AMap
(window as any)._AMapSecurityConfig = { securityJsCode: config.AMAP_SECURITY_CODE };

import AMapLoader from '@amap/amap-jsapi-loader';

const AMAP_KEY = config.AMAP_KEY;

// FleetManager 在 GLCustomLayer.init 中创建, 偏移提供器在 realtime 实例化后接上
let fleetOffsetProvider: (trainId: string) => number = () => 0;

AMapLoader.load({
    key: AMAP_KEY,
    version: "2.0",
    plugins: ['AMap.PolylineEditor']
}).then(async (AMap: any) => {
    // 0. 服务日时间轴: 05:30 -> 次日 01:30 (香港时间)
    const dayStart = getServiceDayStart();
    const playback = new PlaybackController(dayStart, dayStart + SERVICE_DAY_SPAN_MS);

    // 1. Convert Initial Center
    let initialCenter: [number, number] = initialCenterWGS84;
    try {
        await new Promise<void>((resolve) => {
             AMap.convertFrom(initialCenterWGS84, 'gps', (status: string, result: any) => {
                if (status === 'complete' && result.info === 'ok') {
                     const loc = result.locations[0];
                    initialCenter = [loc.getLng(), loc.getLat()];
                }
                resolve();
             });
        });
    } catch(e) { console.error("Center conversion failed", e); }

    // 2. Load Rail Data (Populates railData)
    await loadRailData(AMap, dayStart);

    const map = new AMap.Map('container', {
        viewMode: '3D', pitch: 55, zoom: 12.5, center: initialCenter,
        mapStyle: 'amap://styles/dark', skyColor: '#1f263a'
    });

    const customCoords = map.customCoords;
    customCoords.setCenter(initialCenter);

    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;

    const trackMeshes: THREE.Mesh[] = [];
    const stationMeshes: THREE.Mesh[] = [];
    const stationMarkers: { marker: any; major: boolean }[] = []; // AMap.Text markers

    // 重要的站 (换乘锚点 + 线路端点): 低缩放级别下只显示这些站名
    const majorStations = new Set<string>();
    for (const meta of lineMetas) {
        majorStations.add(meta.stations[0]);
        majorStations.add(meta.stations[meta.stations.length - 1]);
        majorStations.add(meta.anchorSta);
    }

    let stationLabelsDetailed = false;
    const updateStationLabelVisibility = () => {
        const zoom = map.getZoom();
        const detailed = zoom >= 14.2;
        if (detailed === stationLabelsDetailed) return;
        stationLabelsDetailed = detailed;
        for (const { marker, major } of stationMarkers) {
            marker.show(major || detailed);
        }
    };
    map.on('zoomend', updateStationLabelVisibility);

    // 3. Realtime Manager (结合 data.gov.hk)
    const realtime = new RealtimeManager(railData.trips);
    fleetOffsetProvider = (trainId) => realtime.getOffset(trainId);

    // 4. UI: 左上时钟+天气 / 底部时间轴 / 突发气泡
    const clockPanel = new ClockPanel();
    const timeline = new Timeline(playback);
    const alertBubbles = new AlertBubbles(map, lineInfoMap);

    // 实时模式切换: 只有实时状态才轮询政府 API
    playback.onModeChange = (mode) => {
        const live = mode === 'live';
        clockPanel.setLive(live);
        alertBubbles.setVisible(live);
        if (live) {
            realtime.start();
        } else {
            realtime.stop();
            realtime.clearOffsets();
        }
    };
    realtime.onIncidentsChange = (incidents) => alertBubbles.setIncidents(incidents);
    realtime.onHealthChange = (healthy) => clockPanel.setApiHealth(healthy);

    // 平滑轨道缓存 (与轨道渲染/列车共用)
    let smoothedTracksCache: Record<string, number[][]> = {};
    let labeledLocations = new Set<string>();

    let fleet: FleetManager | null = null;

    // Function to rebuild scene elements (编辑器改动后复用)
    const refreshScene = () => {
        console.log("Refreshing Scene...");
        if (!scene) return;

        // 1. Cleanup Trains
        if (fleet) { fleet.disposeAll(); fleet = null; }

        // 2. Cleanup Tracks & Stations
        scene.remove(...trackMeshes);
        trackMeshes.forEach(m => {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
        });
        trackMeshes.length = 0;

        scene.remove(...stationMeshes);
        stationMeshes.forEach(m => {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
        });
        stationMeshes.length = 0;

        map.remove(stationMarkers.map(s => s.marker));
        stationMarkers.length = 0;
        labeledLocations = new Set();

        // 3. 走线缓存: 直接使用高德原始折线 (GCJ02), 不做平滑插值 ——
        //    CatmullRom 会在弯道/长直道交界处外凸, 导致与高德底图走线偏离
        smoothedTracksCache = {};
        Object.values(railData.tracks).forEach(track => {
            const pathLngLats = track.path.map(p => p.location);
            const coords = customCoords.lngLatsToCoords(pathLngLats);
            smoothedTracksCache[track.id] = coords.map((c: number[]) => [c[0], c[1]]);
        });

        // 4. Rebuild Tracks (MeshLine) + Stations
        Object.values(railData.tracks).forEach(track => {
            const pathLngLats = track.path.map(p => p.location);
            const coords = customCoords.lngLatsToCoords(pathLngLats);
            const smoothedCoords = smoothedTracksCache[track.id];

            // 4.1 Track Lines (贴近地面, 消除俯仰视差, 保证与高德底图走线重合)
            const points: number[] = [];
            for(let i = 0; i < smoothedCoords.length; i++) {
                points.push(smoothedCoords[i][0], smoothedCoords[i][1], 1);
            }

            const line = new MeshLine();
            line.setPoints(points);

            const color = track.color || '#00ffff';

            const material = new MeshLineMaterial({
                color: new THREE.Color(color),
                opacity: 0.9,
                transparent: true,
                lineWidth: 24,
                resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
                sizeAttenuation: 1,
                near: camera.near,
                far: camera.far
            });
            // 走线贴近地面 (z≈1) 避免俯仰视差; 关闭深度测试避免被 3D 楼块遮挡
            material.depthTest = false;

            const mesh = new THREE.Mesh(line, material);
            mesh.renderOrder = 1;
            scene.add(mesh);
            trackMeshes.push(mesh);

            // 4.2 Stations (Circles) + 名称标注
            track.path.forEach((p, idx) => {
                if (p.name) {
                    const pos = coords[idx];
                    const stationGeo = new THREE.CylinderGeometry(48, 48, 8, 32);
                    stationGeo.rotateX(Math.PI / 2);

                    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
                    const stationMesh = new THREE.Mesh(stationGeo, fillMat);
                    stationMesh.renderOrder = 2;
                    stationMesh.position.set(pos[0], pos[1], 2);
                    scene.add(stationMesh);
                    stationMeshes.push(stationMesh);

                    const borderGeo = new THREE.RingGeometry(38, 56, 32);
                    const borderMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false });
                    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
                    borderMesh.renderOrder = 2;
                    borderMesh.position.set(pos[0], pos[1], 2.4);
                    scene.add(borderMesh);
                    stationMeshes.push(borderMesh);

                    // 站名标签 (繁体中文): 同一车站 (同站码) 只标一次 (换乘站多线共用)
                    const code = p.name.split('_')[1];
                    const isMajor = majorStations.has(p.name);
                    if (!labeledLocations.has(code)) {
                        labeledLocations.add(code);
                        const textMarker = new AMap.Text({
                            text: stationDisplayName(p.name),
                            anchor: 'bottom-center',
                            position: p.location,
                            offset: new AMap.Pixel(0, -15),
                            style: {
                                'background-color': 'rgba(6,10,22,0.72)',
                                'border-radius': '3px',
                                'border': '1px solid rgba(148, 197, 255, 0.28)',
                                'color': '#fff',
                                'font-size': '12px',
                                'font-family': 'var(--font-serif-mtr)',
                                'letter-spacing': '1px',
                                'padding': '2px 7px',
                                'box-shadow': '0 0 8px rgba(56, 189, 248, 0.22), 0 2px 6px rgba(0,0,0,0.45)',
                                'text-shadow': '0 0 6px rgba(148, 197, 255, 0.55)'
                            },
                            zIndex: 120
                        });
                        textMarker.show(isMajor || stationLabelsDetailed);
                        map.add(textMarker);
                        stationMarkers.push({ marker: textMarker, major: isMajor });
                    }
                }
            });
        });

        // 5. 列车车队 (对象池, 每帧只渲染在场列车)
        fleet = new FleetManager(scene, map, customCoords, railData, smoothedTracksCache);
        fleet.offsetProvider = fleetOffsetProvider;
    };

    // 编辑器 (可选工具, 右下角按钮唤起)
    let editor: Editor | null = null;
    const editorToggle = document.createElement('button');
    editorToggle.className = 'ui-button editor-toggle';
    editorToggle.textContent = '🛠';
    editorToggle.title = '轨道/时刻表编辑器';
    editorToggle.onclick = () => {
        if (!editor) {
            editor = new Editor(map, AMap);
            editor.onDataUpdate = () => {
                refreshScene();
                realtime.rebuildTrips(railData.trips);
            };
            editor.container.classList.add('hidden-panel');
        }
        editor.container.classList.toggle('hidden-panel');
        editorToggle.classList.toggle('active');
    };
    document.body.appendChild(editorToggle);

    const glLayer = new AMap.GLCustomLayer({
        zIndex: 110,
        init: (gl: WebGLRenderingContext) => {
            try {
                camera = new THREE.PerspectiveCamera(
                    60,
                    window.innerWidth / window.innerHeight,
                    100,
                    1 << 30
                );

                renderer = new THREE.WebGLRenderer({
                    context: gl,
                    alpha: true,
                });
                renderer.autoClear = false;

                scene = new THREE.Scene();

                const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
                scene.add(ambientLight);
                const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
                directionalLight.position.set(1000, -100, 900);
                scene.add(directionalLight);

                // Initial Build
                refreshScene();
            } catch (e: any) {
                console.error('[MTR] GL init failed', e);
                (window as any).__sceneError = (e && e.stack) || String(e);
                throw e;
            }
        },
        render: () => {
            renderer.resetState();
            customCoords.setCenter(initialCenter);

            const { near, far, fov, up, lookAt, position } = customCoords.getCameraParams();

            camera.near = near;
            camera.far = far;
            camera.fov = fov;
            camera.position.set(position[0], position[1], position[2]);
            camera.up.set(up[0], up[1], up[2]);
            camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
            camera.updateProjectionMatrix();

            renderer.render(scene, camera);
            renderer.resetState();
        }
    });

    map.add(glLayer);

    // 初始 UI 状态
    clockPanel.setLive(playback.isLive);
    clockPanel.setTime(playback.currentTime);
    if (playback.isLive) realtime.start();
    alertBubbles.setVisible(playback.isLive);

    // 调试/测试钩子
    (window as any).__mtrDebug = { playback, realtime, fleetRef: () => fleet, railData, alertBubbles, map, AMap, getScene: () => scene, getTrackMeshes: () => trackMeshes };

    let lastTime = Date.now();

    function animate() {
        const now = Date.now();
        const deltaTime = now - lastTime;
        lastTime = now;

        playback.update(deltaTime);
        realtime.tick(deltaTime);

        const simTime = playback.currentTime;

        if (fleet) fleet.update(simTime);
        clockPanel.setTime(simTime);
        timeline.render();
        if (playback.isLive) alertBubbles.updatePositions();

        map.render();
        requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('resize', () => {
        if(camera && renderer) {
             camera.aspect = window.innerWidth / window.innerHeight;
             camera.updateProjectionMatrix();
             renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });
});
