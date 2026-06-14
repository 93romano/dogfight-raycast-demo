/**
 * Player authentication input component
 * Handles username-based authentication for database integration.
 *
 * Visual design: "Modern Military HUD" login screen generated with Google Stitch
 * (see docs/design/stitch-login.html). Logic and public API are unchanged.
 */
export interface PlayerAuthenticationResult {
  success: boolean;
  playerId?: number;
  userId?: number;
  username?: string;
  error?: string;
}

export interface PlayerIdInputOptions {
  onAuthentication: (username: string) => Promise<PlayerAuthenticationResult>;
  onError: (error: Error) => void;
}

const C = {
  bgBase: '#070B12',
  panel: '#0C1320',
  raised: '#111A2B',
  primary: '#3399FF',
  primaryBright: '#66CCFF',
  danger: '#F44336',
  text: '#E6F1FF',
  text2: '#8FA9C8',
  muted: '#5A7290',
  fontHead: "'Space Grotesk', 'Noto Sans KR', sans-serif",
  fontMono: "'Space Mono', 'Noto Sans KR', monospace"
};

export class PlayerIdInput {
  private container!: HTMLDivElement;
  private card!: HTMLDivElement;
  private usernameInput!: HTMLInputElement;
  private submitButton!: HTMLButtonElement;
  private errorMessage!: HTMLDivElement;
  private loadingHint!: HTMLDivElement;
  private options: PlayerIdInputOptions;
  private isSubmitting: boolean = false;
  private readonly abortController = new AbortController();

  constructor(options: PlayerIdInputOptions) {
    this.options = options;
    this.createUI();
  }

  /** Adds the four glowing L-shaped HUD corner brackets to an element. */
  private addBrackets(target: HTMLElement): void {
    const specs: Array<[string, string]> = [
      ['top:-1px;left:-1px', 'border-top:2px solid;border-left:2px solid'],
      ['top:-1px;right:-1px', 'border-top:2px solid;border-right:2px solid'],
      ['bottom:-1px;left:-1px', 'border-bottom:2px solid;border-left:2px solid'],
      ['bottom:-1px;right:-1px', 'border-bottom:2px solid;border-right:2px solid']
    ];
    specs.forEach(([pos, border]) => {
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;width:14px;height:14px;border-color:${C.primary};${pos};${border};`;
      target.appendChild(b);
    });
  }

  private createStatusChips(): HTMLDivElement {
    const chips = document.createElement('div');
    chips.style.cssText = `
      display:flex;gap:14px;align-items:center;margin-bottom:26px;
      font-family:${C.fontMono};font-size:11px;letter-spacing:.18em;color:${C.primary};
      background:rgba(12,19,32,.5);backdrop-filter:blur(6px);
      padding:8px 16px;border:1px solid rgba(51,153,255,.2);
    `;
    chips.innerHTML = `
      <span style="display:flex;align-items:center;gap:7px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#4CAF50;box-shadow:0 0 8px #4CAF50;"></span>SERVER ONLINE
      </span>
      <span style="color:${C.muted};">|</span><span>REGION KR</span>
      <span style="color:${C.muted};">|</span><span>24MS PING</span>
    `;
    return chips;
  }

  /** Creates the authentication UI elements */
  private createUI(): void {
    document.body.classList.add('state-login');

    // Full-screen dimmed/blurred backdrop over the live scene.
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position:fixed;inset:0;z-index:1000;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:radial-gradient(circle, rgba(7,11,18,.55) 0%, rgba(7,11,18,.85) 100%);
      backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      color:${C.text};font-family:${C.fontHead};
    `;

    this.container.appendChild(this.createStatusChips());

    // Login card
    this.card = document.createElement('div');
    this.card.style.cssText = `
      position:relative;width:380px;max-width:88vw;
      background:rgba(12,19,32,.8);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      border:1px solid rgba(51,153,255,.3);padding:34px 30px;
      box-shadow:0 4px 24px rgba(7,11,18,.8);
    `;
    this.addBrackets(this.card);

    // top accent bar
    const accent = document.createElement('div');
    accent.style.cssText = `position:absolute;top:0;left:0;width:100%;height:2px;background:${C.primary};box-shadow:0 0 8px ${C.primary};`;
    this.card.appendChild(accent);

    // header
    const title = document.createElement('h1');
    title.textContent = '게임 입장';
    title.style.cssText = `
      margin:6px 0 8px;text-align:center;color:${C.primary};
      font-family:${C.fontHead};font-weight:900;font-size:30px;
      letter-spacing:.18em;text-transform:uppercase;text-shadow:0 0 8px rgba(51,153,255,.6);
    `;
    this.card.appendChild(title);

    const description = document.createElement('p');
    description.textContent = '사용자명을 입력하여 게임에 참가하세요';
    description.style.cssText = `margin:0 0 28px;text-align:center;color:${C.text2};font-size:13px;`;
    this.card.appendChild(description);

    // CALLSIGN label
    const label = document.createElement('label');
    label.textContent = 'CALLSIGN';
    label.style.cssText = `display:block;color:${C.primary};font-family:${C.fontMono};font-size:11px;letter-spacing:.2em;margin-bottom:8px;`;
    this.card.appendChild(label);

    // input + underline
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'position:relative;margin-bottom:18px;';

    this.usernameInput = document.createElement('input');
    this.usernameInput.type = 'text';
    this.usernameInput.placeholder = '사용자명 (2-20자)';
    this.usernameInput.maxLength = 20;
    this.usernameInput.autocomplete = 'off';
    this.usernameInput.spellcheck = false;
    this.usernameInput.style.cssText = `
      width:100%;box-sizing:border-box;background:rgba(17,26,43,.5);border:none;
      color:${C.text};padding:13px 14px;font-family:${C.fontMono};font-size:15px;outline:none;
    `;
    inputWrap.appendChild(this.usernameInput);

    const underline = document.createElement('div');
    underline.style.cssText = `position:absolute;bottom:0;left:0;width:100%;height:1px;opacity:.5;background:linear-gradient(to right,transparent,${C.primary},transparent);transition:opacity .3s,box-shadow .3s;`;
    inputWrap.appendChild(underline);
    this.card.appendChild(inputWrap);

    this.usernameInput.addEventListener('focus', () => {
      underline.style.opacity = '1';
      underline.style.boxShadow = '0 0 8px rgba(51,153,255,.8)';
    }, { signal: this.abortController.signal });
    this.usernameInput.addEventListener('blur', () => {
      underline.style.opacity = '.5';
      underline.style.boxShadow = 'none';
    }, { signal: this.abortController.signal });

    // error slot
    this.errorMessage = document.createElement('div');
    this.errorMessage.style.cssText = `
      display:none;margin-bottom:18px;padding:10px 12px;
      color:${C.danger};font-family:${C.fontMono};font-size:12px;
      background:rgba(244,67,54,.1);border:1px solid rgba(244,67,54,.4);
    `;
    this.card.appendChild(this.errorMessage);

    // submit button
    this.submitButton = document.createElement('button');
    this.submitButton.type = 'button';
    this.submitButton.innerHTML = `<span>게임 시작</span><span class="material-symbols-outlined" style="font-size:20px;">power_settings_new</span>`;
    this.submitButton.style.cssText = `
      width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
      background:rgba(51,153,255,.2);color:${C.primary};border:1px solid rgba(51,153,255,.5);
      padding:15px;font-family:${C.fontHead};font-weight:700;font-size:15px;
      letter-spacing:.18em;text-transform:uppercase;cursor:pointer;
      box-shadow:0 0 12px rgba(51,153,255,.45);transition:all .2s;outline:none;
    `;
    this.submitButton.addEventListener('mouseenter', () => {
      if (!this.submitButton.disabled) {
        this.submitButton.style.background = 'rgba(51,153,255,.3)';
        this.submitButton.style.boxShadow = '0 0 20px rgba(102,204,255,.6)';
      }
    }, { signal: this.abortController.signal });
    this.submitButton.addEventListener('mouseleave', () => {
      if (!this.submitButton.disabled) {
        this.submitButton.style.background = 'rgba(51,153,255,.2)';
        this.submitButton.style.boxShadow = '0 0 12px rgba(51,153,255,.45)';
      }
    }, { signal: this.abortController.signal });
    this.card.appendChild(this.submitButton);

    // loading hint
    this.loadingHint = document.createElement('div');
    this.loadingHint.style.cssText = `text-align:center;margin-top:12px;height:14px;color:${C.muted};font-family:${C.fontMono};font-size:10px;letter-spacing:.2em;text-transform:uppercase;opacity:0;transition:opacity .3s;`;
    this.card.appendChild(this.loadingHint);

    this.container.appendChild(this.card);

    // footer readout
    const footer = document.createElement('div');
    footer.style.cssText = `position:absolute;bottom:26px;display:flex;gap:12px;align-items:center;color:${C.muted};font-family:${C.fontMono};font-size:10px;letter-spacing:.2em;`;
    footer.innerHTML = `<span>DOGFIGHT v0.9.1</span><span style="width:3px;height:3px;border-radius:50%;background:${C.muted};"></span><span>SECURE CONNECTION</span><span style="width:3px;height:3px;border-radius:50%;background:${C.muted};"></span><span>SYS.READY</span>`;
    this.container.appendChild(footer);

    // events
    this.usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitAuthentication();
      }
    }, { signal: this.abortController.signal });

    this.usernameInput.addEventListener('input', () => {
      this.hideError();
    }, { signal: this.abortController.signal });

    this.submitButton.addEventListener('click', () => {
      this.submitAuthentication();
    }, { signal: this.abortController.signal });

    document.body.appendChild(this.container);
    this.usernameInput.focus();
  }

  /**
   * Handles player authentication submission
   * Validates input and communicates with server
   */
  private async submitAuthentication(): Promise<void> {
    try {
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      this.setLoading(true);
      this.hideError();

      const username = this.usernameInput.value.trim();

      // Input validation
      if (!this.validateInput(username)) {
        return;
      }

      // Attempt authentication
      const result = await this.options.onAuthentication(username);

      if (result.success) {
        this.hide();
      } else {
        this.showError(result.error || '인증에 실패했습니다.');
      }
    } catch (error) {
      this.options.onError(error as Error);
      this.showError('서버 연결에 실패했습니다. 다시 시도해주세요.');
    } finally {
      this.isSubmitting = false;
      this.setLoading(false);
    }
  }

  /**
   * Validates username input according to game rules
   */
  private validateInput(username: string): boolean {
    if (!username) {
      this.showError('사용자명을 입력해주세요.');
      this.usernameInput.focus();
      return false;
    }

    if (username.length < 2) {
      this.showError('사용자명은 최소 2자 이상이어야 합니다.');
      this.usernameInput.focus();
      return false;
    }

    if (username.length > 20) {
      this.showError('사용자명은 최대 20자까지 가능합니다.');
      this.usernameInput.focus();
      return false;
    }

    // 허용된 문자만 사용하는지 검증 (영문, 숫자, 한글, 언더스코어, 하이픈)
    if (!/^[a-zA-Z0-9가-힣_-]+$/.test(username)) {
      this.showError('사용자명에는 영문, 숫자, 한글, 언더스코어(_), 하이픈(-)만 사용할 수 있습니다.');
      this.usernameInput.focus();
      return false;
    }

    // 첫 글자가 특수문자인지 검증
    if (/^[_-]/.test(username)) {
      this.showError('사용자명은 영문, 숫자, 또는 한글로 시작해야 합니다.');
      this.usernameInput.focus();
      return false;
    }

    return true;
  }

  /**
   * Shows error message to user with improved styling
   */
  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.style.display = 'block';
    this.errorMessage.style.opacity = '0';
    this.errorMessage.style.transform = 'translateY(-6px)';

    setTimeout(() => {
      this.errorMessage.style.transition = 'all 0.3s ease';
      this.errorMessage.style.opacity = '1';
      this.errorMessage.style.transform = 'translateY(0)';
    }, 10);
  }

  /**
   * Hides error message
   */
  private hideError(): void {
    this.errorMessage.style.display = 'none';
  }

  /**
   * Sets loading state of the form with visual feedback
   */
  private setLoading(isLoading: boolean): void {
    this.submitButton.disabled = isLoading;
    this.usernameInput.disabled = isLoading;

    if (isLoading) {
      this.submitButton.innerHTML = '<span>연결 중...</span>';
      this.submitButton.style.background = 'rgba(90,114,144,.3)';
      this.submitButton.style.color = C.muted;
      this.submitButton.style.boxShadow = 'none';
      this.submitButton.style.cursor = 'not-allowed';
      this.usernameInput.style.opacity = '0.6';
      this.loadingHint.style.opacity = '1';
      this.loadingHint.textContent = 'CONNECTING...';
    } else {
      this.submitButton.innerHTML = `<span>게임 시작</span><span class="material-symbols-outlined" style="font-size:20px;">power_settings_new</span>`;
      this.submitButton.style.background = 'rgba(51,153,255,.2)';
      this.submitButton.style.color = C.primary;
      this.submitButton.style.boxShadow = '0 0 12px rgba(51,153,255,.45)';
      this.submitButton.style.cursor = 'pointer';
      this.usernameInput.style.opacity = '1';
      this.loadingHint.style.opacity = '0';
    }
  }

  /**
   * Hides the authentication form with fade-out animation
   */
  public hide(): void {
    this.abortController.abort();
    document.body.classList.remove('state-login');

    if (this.container.parentNode) {
      this.container.style.transition = 'opacity 0.3s ease';
      this.container.style.opacity = '0';

      setTimeout(() => {
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }, 300);
    }
  }

  public dispose(): void {
    this.abortController.abort();
    document.body.classList.remove('state-login');

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
