// src/PlaybackController.ts
// 模拟时间引擎 (UI 在 src/ui/ 下):
//  - LIVE: currentTime 跟随真实时钟, 结合并列实时 API
//  - REPLAY: 用户拖动/倍速推进, 只按计划时刻表运行
// 时间范围 = 服务日 05:30 -> 次日 01:30 (香港时间)

import { SERVICE_DAY_SPAN_MS } from './hktime';

export const SPEEDS = [1, 2, 5, 15, 60];
const LIVE_EPSILON_MS = 2500; // 距离当前时刻小于该值视为"直播"

export type PlaybackMode = 'live' | 'replay';

export class PlaybackController {
    rangeStart: number;
    rangeEnd: number;

    currentTime: number;
    isPlaying: boolean = true;
    isLive: boolean = true;
    speedIdx: number = 0;

    /** 直播/回放切换 (用于启停实时 API) */
    onModeChange?: (mode: PlaybackMode) => void;
    onPlayChange?: (playing: boolean) => void;
    onSpeedChange?: (speed: number) => void;

    constructor(rangeStart: number = Date.now() - SERVICE_DAY_SPAN_MS / 2, rangeEnd?: number) {
        this.rangeStart = rangeStart;
        this.rangeEnd = rangeEnd ?? rangeStart + SERVICE_DAY_SPAN_MS;
        const now = Date.now();
        this.currentTime = Math.min(Math.max(now, this.rangeStart), this.rangeEnd);
        this.isLive = Math.abs(now - this.currentTime) < LIVE_EPSILON_MS;
    }

    get speed(): number {
        return SPEEDS[this.speedIdx];
    }

    update(deltaTimeMs: number) {
        if (!this.isPlaying) return;
        if (this.isLive) {
            this.currentTime = Date.now();
        } else {
            this.currentTime = Math.min(this.rangeEnd, this.currentTime + deltaTimeMs * this.speed);
        }
    }

    /** 拖动/跳转到指定时刻; 距离当前时刻足够近时自动回到直播 */
    seek(t: number) {
        const clamped = Math.min(Math.max(t, this.rangeStart), this.rangeEnd);
        this.currentTime = clamped;
        const live = Math.abs(clamped - Date.now()) < LIVE_EPSILON_MS;
        this.setLive(live);
    }

    seekRatio(ratio: number) {
        this.seek(this.rangeStart + ratio * (this.rangeEnd - this.rangeStart));
    }

    get ratio(): number {
        const span = this.rangeEnd - this.rangeStart;
        if (span <= 0) return 0;
        // 直播时间可能超出服务日窗口 (01:30-05:30 收车空窗), 进度条钳制在两端
        return Math.min(1, Math.max(0, (this.currentTime - this.rangeStart) / span));
    }

    setLive(live: boolean) {
        if (this.isLive === live) return;
        this.isLive = live;
        if (live) this.isPlaying = true;
        this.onModeChange?.(live ? 'live' : 'replay');
    }

    goLive() {
        this.currentTime = Date.now();
        this.setLive(true);
        if (!this.isPlaying) this.togglePlay();
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        // 暂停中恢复时, 若已远离直播时刻则进入回放推进
        this.onPlayChange?.(this.isPlaying);
    }

    cycleSpeed() {
        this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
        this.onSpeedChange?.(this.speed);
        return this.speed;
    }
}
