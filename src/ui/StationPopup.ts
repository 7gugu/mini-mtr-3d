// 站点悬停提示: 站名 + 途经线路色块列表

import * as THREE from 'three';
import { LineInfo, lineDisplayName, linesServingStationCode, stationDisplayName } from '../hk_mtr_data';
import { StationCluster } from '../trackLayout';
import { getLocale, onLocaleChange, t } from '../i18n';

export class StationPopup {
    private root: HTMLElement;
    private nameEl: HTMLElement;
    private linesEl: HTMLElement;
    private lastKey = '';
    private lastCluster: StationCluster | null = null;

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

        onLocaleChange(() => {
            this.lastKey = '';
            if (this.lastCluster) {
                this.renderContent(this.lastCluster);
            }
        });
    }

    public hide() {
        this.root.classList.add('hidden-panel');
        this.lastKey = '';
        this.lastCluster = null;
    }

    public follow(
        cluster: StationCluster,
        camera: THREE.Camera,
        width: number,
        height: number
    ) {
        this.lastCluster = cluster;
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
        const locale = getLocale();
        const key = `${cluster.code}|${locale}`;
        if (key === this.lastKey) {
            return;
        }
        this.lastKey = key;

        const sample = cluster.points[0]?.name || cluster.code;
        this.nameEl.textContent = stationDisplayName(sample, locale);

        const lines = linesServingStationCode(cluster.code);
        this.linesEl.innerHTML = '';
        for (const line of lines) {
            this.linesEl.appendChild(this.lineRow(line));
        }
        if (lines.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'station-popup-line-row';
            empty.textContent = t('noLineData');
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
        label.textContent = lineDisplayName(line, getLocale());
        row.appendChild(label);
        return row;
    }
}
