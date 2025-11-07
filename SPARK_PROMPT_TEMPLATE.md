# Spark 프롬프트 템플릿 (즉시 사용 가능)

## 🚀 전체 시스템 생성 프롬프트

이 프롬프트를 Spark에 복사-붙여넣기하여 실행하세요.

---

```
소설 작성을 위한 AI 웹 애플리케이션을 만들어줘.

**프론트엔드:**
- 레이아웃: 3단 컬럼 (좌측 30%, 가운데 40%, 우측 30%)
- 다크 테마: 배경색 #0e1116, 텍스트 #e8edf7
- 반응형 디자인

**좌측 패널 (소설/챕터 관리):**
- 소설 제목 입력 필드 (자동완성 기능)
- "새 제목" 버튼
- 챕터 목록 (추가/편집/삭제)
- 챕터 검색 입력란
- "전체 저장" 버튼

**가운데 패널 (속성 목록):**
- "저장된 속성 목록" 헤더
- 속성 필터 입력란 ("소설 → 챕터" 형식)
- 각 속성 카드:
  * 속성 이름 (큰 글씨)
  * BIT MAX, BIT MIN 값 (15자리 소수)
  * 데이터 개수 표시
  * 각 데이터 항목:
    - 텍스트 (150자 제한)
    - BIT 값 표시
    - "복사" 버튼
    - "입력" 버튼 (우측 GPT 입력란에 채움)

**우측 패널 (GPT AI 분석):**
- "GPT AI 자동 속성 추출" 헤더
- 분석할 텍스트 입력 영역 (textarea, 6줄)
- GPT 모델 선택 (gpt-4o-mini, gpt-4o, gpt-4-turbo)
- 프롬프트 입력 1 (textarea, 2줄)
- "GPT AI로 분석 (프롬프트 1)" 버튼 (속성 추출)
- 프롬프트 입력 2 (textarea, 2줄)
- 선택된 속성 표시 (읽기 전용)
- GPT 프롬프트 로그 (읽기 전용, 4줄)
- "GPT AI로 분석 (프롬프트 2)" 버튼 (장면 생성)
- 상태 메시지 영역

**결과 표시 영역:**
- GPT 분석 결과 텍스트 표시
- 추출된 속성 카드 목록

**하단:**
- 로그 컨테이너 (최대 1000개 항목)
- 로그 타입별 색상: info(파란색), error(빨간색), warn(노란색)

**백엔드 (Express.js):**

**POST /api/generate**
- 요청 본문:
  {
    "user_prompt": "string",
    "novelId": "string (optional)",
    "useRag": true,
    "bitMax": 2.41,
    "bitMin": 3.05,
    "type": "analyze" | "generate",
    "selected_attributes": [...],
    "options": {
      "model": "gpt-4o-mini",
      "temperature": 0.7,
      "max_tokens": 2000
    }
  }

- 처리 흐름:
  1. RAG 검색 (useRag가 true인 경우):
     * 비트 값 유사도로 top-K 후보 선정 (by-max, by-min 각각)
     * 중복 제거 및 길이 제한 (200자)
     * 토큰 예산 내에서 압축
  
  2. GPT 호출:
     * System 메시지: "You are an expert novel writer. Always respond in valid JSON only. Do not include any text outside the JSON object."
     * User 메시지 구성:
       - 사용자 프롬프트
       - 선택된 속성 (있는 경우)
       - RAG 예시 (EX1: [source:log, nb_max:X, nb_min:Y] — "텍스트...")
    
  3. 응답 검증:
     * JSON 파싱 (비JSON 응답 시 첫 {와 마지막 } 찾기)
     * 필수 필드 확인 (ok, attributes 또는 text)
  
  4. BIT 계산:
     * wordNbUnicodeFormat(text) → 배열
     * BIT_MAX_NB(arr) → nb_max
     * BIT_MIN_NB(arr) → nb_min
     * GPT가 반환한 nb 값과 비교 (차이 > 0.05면 플래그)
  
  5. 저장:
     * nestedPathFromNumber('max', nb_max) → 경로 계산
     * nestedPathFromNumber('min', nb_min) → 경로 계산
     * 각 경로의 log.ndjson에 NDJSON 형식으로 append
     * 중복 체크 (동일한 s, max, min 조합)
  
  6. 응답:
     {
       "ok": true,
       "generated": {
         "text": "생성된 텍스트",
         "nb_max": 2.41,
         "nb_min": 3.05
       },
       "saved": {
         "maxPath": "data/max/2/4/1/.../max_bit/log.ndjson",
         "minPath": "data/min/3/0/5/.../min_bit/log.ndjson",
         "novelUpdate": "chapter 1 updated"
       }
     }

**GET /api/attributes/all**
- 저장된 속성 목록 반환
- 응답: { ok: true, attributes: [{ text, bitMax, bitMin, dataCount }] }

**POST /api/attributes/data**
- 속성-데이터 저장
- 요청: { attributeBitMax, attributeBitMin, attributeText, text, dataBitMax, dataBitMin, novelTitle, chapter }
- BIT 계산 후 n/b 경로로 저장

**GET /api/log/by-max?nb_max=2.41&n=200**
- 비트 값 기반 검색 (유사도 지원)
- 응답: { ok: true, items: [...] }

**POST /api/gpt/chat**
- GPT API 호출
- 요청: { prompt, systemMessage, model, temperature, maxTokens }
- 응답: { ok: true, response: "...", model: "...", usage: {...} }

**기술 스택:**
- 프론트엔드: HTML5, CSS3, Vanilla JavaScript
- 백엔드: Node.js + Express
- LLM: OpenAI API
- 데이터 저장: 파일 시스템 (NDJSON)

**중요 규칙:**
1. GPT 응답은 반드시 JSON 형식만 허용
2. 서버가 항상 BIT 값을 재계산하여 확정값으로 저장
3. RAG 예시는 토큰 예산 내에서 압축
4. 중복 데이터는 자동 감지하여 저장하지 않음
5. 에러 처리: 비JSON 응답은 quarantine 폴더에 저장
```

---

## 📝 간단 버전 (빠른 프로토타입용)

```
소설 작성을 위한 AI 웹 애플리케이션:

1. 3단 레이아웃 UI (좌측: 소설/챕터, 가운데: 속성 목록, 우측: GPT 입력)
2. Express 서버 + GPT API 통합
3. BIT 값 계산 및 n/b 경로 저장
4. RAG 검색: 비트 값 유사도 기반
5. 다크 테마 적용
```

---

## 🔧 BIT 알고리즘 통합 안내

Spark가 생성한 코드에 다음을 추가:

```javascript
// bitCalculation.js 로드 (외부 스크립트)
<script src="https://xn--9l4b4xi9r.com/_8%EB%B9%84%ED%8A%B8/js/bitCalculation.js" defer></script>

// 또는 기존 파일 참조
<script src="../bitCalculation.js"></script>
```

BIT 계산 함수는 이미 존재하므로, Spark 생성 코드에서 호출만 하면 됩니다.

---

## ✅ 실행 체크리스트

1. ✅ Spark에 프롬프트 입력
2. ✅ 생성된 코드 확인
3. ✅ BIT 알고리즘 스크립트 통합
4. ✅ OpenAI API 키 설정
5. ✅ 서버 실행 및 테스트

---

**총 소요 시간: 5-10분 (프로토타입 생성)**

