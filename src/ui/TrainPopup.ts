// 选中列车顶部信息框: 线路 / 方向 / 上一站 / 下一站

import * as THREE from 'three';
import { Train } from '../Train';
import { lineDisplayName, lineInfoMap, stationDisplayName } from '../hk_mtr_data';
import { HK_TZ } from '../hktime';
import { getLocale, intlLocale, onLocaleChange, t } from '../i18n';

function formatHm(epochMs: number): string {
    return new Intl.DateTimeFormat(intlLocale(), {
        timeZone: HK_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(epochMs));
}

export class TrainPopup {
    private root: HTMLElement;
    private bar: HTMLElement;
    private lineEl: HTMLElement;
    private dirEl: HTMLElement;
    private prevEl: HTMLElement;
    private nextEl: HTMLElement;
    private lastKey = '';
    private lastTrain: Train | null = null;

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

        onLocaleChange(() => {
            this.lastKey = '';
            if (this.lastTrain) {
                this.renderContent(this.lastTrain);
            }
        });
    }

    public hide() {
        this.root.classList.add('hidden-panel');
        this.lastKey = '';
        this.lastTrain = null;
    }

    public follow(train: Train, camera: THREE.Camera, width: number, height: number) {
        if (!train.active || !train.stopInfo) {
            this.hide();
            return;
        }

        this.lastTrain = train;
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

        const locale = getLocale();
        const key = [
            train.trip.trainId,
            info.prevStationId,
            info.nextStationId,
            info.prevTime,
            info.nextTime,
            locale,
        ].join('|');
        if (key === this.lastKey) {
            return;
        }
        this.lastKey = key;

        const line = train.trip.lineId ? lineInfoMap[train.trip.lineId] : undefined;
        this.lineEl.textContent = line
            ? lineDisplayName(line, locale)
            : (train.trip.lineId || t('train'));
        this.root.style.setProperty('--line-color', line?.color || train.colorHex);

        this.dirEl.textContent = `${t('boundFor')}${stationDisplayName(info.destStationId, locale)}`;

        this.prevEl.textContent = `${t('prevStop')}: ${stationDisplayName(info.prevStationId, locale)} ${formatHm(info.prevTime)}`;
        if (info.nextStationId) {
            this.nextEl.textContent = `${t('nextStop')}: ${stationDisplayName(info.nextStationId, locale)} ${formatHm(info.nextTime)}`;
        } else {
            this.nextEl.textContent = `${t('nextStop')}: ${t('terminus')}`;
        }
    }
}
