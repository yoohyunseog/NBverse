# N/B Novel AI

소설 작성을 위한 AI 어시스턴트 도구입니다.

## 기능

- 소설 생성 및 관리
- 챕터 구성
- AI 기반 내용 생성
- 속성 관리
- GPT-4 계열 모델 지원

## 구조

```
novel_ai/
├── index.html          # 메인 HTML
├── assets/
│   ├── css/
│   │   └── style.css   # 스타일시트
│   └── js/
│       ├── config.js   # API 설정
│       └── app.js      # 메인 애플리케이션 로직
└── README.md           # 프로젝트 문서
```

## 시작하기

1. `assets/js/config.js`에서 서버 URL 설정
2. 서버에서 OpenAI API 키 설정 (`/api/gpt/key`)
3. 브라우저에서 `index.html` 열기

## API 설정

자세한 내용은 `assets/js/config.js` 파일을 참고하세요.

## 개발 예정 기능

- [ ] 소설 생성 및 저장
- [ ] 챕터 관리
- [ ] AI 기반 내용 생성
- [ ] 속성 관리
- [ ] 대화형 편집기

