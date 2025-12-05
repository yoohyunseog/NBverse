# GameTools Development

게임 및 도구 개발 프로젝트 모음입니다.

## 주요 프로젝트

### 📚 N/B Novel AI (v1.1.0)

소설 작성을 위한 AI 어시스턴트 도구입니다.

**최신 버전**: v1.1.0

**주요 기능**:
- 사용자 인증 시스템 (JWT, OAuth - Naver)
- 소설 관리 시스템 (CRUD)
- 챕터 관리 및 AI 자동 생성
- 캐릭터 RPG 시스템 통합 (레벨, 경험치, 스탯, 인벤토리, 장비)
- 아이템, 배경, 이벤트 관리
- 요약, 관계도, LV 시스템
- 프롤로그 관리
- GPT-4 계열 모델 지원

**시작하기**:
```bash
cd novel_ai/v1.1.0/server
npm install
node server.js
```

자세한 내용은 [novel_ai/README.md](./novel_ai/README.md) 및 [novel_ai/v1.1.0/README.md](./novel_ai/v1.1.0/README.md)를 참고하세요.

### 🎮 Game Projects

#### DOOM Classic 3D
- GZDoom 기반 DOOM 게임
- 클래식 DOOM 경험 제공
- 자세한 내용: [game/README_DAEHANG_NAVI.md](./game/README_DAEHANG_NAVI.md)

#### Zelda Classic
- Godot 엔진 기반 젤다 스타일 게임
- 자세한 내용: [zelda_classic/README.md](./zelda_classic/README.md)

#### Basketball Combo Game
- Python 기반 농구 콤보 게임
- 실행: `start_basketball_combo.bat`

### 💼 NBTRADE

거래 및 분석 도구입니다.
- 자세한 내용: [NBTRADE/README.md](./NBTRADE/README.md)

### 🤖 GPT Layout

GPT 통합 레이아웃 시스템입니다.
- 자세한 내용: [gpt_layout/README.md](./gpt_layout/README.md)

### 🛠️ Utility Tools

#### Keyboard Bit Calculator
- 키보드 비트 계산 도구
- Python 기반
- 실행: `start_keyboard_bit.bat`
- 자세한 내용: [README_KEYBOARD_BIT.md](./README_KEYBOARD_BIT.md)

#### N/B Max-Min Lotto Picker
- 로또 번호 선택 도구
- 위치: `util/n-b-max-min-lotto-picker-v0-1/`

## 프로젝트 구조

```
GameTools/
├── novel_ai/              # N/B Novel AI 프로젝트
│   ├── v1.1.0/           # 최신 버전
│   ├── v1.0.9/           # 이전 버전
│   └── ...
├── game/                  # 게임 프로젝트
│   ├── gzdoom/           # DOOM 게임
│   └── ...
├── zelda_classic/         # 젤다 스타일 게임
├── NBTRADE/              # 거래 도구
├── gpt_layout/            # GPT 레이아웃
├── util/                  # 유틸리티 도구
├── server/                # 공통 서버
└── README.md             # 이 파일
```

## 기술 스택

### Novel AI
- **클라이언트**: HTML5, CSS3, JavaScript (ES6+), Bootstrap 5.3
- **서버**: Node.js, Express.js, JWT, bcryptjs, OpenAI API
- **데이터**: NDJSON 형식, BIT 기반 경로 구조

### 게임 프로젝트
- **DOOM**: GZDoom 엔진
- **Zelda Classic**: Godot 엔진

### 기타
- **Python**: 유틸리티 스크립트
- **JavaScript**: 웹 애플리케이션

## 시작하기

### Novel AI v1.1.0

1. **서버 시작**
   ```bash
   cd novel_ai/v1.1.0/server
   npm install
   node server.js
   ```

2. **환경 설정** (선택사항)
   - OpenAI API 키 설정
   - Naver OAuth 설정

3. **클라이언트 실행**
   - 브라우저에서 `novel_ai/v1.1.0/index.html` 열기

### 게임 실행

- **DOOM**: `game/start_gzdoom.bat` 실행
- **Basketball Combo**: `start_basketball_combo.bat` 실행

## 개발 환경

- **Node.js**: 서버 개발
- **Python**: 유틸리티 스크립트
- **Godot**: 게임 개발
- **Git**: 버전 관리

## 버전 정보

### Novel AI
- **v1.1.0** (최신): 사용자 인증, RPG 시스템 통합
- **v1.0.9**: 이전 안정 버전
- **v1.0.8**: 속성 단위 편집기
- **v1.0.7**: 소설 메인 정보 화면
- 기타 버전들...

자세한 버전 정보는 각 프로젝트의 README를 참고하세요.

## 라이선스

각 프로젝트별로 라이선스가 다를 수 있습니다. 각 프로젝트 디렉토리의 LICENSE 파일을 확인하세요.

## 문의

문제가 발생하거나 기능 제안이 있으시면 이슈를 등록해주세요.

---

**GameTools Development** | 최종 업데이트: 2024
