export type Locale = 'en' | 'zh';

export type MessageKey =
  | 'appTitle'
  | 'live'
  | 'replay'
  | 'hkTime'
  | 'weatherLoading'
  | 'weatherUnavailable'
  | 'humidity'
  | 'statusReplay'
  | 'statusOffline'
  | 'statusLive'
  | 'playPause'
  | 'goLive'
  | 'goLiveTitle'
  | 'onLive'
  | 'speedTitle'
  | 'powerSave'
  | 'powerSaveOn'
  | 'powerSaveTitle'
  | 'langToggle'
  | 'langToggleTitle'
  | 'about'
  | 'aboutTitle'
  | 'aboutClose'
  | 'aboutAuthor'
  | 'aboutBlog'
  | 'aboutEmail'
  | 'aboutP1a'
  | 'aboutP1b'
  | 'aboutP2'
  | 'aboutP3'
  | 'editorTitle'
  | 'train'
  | 'boundFor'
  | 'prevStop'
  | 'nextStop'
  | 'terminus'
  | 'noLineData'
  | 'delay'
  | 'specialService'
  | 'updatedAt'
  | 'officialLink';

type Dict = Record<MessageKey, string>;

const en: Dict = {
  appTitle: 'mini mtr',
  live: 'LIVE',
  replay: 'Replay',
  hkTime: 'Hong Kong Time HKT',
  weatherLoading: 'Loading weather…',
  weatherUnavailable: 'Weather unavailable',
  humidity: 'Humidity',
  statusReplay: '⏸ Replay · planned timetable',
  statusOffline: '⚠ Live feed offline · showing planned times',
  statusLive: '✓ Connected to MTR live data (data.gov.hk)',
  playPause: 'Play / Pause',
  goLive: 'Go live',
  goLiveTitle: 'Return to real time (government API)',
  onLive: '● Live',
  speedTitle: 'Replay speed',
  powerSave: 'Power save',
  powerSaveOn: 'Power save · ON',
  powerSaveTitle: 'Power save: update all train positions once per second',
  langToggle: '中文',
  langToggleTitle: 'Switch language',
  about: 'About',
  aboutTitle: 'About mini mtr',
  aboutClose: 'Close',
  aboutAuthor: 'Author ',
  aboutBlog: 'Blog',
  aboutEmail: 'Email',
  aboutP1a: 'I discovered ',
  aboutP1b: ' years ago. Seeing an entire city’s rail network move on a 3D map for the first time was genuinely stunning.',
  aboutP2: 'I kept wondering whether rail networks closer to home could look like that too. The technical bar stayed high for a long time. With AI’s help, I finally built this Hong Kong MTR 3D visualization — mini mtr.',
  aboutP3: 'Timetables are generated from published headways and service windows, so they may differ from real operations. If you have more accurate times, please share them — I’m happy to fix things.',
  editorTitle: 'Track / timetable editor',
  train: 'Train',
  boundFor: 'to ',
  prevStop: 'Prev',
  nextStop: 'Next',
  terminus: 'Terminus',
  noLineData: 'No line data',
  delay: 'Service delay',
  specialService: 'Special service',
  updatedAt: 'Updated',
  officialLink: 'Official special arrangements ↗',
};

const zh: Dict = {
  appTitle: 'mini mtr',
  live: '實時',
  replay: '回放',
  hkTime: '香港時間 HKT',
  weatherLoading: '天氣載入中…',
  weatherUnavailable: '天氣數據暫不可用',
  humidity: '濕度',
  statusReplay: '⏸ 回放模式 · 按計劃時刻表運行',
  statusOffline: '⚠ 實時數據連接中斷 · 顯示計劃時刻',
  statusLive: '✓ 已連接港鐵實時數據 (data.gov.hk)',
  playPause: '播放 / 暫停',
  goLive: '回到現在',
  goLiveTitle: '回到實時狀態 (結合政府 API)',
  onLive: '● 實時中',
  speedTitle: '回放倍速',
  powerSave: '省電',
  powerSaveOn: '省電 · 開',
  powerSaveTitle: '省電模式：全圖列車位置每秒更新一次',
  langToggle: 'EN',
  langToggleTitle: '切換語言',
  about: '關於',
  aboutTitle: '關於 mini mtr',
  aboutClose: '關閉',
  aboutAuthor: '作者 ',
  aboutBlog: '博客',
  aboutEmail: '郵箱',
  aboutP1a: '很早以前我就接觸到 ',
  aboutP1b: '。那是第一次看見整座城市的軌道交通在三維地圖上自己跑起來，當時確實被震撼到了。',
  aboutP2: '那之後一直想：國內的軌交網絡能不能也做成這樣。技術門檻擺在那裡，構想停了很久。現在有了 AI 的幫助，我終於有能力把香港港鐵做成這套 3D 可視化 —— 這就是 mini mtr。',
  aboutP3: '時刻表目前按公開班距與服務時段生成，難免和真實運行有出入。如果你手上有更準確的時間，非常歡迎告訴我，我樂意修正。',
  editorTitle: '軌道/時刻表編輯器',
  train: '列車',
  boundFor: '往',
  prevStop: '上一站',
  nextStop: '下一站',
  terminus: '終點',
  noLineData: '無線路資料',
  delay: '服務延誤',
  specialService: '特別服務安排',
  updatedAt: '更新於',
  officialLink: '查看官方特別服務安排 ↗',
};

const dictionaries: Record<Locale, Dict> = { en, zh };

const LOCALE_KEY = 'mini-mtr-locale';

export function detectBrowserLocale(): Locale {
  const langs = typeof navigator !== 'undefined'
    ? [...(navigator.languages || []), navigator.language]
    : [];
  for (const lang of langs) {
    if (!lang) {
      continue;
    }
    const lower = lang.toLowerCase();
    if (lower.startsWith('zh')) {
      return 'zh';
    }
  }
  return 'en';
}

function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === 'en' || v === 'zh') {
      return v;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // ignore
  }
}

let currentLocale: Locale = readStoredLocale() || detectBrowserLocale();
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function intlLocale(): string {
  return currentLocale === 'zh' ? 'zh-HK' : 'en-HK';
}

export function t(key: MessageKey): string {
  return dictionaries[currentLocale][key] || dictionaries.en[key] || key;
}

export function setLocale(locale: Locale) {
  if (locale === currentLocale) {
    return;
  }
  currentLocale = locale;
  writeStoredLocale(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-HK' : 'en';
  }
  listeners.forEach(fn => fn(locale));
}

export function toggleLocale() {
  setLocale(currentLocale === 'zh' ? 'en' : 'zh');
}

export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function initI18n() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLocale === 'zh' ? 'zh-HK' : 'en';
  }
}
