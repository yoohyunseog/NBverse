# 벌집 구조 속성 시스템 설계 구도
## Honeycomb-based Attribute System Design

---

## 📐 1. 핵심 개념 정의

### 1.1 벌집 구조 모델
```
각 속성 = 하나의 육각형 셀 (Hexagon Cell)
├─ 셀의 위치 = BIT 값 좌표 (BIT_MAX, BIT_MIN)
├─ 셀의 내용 = 속성 텍스트
├─ 셀 내부 데이터 = 해당 속성에 연결된 데이터들
└─ 셀 간 연결 = BIT 값 유사도 기반 인접 관계
```

### 1.2 공간 구조
```
2차원 BIT 공간:
  ┌─────────────────────────→ BIT_MAX
  │
  │   [셀A]  [셀B]
  │     ╱  ╲    ╱  ╲
  │  [셀C] ─ [셀D]
  │     ╱  ╲    ╱  ╲
  │   ...    ...
  ↓
BIT_MIN

셀 간 거리 = √((BIT_MAX 차이)² + (BIT_MIN 차이)²)
```

---

## 🏗️ 2. 데이터 구조 설계

### 2.1 속성 셀 레코드 (Attribute Cell Record)
```json
{
  "cellId": "unique_cell_id",
  "cellType": "attribute",  // "attribute" | "data"
  
  "position": {
    "bitMax": 3.063923076923077,
    "bitMin": 2.660476923076924,
    "coordinates": [3.06, 2.66]  // 정규화 좌표 (선택적)
  },
  
  "content": {
    "text": "반지의 제왕",
    "language": "ko",  // 언어 감지 (선택적)
    "metadata": {}  // 추가 메타데이터
  },
  
  "cellProperties": {
    "createdAt": "2025-10-31T22:06:53.736Z",
    "updatedAt": "2025-10-31T22:06:53.736Z",
    "accessCount": 0,  // 접근 빈도
    "dataCount": 3  // 연결된 데이터 수
  },
  
  "connections": {
    "neighbors": [  // 인접 셀 ID 목록 (동적 계산 또는 캐시)
      "cell_id_1",
      "cell_id_2"
    ],
    "neighborCache": {  // 인접성 캐시 (선택적)
      "lastUpdated": "2025-10-31T22:06:53.736Z",
      "neighbors": [
        {
          "cellId": "cell_id_1",
          "distance": 0.12,
          "bitMaxDiff": 0.06,
          "bitMinDiff": 0.04
        }
      ]
    }
  },
  
  "children": [  // 해당 속성에 연결된 데이터 셀 ID들
    "data_cell_id_1",
    "data_cell_id_2"
  ]
}
```

### 2.2 데이터 셀 레코드 (Data Cell Record)
```json
{
  "cellId": "unique_data_cell_id",
  "cellType": "data",
  
  "position": {
    "bitMax": 2.9828260869565213,
    "bitMin": 2.7721739130434786
  },
  
  "content": {
    "text": "원정대",
    "language": "ko"
  },
  
  "parentAttribute": {
    "cellId": "attribute_cell_id",
    "text": "반지의 제왕",
    "bitMax": 3.063923076923077,
    "bitMin": 2.660476923076924
  },
  
  "cellProperties": {
    "createdAt": "2025-10-31T22:06:53.736Z",
    "belongsTo": "attribute_cell_id"
  }
}
```

### 2.3 벌집 구조 메타데이터 (Honeycomb Metadata)
```json
{
  "honeycombVersion": "1.0",
  "totalCells": 150,
  "totalAttributes": 50,
  "totalData": 100,
  
  "clusters": [  // 자동 감지된 클러스터
    {
      "clusterId": "cluster_1",
      "center": {
        "bitMax": 3.06,
        "bitMin": 2.66
      },
      "radius": 0.5,
      "cellIds": ["cell_1", "cell_2", "cell_3"],
      "clusterType": "dense"  // "dense" | "sparse" | "isolated"
    }
  ],
  
  "spatialIndex": {
    "gridResolution": 0.1,  // 그리드 해상도
    "gridMap": {}  // 그리드 → 셀 ID 매핑 (선택적 최적화)
  },
  
  "lastRebuild": "2025-10-31T22:06:53.736Z"
}
```

---

## 🗂️ 3. 저장 구조 설계

### 3.1 기존 구조 유지
```
기존 MAX/MIN 폴더 구조 그대로 유지:
data/
├─ max/
│   └─ {BIT_MAX 경로}/
│       └─ max_bit/
│           └─ log.ndjson
└─ min/
    └─ {BIT_MIN 경로}/
        └─ min_bit/
            └─ log.ndjson
```

### 3.2 벌집 메타데이터 저장 (신규)
```
data/
├─ honeycomb/
│   ├─ metadata.json  // 전체 벌집 메타데이터
│   ├─ cells/
│   │   ├─ attributes/
│   │   │   └─ {cellId}.json  // 속성 셀 레코드 (선택적)
│   │   └─ data/
│   │       └─ {cellId}.json  // 데이터 셀 레코드 (선택적)
│   └─ indexes/
│       ├─ spatial_index.json  // 공간 인덱스 (선택적)
│       └─ neighbor_cache.json  // 인접성 캐시 (선택적)
└─ ...
```

### 3.3 저장 전략 옵션

**옵션 A: 기존 구조만 사용 (현재 방식)**
- 장점: 구조 변경 없음
- 단점: 인접성 계산이 매번 필요 (성능)

**옵션 B: 메타데이터 추가 저장**
- 장점: 인접성 캐시 가능, 빠른 조회
- 단점: 데이터 중복, 동기화 필요

**옵션 C: 하이브리드**
- 기존 MAX/MIN: 실제 레코드 저장
- 메타데이터: 인덱스/캐시만 저장 (계산 결과)
- 장점: 성능 + 데이터 무결성

**권장: 옵션 C**

---

## 🔍 4. 인접성 계산 알고리즘

### 4.1 거리 계산 방법

**유클리드 거리 (Euclidean Distance)**
```
distance = √((BIT_MAX₁ - BIT_MAX₂)² + (BIT_MIN₁ - BIT_MIN₂)²)
```

**맨해튼 거리 (Manhattan Distance)**
```
distance = |BIT_MAX₁ - BIT_MAX₂| + |BIT_MIN₁ - BIT_MIN₂|
```

**가중 거리 (Weighted Distance)**
```
distance = w₁ × |BIT_MAX₁ - BIT_MAX₂| + w₂ × |BIT_MIN₁ - BIT_MIN₂|
// w₁, w₂ = BIT_MAX/MIN의 중요도 가중치
```

**권장: 유클리드 거리 (직관적, 표준)**

### 4.2 인접 셀 판단 임계값

**고정 임계값 방식**
```
임계값 설정: threshold = 0.5
인접 판단: distance < threshold → 인접 셀
```

**적응형 임계값 방식**
```
밀도 기반:
- 지역 밀도가 높으면: threshold 낮게 (0.3)
- 지역 밀도가 낮으면: threshold 높게 (0.8)
```

**K-최근접 방식**
```
항상 가장 가까운 K개를 인접 셀로 선택
K = 6 (육각형의 최대 인접 셀 수)
```

**권장: 적응형 임계값 (유연성)**

### 4.3 인접성 계산 흐름
```
입력: 쿼리 셀 (BIT_MAX, BIT_MIN)

1단계: 모든 속성 셀 검색
  - MAX/MIN 폴더에서 모든 속성 레코드 수집
  - 중복 제거 (동일 cellId)

2단계: 거리 계산
  For each attribute_cell:
    distance = calculateDistance(query_cell, attribute_cell)
    candidates.append({cell, distance})

3단계: 인접 셀 선별
  - 거리순 정렬
  - 임계값 적용 또는 K-최근접 선택
  - neighbors = [candidates where distance < threshold]

4단계: 결과 반환
  Return: {
    centerCell: query_cell,
    neighbors: neighbors,
    clusters: detectClusters(neighbors)
  }
```

---

## 🌐 5. 클러스터 감지 알고리즘

### 5.1 클러스터 정의
```
클러스터 = 인접한 셀들의 그룹
- 밀집 클러스터: 많은 셀이 가까이 모여있음
- 희소 클러스터: 셀들이 넓게 분산됨
- 고립 셀: 인접 셀이 없거나 매우 적음
```

### 5.2 클러스터 감지 방법

**DBSCAN 기반**
```
Parameters:
  - eps (최대 거리): 0.5
  - minPts (최소 점 수): 3

알고리즘:
  1. 모든 셀을 "미방문"으로 초기화
  2. 미방문 셀 선택
  3. eps 반경 내 셀 수 >= minPts?
     - YES: 새 클러스터 시작, 재귀적으로 확장
     - NO: 노이즈로 표시
  4. 반복
```

**K-Means 기반**
```
Parameters:
  - K (클러스터 수): 자동 결정 또는 고정

알고리즘:
  1. 초기 중심점 K개 랜덤 선택
  2. 각 셀을 가장 가까운 중심점에 할당
  3. 중심점 재계산
  4. 수렴할 때까지 반복
```

**간단한 밀도 기반 (권장)**
```
1. 그리드 생성 (해상도: 0.1)
2. 각 그리드 셀에 속하는 실제 셀 수 계산
3. 밀도 >= threshold 인 그리드를 클러스터로 표시
4. 인접한 밀집 그리드들을 하나의 클러스터로 병합
```

### 5.3 클러스터 메타데이터
```json
{
  "clusterId": "cluster_1",
  "center": {
    "bitMax": 3.06,
    "bitMin": 2.66
  },
  "boundary": {
    "minBitMax": 2.8,
    "maxBitMax": 3.3,
    "minBitMin": 2.4,
    "maxBitMin": 2.9
  },
  "cellIds": ["cell_1", "cell_2", "cell_3"],
  "density": 15,  // 단위 면적당 셀 수
  "clusterType": "dense",
  "topics": ["판타지", "소설"]  // 주제 태그 (선택적, GPT 분석)
}
```

---

## 🔎 6. 검색 알고리즘 설계

### 6.1 검색 유형

**타입 1: 정확 매칭 검색**
```
입력: 속성 텍스트 또는 BIT 값
→ 해당 속성 셀만 반환
```

**타입 2: 인접 영역 검색**
```
입력: 속성 텍스트 또는 BIT 값
→ 해당 셀 + 인접 셀들 모두 반환
```

**타입 3: 반경 검색**
```
입력: BIT 값 + 반경 (radius)
→ 반경 내 모든 셀 반환
```

**타입 4: 클러스터 검색**
```
입력: 속성 텍스트
→ 해당 셀이 속한 클러스터 전체 반환
```

**타입 5: 계층 검색**
```
입력: 속성 텍스트
→ 해당 셀 + 자식 데이터 셀들 + 인접 셀들 + 인접 셀의 데이터들
```

### 6.2 검색 흐름 (타입 5 - 계층 검색)
```
입력: searchText

1단계: 텍스트 → BIT 값 계산
  queryBitMax, queryBitMin = calculateBIT(searchText)

2단계: 정확 매칭 셀 찾기
  exactMatch = findCellByBIT(queryBitMax, queryBitMin)
  또는 findCellByText(searchText)

3단계: 인접 셀 탐색
  neighbors = findNeighbors(exactMatch, threshold=0.5)

4단계: 자식 데이터 수집
  for each cell in [exactMatch, ...neighbors]:
    children = findChildren(cell.cellId)
    allData.append(children)

5단계: 결과 통합
  results = {
    center: exactMatch,
    neighbors: neighbors,
    data: allData,
    clusters: findClusters([exactMatch, ...neighbors])
  }

6단계: 정렬 및 필터링
  - 유사도순 정렬
  - 중복 제거
  - 상위 N개 반환
```

### 6.3 성능 최적화

**공간 인덱스 (Spatial Index)**
```
그리드 기반 인덱스:
  - BIT 공간을 격자로 분할 (예: 0.1 × 0.1)
  - 각 격자에 속하는 셀 ID 저장
  - 검색 시: 해당 격자 + 인접 격자만 탐색

구현:
  gridMap = {
    "3.0-2.6": ["cell_1", "cell_2"],
    "3.1-2.7": ["cell_3"],
    ...
  }
```

**인접성 캐시**
```
캐시 구조:
  neighborCache = {
    "cell_id_1": {
      "lastUpdated": timestamp,
      "neighbors": [
        {"cellId": "cell_2", "distance": 0.12},
        ...
      ],
      "ttl": 3600000  // 1시간
    }
  }

캐시 히트: 즉시 반환
캐시 미스: 재계산 후 캐시 저장
```

**지연 계산 (Lazy Computation)**
```
인접성 계산을 즉시 하지 않고:
- 필요한 시점에만 계산
- 백그라운드에서 점진적 계산
- 사용 빈도가 높은 셀 우선 계산
```

---

## 🎯 7. 확장 시나리오

### 7.1 새 속성 추가 시

**시나리오: 새 속성 "엘프의 왕국" 입력**

```
1단계: BIT 값 계산
  "엘프의 왕국" → BIT_MAX: 3.15, BIT_MIN: 2.68

2단계: 저장 위치 결정
  - MAX/MIN 폴더 경로 계산
  - 4곳에 레코드 저장 (기존 방식)

3단계: 인접 셀 자동 탐지
  - 기존 모든 속성과 거리 계산
  - 인접 셀 목록 생성
  - 인접성 캐시 업데이트 (선택적)

4단계: 클러스터 업데이트
  - 새 셀이 기존 클러스터에 속하는지 확인
  - 속하면: 클러스터에 추가
  - 속하지 않으면: 새 클러스터 생성 또는 고립 셀로 표시

5단계: 메타데이터 갱신
  - totalCells++
  - spatialIndex 업데이트
```

### 7.2 데이터 추가 시

**시나리오: 속성 "반지의 제왕"에 데이터 "골룸" 추가**

```
1단계: 데이터 BIT 값 계산
  "골룸" → BIT_MAX: 2.95, BIT_MIN: 2.75

2단계: 데이터 셀 레코드 생성
  - cellId 생성
  - parentAttribute 연결
  - 4곳에 저장 (기존 방식)

3단계: 부모 속성 셀 업데이트
  - 부모 셀의 children 배열에 추가 (캐시된 경우)
  - 부모 셀의 dataCount++

4단계: 데이터 셀도 인접성 계산 (선택적)
  - 다른 데이터 셀들과의 거리 계산
  - 의미 있는 연결 발견 시 메모
```

### 7.3 대규모 확장 고려사항

**문제: 속성이 수만 개가 되면?**
```
해결책:
1. 공간 인덱스 필수 (격자 분할)
2. 인접성 계산을 비동기/배치 처리
3. 클러스터별로 분할 저장
4. 데이터베이스 전환 고려 (SQLite, MongoDB 등)
```

**문제: 검색이 느려지면?**
```
해결책:
1. 인덱스 최적화
2. 결과 캐싱
3. 페이지네이션 (한 번에 상위 100개만)
4. 병렬 처리 (Worker Thread)
```

---

## 🎨 8. UI/UX 설계

### 8.1 벌집 시각화 (선택적)

**2D 히트맵**
```
BIT 공간을 2D 그리드로 표현:
  - 각 격자 = 밀도에 따라 색상 표현
  - 클릭 시: 해당 영역의 셀들 표시
```

**노드-엣지 그래프**
```
- 노드 = 속성 셀
- 엣지 = 인접 관계
- 클러스터별로 색상 구분
- 드래그로 이동, 줌인/아웃
```

**계층 트리**
```
속성 셀
├─ 데이터 셀 1
├─ 데이터 셀 2
└─ 인접 속성 셀
    ├─ 데이터 셀 3
    └─ ...
```

### 8.2 검색 결과 표시

**계층적 표시**
```
[검색어: "반지의 제왕"]

┌─ 중심 셀
│  속성: 반지의 제왕 (BIT: 3.06, 2.66)
│  ├─ 데이터: 원정대
│  ├─ 데이터: 골룸
│  └─ 데이터: 프로도
│
├─ 인접 셀 (거리: 0.12)
│  속성: 호빗 (BIT: 3.12, 2.70)
│  ├─ 데이터: 샤이어
│  └─ 데이터: 바긴스 집
│
└─ 클러스터 "판타지 소설"
   속성 5개, 데이터 12개
```

### 8.3 인터랙션

**드릴다운 탐색**
```
1. 속성 클릭 → 데이터 목록 표시
2. 인접 셀 클릭 → 해당 셀 중심으로 재탐색
3. 클러스터 클릭 → 클러스터 전체 확장 표시
```

**필터링**
```
- 셀 타입 필터 (속성만 / 데이터만 / 전체)
- 거리 필터 (반경 설정)
- 시간 필터 (최신순 / 오래된순)
- 밀도 필터 (밀집 클러스터만 / 고립 셀만)
```

---

## 📊 9. 성능 지표

### 9.1 측정 항목

**저장 성능**
- 새 셀 추가 시간: < 100ms
- 인접성 계산 시간: < 500ms (1000개 셀 기준)
- 클러스터 업데이트 시간: < 1s (배치 처리 허용)

**검색 성능**
- 정확 매칭: < 50ms
- 인접 영역 검색: < 200ms
- 클러스터 검색: < 500ms
- 반경 검색 (radius=1.0): < 1s

**메모리 사용**
- 인덱스 크기: 전체 데이터의 10% 이하
- 캐시 크기: 최대 100MB

### 9.2 최적화 목표

**초기 목표 (소규모)**
- 속성 100개, 데이터 500개
- 모든 인접성 실시간 계산 가능
- 인덱스 없이도 충분히 빠름

**확장 목표 (중규모)**
- 속성 1,000개, 데이터 5,000개
- 공간 인덱스 필수
- 인접성 캐시 활용

**대규모 목표 (대규모)**
- 속성 10,000개 이상
- 데이터베이스 전환 고려
- 분산 처리 또는 클러스터링

---

## 🔄 10. 구현 단계별 계획

### Phase 1: 기본 구조 (기존 유지)
- ✅ 현재 저장 구조 유지
- ✅ 기존 API 유지
- 목표: 기존 기능 보존

### Phase 2: 인접성 계산 추가
- 새 API: `GET /api/honeycomb/neighbors`
- 인접성 계산 알고리즘 구현
- 임계값 설정 가능
- 목표: 인접 셀 탐색 기능

### Phase 3: 클러스터 감지
- 새 API: `GET /api/honeycomb/clusters`
- 클러스터 감지 알고리즘 구현
- 클러스터 메타데이터 저장
- 목표: 자동 그룹화

### Phase 4: 검색 확장
- 기존 검색 API 확장
- 계층 검색 옵션 추가
- 반경 검색 옵션 추가
- 목표: 검색 기능 강화

### Phase 5: 성능 최적화 (선택적)
- 공간 인덱스 구현
- 인접성 캐시 구현
- 백그라운드 배치 처리
- 목표: 대규모 데이터 처리

### Phase 6: UI 개선 (선택적)
- 벌집 시각화
- 계층적 결과 표시
- 인터랙티브 탐색
- 목표: 사용자 경험 향상

---

## 🤔 10. 논의 필요 사항

### 10.1 설계 결정 사항

**Q1: 인접성 계산 방식**
- [ ] 실시간 계산 (간단, 느림)
- [ ] 캐시 사용 (복잡, 빠름)
- [ ] 하이브리드 (권장)

**Q2: 인접 판단 기준**
- [ ] 고정 임계값: _____
- [ ] 적응형 임계값 (밀도 기반)
- [ ] K-최근접: K = _____

**Q3: 클러스터 감지**
- [ ] 간단한 밀도 기반 (빠름)
- [ ] DBSCAN (정확, 느림)
- [ ] 필요 없음 (단순 구조)

**Q4: 메타데이터 저장**
- [ ] 별도 파일로 저장 (honeycomb/)
- [ ] 기존 레코드에 필드 추가
- [ ] 메모리만 사용 (재계산)

**Q5: UI 시각화**
- [ ] 벌집 시각화 필요
- [ ] 리스트/테이블만으로 충분
- [ ] 나중에 추가

### 10.2 우선순위

**필수 기능 (Must Have)**
1. 인접 셀 탐색 (타입 2 검색)
2. 거리 계산 (유클리드)
3. 기본 임계값 설정

**중요 기능 (Should Have)**
4. 클러스터 감지
5. 계층 검색 (타입 5)
6. 성능 최적화 (인덱스)

**선택 기능 (Nice to Have)**
7. 벌집 시각화
8. 고급 클러스터링 알고리즘
9. 실시간 업데이트

---

## 📝 11. 요약

### 핵심 아이디어
- **각 속성 = 벌집의 하나의 셀**
- **BIT 값 = 셀의 좌표**
- **BIT 거리 = 셀 간 인접성**
- **인접 셀 탐색 = 벌집 구조 활용**

### 주요 설계 결정
1. **저장 구조**: 기존 MAX/MIN 구조 유지 (호환성)
2. **인접성 계산**: 유클리드 거리 + 적응형 임계값
3. **클러스터 감지**: 밀도 기반 간단 알고리즘
4. **검색 확장**: 계층 검색 (중심 + 인접 + 데이터)
5. **성능**: 점진적 최적화 (필요 시 인덱스 추가)

### 구현 전략
- **Phase 1-2**: 기본 기능 (인접성 계산)
- **Phase 3-4**: 고급 기능 (클러스터, 검색 확장)
- **Phase 5-6**: 최적화 및 UI (선택적)

---

**다음 단계: 사용자와 논의하여 설계 결정 사항 확정 후 구현 시작**

