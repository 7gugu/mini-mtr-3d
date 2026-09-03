// src/FleetManager.ts
// 列车车队管理器: 用对象池复用 Mesh, 支持全天数千班次的按需渲染。
// 每帧只实例化"当前时刻正在运行"的列车 (约 300-400 列), 其余复用/回收。

import * as THREE from 'three';
import { Train } from './Train';
import { RailSystemData, TrainTrip } from './types/RailData';
import { lineInfoMap } from './hk_mtr_data';

const DEFAULT_COLOR = '#00ccff';

interface TripWindow {
    trip: TrainTrip;
    startMs: number;
    endMs: number;
    color: string;
}

export class FleetManager {
    private scene: THREE.Scene;
    private map: AMap.Map;
    private customCoords: any;
    private railData: RailSystemData;
    private smoothedCache: Record<string, number[][]>;

    private windows: TripWindow[] = [];
    private pools = new Map<string, Train[]>();   // lineId -> 空闲列车
    private active = new Map<string, Train>();    // trainId -> 在场列车

    offsetProvider: (trainId: string) => number = () => 0;

    constructor(
        scene: THREE.Scene,
        map: AMap.Map,
        customCoords: any,
        railData: RailSystemData,
        smoothedCache: Record<string, number[][]>
    ) {
        this.scene = scene;
        this.map = map;
        this.customCoords = customCoords;
        this.railData = railData;
        this.smoothedCache = smoothedCache;
        this.buildWindows();
    }

    private colorFor(trip: TrainTrip): string {
        if (trip.lineId && lineInfoMap[trip.lineId]) return lineInfoMap[trip.lineId].color;
        const track = this.railData.tracks[trip.legs[0]?.trackId];
        return track?.color || DEFAULT_COLOR;
    }

    private buildWindows() {
        this.windows = this.railData.trips
            .filter(t => t.legs.length > 0)
            .map(trip => ({
                trip,
                startMs: trip.legs[0].departureTime,
                endMs: trip.legs[trip.legs.length - 1].arrivalTime,
                color: this.colorFor(trip)
            }));
    }

    /** 编辑器改动数据后重建索引 (清空池) */
    rebuild() {
        this.disposeAll();
        this.buildWindows();
    }

    private spawn(win: TripWindow): Train {
        const pool = this.pools.get(win.trip.lineId || '_default');
        let train = pool && pool.pop();
        if (!train) {
            train = new Train(
                this.map, this.customCoords, win.trip, this.railData.tracks,
                this.smoothedCache, win.color
            );
            train.addToScene(this.scene);
        } else {
            // 复用: 更新班次与配色
            train.trip = win.trip;
            train.tracks = this.railData.tracks;
            train.applyColor(win.color);
            train.setSelected(false);
        }
        train.trip = win.trip;
        this.active.set(win.trip.trainId, train);
        return train;
    }

    private release(trainId: string) {
        const train = this.active.get(trainId);
        if (!train) return;
        train.mesh.visible = false;
        train.active = false;
        train.setSelected(false);
        train.stopInfo = null;
        const key = train.trip.lineId || '_default';
        let pool = this.pools.get(key);
        if (!pool) { pool = []; this.pools.set(key, pool); }
        pool.push(train);
        this.active.delete(trainId);
    }

    update(simTime: number) {
        const seen = new Set<string>();

        for (const win of this.windows) {
            if (simTime < win.startMs || simTime > win.endMs) continue;
            const id = win.trip.trainId;
            seen.add(id);
            let train = this.active.get(id);
            if (!train) train = this.spawn(win);
            train.update(simTime, this.offsetProvider(id));
        }

        // 回收已终到/未发车的列车
        if (this.active.size > 0) {
            const toRelease: string[] = [];
            this.active.forEach((_, id) => { if (!seen.has(id)) toRelease.push(id); });
            for (const id of toRelease) this.release(id);
        }
    }

    /** 释放全部 Mesh (数据重建/销毁时) */
    disposeAll() {
        this.active.forEach(train => {
            train.removeFromScene(this.scene);
            train.dispose();
        });
        this.active.clear();
        this.pools.forEach(pool => pool.forEach(train => {
            train.removeFromScene(this.scene);
            train.dispose();
        }));
        this.pools.clear();
    }

    getActiveCount(): number {
        return this.active.size;
    }

    getActive(trainId: string): Train | undefined {
        return this.active.get(trainId);
    }

    syncSelection(trainId: string | null) {
        this.active.forEach((train, id) => {
            train.setSelected(id === trainId);
        });
    }

    pick(raycaster: THREE.Raycaster): Train | null {
        const meshes: THREE.Object3D[] = [];
        this.active.forEach(train => {
            if (train.mesh.visible) {
                meshes.push(train.mesh);
            }
        });
        if (meshes.length === 0) {
            return null;
        }
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length === 0) {
            return null;
        }
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
            const train = obj.userData.train as Train | undefined;
            if (train) {
                return train;
            }
            obj = obj.parent;
        }
        return null;
    }
}
