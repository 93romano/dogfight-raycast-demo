/**
 * Player authentication input component
 * Handles username-based authentication for database integration
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

export class PlayerIdInput {
  private container: HTMLDivElement;
  private usernameInput: HTMLInputElement;
  private submitButton: HTMLButtonElement;
  private errorMessage: HTMLDivElement;
  private options: PlayerIdInputOptions;
  private isSubmitting: boolean = false;

  constructor(options: PlayerIdInputOptions) {
    this.options = options;
    this.createUI();
  }

  /**
   * Creates the authentication UI elements
   */
  private createUI(): void {
    // 컨테이너 생성
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #3399ff;
      border-radius: 10px;
      padding: 30px;
      text-align: center;
      z-index: 1000;
      color: white;
      font-family: Arial, sans-serif;
      min-width: 320px;
    `;

    // 제목
    const title = document.createElement('h2');
    title.textContent = '게임 입장';
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #3399ff;
      font-size: 24px;
    `;
    this.container.appendChild(title);

    // 설명
    const description = document.createElement('p');
    description.textContent = '사용자명을 입력하여 게임에 참가하세요';
    description.style.cssText = `
      margin: 0 0 25px 0;
      color: #cccccc;
      font-size: 14px;
      line-height: 1.4;
    `;
    this.container.appendChild(description);

    // 사용자명 입력 필드
    this.usernameInput = document.createElement('input');
    this.usernameInput.type = 'text';
    this.usernameInput.placeholder = '사용자명 (2-20자)';
    this.usernameInput.maxLength = 20;
    this.usernameInput.style.cssText = `
      width: 240px;
      padding: 12px 15px;
      font-size: 16px;
      border: 2px solid #3399ff;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      text-align: center;
      margin-bottom: 20px;
      display: block;
      margin-left: auto;
      margin-right: auto;
      outline: none;
      transition: border-color 0.3s, background-color 0.3s;
    `;

    // 포커스 스타일
    this.usernameInput.addEventListener('focus', () => {
      this.usernameInput.style.borderColor = '#66ccff';
      this.usernameInput.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
    });

    this.usernameInput.addEventListener('blur', () => {
      this.usernameInput.style.borderColor = '#3399ff';
      this.usernameInput.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    this.container.appendChild(this.usernameInput);

    // 에러 메시지
    this.errorMessage = document.createElement('div');
    this.errorMessage.style.cssText = `
      color: #ff6666;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
      min-height: 20px;
      padding: 8px;
      background: rgba(255, 102, 102, 0.1);
      border-radius: 5px;
      border: 1px solid rgba(255, 102, 102, 0.3);
    `;
    this.container.appendChild(this.errorMessage);

    // 버튼
    this.submitButton = document.createElement('button');
    this.submitButton.textContent = '게임 시작';
    this.submitButton.style.cssText = `
      background: #3399ff;
      color: white;
      border: none;
      padding: 12px 40px;
      font-size: 16px;
      font-weight: bold;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      outline: none;
    `;

    // 버튼 호버 효과
    this.submitButton.addEventListener('mouseenter', () => {
      if (!this.submitButton.disabled) {
        this.submitButton.style.background = '#2288ee';
        this.submitButton.style.transform = 'translateY(-1px)';
      }
    });

    this.submitButton.addEventListener('mouseleave', () => {
      if (!this.submitButton.disabled) {
        this.submitButton.style.background = '#3399ff';
        this.submitButton.style.transform = 'translateY(0)';
      }
    });

    this.container.appendChild(this.submitButton);

    // 이벤트 리스너 추가
    this.usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitAuthentication();
      }
    });

    this.usernameInput.addEventListener('input', () => {
      this.hideError();
    });

    this.submitButton.addEventListener('click', () => {
      this.submitAuthentication();
    });

    // 페이지에 추가
    document.body.appendChild(this.container);
    
    // 사용자명 입력 필드에 포커스
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

      console.log('username', this);
      console.log('result', result);

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
    
    // 에러 애니메이션
    this.errorMessage.style.opacity = '0';
    this.errorMessage.style.transform = 'translateY(-10px)';
    
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
      this.submitButton.textContent = '연결 중...';
      this.submitButton.style.background = '#666666';
      this.submitButton.style.cursor = 'not-allowed';
      this.usernameInput.style.opacity = '0.6';
    } else {
      this.submitButton.textContent = '게임 시작';
      this.submitButton.style.background = '#3399ff';
      this.submitButton.style.cursor = 'pointer';
      this.usernameInput.style.opacity = '1';
    }
  }

  /**
   * Hides the authentication form with fade-out animation
   */
  public hide(): void {
    if (this.container.parentNode) {
      this.container.style.transition = 'all 0.3s ease';
      this.container.style.opacity = '0';
      this.container.style.transform = 'translate(-50%, -50%) scale(0.9)';
      
      setTimeout(() => {
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }, 300);
    }
  }
} 