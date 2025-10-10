PostgreSQL:
  # PostgreSQL 서비스 시작
  brew services start postgresql

  # 또는 직접 실행
  pg_ctl -D /usr/local/var/postgres start

  # 상태 확인
  brew services list | grep postgresql

  Redis:
  # Redis 서비스 시작
  brew services start redis

  # 또는 직접 실행
  redis-server

  # 상태 확인
  brew services list | grep redis

  전체 실행 순서:

  1. 데이터베이스 시작:
  brew services start postgresql
  brew services start redis

  2. 데이터베이스 초기화 (최초 1회):
  cd server
  npm run db:init

  3. 서버 실행:
  # 메인 서버 (개발 모드)
  npm run dev:server

  # 백그라운드 워커 (별도 터미널)
  cd server && npm run worker:dev

  4. 클라이언트 실행:
  # 클라이언트 (별도 터미널)
  npm run dev:client

  서비스 중지:

  # 데이터베이스 중지
  brew services stop postgresql
  brew services stop redis

⏺ PostgreSQL과 Redis 설치 여부를 확인하는 명령어들입니다:

  설치 확인 명령어:

  PostgreSQL 확인:

  # PostgreSQL 설치 여부 확인
  psql --version

  # 또는
  postgres --version

  # Homebrew로 설치된 경우
  brew list | grep postgresql

//postgresql@15

  Redis 확인:

  # Redis 설치 여부 확인
  redis-server --version

redis-server --version

  # 또는
  redis-cli --version

redis-cli 8.0.2 (git:f2cc3adc)

  # Homebrew로 설치된 경우
  brew list | grep redis

  현재 실행 상태 확인:

  # PostgreSQL 프로세스 확인
  ps aux | grep postgres

  # Redis 프로세스 확인
  ps aux | grep redis

 ps aux | grep redis
kimdonghyuk      69603   0.0  0.0 410069008   1040 s051  R+    9:48PM   0:00.00 grep redis

  # Homebrew 서비스 상태 확인
  brew services list

  설치되지 않은 경우 설치 명령어:

  PostgreSQL 설치:

  # Homebrew로 설치
  brew install postgresql

  # 서비스 시작
  brew services start postgresql

  Redis 설치:

  # Homebrew로 설치
  brew install redis

  # 서비스 시작
  brew services start redis
