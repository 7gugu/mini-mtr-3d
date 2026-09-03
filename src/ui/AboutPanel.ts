// 关于面板: 创作缘由与作者说明

import { onLocaleChange, t } from '../i18n';

const MINI_TOKYO_URL = 'https://minitokyo3d.com/';
const AUTHOR_URL = 'https://github.com/7gugu';
const BLOG_URL = 'https://7gugu.com';
const EMAIL = 'gz7gugu@qq.com';

export class AboutPanel {
    public overlay: HTMLElement;
    private toggleBtn: HTMLButtonElement;
    private closeBtn: HTMLButtonElement;
    private titleEl: HTMLElement;
    private bylineEl: HTMLElement;
    private contactEl: HTMLElement;
    private authorLink: HTMLAnchorElement;
    private bodyEl: HTMLElement;

    public constructor() {
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.className = 'ui-button about-toggle';
        this.toggleBtn.onclick = () => this.open();
        document.body.appendChild(this.toggleBtn);

        this.overlay = document.createElement('div');
        this.overlay.className = 'about-overlay hidden-panel';
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        const card = document.createElement('div');
        card.className = 'ui-panel about-card';

        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'about-close';
        this.closeBtn.type = 'button';
        this.closeBtn.textContent = '×';
        this.closeBtn.onclick = () => this.close();
        card.appendChild(this.closeBtn);

        this.titleEl = document.createElement('h3');
        this.titleEl.className = 'about-title';
        card.appendChild(this.titleEl);

        this.bylineEl = document.createElement('p');
        this.bylineEl.className = 'about-byline';
        this.authorLink = document.createElement('a');
        this.authorLink.href = AUTHOR_URL;
        this.authorLink.target = '_blank';
        this.authorLink.rel = 'noopener';
        this.authorLink.textContent = '7gugu';
        this.bylineEl.appendChild(this.authorLink);
        card.appendChild(this.bylineEl);

        this.contactEl = document.createElement('p');
        this.contactEl.className = 'about-contact';
        card.appendChild(this.contactEl);

        this.bodyEl = document.createElement('div');
        this.bodyEl.className = 'about-body';
        card.appendChild(this.bodyEl);

        this.overlay.appendChild(card);
        document.body.appendChild(this.overlay);

        this.applyLocale();
        onLocaleChange(() => this.applyLocale());

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.overlay.classList.contains('hidden-panel')) {
                this.close();
            }
        });
    }

    public open() {
        this.overlay.classList.remove('hidden-panel');
        this.toggleBtn.classList.add('active');
    }

    public close() {
        this.overlay.classList.add('hidden-panel');
        this.toggleBtn.classList.remove('active');
    }

    private applyLocale() {
        this.toggleBtn.textContent = t('about');
        this.toggleBtn.title = t('aboutTitle');
        this.closeBtn.setAttribute('aria-label', t('aboutClose'));
        this.titleEl.textContent = t('aboutTitle');
        this.bylineEl.replaceChildren(document.createTextNode(t('aboutAuthor')), this.authorLink);
        this.contactEl.replaceChildren(
            document.createTextNode(`${t('aboutBlog')}: `),
            this.link(BLOG_URL, '7gugu.com'),
            document.createTextNode(` · ${t('aboutEmail')}: `),
            this.mailLink(EMAIL),
        );
        this.bodyEl.replaceChildren(
            this.para(t('aboutP1a'), this.link(MINI_TOKYO_URL, 'Mini Tokyo 3D'), t('aboutP1b')),
            this.para(t('aboutP2')),
            this.para(t('aboutP3')),
        );
    }

    private link(href: string, text: string): HTMLAnchorElement {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = text;
        return a;
    }

    private mailLink(email: string): HTMLAnchorElement {
        const a = document.createElement('a');
        a.href = `mailto:${email}`;
        a.textContent = email;
        return a;
    }

    private para(...parts: Array<string | HTMLElement>): HTMLParagraphElement {
        const p = document.createElement('p');
        for (const part of parts) {
            if (typeof part === 'string') {
                p.appendChild(document.createTextNode(part));
            } else {
                p.appendChild(part);
            }
        }
        return p;
    }
}
