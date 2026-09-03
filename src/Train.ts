import { InterpolatedPoint, Point } from './utils';
import * as THREE from 'three';
import { TrainTrip, TripLeg, TrackGeometry } from './types/RailData';

// 列车几何尺寸 (customCoords 单位约等于米, 接近真实比例: 港铁列车约 180-240m)
const TRAIN_W = 55;
const TRAIN_L = 240;
const TRAIN_H = 60;
const TRAIN_ALTITUDE = 35;

export interface TrainStopInfo {
    prevStationId: string;
    prevTime: number;
    nextStationId: string;
    nextTime: number;
    destStationId: string;
}

export class Train {
    map: AMap.Map;
    customCoords: any;

    trip: TrainTrip;
    tracks: Record<string, TrackGeometry>;
    colorHex: string;

    // Use injected smoothed cache or local cache
    trackCoordsCache: Map<string, number[][]>;

    mesh: THREE.Mesh;
    outline: THREE.Mesh;
    active: boolean = false;
    stopInfo: TrainStopInfo | null = null;

    constructor(
        map: AMap.Map,
        customCoords: any,
        trip: TrainTrip,
        tracks: Record<string, TrackGeometry>,
        smoothedTracksCache?: Record<string, number[][]>,
        colorHex: string = '#00ccff'
    ) {
        this.map = map;
        this.customCoords = customCoords;
        this.trip = trip;
        this.tracks = tracks;
        this.colorHex = colorHex;
        this.trackCoordsCache = new Map();

        // Populate cache from injected smoothed paths if available
        if (smoothedTracksCache) {
            Object.keys(smoothedTracksCache).forEach(key => {
                this.trackCoordsCache.set(key, smoothedTracksCache[key]);
            });
        }

        // Initialize Mesh
        const geometry = new THREE.BoxGeometry(TRAIN_W, TRAIN_L, TRAIN_H);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(colorHex),
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.renderOrder = 3;
        this.mesh.userData.train = this;
        // Initially hide until valid time
        this.mesh.visible = false;

        const outlineMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            depthTest: false,
        });
        this.outline = new THREE.Mesh(
            new THREE.BoxGeometry(TRAIN_W * 1.16, TRAIN_L * 1.06, TRAIN_H * 1.2),
            outlineMat
        );
        this.outline.renderOrder = 2.5;
        this.outline.visible = false;
        this.mesh.add(this.outline);

        // Pre-convert coordinates for relevant tracks ONLY if not already cached
        this.trip.legs.forEach(leg => {
            if (!this.trackCoordsCache.has(leg.trackId)) {
                const track = this.tracks[leg.trackId];
                if (track) {
                    const pathLngLats = track.path.map(p => p.location);
                    const coords = this.customCoords.lngLatsToCoords(pathLngLats);
                    this.trackCoordsCache.set(leg.trackId, coords);
                }
            }
        });
    }

    addToScene(scene: THREE.Scene) {
        scene.add(this.mesh);
    }

    removeFromScene(scene: THREE.Scene) {
        scene.remove(this.mesh);
    }

    dispose() {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.outline.geometry.dispose();
        (this.outline.material as THREE.Material).dispose();
    }

    setSelected(selected: boolean) {
        this.outline.visible = selected;
    }

    getPopupAnchor(): THREE.Vector3 {
        return new THREE.Vector3(
            this.mesh.position.x,
            this.mesh.position.y,
            this.mesh.position.z + TRAIN_H / 2 + 28
        );
    }

    applyColor(colorHex: string) {
        this.colorHex = colorHex;
        (this.mesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
    }

    /**
     * @param currentTime 模拟当前时刻 (epoch ms)
     * @param offsetMs 实时修正偏移 (epoch ms), 回放时为 0
     */
    update(currentTime: number, offsetMs: number = 0): Point | null {
        const t = currentTime + offsetMs;
        const legs = this.trip.legs;
        if (!legs || legs.length === 0) {
            this.mesh.visible = false;
            this.stopInfo = null;
            return null;
        }

        // 定位当前所在区间: 行驶中 / 站内停留
        let legIdx = -1;
        let mode: 'run' | 'dwell' = 'run';
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const dep = leg.departureTime + offsetMs;
            const arr = leg.arrivalTime + offsetMs;
            if (t >= dep && t <= arr) { legIdx = i; mode = 'run'; break; }
            // 行程间隙 (停站): t 在本段到站之后、下一段发车之前
            const nextDep = i + 1 < legs.length ? legs[i + 1].departureTime + offsetMs : Infinity;
            if (t > arr && t < nextDep) { legIdx = i; mode = 'dwell'; break; }
        }

        if (legIdx === -1) {
            // 未发车或已终到
            this.mesh.visible = false;
            this.active = false;
            this.stopInfo = null;
            return null;
        }

        const currentLeg = legs[legIdx];
        this.mesh.visible = true;
        this.active = true;
        this.stopInfo = this.buildStopInfo(legs, legIdx, mode, offsetMs);

        const progress = mode === 'dwell'
            ? 1
            : Math.min(1, Math.max(0, (t - currentLeg.departureTime - offsetMs) /
                  Math.max(1, currentLeg.arrivalTime - currentLeg.departureTime)));

        const pathCoords = this.trackCoordsCache.get(currentLeg.trackId);
        const track = this.tracks[currentLeg.trackId];

        if (!pathCoords || !track) return null;

        // Find Station Indices
        const fromIdx = track.path.findIndex(p => p.name === currentLeg.fromStationId);
        const toIdx = track.path.findIndex(p => p.name === currentLeg.toStationId);

        if (fromIdx === -1 || toIdx === -1) return null;

        // Extract Sub-segment: 走线缓存即锚点下标对齐的折线 (与 track.path 一一对应),
        // 站点子路径直接按锚点下标截取, 里程按折线长度加权插值
        let segmentPath: number[][];

        if (fromIdx < toIdx) {
            segmentPath = pathCoords.slice(fromIdx, toIdx + 1);
        } else {
            segmentPath = pathCoords.slice(toIdx, fromIdx + 1).reverse();
        }

        const cur = this.getInterpolatedCoord(segmentPath, progress);

        if (cur) {
            this.mesh.position.set(cur.x, cur.y, TRAIN_ALTITUDE);
            this.mesh.rotation.z = cur.angle - Math.PI / 2;
            return cur;
        }

        return null;
    }

    // Re-implement interpolation (similar to before)
    getInterpolatedCoord(path: number[][], t: number): InterpolatedPoint | null {
        if (!path || path.length < 2) return null;

        const dist = (p1: number[], p2: number[]) => Math.sqrt(Math.pow(p2[0]-p1[0], 2) + Math.pow(p2[1]-p1[1], 2));

        let totalLen = 0;
        for (let i = 0; i < path.length - 1; i++) totalLen += dist(path[i], path[i+1]);

        const targetLen = totalLen * t;
        let currentLen = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i+1];
            const segLen = dist(p1, p2);

            if (currentLen + segLen >= targetLen) {
                const segT = (targetLen - currentLen) / segLen;
                const x = p1[0] + (p2[0] - p1[0]) * segT;
                const y = p1[1] + (p2[1] - p1[1]) * segT;
                const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
                return { x, y, angle };
            }
            currentLen += segLen;
        }

        const last = path[path.length-1];
        const prev = path[path.length-2];
        return { x: last[0], y: last[1], angle: Math.atan2(last[1]-prev[1], last[0]-prev[0]) };
    }

    private buildStopInfo(
        legs: TripLeg[],
        legIdx: number,
        mode: 'run' | 'dwell',
        offsetMs: number
    ): TrainStopInfo {
        const currentLeg = legs[legIdx];
        const destStationId = legs[legs.length - 1].toStationId;

        if (mode === 'run') {
            return {
                prevStationId: currentLeg.fromStationId,
                prevTime: currentLeg.departureTime + offsetMs,
                nextStationId: currentLeg.toStationId,
                nextTime: currentLeg.arrivalTime + offsetMs,
                destStationId,
            };
        }

        const nextLeg = legs[legIdx + 1];
        return {
            prevStationId: currentLeg.toStationId,
            prevTime: currentLeg.arrivalTime + offsetMs,
            nextStationId: nextLeg ? nextLeg.toStationId : '',
            nextTime: nextLeg ? nextLeg.arrivalTime + offsetMs : currentLeg.arrivalTime + offsetMs,
            destStationId,
        };
    }
}
