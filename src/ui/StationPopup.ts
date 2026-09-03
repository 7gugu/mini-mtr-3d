// 站点悬停提示: 站名 + 途经线路色块列表

import * as THREE from 'three';
import { LineInfo, linesServingStationCode, stationDisplayName } from '../hk_mtr_data';
import { StationCluster } from '../trackLayout';

export class StationPopup {
    private root: HTMLElement;
    private nameEl: HTMLElement;
    private linesEl: HTMLElement;
    private lastCode = '';

    public constructor() {
        this.root = document.createElement('div');
        this.root.className = 'station-popup hidden-panel';

        this.nameEl = document.createElement('div');
        this.nameEl.className = 'station-popup-name';
        this.root.appendChild(this.nameEl);

        this.linesEl = document.createElement('div');
        this.linesEl.className = 'station-popup-lines';
        this.root.appendChild(this.linesEl);

        document.body.appendChild(this.root);
    }

    public hide() {
        this.root.classList.add('hidden-panel');
        this.lastCode = '';
    }

    public follow(
        cluster: StationCluster,
        camera: THREE.Camera,
        width: number,
        height: number
    ) {
        this.renderContent(cluster);

        const v = new THREE.Vector3(cluster.cx, cluster.cy, 40);
        v.project(camera);
        if (v.z < -1 || v.z > 1) {
            this.hide();
            return;
        }

        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-v.y * 0.5 + 0.5) * height;
        this.root.style.left = `${x}px`;
        this.root.style.top = `${y}px`;
        this.root.classList.remove('hidden-panel');
    }

    private renderContent(cluster: StationCluster) {
        if (cluster.code === this.lastCode) {
            return;
        }
        this.lastCode = cluster.code;

        const sample = cluster.points[0]?.name || cluster.code;
        this.nameEl.textContent = stationDisplayName(sample);

        const lines = linesServingStationCode(cluster.code);
        this.linesEl.innerHTML = '';
        for (const line of lines) {
            this.linesEl.appendChild(this.lineRow(line));
        }
        if (lines.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'station-popup-line-row';
            empty.textContent = '無線路資料';
            this.linesEl.appendChild(empty);
        }
    }

    private lineRow(line: LineInfo): HTMLElement {
        const row = document.createElement('div');
        row.className = 'station-popup-line-row';

        const swatch = document.createElement('span');
        swatch.className = 'station-popup-swatch';
        swatch.style.background = line.color;
        row.appendChild(swatch);

        const label = document.createElement('span');
        label.textContent = line.nameZh;
        row.appendChild(label);
        return row;
    }
}
