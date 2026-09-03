// 底部居中: 当日全天进度条 (05:30 -> 次日 01:30), 可左右拖动回放。

import { PlaybackController } from '../PlaybackController';
import { getLocale, onLocaleChange, t, toggleLocale } from '../i18n';

const POWER_SAVE_KEY = 'mini-mtr-power-save';

function readPowerSave(): boolean {
    try {
        return localStorage.getItem(POWER_SAVE_KEY) === '1';
    } catch {
        return false;
    }
}

function writePowerSave(on: boolean) {
    try {
        localStorage.setItem(POWER_SAVE_KEY, on ? '1' : '0');
    } catch {
        // ignore
    }
}

function fmtHkClock(ms: number): string {
    return new Intl.DateTimeFormat(getLocale() === 'zh' ? 'zh-HK' : 'en-HK', {
        timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ms));
}

export class Timeline {
    container: HTMLElement;
    private playback: PlaybackController;

    private playBtn: HTMLButtonElement;
    private speedBtn: HTMLButtonElement;
    private liveBtn: HTMLButtonElement;
    private powerBtn: HTMLButtonElement;
    private langBtn: HTMLButtonElement;
    private trackEl: HTMLElement;
    private fillEl: HTMLElement;
    private handleEl: HTMLElement;
    private bubbleEl: HTMLElement;
    private labelsEl: HTMLElement;

    private dragging = false;
    public powerSave = false;

    constructor(playback: PlaybackController) {
        this.playback = playback;
        this.powerSave = readPowerSave();

        this.container = document.createElement('div');
        this.container.className = 'ui-panel timeline-panel';

        const controls = document.createElement('div');
        controls.className = 'tl-controls';

        this.playBtn = document.createElement('button');
        this.playBtn.className = 'ui-button tl-btn';
        this.playBtn.onclick = () => {
            this.playback.togglePlay();
            if (!this.playback.isPlaying && this.playback.isLive) {
                this.playback.setLive(false);
            }
            this.refreshButtons();
        };
        controls.appendChild(this.playBtn);

        this.liveBtn = document.createElement('button');
        this.liveBtn.className = 'ui-button tl-btn live-btn';
        this.liveBtn.onclick = () => this.playback.goLive();
        controls.appendChild(this.liveBtn);

        this.speedBtn = document.createElement('button');
        this.speedBtn.className = 'ui-button tl-btn speed-btn';
        this.speedBtn.onclick = () => this.playback.cycleSpeed();
        controls.appendChild(this.speedBtn);

        this.powerBtn = document.createElement('button');
        this.powerBtn.className = 'ui-button tl-btn power-btn';
        this.powerBtn.setAttribute('aria-pressed', 'false');
        this.powerBtn.onclick = () => {
            this.powerSave = !this.powerSave;
            writePowerSave(this.powerSave);
            this.syncPowerButton();
        };
        controls.appendChild(this.powerBtn);

        this.langBtn = document.createElement('button');
        this.langBtn.className = 'ui-button tl-btn lang-btn';
        this.langBtn.onclick = () => toggleLocale();
        controls.appendChild(this.langBtn);

        this.container.appendChild(controls);

        this.trackEl = document.createElement('div');
        this.trackEl.className = 'tl-track';

        this.fillEl = document.createElement('div');
        this.fillEl.className = 'tl-fill';
        this.trackEl.appendChild(this.fillEl);

        this.handleEl = document.createElement('div');
        this.handleEl.className = 'tl-handle';
        this.trackEl.appendChild(this.handleEl);

        this.bubbleEl = document.createElement('div');
        this.bubbleEl.className = 'tl-bubble';
        this.trackEl.appendChild(this.bubbleEl);

        const hitArea = document.createElement('div');
        hitArea.className = 'tl-hit';
        hitArea.appendChild(this.trackEl);
        this.attachDrag(hitArea);
        this.container.appendChild(hitArea);

        this.labelsEl = document.createElement('div');
        this.labelsEl.className = 'tl-labels';
        this.container.appendChild(this.labelsEl);
        this.buildTicks();

        document.body.appendChild(this.container);
        this.applyLocale();
        onLocaleChange(() => this.applyLocale());
    }

    private applyLocale() {
        this.playBtn.title = t('playPause');
        this.liveBtn.title = t('goLiveTitle');
        this.speedBtn.title = t('speedTitle');
        this.powerBtn.title = t('powerSaveTitle');
        this.langBtn.title = t('langToggleTitle');
        this.langBtn.textContent = t('langToggle');
        this.syncPowerButton();
        this.refreshButtons();
    }

    private buildTicks() {
        const { rangeStart, rangeEnd } = this.playback;
        const span = rangeEnd - rangeStart;
        const HK_OFF = 8 * 3600 * 1000;
        const firstHour = Math.ceil((rangeStart + HK_OFF) / 3600000) * 3600000 - HK_OFF;
        const frag = document.createDocumentFragment();
        for (let t = firstHour; t <= rangeEnd; t += 3600000) {
            const r = (t - rangeStart) / span;
            const tick = document.createElement('div');
            tick.className = 'tl-tick';
            tick.style.left = `${(r * 100).toFixed(3)}%`;
            frag.appendChild(tick);

            const hkHour = new Date(t).getUTCHours() + 8;
            const isLabel = (hkHour + 24) % 24 % 3 === 0;
            if (isLabel) {
                const label = document.createElement('span');
                label.className = 'tl-tick-label';
                label.style.left = `${(r * 100).toFixed(3)}%`;
                label.textContent = `${String(hkHour % 24).padStart(2, '0')}:00`;
                this.labelsEl.appendChild(label);
            }
        }
        this.trackEl.appendChild(frag);
    }

    private attachDrag(el: HTMLElement) {
        el.classList.add('tl-draggable');
        const ratioFromEvent = (e: PointerEvent) => {
            const rect = this.trackEl.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        };
        el.addEventListener('pointerdown', (e) => {
            this.dragging = true;
            el.setPointerCapture(e.pointerId);
            this.playback.seekRatio(ratioFromEvent(e));
            this.bubbleEl.style.opacity = '1';
            this.render();
        });
        el.addEventListener('pointermove', (e) => {
            if (!this.dragging) {
                return;
            }
            this.playback.seekRatio(ratioFromEvent(e));
            this.render();
        });
        const end = () => {
            if (!this.dragging) {
                return;
            }
            this.dragging = false;
            this.bubbleEl.style.opacity = '0';
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }

    private syncPowerButton() {
        this.powerBtn.classList.toggle('active', this.powerSave);
        this.powerBtn.setAttribute('aria-pressed', String(this.powerSave));
        this.powerBtn.textContent = this.powerSave ? t('powerSaveOn') : t('powerSave');
    }

    private refreshButtons() {
        this.playBtn.innerHTML = this.playback.isPlaying ? '⏸' : '▶';
        this.speedBtn.textContent = `${this.playback.speed}×`;
        this.liveBtn.classList.toggle('on-live', this.playback.isLive);
        this.liveBtn.textContent = this.playback.isLive ? t('onLive') : t('goLive');
    }

    render() {
        const pct = (this.playback.ratio * 100).toFixed(3);
        this.fillEl.style.width = `${pct}%`;
        this.handleEl.style.left = `${pct}%`;
        this.bubbleEl.style.left = `${pct}%`;
        this.bubbleEl.textContent = fmtHkClock(this.playback.currentTime);
        if (!this.dragging) {
            this.refreshButtons();
        }
    }
}
