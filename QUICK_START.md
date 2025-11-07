# 🚀 빠른 실행 가이드

## 현재 상태
- ✅ `novel_composition_new5.html` 파일 존재
- ✅ 서버 코드 (`server/server.js`) 준비됨
- ✅ GPT API 통합 기능 구현됨

## 실행 방법

### 1. 서버 시작

**터미널에서 실행:**
```bash
cd server
npm install  # 최초 1회만 (의존성 설치)
node server.js
```

또는 PowerShell에서:
```powershell
cd server
node server.js
```

서버가 시작되면:
```
서버가 http://localhost:8080 에서 실행 중입니다.
```

### 2. 브라우저에서 열기

1. **브라우저 주소창에 입력:**
   ```
   http://localhost:8080/novel_composition_new5.html
   ```

2. **또는 파일 탐색기에서:**
   - `novel_composition_new5.html` 파일을 찾아서
   - 브라우저로 드래그 앤 드롭

### 3. GPT API 키 설정 (필수)

1. 브라우저에서 `http://localhost:8080` 접속
2. GPT API 키 설정 페이지로 이동
3. 또는 서버 디렉토리에 `data/gpt_api_key.txt` 파일 생성 후 API 키 입력

**API 키 설정 방법:**
- 방법 1: 서버 API 사용
  ```
  POST http://localhost:8080/api/gpt/key
  Body: { "key": "sk-..." }
  ```

- 방법 2: 환경 변수
  ```bash
  # .env 파일 생성
  OPENAI_API_KEY=sk-...
  ```

- 방법 3: 파일 직접 생성
  ```
  server/data/gpt_api_key.txt 파일에 API 키 입력
  ```

## 화면 구성

### 좌측: 소설 제목 & 챕터 목록
- 소설 제목 입력/선택
- 챕터 추가/편집

### 가운데: 속성 목록
- 저장된 속성 표시
- 데이터 복사/입력 기능

### 우측: GPT AI 분석
- **프롬프트 1**: 속성 추출
- **프롬프트 2**: 장면 생성/이어쓰기

## 기능 테스트

### 1. 속성 추출 테스트
1. "분석할 텍스트" 입력란에 소설 텍스트 입력
2. "GPT AI로 분석 (프롬프트 1)" 버튼 클릭
3. 추출된 속성이 가운데 패널에 표시됨

### 2. 장면 생성 테스트
1. 소설 제목 입력
2. 챕터 추가/선택
3. "프롬프트 입력 2"에 요청 입력 (예: "어두운 해변 배경으로 400자 쓰기")
4. "GPT AI로 분석 (프롬프트 2)" 버튼 클릭
5. 생성된 텍스트가 우측에 표시되고 자동 저장됨

## 문제 해결

### 서버가 시작되지 않음
- Node.js 설치 확인: `node --version`
- 포트 8080이 사용 중인지 확인
- `server` 디렉토리로 이동했는지 확인

### GPT API 오류
- API 키가 올바르게 설정되었는지 확인
- OpenAI 계정에 크레딧이 있는지 확인
- 네트워크 연결 확인

### BIT 계산 오류
- `bitCalculation.js` 파일이 로드되는지 확인
- 브라우저 콘솔에서 오류 메시지 확인

## 추가 참고사항

자세한 설계 문서: `GPT_INTEGRATION_DESIGN.md` 참고

