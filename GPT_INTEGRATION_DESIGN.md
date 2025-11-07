# GPT 통합 설계 문서: novel_composition_new5 알고리즘 활용

## 📋 목표 요약

GPT(대화형 모델, 예: GPT-4 계열)가 novel_composition_new5 알고리즘의 로직·컨텍스트·검색 결과(비트 기반 RAG)를 받아 소설 속성/데이터 추출과 장면 생성 작업을 수행하고, 생성물(또는 추출 결과)을 n/b(BIT) 방식으로 자동 저장·색인하도록 서버 인터페이스와 데이터 스펙을 표준화한다.

---

## 🔄 전체 통합 개요 (한 문장)

**클라이언트/서버가 RAG 후보(비트 검색)와 메타를 수집 → 프롬프트 템플릿으로 GPT에 전달(예시 + 시스템/지시 포함) → GPT는 정해진 출력 포맷(권장 JSON)으로 응답 → 서버가 응답 검증 → BIT 계산 → n/b 규칙으로 저장 → 목록(메타) 갱신 및 클라이언트로 요약 반환.**

---

## 📊 GPT와 주고받을 데이터 규격(권장)

### 요청(Request) JSON (서버 → GPT 프롬프트 바디로 변환)

```json
{
  "id": "string (요청 id)",
  "type": "analyze" | "generate" | "attribute_to_text" | "summarize",
  "prompt_text": "string (사용자 입력/지시)",
  "context_examples": [
    {
      "id": "string",
      "type": "log" | "attribute" | "chapter",
      "source": "string",
      "short_text": "string (최대 200 chars)",
      "nb_max": 2.41,
      "nb_min": 3.05,
      "excerpt": "string (전체 텍스트 일부)"
    }
  ],
  "selected_attributes": [
    {
      "id": "string",
      "text": "string",
      "nb_max": 2.41,
      "nb_min": 3.05
    }
  ],
  "novel_meta": {
    "novelId": "string",
    "chapterNum": 1,
    "title": "string",
    "genre": "string"
  },
  "options": {
    "model": "gpt-4o-mini" | "gpt-4o" | "gpt-4-turbo",
    "temperature": 0.7,
    "max_tokens": 2000,
    "format": "json"
  }
}
```

**주의사항:**
- 서버는 위 Request를 GPT에게 `messages` 배열로 전달(시스템 + user 역할).
- GPT에게 넘기기 전 반드시 examples 길이(문자/토큰)를 확인해 토큰 예산을 초과하지 않음.
- `context_examples`는 최대 K개(권장: 5~8개).

---

### GPT 출력(권장 JSON 형식)

#### For `analyze` (Prompt1) → attributes extraction

```json
{
  "ok": true,
  "attributes": [
    {
      "id": "attr-1",
      "text": "속성 텍스트",
      "data": "연관 데이터(요약)",
      "reason": "요약된 근거",
      "nb_max": 2.41,
      "nb_min": 3.05,
      "estimated": true
    }
  ],
  "notes": "파싱/검증 관련 코멘트"
}
```

#### For `generate` (Prompt2) → scene text

```json
{
  "ok": true,
  "type": "scene",
  "title": "장면 제목(선택)",
  "text": "생성된 전체 텍스트",
  "tokens_estimated": 512,
  "attributes_used": ["attr-1", "attr-3"],
  "warnings": []
}
```

**이유:** JSON 출력은 파싱 신뢰도를 높이고 자동화를 쉽게 함. GPT에 **"Output MUST be valid JSON only"**를 명시.

---

## 🎯 프롬프트 설계 (System + User)

### System(역할 지시, 반드시 포함)

**예시:**
```
You are an expert novel writer and extractor. Always respond in strict JSON following the provided schema. Do not include extra commentary. If you cannot fulfill, return {"ok": false, "error": "explanation"}.
```

### User(컨텍스트 + 명령)

**포함 항목:**
- 사용자 요청
- selected attributes (있는 경우)
- top-K context examples (각 예시는 short_text + source)

**예시 포맷(프롬프트 안):**
```
EXAMPLE N: {source: 'log', nb_max: X, nb_min: Y, text: '...'}
```

### 강제 규칙

1. **속성 추출 시:**
   - "If asked to extract attributes, output JSON with attributes array. Each attribute must have text and reason fields. Do not invent nb_max/nb_min—if you estimate, mark estimated:true."

2. **생성 시:**
   - "When generating, produce only the 'text' field content in JSON; do not include Markdown unless explicitly requested."

---

## 🔍 RAG 통합 규칙(서버가 GPT에 어떤 예시/메타를 포함할지)

### 후보 선정

1. **비트 기반 top-K:**
   - `by-max`와 `by-min` 각각에서 top K1, K2 (권장: K total = 5~8)
   - 예: `queryBitMax=2.41, queryBitMin=3.05`일 때
     - `by-max`: `nb_max`가 2.41에 가까운 순서로 정렬
     - `by-min`: `nb_min`이 3.05에 가까운 순서로 정렬

2. **후보 필터:**
   - 중복 텍스트 제거
   - 길이 자르기(excerpt 200 chars)

### 프롬프트 포함 방식

1. **예시를 번호 매긴 짧은 발췌로 포함:**
   ```
   EX1: [source:log, nb_max:2.41, nb_min:3.05] — "He walked along the rain-slick pier, the neon signs blurred…"
   ```

2. **메타데이터 라인 포함:**
   ```
   EX#: nb_max=2.41 nb_min=3.05 source=gpt
   ```

### 토큰 제약

1. **토큰 예산 계산:**
   ```
   token_budget = max_tokens_for_model - expected_response_tokens - safety_margin
   ```

2. **예시 압축:**
   - 예시가 예산을 초과하면 truncate/shorten
   - 우선순위: exact attribute matches → high similarity → recent entries

### 예시 우선순위

1. **우선순위 순서:**
   - exact attribute matches first
   - then high similarity
   - then recent entries

2. **예시가 너무 많을 때:**
   - 서버 측에서 여러 예시를 1-2 문장으로 요약하여 포함

---

## 💾 BIT 계산 & 저장 흐름(서버 중심)

### GPT 응답을 받은 후 서버가 수행할 작업(순서)

1. **JSON 스키마 검증**
   - GPT 응답의 required fields, types 확인
   - 필수 필드: `ok`, `attributes` 또는 `text`

2. **BIT 재계산**
   - 각 반환된 text/attribute에 대해:
     - `wordNbUnicodeFormat(text)` 실행
     - `BIT_MAX_NB(arr)` 실행 → `nb_max`
     - `BIT_MIN_NB(arr)` 실행 → `nb_min`
   - GPT가 반환한 nb 값이 있으면 서버 계산값과 비교
   - 차이가 threshold(예: 0.05) 이상이면 discrepancy 플래그

3. **레코드 저장**
   - 저장 객체 생성:
     ```json
     {
       "id": "generated-id",
       "t": 1234567890,
       "s": "text content",
       "max": 2.41,
       "min": 3.05,
       "source": "gpt",
       "type": "scene" | "attribute"
     }
     ```
   - `nestedPathFromNumber('max', nb_max)`로 경로 계산
   - `nestedPathFromNumber('min', nb_min)`로 경로 계산
   - 두 경로의 `log.ndjson` 파일에 각각 append

4. **소설 메타 업데이트**
   - `novelId`가 제공된 경우:
     - 챕터 텍스트 추가 또는 챕터 카운트 증가
     - `meta.json` 업데이트

5. **리프 인덱스 업데이트**
   - 각 저장 경로의 `index.json` 업데이트:
     - `count` 증가
     - `lastModified` 갱신
     - `sampleIds`에 새 레코드 ID 추가

6. **클라이언트 응답**
   - 저장 경로, nb 값, 소설 업데이트 결과를 요약하여 반환

---

## ✅ 파싱·검증 규칙(에러/안정성)

### JSON 파싱

1. **GPT가 JSON만 반환하도록 강제**
   - 프롬프트에 "Respond only with valid JSON" 명시

2. **비JSON 응답 처리:**
   - 첫 번째 `{`와 마지막 `}`를 찾아 JSON substring 추출 시도
   - 여전히 유효하지 않으면 `parse_error` 플래그
   - `quarantine` 폴더에 원본 응답 저장 (수동 검토용)

### 콘텐츠 검증

1. **길이 검증:**
   - `text` length > MIN_LENGTH (예: 50 chars) for a scene
   - `attributes` array length >= 1 for analyze

2. **BIT 계산 실패 처리:**
   - BIT calc가 NaN 또는 Infinity를 반환하면:
     - `nb_max`/`nb_min` = 0으로 설정
     - 레코드에 `error` 태그 추가

3. **중복 감지:**
   - 저장 전에 같은 리프 파일에서 동일한 `s` 또는 동일한 `data.text` 검색
   - 발견되면 `deduped=true`로 표시하고 기존 메타데이터 업데이트 (새 레코드 추가 안 함)

---

## 📝 프롬프트 템플릿 (권장 형태 — 자연어 가이드)

### Prompt1 (Attribute extraction)

**System:**
```
You are an expert novel attribute extractor. Analyze the given text and extract key attributes (concepts, themes, settings, character traits, etc.). Always respond in valid JSON only. Do not include any text outside the JSON object.
```

**User:**
```
Extract up to N attributes from the following text. For each attribute, provide:
- text: The attribute name/description
- data: An example usage or related data (brief summary)
- reason: Why this attribute was selected (brief explanation)

Input text:
{input_text}

Context examples (similar content):
{context_examples}

Output JSON format:
{
  "ok": true,
  "attributes": [
    {
      "text": "attribute name",
      "data": "example usage",
      "reason": "why selected"
    }
  ],
  "notes": "optional parsing notes"
}
```

### Prompt2 (Content generation)

**System:**
```
You are an expert novel writer. Write engaging scenes based on provided attributes and context. Always respond in valid JSON only. Do not include any text outside the JSON object.
```

**User:**
```
Write a scene using the following attributes:
{selected_attributes}

Style/Tone: {style_tone}
POV: {pov}
Length: {length_range} words

Context examples (similar scenes):
{context_examples}

Instructions:
- Do not mention 'attribute' or 'example' explicitly in the scene
- Write naturally as if part of a novel
- Maintain consistency with the provided context

Output JSON format:
{
  "ok": true,
  "type": "scene",
  "title": "optional scene title",
  "text": "full scene text",
  "attributes_used": ["attr-1", "attr-2"]
}
```

---

## 📋 예시 데이터 포맷(서버가 GPT에 주는 후보)

### Example object shown in prompt

```
EX1: [source:log, nb_max:2.41, nb_min:3.05] — "He walked along the rain-slick pier, the neon signs blurred…"

EX2: [source:attribute, nb_max:2.50, nb_min:2.90] — "The old lighthouse stood against the storm, its beacon cutting through the fog..."
```

또는 프롬프트 내에서 간결한 bullet list로:

```
• EX1: [log, nb_max:2.41, nb_min:3.05] — "He walked along the rain-slick pier..."
• EX2: [attribute, nb_max:2.50, nb_min:2.90] — "The old lighthouse stood against the storm..."
```

---

## 🔌 서버 API 계약(요청/응답 요약)

### POST /api/generate

**요청 (body from client):**
```json
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
```

**처리 흐름:**
1. Server → GPT messages composed per templates above
2. GPT response JSON validated and pipeline executed
3. Server returns response

**응답:**
```json
{
  "ok": true,
  "generated": {
    "text": "generated text",
    "nb_max": 2.41,
    "nb_min": 3.05
  },
  "saved": {
    "maxPath": "data/max/2/4/1/.../max_bit/log.ndjson",
    "minPath": "data/min/3/0/5/.../min_bit/log.ndjson",
    "novelUpdate": "chapter 1 updated"
  }
}
```

---

## 🚨 운영/비상 처리

### 실패 시 처리

1. **GPT 반환 비JSON:**
   - `quarantine` 폴더에 원본 응답 저장
   - 메타데이터에 `parse_error` 플래그
   - 관리자에게 로그로 알림

2. **BIT calc 오류:**
   - `nb_max`/`nb_min` = 0으로 설정
   - 레코드에 `error` 태그
   - `quarantine`에 저장하여 수동 검토

### 감사(Audit)

- 원본 GPT 응답(raw)을 보안 로그에 저장 (추적 가능성)
- 개인정보 고려 필요

### 비용 관리

- 요청당 `max_tokens` 제한
- 요청 수 모니터링
- 할당량(quota) 구현

---

## 🔄 예제 워크플로(실제 대화/요청 흐름)

### 사용자 요청

**사용자:** "이 다음 장면을 어두운 해변 배경으로 400~600자, 1인칭으로 써줘."

### 클라이언트 → 서버

```json
POST /api/generate
{
  "user_prompt": "이 다음 장면을 어두운 해변 배경으로 400~600자, 1인칭으로 써줘.",
  "novelId": "novel_123",
  "useRag": true,
  "type": "generate",
  "options": {
    "model": "gpt-4o-mini",
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

### 서버 처리

1. **현재 비트 계산** (클라이언트가 제공한 경우 사용, 없으면 기본값)
2. **RAG 후보 검색:**
   - `by-max`와 `by-min`에서 각각 top-K 검색
   - 중복 제거 및 길이 제한
3. **프롬프트 구성:**
   - System + User 메시지 생성
   - RAG 예시 포함
4. **GPT 호출:**
   - OpenAI API 호출
   - 응답 받기

### GPT 응답

```json
{
  "ok": true,
  "type": "scene",
  "text": "파도 소리가 귓가에서 멀어지고, 나는 어둠 속에서 모래를 손으로 더듬었다. 달빛도 없고, 오직 먼 등대의 불빛만이 수평선 너머로 희미하게 깜빡였다...",
  "attributes_used": []
}
```

### 서버 후처리

1. **JSON 검증** → 성공
2. **BIT 재계산:**
   - `wordNbUnicodeFormat(text)` → `[123, 456, ...]`
   - `BIT_MAX_NB(arr)` → `2.41`
   - `BIT_MIN_NB(arr)` → `3.05`
3. **저장:**
   - `data/max/2/4/1/.../max_bit/log.ndjson`에 append
   - `data/min/3/0/5/.../min_bit/log.ndjson`에 append
4. **소설 메타 업데이트:**
   - `novel_123`의 챕터 카운트 증가
   - `meta.json` 업데이트
5. **인덱스 업데이트:**
   - 각 리프의 `index.json` 업데이트

### 서버 → 클라이언트 응답

```json
{
  "ok": true,
  "generated": {
    "text": "파도 소리가 귓가에서 멀어지고...",
    "nb_max": 2.41,
    "nb_min": 3.05
  },
  "saved": {
    "maxPath": "data/max/2/4/1/.../max_bit/log.ndjson",
    "minPath": "data/min/3/0/5/.../min_bit/log.ndjson",
    "novelUpdate": "chapter 2 created"
  }
}
```

### 클라이언트 동작

- 우측 패널에 GPT 텍스트 표시
- 좌측 목록에 새 챕터/항목 추가

---

## ⚠️ 유의사항(알고리즘-모델 상호작용)

1. **GPT가 nb 값을 계산하도록 신뢰하지 않음:**
   - 서버가 항상 BIT를 재계산해 확정값으로 저장해야 함.
   - GPT가 반환한 nb 값은 참고용일 뿐.

2. **출력 포맷 강제:**
   - "Respond only with JSON"를 명시하되, 모델 오류 대비 파싱 전략 필요.

3. **RAG 예시 토큰 관리:**
   - 예시를 너무 많이 넣으면 토큰 낭비 + 비용 증가.
   - 서버는 요약(압축) 기능을 갖추어야 함.

4. **비동기 처리:**
   - 저장 작업은 비동기로 처리하여 응답 지연 최소화.

---

## ✅ 검증 체크리스트(배포 전)

### 프롬프트→GPT→파싱

- [ ] 10개 이상의 다양한 샘플로 E2E 확인
- [ ] JSON 파싱 성공률 > 95%
- [ ] 비JSON 응답 처리 테스트

### BIT 결과 일관성 검사

- [ ] GPT가 반환한 nb와 서버 계산 nb의 차이 통계(평균/분산)
- [ ] 차이가 threshold(0.05) 이상인 경우 비율 < 5%
- [ ] NaN/Infinity 처리 테스트

### 저장 무결성

- [ ] 동시 저장 시 NDJSON 형식 보존(라인별 JSON)
- [ ] 인덱스 업데이트 테스트
- [ ] 파일 시스템 오류 처리

### 중복 처리

- [ ] 같은 텍스트 여러 번 생성 시 dedupe 동작 확인
- [ ] 중복 감지 정확도 > 99%

### 토큰/비용

- [ ] 평균 토큰 사용량 측정
- [ ] 비용 한도 설정
- [ ] 할당량 초과 시 처리

---

## 🔮 확장 권장(향후)

1. **JSON Schema 검증:**
   - GPT에 JSON Schema를 제출하여 응답 검증 자동화

2. **의미 기반 보강:**
   - 비트 기반 검색과 병행할 임베딩 기반 후보 검색(벡터 DB)

3. **자동 프롬프트 튜닝:**
   - 결과 품질을 모니터링해 예시 수/가중치 자동 조정

4. **스트리밍 응답:**
   - GPT 스트리밍 응답 지원 (장문 생성 시)

5. **캐싱:**
   - 동일한 프롬프트에 대한 응답 캐싱

---

## 📌 마무리(요약)

**핵심은 '프롬프트 강제 형식(JSON)', 'RAG 예시의 요약 포함', '서버 측 BIT 재검증 및 n/b 저장' 입니다.**

위 규약을 따르면 GPT는 novel_composition_new5 알고리즘의 출력·저장 흐름을 안정적으로 수행할 수 있고, 생성물이 n/b 색인에 일관되게 들어가 좌측 목록과 우측 대화 UI를 통합해 동작하게 됩니다.

---

## 📚 다음 단계 상세화 옵션

원하시면 다음 중 하나를 상세화해 드립니다(코드 없이):

- **A: Prompt1 / Prompt2의 구체적 텍스트 템플릿(예문 포함) + 기대 응답 예시(JSON)**
- **B: 서버-검증 체크리스트(파싱-비교-저장 시퀀스의 정확한 단계별 검증 포인트)**
- **C: RAG 후보 요약 알고리즘(예시 압축 규칙, 토큰 계산 방법, 우선순위 규칙)**

---

**문서 버전:** 1.0  
**최종 업데이트:** 2025-01-27

