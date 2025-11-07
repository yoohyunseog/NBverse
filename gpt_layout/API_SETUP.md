# API 설정 가이드

## 1. API 설정 파일 위치

API 설정은 `assets/js/config.js` 파일에서 관리합니다.

```javascript
const API_CONFIG = {
    baseUrl: window.location.origin || 'http://localhost:8123',
    endpoints: {
        chat: '/api/gpt/chat',
    },
    defaultModel: 'gpt-4o',
    defaultParams: {
        temperature: 0.7,
        maxTokens: 2000,
    }
};
```

## 2. 서버 URL 설정

### 로컬 개발 환경
```javascript
baseUrl: 'http://localhost:8123'
```

### 프로덕션 환경
```javascript
baseUrl: 'https://your-domain.com'
```

또는 자동 감지:
```javascript
baseUrl: window.location.origin
```

## 3. OpenAI API 키 설정

서버에서 OpenAI API 키를 설정해야 합니다:

### 방법 1: 서버 API 엔드포인트 사용
```bash
POST /api/gpt/key
Content-Type: application/json

{
  "key": "sk-your-openai-api-key"
}
```

### 방법 2: 서버 환경 변수
서버 코드(`server.js`)에서 환경 변수로 설정:
```javascript
process.env.OPENAI_API_KEY = 'sk-your-openai-api-key';
```

## 4. API 엔드포인트

### 채팅 메시지 전송
- **URL**: `/api/gpt/chat`
- **Method**: `POST`
- **Body**:
```json
{
  "prompt": "사용자 메시지",
  "model": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": 2000,
  "systemMessage": "시스템 프롬프트 (선택)"
}
```

### 응답 형식
```json
{
  "ok": true,
  "response": "GPT 응답 텍스트"
}
```

## 5. 모델 변경

헤더의 모델 선택 드롭다운에서 변경 가능:
- `gpt-4o` (기본값)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`

## 6. 문제 해결

### API 키 오류
```
❌ API 키가 설정되지 않았습니다.
```
→ 서버에서 `/api/gpt/key` 엔드포인트로 API 키 설정

### 연결 오류
```
❌ 오류: HTTP 404
```
→ `config.js`의 `baseUrl` 확인 및 서버 실행 상태 확인

### CORS 오류
→ 서버에서 CORS 설정 확인

## 7. 커스터마이징

`assets/js/config.js`에서 다음을 수정할 수 있습니다:
- 서버 URL
- 기본 모델
- 기본 temperature
- 기본 maxTokens
- 추가 엔드포인트

