// src/ui/ClockPanel.ts
// 左上角: 香港时间 (模拟时间) + 日期 + 天文台现时天气 + 实时数据状态

import { HkWeather, fetchHkWeather, weatherIconEmoji } from '../mtr/api';
import { HK_TZ } from '../hktime';

const WEATHER_INTERVAL_MS = 10 * 60 * 1000;

const timeFmt = new Intl.DateTimeFormat('zh-HK', {
    timeZone: HK_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});
const dateFmt = new Intl.DateTimeFormat('zh-HK', {
    timeZone: HK_TZ, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
});

export class ClockPanel {
    container: HTMLElement;

    private badge: HTMLElement;
    private liveLabel: HTMLElement;
    private timeEl: HTMLElement;
    private dateEl: HTMLElement;
    private weatherRow: HTMLElement;
    private warnRow: HTMLElement;
    private statusEl: HTMLElement;

    private weather: HkWeather | null = null;
    private isLive = true;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'ui-panel clock-panel';

        // 顶行: LIVE 徽标 + 香港时间标签
        const topRow = document.createElement('div');
        topRow.className = 'clock-top';
        this.badge = document.createElement('span');
        this.badge.className = 'live-badge';
        this.liveLabel = document.createElement('span');
        this.liveLabel.className = 'live-label';
        this.liveLabel.textContent = '直播';
        topRow.appendChild(this.badge);
        topRow.appendChild(this.liveLabel);
        const tz = document.createElement('span');
        tz.className = 'tz-label';
        tz.textContent = '香港時間 HKT';
        topRow.appendChild(tz);
        this.container.appendChild(topRow);

        // 大时钟
        this.timeEl = document.createElement('div');
        this.timeEl.className = 'clock-time';
        this.container.appendChild(this.timeEl);

        // 日期
        this.dateEl = document.createElement('div');
        this.dateEl.className = 'clock-date';
        this.container.appendChild(this.dateEl);

        // 天气行
        this.weatherRow = document.createElement('div');
        this.weatherRow.className = 'weather-row';
        this.weatherRow.textContent = '天氣載入中…';
        this.container.appendChild(this.weatherRow);

        // 警告行
        this.warnRow = document.createElement('div');
        this.warnRow.className = 'weather-warnings';
        this.container.appendChild(this.warnRow);

        // 数据源状态
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'api-status';
        this.container.appendChild(this.statusEl);

        document.body.appendChild(this.container);

        void this.refreshWeather();
        setInterval(() => void this.refreshWeather(), WEATHER_INTERVAL_MS);
    }

    private async refreshWeather() {
        try {
            this.weather = await fetchHkWeather('tc');
            this.renderWeather();
        } catch (e) {
            console.warn('[Weather] fetch failed', e);
            this.weatherRow.textContent = '天氣數據暫不可用';
        }
    }

    private renderWeather() {
        const w = this.weather;
        if (!w) return;
        const parts: string[] = [];
        parts.push(`${weatherIconEmoji(w.icon)}`);
        if (!isNaN(w.tempC)) parts.push(`${w.tempC}°C`);
        if (!isNaN(w.humidity)) parts.push(`濕度 ${w.humidity}%`);
        this.weatherRow.textContent = parts.join('  ');

        this.warnRow.innerHTML = '';
        for (const warning of w.warnings.slice(0, 2)) {
            const chip = document.createElement('span');
            chip.className = 'warn-chip';
            chip.textContent = warning;
            this.warnRow.appendChild(chip);
        }
    }

    /** 每帧/每秒调用: 同步模拟时间显示 */
    setTime(epochMs: number) {
        this.timeEl.textContent = timeFmt.format(new Date(epochMs));
        // 日期只在变化时更新
        const d = dateFmt.format(new Date(epochMs));
        if (this.dateEl.textContent !== d) this.dateEl.textContent = d;
    }

    setLive(live: boolean) {
        this.isLive = live;
        this.badge.classList.toggle('live', live);
        this.badge.classList.toggle('replay', !live);
        this.liveLabel.textContent = live ? '實時' : '回放';
        this.renderStatus();
    }

    setApiHealth(healthy: boolean) {
        this.statusEl.classList.toggle('offline', !healthy);
        this.renderStatus();
    }

    private renderStatus() {
        if (!this.isLive) {
            this.statusEl.textContent = '⏸ 回放模式 · 按計劃時刻表運行';
        } else if (this.statusEl.classList.contains('offline')) {
            this.statusEl.textContent = '⚠ 實時數據連接中斷 · 顯示計劃時刻';
        } else {
            this.statusEl.textContent = '✓ 已連接港鐵實時數據 (data.gov.hk)';
        }
    }
}
