# 알고리즘 정리 문서

## 1. BIT 값 계산 알고리즘

### 1.1 문자열 → 유니코드 배열 변환
```
입력: 문자열 텍스트
출력: 유니코드 배열 [number, number, ...]

알고리즘:
1. wordNbUnicodeFormat(text) 호출
2. 각 문자에 언어별 prefix 추가:
   - 한글: +1000000
   - 일본어: +2000000 (히라가나), +3000000 (가타카나), +4000000 (한자)
   - 영문/기타: prefix 없음
3. 최종 배열 반환: [prefix + unicode_value, ...]
```

### 1.2 BIT_MAX_NB 계산
```
입력: 유니코드 배열 (nb), 기본 비트값 (bit = 5.5)
출력: BIT_MAX 값 (number)

알고리즘:
1. calculateBit(nb, bit, reverse = false) 호출
2. COUNT = 200 설정 (정확도 향상)
3. BIT_START_NBA100 배열 초기화 (정방향)
4. 범위 매칭:
   - 각 유니코드 값에 대해 BIT_START_B50[a] <= value <= BIT_START_B100[a] 범위 찾기
   - 해당하는 NBA100[a] 값 누적
5. nb.length === 2인 경우: bit - NB50 반환
6. 그 외: NB50 반환
7. 범위 검증: -100 <= result <= 100
8. 범위 초과 시: SUPER_BIT (이전 계산값) 반환
```

### 1.3 BIT_MIN_NB 계산
```
입력: 유니코드 배열 (nb), 기본 비트값 (bit = 5.5)
출력: BIT_MIN 값 (number)

알고리즘:
1. calculateBit(nb, bit, reverse = true) 호출
2. COUNT = 200 설정
3. BIT_START_NBA100 배열 역순 처리
4. 나머지는 BIT_MAX와 동일
```

---

## 2. 폴더 구조 생성 알고리즘 (nestedPathFromNumber)

### 2.1 숫자 → 중첩 폴더 경로 변환
```
입력: label ('max' 또는 'min'), num (BIT 값)
출력: { targetDir, nestedFile, baseDir, digits }

알고리즘:
1. 숫자를 문자열로 변환:
   - Math.abs(num).toFixed(10) → 소수점 10자리 고정
   - '.' 제거 → "30639230769230769" (예시)
2. 각 자릿수를 배열로 분리: [3, 0, 6, 3, 9, 2, ...]
3. 폴더 경로 생성:
   - baseDir = data/{label}/{digit1}/{digit2}/.../{digitN}
   - targetDir = baseDir/{label}_bit/
   - nestedFile = targetDir/log.ndjson
4. 반환: { targetDir, nestedFile, baseDir, digits }
```

**예시:**
```
BIT MAX = 3.063923076923077
→ max/3/0/6/3/9/2/3/0/7/6/9/max_bit/log.ndjson

BIT MIN = 2.660476923076924
→ min/2/6/6/0/4/7/6/9/2/3/0/min_bit/log.ndjson
```

---

## 3. 속성-데이터 저장 알고리즘

### 3.1 데이터 구조
```json
{
  "timestamp": "ISO 8601 형식",
  "t": 시간(밀리초),
  "s": "데이터 텍스트",
  "max": 데이터BIT_MAX,
  "min": 데이터BIT_MIN,
  "attribute": {
    "text": "속성 텍스트",
    "bitMax": 속성BIT_MAX,
    "bitMin": 속성BIT_MIN
  },
  "data": {
    "text": "데이터 텍스트",
    "bitMax": 데이터BIT_MAX,
    "bitMin": 데이터BIT_MIN
  }
}
```

### 3.2 저장 위치 (4곳)
```
1. 속성 BIT MAX → data/max/{속성MAX경로}/max_bit/log.ndjson
2. 속성 BIT MIN → data/min/{속성MIN경로}/min_bit/log.ndjson
3. 데이터 BIT MAX → data/max/{데이터MAX경로}/max_bit/log.ndjson
4. 데이터 BIT MIN → data/min/{데이터MIN경로}/min_bit/log.ndjson
```

### 3.3 저장 알고리즘
```
입력: 속성텍스트, 데이터텍스트

1단계: 속성 BIT 값 계산
  - 속성텍스트 → 유니코드 배열
  - BIT_MAX_NB → 속성BIT_MAX
  - BIT_MIN_NB → 속성BIT_MIN

2단계: 데이터 BIT 값 계산
  - 데이터텍스트 → 유니코드 배열
  - BIT_MAX_NB → 데이터BIT_MAX
  - BIT_MIN_NB → 데이터BIT_MIN

3단계: 레코드 생성
  - 위 데이터 구조로 JSON 생성

4단계: 4곳에 저장
  - nestedPathFromNumber('max', 속성BIT_MAX) → 속성 MAX 폴더
  - nestedPathFromNumber('min', 속성BIT_MIN) → 속성 MIN 폴더
  - nestedPathFromNumber('max', 데이터BIT_MAX) → 데이터 MAX 폴더
  - nestedPathFromNumber('min', 데이터BIT_MIN) → 데이터 MIN 폴더
  - 각 폴더에 log.ndjson 파일에 append
```

---

## 4. 검색 알고리즘

### 4.1 일반 검색
```
입력: 검색 텍스트 (문자열)

1단계: BIT 값 계산
  - 검색텍스트 → BIT_MAX, BIT_MIN

2단계: 검색 방식 선택
  - 유사도 검색: /api/training/similar (BIT 값 유사도 계산)
  - 정확 일치: /api/log/by-max, /api/log/by-min (정확한 BIT 값)

3단계: 결과 수집
  - 여러 소스에서 결과 수집
  - 중복 제거 (t, input, response 기준)
  - 유사도순 정렬
```

### 4.2 속성 연결 데이터 검색
```
입력: 검색 텍스트 (문자열), 계산된 BIT_MAX, BIT_MIN

1단계: 속성 데이터 조회
  - GET /api/attributes/data?bitMax={BIT_MAX}&bitMin={BIT_MIN}
  - MAX 폴더에서 attribute 필드가 있는 항목 필터링
  - attribute.bitMax === 검색BIT_MAX && attribute.bitMin === 검색BIT_MIN

2단계: 결과 통합
  - 일반 검색 결과와 속성 연결 데이터 합치기
  - 중복 제거
  - 유사도순 정렬

예시:
  검색: "반지의 제왕" (속성)
  → 속성 BIT 값 계산
  → 속성 데이터 API 호출
  → "원정대" (연결된 데이터) 조회됨
```

---

## 5. 유사도 검색 알고리즘 (RAG/Few-shot Learning)

### 5.1 유사도 점수 계산
```
입력: 쿼리 BIT_MAX, BIT_MIN, 데이터베이스 항목들
출력: 각 항목의 유사도 점수

점수 = (BIT 유사도 × 0.6) + (텍스트 유사도 × 0.3) + (최신성 × 0.1)

1. BIT 값 유사도 (가중치 0.6):
   - bitMaxDiff = |queryBitMax - itemBitMax|
   - bitMinDiff = |queryBitMin - itemBitMin|
   - bitScore = 1 / (1 + bitMaxDiff + bitMinDiff)
   - 점수 += bitScore × 0.6

2. 텍스트 유사도 (가중치 0.3):
   - 공통 단어 수 / 쿼리 단어 수
   - 점수 += textScore × 0.3

3. 최신성 (가중치 0.1):
   - daysAgo = (현재시간 - item.t) / (1000×60×60×24)
   - recencyScore = max(0, 1 - daysAgo / 30)
   - 점수 += recencyScore × 0.1
```

### 5.2 정렬 및 반환
```
1. 점수순 내림차순 정렬
2. 상위 N개 반환 (limit)
```

---

## 6. 전체 데이터 흐름

### 저장 흐름
```
텍스트 입력
  ↓
BIT 값 계산 (BIT_MAX, BIT_MIN)
  ↓
속성 데이터인 경우:
  - 속성 BIT 값으로 MAX/MIN 폴더 저장 (4곳)
  - attribute, data 필드 포함

일반 데이터인 경우:
  - 데이터 BIT 값으로 MAX/MIN 폴더 저장 (2곳)
```

### 검색 흐름
```
검색 텍스트 입력
  ↓
BIT 값 계산
  ↓
일반 검색 실행
  ↓
속성 데이터 조회 (동일 BIT 값)
  ↓
결과 통합 및 중복 제거
  ↓
유사도순 정렬
  ↓
결과 표시
```

---

## 7. 주요 함수 및 API

### 클라이언트 함수
- `calculateBitValues(text)`: 텍스트 → BIT_MAX, BIT_MIN
- `search()`: 통합 검색 (일반 + 속성)
- `saveData()`: 속성에 데이터 저장
- `loadAttributeData()`: 속성별 데이터 조회

### 서버 API
- `POST /api/attributes/data`: 속성에 데이터 저장
- `GET /api/attributes/data`: 속성별 데이터 조회
- `POST /api/training/similar`: 유사도 검색
- `GET /api/log/by-max`: MAX 값 정확 일치 검색
- `GET /api/log/by-min`: MIN 값 정확 일치 검색

### 서버 함수
- `nestedPathFromNumber(label, num)`: 숫자 → 폴더 경로
- `findAllLogFiles(baseDir, label, digits)`: 재귀 파일 탐색

---

## 8. 데이터 구조 요약

### 저장 형식 (NDJSON)
```
각 줄 = 하나의 JSON 객체
마지막 줄 = 개행 문자 포함
```

### 필드 설명
- `t`: 타임스탬프 (밀리초)
- `s`: 데이터 텍스트
- `max`: BIT_MAX 값
- `min`: BIT_MIN 값
- `attribute`: 속성 정보 (선택적)
- `data`: 데이터 정보 (선택적)
- `bit`: BIT 값 객체 (선택적)

---

이 문서는 현재 시스템의 주요 알고리즘을 정리한 것입니다.

