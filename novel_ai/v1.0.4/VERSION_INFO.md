# Novel AI v1.0.4

## 버전 정보
- **버전**: 1.0.4
- **릴리스 날짜**: 2025-11-10
- **상태**: 개발 중 (내부 프리뷰)

## 주요 기능
- `diagrams/` 페이지를 통한 시스템 흐름, BIT 계산, 데이터 저장 절차 시각화
- 로그 히스토리 기반 단계별 Mermaid 다이어그램 자동 생성
- Novel/Chapter/Attribute 데이터 관리와 GPT 연동 지원
- `log_viewer/` UI와 연계된 서버 로그 API (`/api/server/logs*`)
- 비동기 자동 저장 및 중복 방지 로직 (`assets/js/app.js`, `server/server.js`)

## 변경 사항
- v1.0.3 자산을 1.0.4 경로로 이관하고 실행 리소스 초기화
- 문서(README, VERSION_INFO, VERSION_HISTORY)에서 최신 버전 표기 정리
- `server/server.js`의 로그 파일 URL을 `/novel_ai/v1.0.4/server/logs/`로 갱신
- `server/data/`, `server/logs/`를 초기 상태로 재구성하여 신규 프로젝트 시작에 적합하도록 조정
- 액션 모드 자동화 테스트 스크립트(`tests/auto_generate.mjs`)와 `npm run test:auto` 명령 추가

