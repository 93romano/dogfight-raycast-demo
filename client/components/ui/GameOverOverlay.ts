/**
 * Game-over / elimination overlay.
 * Visual design: "Modern Military HUD" game-over screen generated with Google Stitch
 * (see docs/design/stitch-gameover.html).
 */
export interface GameOverStats {
  killedBy?: string;
  kills?: number;
  deaths?: number;
  score?: number;
}

export interface GameOverOverlayOptions {
  onRespawn: () => void;
  onMainMenu: () => void;
}

const C = {
  primary: '#3399FF',
  bright: '#66CCFF',
  danger: '#F44336',
  text: '#E6F1FF',
  secondary: '#8FA9C8',
  muted: '#5A7290',
  fontHead: "'Space Grotesk', 'Noto Sans KR', sans-serif",
  fontMono: "'Space Mono', 'Noto Sans KR', monospace"
};

export class GameOverOverlay {
  private readonly container: HTMLDivElement;
  private readonly killedByEl: HTMLElement;
  private readonly killsEl: HTMLElement;
  private readonly deathsEl: HTMLElement;
  private readonly kdEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly abortController = new AbortController();

  constructor(private readonly options: GameOverOverlayOptions) {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position:fixed;inset:0;z-index:1100;display:none;overflow:hidden;
      background:#070B12;color:${C.text};font-family:${C.fontHead};
      opacity:0;transition:opacity .35s ease;
    `;

    // backdrop: vignette + animated scanline + tactical grid
    const bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;z-index:0;';
    bg.innerHTML = `
      <div style="position:absolute;inset:0;background:radial-gradient(circle, transparent 20%, rgba(7,11,18,.9) 100%);"></div>
      <div style="position:absolute;inset:0;opacity:.1;background-image:linear-gradient(rgba(51,153,255,.2) 1px,transparent 1px),linear-gradient(90deg,rgba(51,153,255,.2) 1px,transparent 1px);background-size:50px 50px;"></div>
      <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,transparent,rgba(51,153,255,.05) 50%,transparent);animation:scanMove 8s linear infinite;pointer-events:none;"></div>`;
    this.container.appendChild(bg);

    // top bar
    const header = document.createElement('header');
    header.style.cssText = `position:absolute;top:0;left:0;width:100%;z-index:30;height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;background:rgba(7,11,18,.8);backdrop-filter:blur(8px);border-bottom:1px solid rgba(51,153,255,.3);`;
    header.innerHTML = `
      <div style="font-weight:900;font-style:italic;letter-spacing:-.02em;color:${C.primary};text-shadow:0 0 12px rgba(51,153,255,.45);">DOGFIGHT</div>
      <div style="font-family:${C.fontHead};font-size:13px;letter-spacing:.2em;color:${C.primary};text-transform:uppercase;">SERVER ONLINE // 24MS</div>`;
    this.container.appendChild(header);

    this.addCornerBrackets();

    // main content
    const main = document.createElement('main');
    main.style.cssText = 'position:relative;z-index:10;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 24px;';

    const status = document.createElement('div');
    status.style.cssText = `margin-bottom:16px;font-family:${C.fontMono};font-size:12px;letter-spacing:.2em;color:${C.danger};`;
    status.innerHTML = `<span style="animation:hudFlicker 1.5s infinite;">●</span> SYSTEM_OFFLINE // CONNECTIVITY_LOST`;
    main.appendChild(status);

    const title = document.createElement('h1');
    title.textContent = '격추됨';
    title.style.cssText = `margin:0 0 8px;font-family:${C.fontHead};font-weight:900;font-size:clamp(64px,11vw,140px);line-height:.9;letter-spacing:-.03em;color:${C.danger};text-transform:uppercase;text-shadow:0 0 20px rgba(244,67,54,.8);`;
    main.appendChild(title);

    const killCredit = document.createElement('div');
    killCredit.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:42px;';
    killCredit.innerHTML = `<span style="color:${C.secondary};font-family:${C.fontMono};font-size:13px;letter-spacing:.2em;text-transform:uppercase;">Killed By</span>`;
    this.killedByEl = document.createElement('span');
    this.killedByEl.style.cssText = `color:${C.primary};font-family:${C.fontMono};font-weight:700;font-size:20px;background:rgba(51,153,255,.1);padding:4px 12px;border:1px solid rgba(51,153,255,.2);`;
    this.killedByEl.textContent = 'UNKNOWN';
    killCredit.appendChild(this.killedByEl);
    main.appendChild(killCredit);

    // stats line
    const divider = () => {
      const d = document.createElement('div');
      d.style.cssText = 'width:100%;max-width:560px;height:1px;background:linear-gradient(to right,transparent,rgba(51,153,255,.3),transparent);margin:0 auto;';
      return d;
    };
    main.appendChild(divider());

    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:18px;margin:28px 0;';
    const tile = (label: string, color: string, accent = false) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;min-width:118px;padding:18px 24px;background:rgba(12,19,32,.55);border:1px solid rgba(51,153,255,.22);text-align:center;';
      const bar = document.createElement('div');
      bar.style.cssText = `position:absolute;top:0;left:0;width:100%;height:2px;background:${accent ? C.primary : 'rgba(51,153,255,.4)'};${accent ? 'box-shadow:0 0 8px ' + C.primary + ';' : ''}`;
      wrap.appendChild(bar);
      const v = document.createElement('div');
      v.style.cssText = `font-family:${C.fontMono};font-size:34px;font-weight:700;color:${color};line-height:1;`;
      v.textContent = '0';
      const l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = `margin-top:8px;font-family:${C.fontMono};font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.muted};`;
      wrap.appendChild(v);
      wrap.appendChild(l);
      stats.appendChild(wrap);
      return v;
    };
    this.killsEl = tile('Kills', C.text);
    this.deathsEl = tile('Deaths', C.text);
    this.kdEl = tile('K / D', C.bright);
    this.scoreEl = tile('Score', C.primary, true);
    main.appendChild(stats);
    main.appendChild(divider());

    // buttons
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:24px;width:100%;max-width:460px;margin-top:56px;';

    const respawnBtn = document.createElement('button');
    respawnBtn.type = 'button';
    respawnBtn.textContent = '재시작';
    respawnBtn.style.cssText = `flex:1;padding:16px;background:${C.primary};color:#070B12;border:none;font-family:${C.fontHead};font-weight:700;font-size:16px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;box-shadow:0 0 12px rgba(51,153,255,.45);transition:all .2s;`;
    respawnBtn.addEventListener('mouseenter', () => (respawnBtn.style.background = C.bright), { signal: this.abortController.signal });
    respawnBtn.addEventListener('mouseleave', () => (respawnBtn.style.background = C.primary), { signal: this.abortController.signal });
    respawnBtn.addEventListener('click', () => { this.hide(); this.options.onRespawn(); }, { signal: this.abortController.signal });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.textContent = '메인 메뉴';
    menuBtn.style.cssText = `flex:1;padding:16px;background:transparent;color:${C.primary};border:1px solid rgba(51,153,255,.5);font-family:${C.fontHead};font-weight:700;font-size:16px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:all .2s;`;
    menuBtn.addEventListener('mouseenter', () => { menuBtn.style.background = 'rgba(51,153,255,.1)'; menuBtn.style.borderColor = C.primary; }, { signal: this.abortController.signal });
    menuBtn.addEventListener('mouseleave', () => { menuBtn.style.background = 'transparent'; menuBtn.style.borderColor = 'rgba(51,153,255,.5)'; }, { signal: this.abortController.signal });
    menuBtn.addEventListener('click', () => { this.hide(); this.options.onMainMenu(); }, { signal: this.abortController.signal });

    buttons.appendChild(respawnBtn);
    buttons.appendChild(menuBtn);
    main.appendChild(buttons);
    this.container.appendChild(main);

    // left HUD-flavour panel
    const leftAside = document.createElement('aside');
    leftAside.style.cssText = 'position:absolute;left:40px;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:24px;pointer-events:none;';
    leftAside.innerHTML = `
      <div style="padding:14px;border-left:2px solid rgba(244,67,54,.4);background:rgba(12,19,32,.3);backdrop-filter:blur(4px);">
        <div style="font-family:${C.fontMono};font-size:10px;color:${C.danger};text-transform:uppercase;margin-bottom:6px;">Hull Integrity</div>
        <div style="width:96px;height:4px;background:rgba(244,67,54,.2);"><div style="width:0;height:100%;background:${C.danger};"></div></div>
        <div style="font-family:${C.fontMono};font-size:12px;color:${C.danger};margin-top:6px;">CRITICAL FAILURE</div>
      </div>`;
    this.container.appendChild(leftAside);

    // footer
    const footer = document.createElement('footer');
    footer.style.cssText = `position:absolute;bottom:0;left:0;width:100%;z-index:30;display:flex;justify-content:space-between;align-items:center;padding:16px 40px;font-family:${C.fontMono};font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.muted};`;
    footer.innerHTML = `<span>BUILD_V0.9_ALPHA // SECTOR_7G</span><span>TERMS_OF_ENGAGEMENT</span>`;
    this.container.appendChild(footer);

    document.body.appendChild(this.container);
  }

  private addCornerBrackets(): void {
    const specs: Array<[string, string]> = [
      ['top:40px;left:40px', 'border-right:none;border-bottom:none'],
      ['top:40px;right:40px', 'border-left:none;border-bottom:none'],
      ['bottom:40px;left:40px', 'border-right:none;border-top:none'],
      ['bottom:40px;right:40px', 'border-left:none;border-top:none']
    ];
    specs.forEach(([pos, off]) => {
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;width:40px;height:40px;border:2px solid rgba(51,153,255,.3);z-index:25;${pos};${off};`;
      this.container.appendChild(b);
    });
  }

  public show(stats: GameOverStats = {}): void {
    const kills = stats.kills ?? 0;
    const deaths = stats.deaths ?? 0;

    this.killedByEl.textContent = stats.killedBy ?? 'UNKNOWN';
    this.killsEl.textContent = String(kills).padStart(2, '0');
    this.deathsEl.textContent = String(deaths).padStart(2, '0');
    this.kdEl.textContent = (kills / Math.max(1, deaths)).toFixed(2);
    this.scoreEl.textContent = String(stats.score ?? 0);

    this.container.style.display = 'block';
    // force reflow so the opacity transition runs
    void this.container.offsetWidth;
    this.container.style.opacity = '1';
  }

  public hide(): void {
    this.container.style.opacity = '0';
    setTimeout(() => {
      this.container.style.display = 'none';
    }, 350);
  }

  public dispose(): void {
    this.abortController.abort();
    if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
  }
}
