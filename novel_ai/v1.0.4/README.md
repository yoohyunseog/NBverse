# N/B Novel AI v1.0.4

소설 작성을 위한 AI 어시스턴트 툴의 1.0.4 릴리스입니다.  
이번 버전은 `diagrams/` 흐름 문서와 로그 뷰어를 중심으로 자료를 보강하고, 버전 관리 체계를 1.0.4 경로로 확장한 것이 핵심입니다.

## 핵심 변경 사항
- `diagrams/index.html`에서 시스템 흐름·BIT 계산·데이터 저장 과정을 Mermaid 다이어그램으로 정리.
- 최근 로그를 기반으로 한 단계별 시각화(`diagrams/app.js`)와 세부 로그 패널 강화.
- `server/` 하위 구조를 1.0.4 버전으로 복제하면서 데이터/로그/의존성은 초기화.
- 문서(`README.md`, `VERSION_INFO.md`, `VERSION_HISTORY.md`)를 1.0.4 릴리스 기준으로 업데이트.

## 폴더 구조
```
novel_ai/v1.0.4/
├── index.html              # 메인 Novel AI 앱
├── attribute_data.html     # 속성/데이터 조회
├── diagrams/               # 시스템 흐름 & 로그 다이어그램 문서
├── log_viewer/             # 로그 분석 전용 페이지
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       ├── attribute_data.js
│       ├── auto_save.js
│       ├── config.js
│       ├── data_auto_save.js
│       ├── prompts.js
│       └── right_data_manager.js
├── server/
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js
│   ├── data/               # 실행 시 생성되는 저장소 (초기 비어 있음)
│   └── logs/               # 실행 시 생성되는 서버 로그
├── README.md
└── VERSION_INFO.md
```

## 실행 방법
1. `novel_ai/v1.0.4/server` 폴더에서 `npm install` (최초 1회).
2. 같은 위치에서 `npm start` 실행 → 기본 포트는 `8123`.
3. 브라우저에서 `http://127.0.0.1:8123/novel_ai/v1.0.4/` 접속.
4. 다이어그램 문서는 `http://127.0.0.1:8123/novel_ai/v1.0.4/diagrams/` 에서 확인.

> OpenAI API 키는 `server/data/gpt_api_key.txt` 또는 환경 변수 `OPENAI_API_KEY`로 설정합니다.

## 자동화 테스트 (액션 모드 시뮬레이션)
- 서버 실행 후 `novel_ai/v1.0.4/server` 폴더에서 `npm run test:auto` 실행.
- 스크립트는 `/tests/auto_generate.mjs`를 호출하여 자동으로 챕터 5개까지 구성 목록을 생성·검증합니다.
- 기본 설정은 `http://127.0.0.1:8123`를 사용하며, 환경 변수나 인자로 `--base`, `--title`, `--chapters`를 지정할 수 있습니다.
- 실행이 끝나면 저장된 속성 목록과 검증 결과를 콘솔에서 확인할 수 있습니다.
- 브라우저에서 직접 시연하려면 `http://127.0.0.1:8123/novel_ai/v1.0.4/tests/action_runner.html` 페이지를 열어 “테스트 실행” 버튼을 눌러보세요.

## 참고
- BIT 계산과 저장 구조는 `diagrams/` 페이지와 `QUERY_FLOW_EXPLANATION.md` 문서를 함께 보시면 이해가 빠릅니다.
- 로그 분석은 `log_viewer/` 페이지와 `server/logs/`에 누적되는 NDJSON 파일을 활용합니다.
- 이전 버전 아카이브는 `novel_ai/v1.0.x` 경로에서 확인할 수 있습니다.
