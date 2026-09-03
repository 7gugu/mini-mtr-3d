import { railData, loadRailData, initialCenterWGS84 } from './data';
import { config } from './config';
import { Editor } from './Editor';
import { PlaybackController } from './PlaybackController';
import { FleetManager } from './FleetManager';
import { RealtimeManager } from './mtr/RealtimeManager';
import { ClockPanel } from './ui/ClockPanel';
import { Timeline } from './ui/Timeline';
import { AlertBubbles } from './ui/AlertBubbles';
import { TrainPopup } from './ui/TrainPopup';
import { StationPopup } from './ui/StationPopup';
import { AboutPanel } from './ui/AboutPanel';
import { getServiceDayStart, SERVICE_DAY_SPAN_MS, mapThemeAt, MapTheme } from './hktime';
import { lineInfoMap, lineMetas, stationDisplayName } from './hk_mtr_data';
import {
    clusterStations,
    interchangeCapsuleSize,
    offsetOverlappingPolylines,
    StationCluster,
    STATION_BORDER_WIDTH,
} from './trackLayout';
import '../assets/style.css';
import * as THREE from 'three';
import { MeshLine, MeshLineMaterial } from 'three.meshline';

// Set security config before loading AMap
(window as any)._AMapSecurityConfig = { securityJsCode: config.AMAP_SECURITY_CODE };

import AMapLoader from '@amap/amap-jsapi-loader';

function stadiumShape(length: number, width: number): THREE.Shape {
    const r = width / 2;
    const ext = Math.max(0.01, (length - width) / 2);
    const shape = new THREE.Shape();
    shape.moveTo(-ext, r);
    shape.lineTo(ext, r);
    shape.absarc(ext, 0, r, Math.PI / 2, -Math.PI / 2, true);
    shape.lineTo(-ext, -r);
    shape.absarc(-ext, 0, r, -Math.PI / 2, Math.PI / 2, true);
    return shape;
}

function addStadiumStation(scene: THREE.Scene, cluster: StationCluster, meshes: THREE.Mesh[]) {
    const { length, width } = interchangeCapsuleSize(cluster);
    // 黑边粗度与普通站 RingGeometry(38, 56) 的径向宽度一致
    const border = new THREE.Mesh(
        new THREE.ShapeGeometry(stadiumShape(length + STATION_BORDER_WIDTH, width + STATION_BORDER_WIDTH)),
        new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 1 })
    );
    const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(stadiumShape(length, width)),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            transparent: true,
            opacity: 1,
        })
    );
    border.renderOrder = 10;
    fill.renderOrder = 11;
    border.position.set(cluster.cx, cluster.cy, 4);
    fill.position.set(cluster.cx, cluster.cy, 4.2);
    border.rotation.z = cluster.angle;
    fill.rotation.z = cluster.angle;
    border.userData.stationCode = cluster.code;
    fill.userData.stationCode = cluster.code;
    scene.add(border);
    scene.add(fill);
    meshes.push(border, fill);
}

function addCircleStation(scene: THREE.Scene, x: number, y: number, cluster: StationCluster, meshes: THREE.Mesh[]) {
    const stationGeo = new THREE.CylinderGeometry(48, 48, 8, 32);
    stationGeo.rotateX(Math.PI / 2);
    const stationMesh = new THREE.Mesh(
        stationGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 1 })
    );
    stationMesh.renderOrder = 10;
    stationMesh.position.set(x, y, 4);
    stationMesh.userData.stationCode = cluster.code;
    scene.add(stationMesh);
    meshes.push(stationMesh);

    const borderMesh = new THREE.Mesh(
        new THREE.RingGeometry(38, 56, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 1 })
    );
    borderMesh.renderOrder = 11;
    borderMesh.position.set(x, y, 4.4);
    borderMesh.userData.stationCode = cluster.code;
    scene.add(borderMesh);
    meshes.push(borderMesh);
}

const AMAP_KEY = config.AMAP_KEY;

const MAP_STYLES: Record<MapTheme, string> = {
    day: 'amap://styles/whitesmoke',
    night: 'amap://styles/dark',
};
const MAP_SKY: Record<MapTheme, string> = {
    day: '#9ec9ea',
    night: '#1f263a',
};

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

    const initialTheme = mapThemeAt(playback.currentTime);
    const map = new AMap.Map('container', {
        viewMode: '3D', pitch: 55, zoom: 12.5, center: initialCenter,
        mapStyle: MAP_STYLES[initialTheme], skyColor: MAP_SKY[initialTheme]
    });

    let appliedTheme: MapTheme | null = null;
    const applyMapTheme = (epochMs: number) => {
        const theme = mapThemeAt(epochMs);
        if (theme === appliedTheme) {
            return;
        }
        const prev = appliedTheme;
        appliedTheme = theme;
        document.body.classList.toggle('theme-day', theme === 'day');
        document.body.classList.toggle('theme-night', theme === 'night');
        if (prev !== null) {
            map.setMapStyle(MAP_STYLES[theme]);
        }
    };
    applyMapTheme(playback.currentTime);

    const customCoords = map.customCoords;
    customCoords.setCenter(initialCenter);

    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;

    const trackMeshes: THREE.Mesh[] = [];
    const stationMeshes: THREE.Mesh[] = [];
    const stationMarkers: { marker: any; major: boolean; code: string }[] = []; // AMap.Text markers

    // 重要的站 (换乘锚点 + 线路端点): 低缩放级别下只显示这些站名
    const majorStations = new Set<string>();
    for (const meta of lineMetas) {
        majorStations.add(meta.stations[0]);
        majorStations.add(meta.stations[meta.stations.length - 1]);
        majorStations.add(meta.anchorSta);
    }

    let stationLabelsDetailed = false;
    const setMarkerVisible = (marker: any, visible: boolean) => {
        if (visible) {
            marker.show();
        } else {
            marker.hide();
        }
    };
    const updateStationLabelVisibility = () => {
        const zoom = map.getZoom();
        const detailed = zoom >= 14.2;
        if (detailed === stationLabelsDetailed) return;
        stationLabelsDetailed = detailed;
        for (const { marker, major, code } of stationMarkers) {
            setMarkerVisible(marker, (major || detailed) && code !== hoveredStationCode);
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
    const trainPopup = new TrainPopup();
    const stationPopup = new StationPopup();
    let hoveredTrainId: string | null = null;
    let hoveredStationCode: string | null = null;
    let stationByCode = new Map<string, StationCluster>();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerInside = false;

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
        hoveredTrainId = null;
        hoveredStationCode = null;
        trainPopup.hide();
        stationPopup.hide();
        stationByCode = new Map();

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

        // 3. 走线缓存: 高德原始折线转 customCoords, 再对平行重合段做法向并排
        smoothedTracksCache = {};
        const rawCoords: Record<string, number[][]> = {};
        Object.values(railData.tracks).forEach(track => {
            const pathLngLats = track.path.map(p => p.location);
            const coords = customCoords.lngLatsToCoords(pathLngLats);
            rawCoords[track.id] = coords.map((c: number[]) => [c[0], c[1]]);
        });
        smoothedTracksCache = offsetOverlappingPolylines(rawCoords);

        // 4. Rebuild Tracks (MeshLine)
        Object.values(railData.tracks).forEach(track => {
            const smoothedCoords = smoothedTracksCache[track.id];
            if (!smoothedCoords) {
                return;
            }

            const points: number[] = [];
            for (let i = 0; i < smoothedCoords.length; i++) {
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
            material.depthTest = false;

            const mesh = new THREE.Mesh(line, material);
            mesh.renderOrder = 1;
            scene.add(mesh);
            trackMeshes.push(mesh);
        });

        // 4.2 站点: 换乘站椭圆包住并排线路, 普通站仍用圆点
        const stationClusters = clusterStations(railData.tracks, smoothedTracksCache);
        stationByCode = new Map(stationClusters.map(c => [c.code, c]));
        for (const cluster of stationClusters) {
            if (cluster.isInterchange) {
                addStadiumStation(scene, cluster, stationMeshes);
            } else {
                addCircleStation(scene, cluster.cx, cluster.cy, cluster, stationMeshes);
            }

            const sample = cluster.points[0];
            const isMajor = cluster.points.some(p => majorStations.has(p.name));
            if (labeledLocations.has(cluster.code)) {
                continue;
            }
            labeledLocations.add(cluster.code);

            const lng = cluster.points.reduce((s, p) => s + p.location[0], 0) / cluster.points.length;
            const lat = cluster.points.reduce((s, p) => s + p.location[1], 0) / cluster.points.length;
            const textMarker = new AMap.Text({
                text: stationDisplayName(sample.name),
                anchor: 'bottom-center',
                position: [lng, lat],
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
                    'text-shadow': '0 0 6px rgba(0,0,0,0.85), 0 0 6px rgba(148, 197, 255, 0.55)'
                },
                zIndex: 120
            });
            setMarkerVisible(textMarker, isMajor || stationLabelsDetailed);
            map.add(textMarker);
            stationMarkers.push({ marker: textMarker, major: isMajor, code: cluster.code });
        }

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
    new AboutPanel();

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

    const syncStationLabelHover = (hiddenCode: string | null) => {
        for (const { marker, major, code } of stationMarkers) {
            setMarkerVisible(marker, (major || stationLabelsDetailed) && code !== hiddenCode);
        }
    };

    const clearHover = () => {
        hoveredTrainId = null;
        hoveredStationCode = null;
        if (fleet) {
            fleet.syncSelection(null);
        }
        trainPopup.hide();
        stationPopup.hide();
        syncStationLabelHover(null);
    };

    const pickFromPointer = (clientX: number, clientY: number) => {
        if (!camera || !fleet) {
            return;
        }
        const rect = document.getElementById('container')!.getBoundingClientRect();
        pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);

        const trainHit = fleet.pick(raycaster);
        if (trainHit) {
            hoveredTrainId = trainHit.trip.trainId;
            hoveredStationCode = null;
            fleet.syncSelection(hoveredTrainId);
            stationPopup.hide();
            syncStationLabelHover(null);
            return;
        }

        const stationHits = raycaster.intersectObjects(stationMeshes, false);
        let stationCode: string | null = null;
        for (const hit of stationHits) {
            const code = hit.object.userData.stationCode as string | undefined;
            if (code) {
                stationCode = code;
                break;
            }
        }

        if (stationCode) {
            hoveredTrainId = null;
            hoveredStationCode = stationCode;
            fleet.syncSelection(null);
            trainPopup.hide();
            syncStationLabelHover(stationCode);
            return;
        }

        clearHover();
    };

    map.on('mousemove', (e: any) => {
        const origin = e.originEvent as MouseEvent | undefined;
        if (!origin) {
            return;
        }
        const target = origin.target as HTMLElement | null;
        if (target?.closest('.ui-panel, .editor-toggle, .about-toggle, .about-overlay, .alert-bubble, .train-popup, .station-popup')) {
            return;
        }
        pointerInside = true;
        pickFromPointer(origin.clientX, origin.clientY);
    });

    map.on('mouseout', () => {
        pointerInside = false;
        clearHover();
    });

    // 初始 UI 状态
    clockPanel.setLive(playback.isLive);
    clockPanel.setTime(playback.currentTime);
    if (playback.isLive) realtime.start();
    alertBubbles.setVisible(playback.isLive);

    // 调试/测试钩子
    (window as any).__mtrDebug = { playback, realtime, fleetRef: () => fleet, railData, alertBubbles, map, AMap, getScene: () => scene, getTrackMeshes: () => trackMeshes };

    let lastTime = Date.now();
    let lastFleetUpdateMs = 0;

    function animate() {
        const now = Date.now();
        const deltaTime = now - lastTime;
        lastTime = now;

        playback.update(deltaTime);
        realtime.tick(deltaTime);

        const simTime = playback.currentTime;

        if (fleet && camera) {
            const updateFleet = !timeline.powerSave || (now - lastFleetUpdateMs >= 1000);
            if (updateFleet) {
                lastFleetUpdateMs = now;
                fleet.update(simTime);
            }

            const box = document.getElementById('container')!;
            if (pointerInside && hoveredTrainId) {
                const hovered = fleet.getActive(hoveredTrainId);
                if (!hovered || !hovered.active) {
                    clearHover();
                } else {
                    fleet.syncSelection(hoveredTrainId);
                    trainPopup.follow(hovered, camera, box.clientWidth, box.clientHeight);
                    stationPopup.hide();
                }
            } else if (pointerInside && hoveredStationCode) {
                const cluster = stationByCode.get(hoveredStationCode);
                if (!cluster) {
                    clearHover();
                } else {
                    fleet.syncSelection(null);
                    trainPopup.hide();
                    stationPopup.follow(cluster, camera, box.clientWidth, box.clientHeight);
                }
            } else {
                fleet.syncSelection(null);
                trainPopup.hide();
                stationPopup.hide();
            }
        }
        clockPanel.setTime(simTime);
        applyMapTheme(simTime);
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
