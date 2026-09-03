// 线路突发事件气泡: 锚定在受影响线路中点站上方, 跟随地图移动。

import { LineIncident } from '../mtr/api';
import { LineInfo, lineDisplayName } from '../hk_mtr_data';
import { getLocale, intlLocale, onLocaleChange, t } from '../i18n';

interface MapLike {
    lngLatToContainer: (lnglat: unknown) => { getX?: () => number; getY?: () => number; x?: number; y?: number };
}

interface BubbleEntry {
    lineId: string;
    info: LineInfo;
    incident: LineIncident;
    root: HTMLElement;
    nameEl: HTMLElement;
    hintEl: HTMLElement;
    card: HTMLElement;
    expanded: boolean;
}

export class AlertBubbles {
    private layer: HTMLElement;
    private entries = new Map<string, BubbleEntry>();
    private map: MapLike;
    private lineInfos: Record<string, LineInfo>;

    constructor(map: MapLike, lineInfos: Record<string, LineInfo>) {
        this.map = map;
        this.lineInfos = lineInfos;
        this.layer = document.createElement('div');
        this.layer.className = 'alert-layer';
        document.body.appendChild(this.layer);
        onLocaleChange(() => this.relocalize());
    }

    setIncidents(incidents: Map<string, LineIncident>) {
        for (const [lineId, entry] of this.entries) {
            if (!incidents.has(lineId)) {
                entry.root.remove();
                this.entries.delete(lineId);
            }
        }
        incidents.forEach((incident, lineId) => {
            const existing = this.entries.get(lineId);
            if (existing && existing.incident.message === incident.message && existing.incident.updatedAt === incident.updatedAt) {
                return;
            }
            if (!existing) {
                this.createBubble(lineId, incident);
            } else {
                existing.incident = incident;
                this.renderBubbleChrome(existing);
                this.renderCard(existing);
            }
        });
    }

    private createBubble(lineId: string, incident: LineIncident) {
        const info = this.lineInfos[lineId];
        if (!info) {
            return;
        }

        const root = document.createElement('div');
        root.className = 'alert-bubble';
        root.style.setProperty('--line-color', info.color);

        const icon = document.createElement('div');
        icon.className = 'alert-icon';
        icon.textContent = '⚠';
        root.appendChild(icon);

        const nameEl = document.createElement('div');
        nameEl.className = 'alert-line-name';
        root.appendChild(nameEl);

        const hintEl = document.createElement('div');
        hintEl.className = 'alert-hint';
        root.appendChild(hintEl);

        const card = document.createElement('div');
        card.className = 'alert-card';
        root.appendChild(card);

        const entry: BubbleEntry = { lineId, info, incident, root, nameEl, hintEl, card, expanded: false };
        root.addEventListener('click', (e) => {
            e.stopPropagation();
            entry.expanded = !entry.expanded;
            root.classList.toggle('expanded', entry.expanded);
        });

        this.layer.appendChild(root);
        this.entries.set(lineId, entry);
        this.renderBubbleChrome(entry);
        this.renderCard(entry);
        this.updatePosition(entry);
    }

    private renderBubbleChrome(entry: BubbleEntry) {
        const locale = getLocale();
        entry.nameEl.textContent = lineDisplayName(entry.info, locale);
        entry.hintEl.textContent = entry.incident.isdelay ? t('delay') : t('specialService');
    }

    private renderCard(entry: BubbleEntry) {
        const { card, incident, info } = entry;
        card.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'alert-card-title';
        title.textContent = `${info.nameZh} ${info.nameEn}`;
        card.appendChild(title);

        const msg = document.createElement('div');
        msg.className = 'alert-card-msg';
        msg.textContent = incident.message;
        card.appendChild(msg);

        const time = document.createElement('div');
        time.className = 'alert-card-time';
        time.textContent = `${t('updatedAt')} ${new Intl.DateTimeFormat(intlLocale(), {
            timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date(incident.updatedAt))}`;
        card.appendChild(time);

        if (incident.url) {
            const link = document.createElement('a');
            link.className = 'alert-card-link';
            link.href = incident.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = t('officialLink');
            card.appendChild(link);
        }
    }

    private relocalize() {
        this.entries.forEach(entry => {
            this.renderBubbleChrome(entry);
            this.renderCard(entry);
        });
    }

    private updatePosition(entry: BubbleEntry) {
        try {
            const px = this.map.lngLatToContainer(entry.info.anchor as [number, number]);
            const x = typeof px.getX === 'function' ? px.getX() : (px.x ?? 0);
            const y = typeof px.getY === 'function' ? px.getY() : (px.y ?? 0);
            entry.root.style.left = `${x}px`;
            entry.root.style.top = `${y}px`;
        } catch {
            // map not ready
        }
    }

    updatePositions() {
        if (this.entries.size === 0) {
            return;
        }
        this.entries.forEach(entry => this.updatePosition(entry));
    }

    setVisible(visible: boolean) {
        this.layer.style.display = visible ? '' : 'none';
    }
}
