// 选中列车顶部信息框: 线路 / 方向 / 上一站 / 下一站

import * as THREE from 'three';
import { Train } from '../Train';
import { lineInfoMap, stationDisplayName } from '../hk_mtr_data';
import { HK_TZ } from '../hktime';

const timeFmt = new Intl.DateTimeFormat('zh-HK', {
    timeZone: HK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

function formatHm(epochMs: number): string {
    return timeFmt.format(new Date(epochMs));
}

export class TrainPopup {
    private root: HTMLElement;
    private bar: HTMLElement;
    private lineEl: HTMLElement;
    private dirEl: HTMLElement;
    private prevEl: HTMLElement;
    private nextEl: HTMLElement;
    private lastKey = '';

    public constructor() {
        this.root = document.createElement('div');
        this.root.className = 'train-popup hidden-panel';

        this.bar = document.createElement('div');
        this.bar.className = 'train-popup-bar';
        this.root.appendChild(this.bar);

        const body = document.createElement('div');
        body.className = 'train-popup-body';

        this.lineEl = document.createElement('div');
        this.lineEl.className = 'train-popup-line';
        body.appendChild(this.lineEl);

        this.dirEl = document.createElement('div');
        this.dirEl.className = 'train-popup-dir';
        body.appendChild(this.dirEl);

        this.prevEl = document.createElement('div');
        this.prevEl.className = 'train-popup-stop';
        body.appendChild(this.prevEl);

        this.nextEl = document.createElement('div');
        this.nextEl.className = 'train-popup-stop';
        body.appendChild(this.nextEl);

        this.root.appendChild(body);
        document.body.appendChild(this.root);
    }

    public hide() {
        this.root.classList.add('hidden-panel');
        this.lastKey = '';
    }

    public follow(train: Train, camera: THREE.Camera, width: number, height: number) {
        if (!train.active || !train.stopInfo) {
            this.hide();
            return;
        }

        this.renderContent(train);

        const v = train.getPopupAnchor();
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

    private renderContent(train: Train) {
        const info = train.stopInfo;
        if (!info) {
            return;
        }

        const key = [
            train.trip.trainId,
            info.prevStationId,
            info.nextStationId,
            info.prevTime,
            info.nextTime,
        ].join('|');
        if (key === this.lastKey) {
            return;
        }
        this.lastKey = key;

        const line = train.trip.lineId ? lineInfoMap[train.trip.lineId] : undefined;
        this.lineEl.textContent = line?.nameZh || train.trip.lineId || '列車';
        this.root.style.setProperty('--line-color', line?.color || train.colorHex);

        this.dirEl.textContent = `往${stationDisplayName(info.destStationId)}`;

        this.prevEl.textContent = `上一站: ${stationDisplayName(info.prevStationId)} ${formatHm(info.prevTime)}`;
        if (info.nextStationId) {
            this.nextEl.textContent = `下一站: ${stationDisplayName(info.nextStationId)} ${formatHm(info.nextTime)}`;
        } else {
            this.nextEl.textContent = '下一站: 終點';
        }
    }
}
