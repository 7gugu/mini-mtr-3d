// 左上角: 香港时间 (模拟时间) + 日期 + 天文台现时天气 + 实时数据状态

import { HkWeather, fetchHkWeather, weatherIconEmoji } from '../mtr/api';
import { HK_TZ } from '../hktime';
import { getLocale, intlLocale, onLocaleChange, t } from '../i18n';

const WEATHER_INTERVAL_MS = 10 * 60 * 1000;

export class ClockPanel {
    container: HTMLElement;

    private badge: HTMLElement;
    private liveLabel: HTMLElement;
    private tzLabel: HTMLElement;
    private timeEl: HTMLElement;
    private dateEl: HTMLElement;
    private weatherRow: HTMLElement;
    private warnRow: HTMLElement;
    private statusEl: HTMLElement;

    private weather: HkWeather | null = null;
    private isLive = true;
    private lastEpochMs = Date.now();

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'ui-panel clock-panel';

        const topRow = document.createElement('div');
        topRow.className = 'clock-top';
        this.badge = document.createElement('span');
        this.badge.className = 'live-badge';
        this.liveLabel = document.createElement('span');
        this.liveLabel.className = 'live-label';
        topRow.appendChild(this.badge);
        topRow.appendChild(this.liveLabel);
        this.tzLabel = document.createElement('span');
        this.tzLabel.className = 'tz-label';
        topRow.appendChild(this.tzLabel);
        this.container.appendChild(topRow);

        this.timeEl = document.createElement('div');
        this.timeEl.className = 'clock-time';
        this.container.appendChild(this.timeEl);

        this.dateEl = document.createElement('div');
        this.dateEl.className = 'clock-date';
        this.container.appendChild(this.dateEl);

        this.weatherRow = document.createElement('div');
        this.weatherRow.className = 'weather-row';
        this.container.appendChild(this.weatherRow);

        this.warnRow = document.createElement('div');
        this.warnRow.className = 'weather-warnings';
        this.container.appendChild(this.warnRow);

        this.statusEl = document.createElement('div');
        this.statusEl.className = 'api-status';
        this.container.appendChild(this.statusEl);

        document.body.appendChild(this.container);

        this.applyLocale();
        onLocaleChange(() => {
            this.applyLocale();
            void this.refreshWeather();
        });

        void this.refreshWeather();
        setInterval(() => void this.refreshWeather(), WEATHER_INTERVAL_MS);
    }

    private applyLocale() {
        this.tzLabel.textContent = t('hkTime');
        this.setLive(this.isLive);
        this.setTime(this.lastEpochMs);
        if (!this.weather) {
            this.weatherRow.textContent = t('weatherLoading');
        } else {
            this.renderWeather();
        }
    }

    private async refreshWeather() {
        try {
            this.weather = await fetchHkWeather(getLocale() === 'zh' ? 'tc' : 'en');
            this.renderWeather();
        } catch (e) {
            console.warn('[Weather] fetch failed', e);
            this.weatherRow.textContent = t('weatherUnavailable');
        }
    }

    private renderWeather() {
        const w = this.weather;
        if (!w) {
            return;
        }
        const parts: string[] = [];
        parts.push(`${weatherIconEmoji(w.icon)}`);
        if (!isNaN(w.tempC)) {
            parts.push(`${w.tempC}°C`);
        }
        if (!isNaN(w.humidity)) {
            parts.push(`${t('humidity')} ${w.humidity}%`);
        }
        this.weatherRow.textContent = parts.join('  ');

        this.warnRow.innerHTML = '';
        for (const warning of w.warnings.slice(0, 2)) {
            const chip = document.createElement('span');
            chip.className = 'warn-chip';
            chip.textContent = warning;
            this.warnRow.appendChild(chip);
        }
    }

    setTime(epochMs: number) {
        this.lastEpochMs = epochMs;
        const timeFmt = new Intl.DateTimeFormat(intlLocale(), {
            timeZone: HK_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
        const dateFmt = new Intl.DateTimeFormat(intlLocale(), {
            timeZone: HK_TZ, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
        });
        this.timeEl.textContent = timeFmt.format(new Date(epochMs));
        const d = dateFmt.format(new Date(epochMs));
        if (this.dateEl.textContent !== d) {
            this.dateEl.textContent = d;
        }
    }

    setLive(live: boolean) {
        this.isLive = live;
        this.badge.classList.toggle('live', live);
        this.badge.classList.toggle('replay', !live);
        this.liveLabel.textContent = live ? t('live') : t('replay');
        this.renderStatus();
    }

    setApiHealth(healthy: boolean) {
        this.statusEl.classList.toggle('offline', !healthy);
        this.renderStatus();
    }

    private renderStatus() {
        if (!this.isLive) {
            this.statusEl.textContent = t('statusReplay');
        } else if (this.statusEl.classList.contains('offline')) {
            this.statusEl.textContent = t('statusOffline');
        } else {
            this.statusEl.textContent = t('statusLive');
        }
    }
}
