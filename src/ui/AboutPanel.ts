// 关于面板: 创作缘由与作者说明

const MINI_TOKYO_URL = 'https://minitokyo3d.com/';
const AUTHOR_URL = 'https://github.com/7gugu';

export class AboutPanel {
    public overlay: HTMLElement;
    private toggleBtn: HTMLButtonElement;

    public constructor() {
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.className = 'ui-button about-toggle';
        this.toggleBtn.textContent = '關於';
        this.toggleBtn.title = '關於 mini mtr';
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

        const closeBtn = document.createElement('button');
        closeBtn.className = 'about-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', '關閉');
        closeBtn.textContent = '×';
        closeBtn.onclick = () => this.close();
        card.appendChild(closeBtn);

        const title = document.createElement('h3');
        title.className = 'about-title';
        title.textContent = '關於 mini mtr';
        card.appendChild(title);

        const byline = document.createElement('p');
        byline.className = 'about-byline';
        byline.appendChild(document.createTextNode('作者 '));
        const authorLink = document.createElement('a');
        authorLink.href = AUTHOR_URL;
        authorLink.target = '_blank';
        authorLink.rel = 'noopener';
        authorLink.textContent = '7gugu';
        byline.appendChild(authorLink);
        card.appendChild(byline);

        const body = document.createElement('div');
        body.className = 'about-body';
        body.appendChild(this.para(
            '很早以前我就接觸到 ',
            this.link(MINI_TOKYO_URL, 'Mini Tokyo 3D'),
            '。那是第一次看見整座城市的軌道交通在三維地圖上自己跑起來，當時確實被震撼到了。'
        ));
        body.appendChild(this.para(
            '那之後一直想：國內的軌交網絡能不能也做成這樣。技術門檻擺在那裡，構想停了很久。現在有了 AI 的幫助，我終於有能力把香港港鐵做成這套 3D 可視化 —— 這就是 mini mtr。'
        ));
        body.appendChild(this.para(
            '時刻表目前按公開班距與服務時段生成，難免和真實運行有出入。如果你手上有更準確的時間，非常歡迎告訴我，我樂意修正。'
        ));
        card.appendChild(body);

        this.overlay.appendChild(card);
        document.body.appendChild(this.overlay);

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

    private link(href: string, text: string): HTMLAnchorElement {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = text;
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
