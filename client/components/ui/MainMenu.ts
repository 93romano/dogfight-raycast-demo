/**
 * Main menu / title screen.
 * Visual design: "Modern Military HUD" title screen generated with Google Stitch
 * (see docs/design/stitch-menu.html).
 */
export interface MainMenuOptions {
  onStart: () => void;
}

const C = {
  primary: '#3399FF',
  bright: '#66CCFF',
  text: '#E6F1FF',
  secondary: '#8FA9C8',
  muted: '#5A7290',
  fontHead: "'Space Grotesk', 'Noto Sans KR', sans-serif",
  fontMono: "'Space Mono', 'Noto Sans KR', monospace"
};

export class MainMenu {
  private readonly container: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly abortController = new AbortController();

  constructor(private readonly options: MainMenuOptions) {
    document.body.classList.add('state-menu');

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position:fixed;inset:0;z-index:900;overflow:hidden;
      background:#070B12;color:${C.text};font-family:${C.fontHead};
      transition:opacity .4s ease;
    `;

    // perspective grid backdrop
    this.grid = document.createElement('div');
    this.grid.style.cssText = `
      position:absolute;width:200%;height:200%;top:-50%;left:-50%;z-index:1;
      background-image:linear-gradient(to right, rgba(51,153,255,.08) 1px, transparent 1px),
                       linear-gradient(to bottom, rgba(51,153,255,.08) 1px, transparent 1px);
      background-size:60px 60px;transform:perspective(500px) rotateX(60deg);
      -webkit-mask-image:radial-gradient(circle, black 30%, transparent 70%);
      mask-image:radial-gradient(circle, black 30%, transparent 70%);
    `;
    this.container.appendChild(this.grid);

    // vignette + scanlines
    const vignette = document.createElement('div');
    vignette.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(circle, transparent 40%, rgba(7,11,18,.9) 100%);';
    this.container.appendChild(vignette);
    const scan = document.createElement('div');
    scan.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none;background:repeating-linear-gradient(0deg, rgba(0,0,0,.05), rgba(0,0,0,.05) 1px, transparent 1px, transparent 2px);';
    this.container.appendChild(scan);

    this.addCornerBrackets();

    // top bar
    const header = document.createElement('header');
    header.style.cssText = 'position:absolute;top:0;left:0;width:100%;z-index:30;display:flex;justify-content:space-between;align-items:center;padding:22px 32px;';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="color:${C.primary};font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;">System Online</span>
        <div style="width:64px;height:1px;background:rgba(51,153,255,.3);"></div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;font-family:${C.fontMono};">
        <div style="text-align:right;line-height:1.2;">
          <div style="font-size:10px;color:${C.muted};">PILOT_ID</div>
          <div style="font-size:12px;color:${C.primary};font-weight:700;">VIPER_77</div>
        </div>
        <span class="material-symbols-outlined" style="color:${C.primary};font-size:26px;">account_circle</span>
      </div>`;
    this.container.appendChild(header);

    // center content
    const main = document.createElement('main');
    main.style.cssText = 'position:relative;z-index:20;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 20px;';

    const titleBlock = document.createElement('div');
    titleBlock.style.cssText = 'margin-bottom:48px;animation:hudFlicker 4s infinite;';
    titleBlock.innerHTML = `
      <h1 style="margin:0;font-family:${C.fontHead};font-weight:900;font-size:clamp(64px,12vw,150px);line-height:.9;letter-spacing:-.03em;color:${C.primary};text-transform:uppercase;text-shadow:0 0 15px rgba(51,153,255,.6),0 0 30px rgba(51,153,255,.3);">DOGFIGHT</h1>
      <p style="margin:18px 0 0;font-family:${C.fontMono};font-size:14px;letter-spacing:.4em;color:${C.secondary};text-transform:uppercase;">MULTIPLAYER FLIGHT COMBAT</p>`;
    main.appendChild(titleBlock);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:28px;width:100%;max-width:320px;';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.textContent = '게임 시작';
    startBtn.style.cssText = `
      width:100%;background:${C.primary};color:#070B12;border:none;
      font-family:${C.fontHead};font-weight:700;font-size:20px;letter-spacing:.18em;
      text-transform:uppercase;padding:16px;cursor:pointer;
      clip-path:polygon(8% 0,100% 0,100% 68%,92% 100%,0 100%,0 32%);
      box-shadow:0 0 15px rgba(51,153,255,.4);transition:all .3s cubic-bezier(.4,0,.2,1);
    `;
    startBtn.addEventListener('mouseenter', () => {
      startBtn.style.background = C.bright;
      startBtn.style.boxShadow = '0 0 25px rgba(51,153,255,.6)';
      startBtn.style.transform = 'translateY(-2px)';
    }, { signal: this.abortController.signal });
    startBtn.addEventListener('mouseleave', () => {
      startBtn.style.background = C.primary;
      startBtn.style.boxShadow = '0 0 15px rgba(51,153,255,.4)';
      startBtn.style.transform = 'translateY(0)';
    }, { signal: this.abortController.signal });
    startBtn.addEventListener('click', () => this.start(), { signal: this.abortController.signal });
    actions.appendChild(startBtn);

    const nav = document.createElement('nav');
    nav.style.cssText = `display:flex;align-items:center;gap:16px;font-family:${C.fontHead};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${C.secondary};`;
    nav.innerHTML = `
      <a data-action="start" style="cursor:pointer;">빠른 매치</a>
      <span style="width:4px;height:4px;border-radius:50%;background:${C.muted};"></span>
      <a data-action="soon" style="cursor:pointer;">랭킹</a>
      <span style="width:4px;height:4px;border-radius:50%;background:${C.muted};"></span>
      <a data-action="soon" style="cursor:pointer;">격납고</a>`;
    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('mouseenter', () => (a.style.color = C.bright), { signal: this.abortController.signal });
      a.addEventListener('mouseleave', () => (a.style.color = C.secondary), { signal: this.abortController.signal });
      a.addEventListener('click', () => {
        if (a.getAttribute('data-action') === 'start') this.start();
      }, { signal: this.abortController.signal });
    });
    actions.appendChild(nav);
    main.appendChild(actions);

    // decorative telemetry
    const telemetry = document.createElement('div');
    telemetry.style.cssText = `position:absolute;bottom:96px;left:50%;transform:translateX(-50%);width:100%;max-width:640px;padding:0 32px;display:flex;justify-content:space-between;align-items:flex-end;opacity:.4;font-family:${C.fontMono};font-size:10px;`;
    telemetry.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;text-align:left;">
        <div><span style="color:${C.muted};">LAT:</span> <span style="color:${C.primary};">37.5665 N</span></div>
        <div><span style="color:${C.muted};">LNG:</span> <span style="color:${C.primary};">126.9780 E</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;text-align:right;">
        <div><span style="color:${C.muted};">ALT:</span> <span style="color:${C.primary};">024,500 FT</span></div>
        <div><span style="color:${C.muted};">SPD:</span> <span style="color:${C.primary};">1,240 KTS</span></div>
      </div>`;
    main.appendChild(telemetry);
    this.container.appendChild(main);

    // footer
    const footer = document.createElement('footer');
    footer.style.cssText = `position:absolute;bottom:0;left:0;width:100%;z-index:30;display:flex;justify-content:space-between;align-items:center;padding:22px 40px;font-family:${C.fontMono};font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.muted};`;
    footer.innerHTML = `
      <span style="color:${C.primary};font-weight:700;">VER 0.9.0_STABLE</span>
      <span>© 2026 DOGFIGHT SYSTEMS. ALL RIGHTS RESERVED.</span>`;
    this.container.appendChild(footer);

    // parallax grid tilt
    document.addEventListener('mousemove', this.handleMouseMove, { signal: this.abortController.signal });

    document.body.appendChild(this.container);
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const x = (window.innerWidth / 2 - e.pageX) / 50;
    const y = (window.innerHeight / 2 - e.pageY) / 50;
    this.grid.style.transform = `perspective(500px) rotateX(${60 + y}deg) rotateY(${x}deg)`;
  };

  private addCornerBrackets(): void {
    const specs: Array<[string, string]> = [
      ['top:32px;left:32px', 'border-right:none;border-bottom:none'],
      ['top:32px;right:32px', 'border-left:none;border-bottom:none'],
      ['bottom:32px;left:32px', 'border-right:none;border-top:none'],
      ['bottom:32px;right:32px', 'border-left:none;border-top:none']
    ];
    specs.forEach(([pos, off]) => {
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;width:40px;height:40px;border:2px solid rgba(51,153,255,.4);z-index:25;${pos};${off};`;
      this.container.appendChild(b);
    });
  }

  private start(): void {
    this.hide();
    this.options.onStart();
  }

  public hide(): void {
    this.abortController.abort();
    document.body.classList.remove('state-menu');
    if (this.container.parentNode) {
      this.container.style.opacity = '0';
      setTimeout(() => {
        if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
      }, 400);
    }
  }

  public dispose(): void {
    this.abortController.abort();
    document.body.classList.remove('state-menu');
    if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
  }
}
