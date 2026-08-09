# Make Ten

모바일 우선 숫자 퍼즐 게임 — 드래그로 숫자를 묶어 10을 만들고, 점수로 스킬트리를 해금하며 반복 플레이하는 타임어택 아케이드 퍼즐.

## 핵심 규칙

- 격자 보드에 1~9 숫자가 랜덤 배치된다.
- 드래그로 직사각형 영역을 선택해, 영역 내 숫자 합이 **10**이면 타일이 제거되고 점수를 얻는다. 지운 자리는 빈칸으로 남는다(고정 보드).
- 합 10을 지우면 시간 +1초. 조합이 없어지면 보드가 자동으로 전체 초기화된다.
- **초기화 버튼**: 판당 1회, 보드 전체를 새로 생성 (스킬트리로 최대 3회).
- 시작 전 **목표 선택**: 10 외 특수 숫자를 최대 3개 선택 (17 기본 제공: 7→1 변환, 13/20은 해금).
- 제한 시간(기본 30초) 내 최대한 높은 점수를 노린다.
- 점수는 코인으로 환산되어 **스킬트리**(점수 배율, 특수 조합 13/17/20 해금, 시간 연장, 리롤 충전 등)를 해금하는 데 쓰인다.

## 플레이 / 테스트 방법

### 웹에서 바로 플레이 (GitHub Pages)

푸시할 때마다 자동 배포된다: **https://w-x-z.github.io/Make-Ten/**

폰 브라우저로 열면 터치 드래그로 바로 플레이 가능. 홈 화면에 추가하면 앱처럼 쓸 수 있다.

### 로컬 실행

```bash
npm install
npm run dev          # 개발 서버 (브라우저에서 플레이)
npm run dev -- --host  # 같은 Wi-Fi의 폰에서 접속해 터치 테스트
npm run build        # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview      # 빌드 결과 미리보기
```

모바일 우선 UI지만 데스크톱 브라우저에서도 마우스 드래그로 플레이할 수 있다.
크롬 개발자도구(F12) → 기기 에뮬레이션(Ctrl+Shift+M)으로 모바일 화면을 시뮬레이션할 수 있다.

### 안드로이드 앱 빌드 (플레이스토어)

푸시할 때마다 GitHub Actions(`android-build.yml`)가 Capacitor로 AAB를 빌드한다.
Actions 탭 → 최신 "Build Android App Bundle" 실행 → Artifacts에서 다운로드:

- `make-ten-release-aab` — 플레이스토어 업로드용 (서명 시크릿 등록 시 서명됨)
- `make-ten-debug-apk` — 기기에 직접 설치해보는 테스트용

**릴리스 서명 설정 (최초 1회)** — 업로드 키를 만들고 레포 시크릿에 등록:

```bash
keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload-keystore.jks   # 이 출력값을 시크릿에 등록
```

레포 Settings → Secrets and variables → Actions에 등록할 시크릿 4개:

| 시크릿 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 키스토어 파일의 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `ANDROID_KEY_ALIAS` | `upload` (생성 시 지정한 alias) |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 |

키스토어 파일(`.jks`)은 절대 커밋하지 말고 안전한 곳에 백업할 것.
플레이 콘솔에서는 **Play App Signing**(기본값)을 사용 — 위 키는 "업로드 키"가 되고, 분실 시 구글에 재설정을 요청할 수 있다.

### 테스트 치트 (URL 파라미터)

| 파라미터 | 효과 |
|---|---|
| `?coins=5000` | 코인을 5000으로 설정 — 스킬트리를 바로 테스트할 때 |
| `?reset=1` | 코인/스킬/최고기록 전체 초기화 |

## 구조

```
src/
  core/        # 순수 게임 로직 (렌더링 무관)
    board.ts       # 보드 생성, 리롤, 사각형 합 판정, 조합 고갈 검사, 십자 폭발
    scoring.ts     # 점수 규칙
    game.ts        # 타이머, 상태 머신, 리롤 자원, Perks(스킬 효과) 적용
  meta/        # 영구 진행 (localStorage)
    progress.ts    # 코인, 최고 기록, 스킬 레벨 저장/로드
    skills.ts      # 스킬 정의(데이터), 구매/선행조건 검사, Perks 계산
  ui/
    renderer.ts    # 캔버스 렌더링 (타일, 선택 영역, 합계 배지, 힌트, 플로팅)
    input.ts       # 포인터(터치/마우스) 드래그 입력
    skilltree.ts   # 노드 그래프형 스킬트리 (팬/줌, 노드 탭 → 상세·구매 패널)
  main.ts      # DOM/HUD 연결, 게임 루프, 화면 전환
```

## 문서

- [게임 초기 기획서](docs/GAME_DESIGN.md) — 코어 루프, 점수/스킬트리 설계, 기술 스택 제안, 로드맵

## 상태

✅ **M1 (코어 MVP)** — 그리드, 드래그 선택, 합 10 판정, 리롤 1회, 타이머, 점수, 결과 화면, 로컬 최고 기록
✅ **M2 (메타 루프)** — 점수→코인 환산(5점=1코인), 4계열 스킬트리(배점·조합·시간·유틸) 및 해금, 특수 조합 13/17/20 게임플레이 효과, 힌트, localStorage 영속화
⬜ M3 — 콤보/피버, 연출·사운드 강화
⬜ M4 — Capacitor 패키징, 출시 준비
