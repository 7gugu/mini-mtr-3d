// src/ui/AlertBubbles.ts
// 线路突发事件气泡: 锚定在受影响线路中点站上方, 跟随地图移动。
// 点击展开详情 (官方文案 + 详情链接)。仅在实时模式下显示。

import { LineIncident } from '../mtr/api';
import { LineInfo } from '../hk_mtr_data';

/** 最小地图接口 (避免与 main 循环导入) */
interface MapLike {
    lngLatToContainer: (lnglat: unknown) => { getX?: () => number; getY?: () => number; x?: number; y?: number };
}

interface BubbleEntry {
    lineId: string;
    info: LineInfo;
    incident: LineIncident;
    root: HTMLElement;   // 定位容器 (跟随地图)
    card: HTMLElement;   // 展开的详情卡
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
    }

    /** 实时管理器回调: 全量同步气泡 */
    setIncidents(incidents: Map<string, LineIncident>) {
        // 移除已解除的
        for (const [lineId, entry] of this.entries) {
            if (!incidents.has(lineId)) {
                entry.root.remove();
                this.entries.delete(lineId);
            }
        }
        // 新增/更新
        incidents.forEach((incident, lineId) => {
            const existing = this.entries.get(lineId);
            if (existing && existing.incident.message === incident.message && existing.incident.updatedAt === incident.updatedAt) {
                return;
            }
            if (!existing) {
                this.createBubble(lineId, incident);
            } else {
                existing.incident = incident;
                this.renderCard(existing);
            }
        });
    }

    private createBubble(lineId: string, incident: LineIncident) {
        // 线路锚点可能缺失 (编辑器自定义数据)
        const info = this.lineInfos[lineId];
        if (!info) return;

        const root = document.createElement('div');
        root.className = 'alert-bubble';
        root.style.setProperty('--line-color', info.color);

        const icon = document.createElement('div');
        icon.className = 'alert-icon';
        icon.textContent = '⚠';
        root.appendChild(icon);

        const name = document.createElement('div');
        name.className = 'alert-line-name';
        name.textContent = info.nameZh;
        root.appendChild(name);

        const hint = document.createElement('div');
        hint.className = 'alert-hint';
        hint.textContent = incident.isdelay ? '服務延誤' : '特別服務安排';
        root.appendChild(hint);

        const card = document.createElement('div');
        card.className = 'alert-card';
        root.appendChild(card);

        root.addEventListener('click', (e) => {
            e.stopPropagation();
            entry.expanded = !entry.expanded;
            root.classList.toggle('expanded', entry.expanded);
        });

        this.layer.appendChild(root);
        const entry: BubbleEntry = { lineId, info, incident, root, card, expanded: false };
        this.entries.set(lineId, entry);
        this.renderCard(entry);
        this.updatePosition(entry);
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
        time.textContent = `更新於 ${new Intl.DateTimeFormat('zh-HK', {
            timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date(incident.updatedAt))}`;
        card.appendChild(time);

        if (incident.url) {
            const link = document.createElement('a');
            link.className = 'alert-card-link';
            link.href = incident.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = '查看官方特別服務安排 ↗';
            card.appendChild(link);
        }
    }

    private updatePosition(entry: BubbleEntry) {
        try {
            const px = this.map.lngLatToContainer(entry.info.anchor as [number, number]);
            const x = typeof px.getX === 'function' ? px.getX() : (px.x ?? 0);
            const y = typeof px.getY === 'function' ? px.getY() : (px.y ?? 0);
            entry.root.style.left = `${x}px`;
            entry.root.style.top = `${y}px`;
        } catch {
            // 地图未就绪
        }
    }

    /** 每帧调用: 气泡跟随地图 */
    updatePositions() {
        if (this.entries.size === 0) return;
        this.entries.forEach(entry => this.updatePosition(entry));
    }

    setVisible(visible: boolean) {
        this.layer.style.display = visible ? '' : 'none';
    }
}
