Public vs Private 메서드

  Public 메서드 방식

  // main.ts
  class Game {
    public updatePlayerId() {  // public으로 변경
      this.playerIdElement.textContent = this.multiplayerScene?.networkManager?.socket?.playerId.toString() || '...';
    }
  }

  // MultiplayerScene.ts
  await this.networkManager.connect(username);
  // 연결 성공 후 Game 인스턴스의 메서드 직접 호출
  gameInstance.updatePlayerId(); // 직접 호출

  장점: 간단하고 직관적
  단점: 클래스 간 강한 결합(coupling), Game 인스턴스 참조 필요

  Private 유지 + 이벤트 기반 방식

  // main.ts
  class Game {
    private updatePlayerId() {  // private 유지
      // ...
    }

    constructor() {
      // 이벤트 리스너 등록
      window.addEventListener('playerConnected', () => {
        this.updatePlayerId();
      });
    }
  }

  // MultiplayerScene.ts
  await this.networkManager.connect(username);
  // 연결 성공 후 이벤트 발생
  window.dispatchEvent(new CustomEvent('playerConnected'));

  장점:
  - 클래스 간 느슨한 결합(loose coupling)
  - 캡슐화 유지
  - 여러 컴포넌트가 같은 이벤트 구독 가능
  - 확장성 좋음

  단점: 약간 더 복잡함

  실제 구현 예시

  이벤트 기반 방식 (권장)

  // 커스텀 이벤트 타입 정의
  interface PlayerConnectedEvent extends CustomEvent {
    detail: {
      playerId: number;
      username: string;
    }
  }

  // MultiplayerScene.ts
  await this.networkManager.connect(username);
  window.dispatchEvent(new CustomEvent('playerConnected', {
    detail: {
      playerId: this.networkManager.getPlayerId(),
      username: username
    }
  }));

  // main.ts
  window.addEventListener('playerConnected', ((event: PlayerConnectedEvent) => {
    this.updatePlayerId();
  }) as EventListener);

  이벤트 기반이 더 확장 가능하고 유지보수하기 좋은 패턴입니다. 어떤 방식을 선호하시나요?