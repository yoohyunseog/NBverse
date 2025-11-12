# 조회 흐름 설명
## How Data Retrieval Works in the Hierarchy System

---

## 📋 예시 시나리오

**저장된 데이터:**
1. 속성: "반지의 제왕" (BIT: 3.06, 2.66) → 데이터: "원정대"
2. 속성: "다크 판타지" (BIT: 4.50, 3.50) → 데이터: "반지의 제왕"
3. 상위 속성: "다크 판타지" (하위 속성: "반지의 제왕")

**조회 요청:** "다크 판타지" 상위 속성으로 검색

---

## 🔍 조회 단계별 흐름

### **1단계: 상위 속성 정보 로드**

```
API: GET /api/attributes/data/by-parent?parentId=parent_다크판타지_xxxxx

서버 작업:
  1. data/honeycomb/hierarchy/parents.json 읽기
  2. parentId로 상위 속성 찾기
  3. 상위 속성 정보 반환:
     {
       parentId: "parent_다크판타지_xxxxx",
       text: "다크 판타지",
       bitMax: 4.50,
       bitMin: 3.50,
       childCellIds: ["attr_반지의제왕_3.06_2.66"]  ← 하위 속성 ID 목록
     }
```

---

### **2단계: 하위 속성 목록 수집**

```
서버 작업:
  1. collectAllAttributes() 호출
     → MAX/MIN 폴더 전체를 탐색하여 모든 속성 수집
     
  2. 하위 속성 필터링:
     childAttributes = attributes.filter(a => 
       parent.childCellIds.includes(a.cellId)
     )
     
  3. 결과:
     [
       {
         cellId: "attr_반지의제왕_3.06_2.66",
         text: "반지의 제왕",
         bitMax: 3.06,
         bitMin: 2.66,
         dataCount: 1
       }
     ]
```

---

### **3단계: 재귀적 데이터 수집**

```
각 하위 속성에 대해 collectAttributeDataRecursive() 호출:

[속성: "반지의 제왕" (BIT: 3.06, 2.66)]

3-1. 직접 저장된 데이터 수집
  ├─ 파일 경로 계산: data/max/3/0/6/3/9/2/3/0/7/6/9/max_bit/log.ndjson
  ├─ 파일 읽기
  └─ 속성 BIT가 일치하는 레코드 찾기:
      {
        attribute: { text: "반지의 제왕", bitMax: 3.06, bitMin: 2.66 },
        data: { text: "원정대", bitMax: 2.98, bitMin: 2.77 }
      }
      ✅ 수집됨!

3-2. 데이터가 다른 속성인지 확인
  ├─ 데이터 BIT 값: (2.98, 2.77)
  ├─ 모든 속성 목록에서 BIT 값이 일치하는 속성 찾기
  └─ 없음 → 재귀 종료

3-3. 결과 반환:
  [
    { attribute: { text: "반지의 제왕", ... }, data: { text: "원정대", ... } }
  ]
```

**만약 "반지의 제왕"도 다른 속성에 데이터로 저장되어 있다면:**

```
[추가 시나리오]
저장: 속성 "다크 판타지" → 데이터 "반지의 제왕"

3-2. 데이터가 다른 속성인지 확인
  ├─ 데이터 BIT 값: (3.06, 2.66)  ← "반지의 제왕"의 BIT 값
  ├─ 모든 속성 목록에서 검색
  └─ 발견! "반지의 제왕" 속성 (BIT: 3.06, 2.66)
  
3-3. 재귀 호출:
  collectAttributeDataRecursive(
    attrBitMax: 3.06,
    attrBitMin: 2.66,
    visited: Set(...),  ← 무한 재귀 방지
    depth: 1,           ← 현재 깊이
    maxDepth: 10
  )
  
3-4. 재귀 호출 결과:
  → "반지의 제왕" 속성의 모든 데이터 수집
  → "원정대" 데이터 발견!
  → "원정대"가 다른 속성인지 확인 (없음)
  → 결과 반환

3-5. 최종 결과 통합:
  [
    { attribute: { text: "다크 판타지", ... }, data: { text: "반지의 제왕", ... } },  ← 직접 데이터
    { attribute: { text: "반지의 제왕", ... }, data: { text: "원정대", ... } }      ← 재귀 데이터
  ]
```

---

### **4단계: 중복 제거 및 정렬**

```
서버 작업:
  1. 중복 제거:
     - 각 레코드를 고유 키로 변환: `${t}_${s}_${max}_${min}`
     - Set으로 중복 체크
     
  2. 정렬:
     - 최신순 (timestamp 내림차순)
     
  3. 제한:
     - 상위 100개만 반환 (limit 파라미터로 조정 가능)
```

---

### **5단계: 클라이언트에 결과 반환**

```json
{
  "ok": true,
  "parent": {
    "parentId": "parent_다크판타지_xxxxx",
    "text": "다크 판타지",
    "bitMax": 4.50,
    "bitMin": 3.50,
    "childCellIds": ["attr_반지의제왕_3.06_2.66"]
  },
  "childAttributes": [
    {
      "cellId": "attr_반지의제왕_3.06_2.66",
      "text": "반지의 제왕",
      "bitMax": 3.06,
      "bitMin": 2.66,
      "dataCount": 1
    }
  ],
  "count": 2,
  "items": [
    {
      "attribute": {
        "text": "반지의 제왕",
        "bitMax": 3.06,
        "bitMin": 2.66
      },
      "data": {
        "text": "원정대",
        "bitMax": 2.98,
        "bitMin": 2.77
      },
      "timestamp": "2025-10-31T22:06:53.736Z",
      "t": 1761948413736
    },
    {
      "attribute": {
        "text": "다크 판타지",
        "bitMax": 4.50,
        "bitMin": 3.50
      },
      "data": {
        "text": "반지의 제왕",
        "bitMax": 3.06,
        "bitMin": 2.66
      },
      "timestamp": "2025-10-31T23:00:00.000Z",
      "t": 1761950000000
    }
  ]
}
```

---

## 🔄 재귀 호출 상세

### **재귀 함수 동작 원리**

```javascript
collectAttributeDataRecursive(attrBitMax, attrBitMin, visited, depth, maxDepth)

입력:
  - attrBitMax, attrBitMin: 속성의 BIT 값
  - visited: 이미 방문한 속성 BIT 값 Set (순환 참조 방지)
  - depth: 현재 재귀 깊이
  - maxDepth: 최대 깊이 (기본값: 10)

처리:
  1. 무한 재귀 방지 체크:
     - depth > maxDepth → 즉시 반환 []
     - visited.has(key) → 즉시 반환 [] (이미 방문함)
     
  2. visited에 현재 속성 추가
   
  3. 해당 속성의 직접 저장된 데이터 수집
     - 파일에서 attribute.bitMax/Min이 일치하는 레코드 찾기
   
  4. 각 데이터에 대해:
     - 데이터의 BIT 값 확인
     - 그 BIT 값이 다른 속성과 일치하는지 확인
     - 일치하면 → 재귀 호출 (depth + 1)
     - 재귀 결과를 현재 결과에 추가
   
  5. 모든 결과 반환

출력:
  - 속성에 직접 저장된 데이터 배열
  - 재귀적으로 수집된 하위 데이터 배열
```

---

## 📊 전체 흐름도

```
[사용자] "다크 판타지" 상위 속성 검색 클릭
    ↓
[클라이언트] GET /api/attributes/data/by-parent?parentId=...
    ↓
[서버] 1. 상위 속성 정보 로드 (parents.json)
    ↓
[서버] 2. 하위 속성 목록 수집 (childCellIds)
    ↓
[서버] 3. 각 하위 속성에 대해 재귀적 데이터 수집:
    │
    ├─ 속성 A: collectAttributeDataRecursive()
    │   ├─ 직접 데이터 수집
    │   ├─ 데이터가 다른 속성인지 확인
    │   └─ 맞으면 → 재귀 호출
    │       ├─ 속성 A' 데이터 수집
    │       ├─ 데이터가 다른 속성인지 확인
    │       └─ ... (최대 10단계까지)
    │
    ├─ 속성 B: collectAttributeDataRecursive()
    │   └─ ...
    │
    └─ 속성 C: collectAttributeDataRecursive()
        └─ ...
    ↓
[서버] 4. 모든 결과 통합
    ├─ 중복 제거
    ├─ 정렬 (최신순)
    └─ 제한 (상위 N개)
    ↓
[서버] JSON 응답 반환
    ↓
[클라이언트] 결과 표시
    ├─ 상위 속성 정보
    ├─ 하위 속성 목록
    └─ 수집된 모든 데이터 테이블
```

---

## 🛡️ 안전장치

### **1. 무한 재귀 방지**
- `maxDepth: 10` → 최대 10단계까지만 재귀
- `visited` Set → 같은 속성을 두 번 방문하지 않음

### **2. 중복 제거**
- 레코드 고유 키: `${t}_${s}_${max}_${min}`
- Set을 사용하여 중복 체크

### **3. 에러 처리**
- 파일 읽기 실패 → 무시하고 계속 진행
- JSON 파싱 실패 → 해당 라인 무시
- 속성 찾기 실패 → 빈 배열 반환

---

## 💡 핵심 포인트

### **왜 재귀적으로 수집하나?**
- 속성이 데이터로 저장되어 있을 때, 그 속성의 하위 데이터도 함께 조회하기 위함
- 예: "다크 판타지" → "반지의 제왕" (데이터) → "원정대" (데이터의 데이터)

### **어떻게 속성을 찾나?**
- BIT 값으로 찾음
- 데이터의 BIT 값 = 다른 속성의 BIT 값이면 → 같은 속성으로 인식

### **성능 고려사항**
- 모든 속성을 매번 수집하지 않음
- 재귀 호출 시에만 `collectAllAttributes()` 호출 (최적화 가능)
- 캐싱 가능 (향후 개선)

---

**이제 "다크 판타지"로 검색하면 "반지의 제왕"과 "원정대"가 모두 조회됩니다!**

