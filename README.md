# N/B Novel AI v1.0.2

소설 작성을 위한 AI 어시스턴트 도구입니다.

## 기능

- 소설 생성 및 관리
- 챕터 구성
- AI 기반 내용 생성
- 속성 관리
- GPT-4 계열 모델 지원

## 구조

```
novel_ai/v1.0.2/
├── index.html          # 메인 HTML
├── attribute_data.html # 속성 데이터 조회 페이지
├── assets/
│   ├── css/
│   │   └── style.css   # 스타일시트
│   └── js/
│       ├── config.js   # API 설정
│       ├── app.js      # 메인 애플리케이션 로직
│       ├── attribute_data.js # 속성 데이터 관리
│       └── prompts.js  # 프롬프트 관리
├── README.md           # 프로젝트 문서
└── VERSION_INFO.md     # 버전 정보
```

## 시작하기

1. `assets/js/config.js`에서 서버 URL 설정
2. 서버에서 OpenAI API 키 설정 (`/api/gpt/key`)
3. 브라우저에서 `index.html` 열기

## API 설정

자세한 내용은 `assets/js/config.js` 파일을 참고하세요.

## 주요 기능

### 1. 3-패널 레이아웃
- **좌측 패널**: Novel AI 속성 조회 (BIT 값 기반 필터링)
- **중앙 패널**: 챗봇 인터페이스 (GPT 기반 소설 구성 생성)
- **우측 패널**: 속성/데이터 입력 및 관리

### 2. BIT 값 기반 속성 관리
- 속성과 데이터를 BIT 값으로 계산하여 저장
- BIT 값 기반 검색 및 필터링
- 자동 저장 및 중복 방지

### 3. 챕터 구성 관리
- 소설 제목 및 챕터 목록 관리
- 계층적 데이터 구조 (소설 제목 → 챕터 → 속성 → 데이터)
- 자동 저장 및 상태 유지 (localStorage)

### 4. GPT 통합
- GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-4 모델 지원
- 프롬프트 기반 소설 구성 생성
- 실시간 대화형 인터페이스

## 개발 예정 기능

- [ ] 소설 생성 및 저장
- [ ] 챕터 관리
- [ ] AI 기반 내용 생성
- [ ] 속성 관리
- [ ] 대화형 편집기

## 버전 정보

자세한 버전 정보는 `VERSION_INFO.md` 파일을 참고하세요.

---
**Novel AI v1.0.2** | 개발 중
