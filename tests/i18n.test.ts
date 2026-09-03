import { detectBrowserLocale, t, setLocale, getLocale } from '../src/i18n';

describe('i18n', () => {
    it('defaults dictionaries for both locales', () => {
        setLocale('en');
        expect(t('goLive')).toBe('Go live');
        setLocale('zh');
        expect(t('goLive')).toBe('回到現在');
        expect(getLocale()).toBe('zh');
    });

    it('detects Chinese browser languages', () => {
        const original = navigator.languages;
        Object.defineProperty(navigator, 'languages', {
            configurable: true,
            get: () => ['zh-HK', 'en'],
        });
        expect(detectBrowserLocale()).toBe('zh');
        Object.defineProperty(navigator, 'languages', {
            configurable: true,
            get: () => original,
        });
    });
});
