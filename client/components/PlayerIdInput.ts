export class PlayerIdInput {
  private container: HTMLDivElement;
  private input: HTMLInputElement;
  private submitButton: HTMLButtonElement;
  private onPlayerIdSubmit: (playerId: number) => void;

  constructor(onPlayerIdSubmit: (playerId: number) => void) {
    this.onPlayerIdSubmit = onPlayerIdSubmit;
    this.createUI();
  }

  private createUI() {
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
    `;

    // 제목
    const title = document.createElement('h2');
    title.textContent = '플레이어 번호 입력';
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #3399ff;
      font-size: 24px;
    `;
    this.container.appendChild(title);

    // 설명
    const description = document.createElement('p');
    description.textContent = '1-9999 사이의 번호를 입력하세요';
    description.style.cssText = `
      margin: 0 0 20px 0;
      color: #cccccc;
      font-size: 14px;
    `;
    this.container.appendChild(description);

    // 입력 필드
    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.min = '1';
    this.input.max = '9999';
    this.input.placeholder = '플레이어 번호';
    this.input.style.cssText = `
      width: 200px;
      padding: 10px;
      font-size: 16px;
      border: 2px solid #3399ff;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      text-align: center;
      margin-bottom: 20px;
    `;
    this.container.appendChild(this.input);

    // 버튼
    this.submitButton = document.createElement('button');
    this.submitButton.textContent = '게임 시작';
    this.submitButton.style.cssText = `
      background: #3399ff;
      color: white;
      border: none;
      padding: 12px 30px;
      font-size: 16px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.3s;
    `;
    this.container.appendChild(this.submitButton);

    // 이벤트 리스너 추가
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitPlayerId();
      }
    });

    this.submitButton.addEventListener('click', () => {
      this.submitPlayerId();
    });

    // 페이지에 추가
    document.body.appendChild(this.container);
    
    // 입력 필드에 포커스
    this.input.focus();
  }

  private submitPlayerId() {
    const playerId = parseInt(this.input.value);
    
    if (playerId >= 1 && playerId <= 9999) {
      this.onPlayerIdSubmit(playerId);
      this.hide();
    } else {
      alert('1-9999 사이의 번호를 입력해주세요.');
      this.input.focus();
    }
  }

  public hide() {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
} 