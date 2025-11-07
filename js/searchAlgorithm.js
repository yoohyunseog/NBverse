/**
 * 검색 알고리즘 모듈
 * gpt_auto_new.html의 검색 알고리즘을 공통으로 사용하기 위한 모듈
 */

// 전역으로 노출될 객체
window.SearchAlgorithm = (function() {
    'use strict';

    /**
     * BIT 값 기반 유사도 계산
     * @param {number} queryBitMax - 쿼리의 BIT MAX 값
     * @param {number} queryBitMin - 쿼리의 BIT MIN 값
     * @param {number} resultBitMax - 결과의 BIT MAX 값
     * @param {number} resultBitMin - 결과의 BIT MIN 값
     * @returns {number} 유사도 (0~1)
     */
    function calculateSimilarity(queryBitMax, queryBitMin, resultBitMax, resultBitMin) {
        if (resultBitMax === null || resultBitMax === undefined || 
            resultBitMin === null || resultBitMin === undefined) {
            return 0;
        }
        const bitMaxDiff = Math.abs((queryBitMax || 0) - (resultBitMax || 0));
        const bitMinDiff = Math.abs((queryBitMin || 0) - (resultBitMin || 0));
        const distance = Math.sqrt(bitMaxDiff * bitMaxDiff + bitMinDiff * bitMinDiff);
        // 거리가 0이면 1.0, 거리가 멀수록 0에 가까워짐
        return Math.max(0, 1 / (1 + distance));
    }

    /**
     * 속성 유사도 검색 (BIT 기반)
     * @param {string} searchText - 검색 텍스트
     * @param {number} searchBitMax - 검색 쿼리의 BIT MAX
     * @param {number} searchBitMin - 검색 쿼리의 BIT MIN
     * @param {Array} allAttributes - 모든 속성 목록
     * @param {number} threshold - 유사도 임계값 (기본값: 0.1)
     * @param {number} limit - 반환할 최대 개수 (기본값: 10)
     * @returns {Array} 유사한 속성 배열 (similarity 포함)
     */
    function findSimilarAttributes(searchText, searchBitMax, searchBitMin, allAttributes, threshold = 0.1, limit = 10) {
        if (!allAttributes || allAttributes.length === 0) {
            return [];
        }

        const searchTextTrimmed = searchText ? searchText.trim() : '';
        
        const similarAttributes = allAttributes
            .filter(attr => attr && attr.text) // null/undefined 체크
            .map(attr => {
                const attrText = String(attr.text || '').trim();
                if (!attrText) return null;
                
                let similarity = 0;
                
                // 텍스트가 정확히 일치하는 경우만 100%
                if (attrText === searchTextTrimmed) {
                    similarity = 1.0;
                } else {
                    // BIT 값이 정확히 일치하더라도 텍스트가 다르면 유사도 계산
                    // (다른 챕터가 같은 BIT 값을 가질 수 있으므로 텍스트 매칭 우선)
                    const bitMaxDiff = Math.abs((searchBitMax || 0) - (attr.bitMax || 0));
                    const bitMinDiff = Math.abs((searchBitMin || 0) - (attr.bitMin || 0));
                    if (bitMaxDiff === 0 && bitMinDiff === 0) {
                        // BIT 값은 일치하지만 텍스트가 다른 경우, 매우 높은 유사도 (100%가 아닌 0.99)
                        // 텍스트 부분 일치 확인
                        if (attrText.includes(searchTextTrimmed) || searchTextTrimmed.includes(attrText)) {
                            similarity = 0.99;
                        } else {
                            similarity = 0.95; // BIT만 일치
                        }
                    } else {
                        // 유사도 계산
                        similarity = calculateSimilarity(searchBitMax, searchBitMin, attr.bitMax, attr.bitMin);
                    }
                }
                
                return { ...attr, similarity };
            })
            .filter(attr => attr !== null) // null 필터링
            .filter(attr => attr.similarity > threshold) // 유사도 임계값 필터링
            .sort((a, b) => {
                // 정확히 일치하는 항목(유사도 1.0)을 먼저, 그 다음 유사도순으로 정렬
                const aIsExact = (a.similarity || 0) === 1.0;
                const bIsExact = (b.similarity || 0) === 1.0;
                if (aIsExact && !bIsExact) return -1;
                if (!aIsExact && bIsExact) return 1;
                return (b.similarity || 0) - (a.similarity || 0);
            })
            .slice(0, limit);
        
        return similarAttributes;
    }

    /**
     * 검색 결과 정렬 및 중복 제거
     * @param {Array} results - 검색 결과 배열
     * @param {number} queryBitMax - 쿼리의 BIT MAX
     * @param {number} queryBitMin - 쿼리의 BIT MIN
     * @param {number} limit - 반환할 최대 개수 (기본값: 20)
     * @returns {Array} 정렬된 고유 결과 배열
     */
    function processSearchResults(results, queryBitMax, queryBitMin, limit = 20) {
        // 중복 제거
        const seen = new Set();
        const uniqueResults = [];
        results.forEach(item => {
            const key = `${item.t || ''}_${item.input || item.attribute?.text || ''}_${item.response || item.data?.text || item.s || ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });

        // 유사도가 계산되지 않은 항목에 대해 계산 시도
        uniqueResults.forEach(item => {
            if (item.similarity === undefined || item.similarity === null) {
                const resultBitMax = item.data?.bitMax || item.max || item.nb_max || item.bit?.max || null;
                const resultBitMin = item.data?.bitMin || item.min || item.nb_min || item.bit?.min || null;
                item.similarity = calculateSimilarity(queryBitMax, queryBitMin, resultBitMax, resultBitMin);
            }
        });
        
        // 정확히 일치하는 항목(유사도 1.0)을 먼저, 그 다음 유사도순으로 정렬
        uniqueResults.sort((a, b) => {
            const aIsExact = (a.similarity || 0) === 1.0;
            const bIsExact = (b.similarity || 0) === 1.0;
            if (aIsExact && !bIsExact) return -1;
            if (!aIsExact && bIsExact) return 1;
            // 둘 다 정확히 일치하거나 둘 다 아닌 경우 유사도순 정렬
            return (b.similarity || 0) - (a.similarity || 0);
        });
        
        return uniqueResults.slice(0, limit);
    }

    /**
     * 속성 검색 결과의 유사도 계산 (속성 BIT 기반)
     * @param {string} searchAttributeText - 검색 속성 텍스트
     * @param {number} attrBitMax - 검색 속성의 BIT MAX
     * @param {number} attrBitMin - 검색 속성의 BIT MIN
     * @param {Object} item - 검색 결과 항목
     * @returns {number} 유사도 (0~1)
     */
    function calculateAttributeSimilarity(searchAttributeText, attrBitMax, attrBitMin, item) {
        const resultAttrBitMax = item.attribute?.bitMax || null;
        const resultAttrBitMin = item.attribute?.bitMin || null;
        const resultAttrText = item.attribute?.text || '';
        
        if (resultAttrBitMax !== null && resultAttrBitMin !== null) {
            // 텍스트가 정확히 일치하는 경우만 100%
            if (resultAttrText === searchAttributeText) {
                return 1.0;
            } else {
                // BIT 값이 정확히 일치하더라도 텍스트가 다르면 유사도 계산
                // (다른 챕터가 같은 BIT 값을 가질 수 있으므로 텍스트 매칭 우선)
                const bitMaxDiff = Math.abs((attrBitMax || 0) - (resultAttrBitMax || 0));
                const bitMinDiff = Math.abs((attrBitMin || 0) - (resultAttrBitMin || 0));
                if (bitMaxDiff === 0 && bitMinDiff === 0) {
                    // BIT 값은 일치하지만 텍스트가 다른 경우, 매우 높은 유사도 (100%가 아닌 0.99)
                    // 텍스트 부분 일치 확인
                    if (resultAttrText.includes(searchAttributeText) || searchAttributeText.includes(resultAttrText)) {
                        return 0.99;
                    } else {
                        return 0.95; // BIT만 일치
                    }
                } else {
                    // 속성 BIT 값으로 유사도 계산
                    return calculateSimilarity(attrBitMax, attrBitMin, resultAttrBitMax, resultAttrBitMin);
                }
            }
        } else if (item.similarity) {
            // 서버에서 반환된 유사도 사용
            let similarity = item.similarity;
            // 텍스트가 정확히 일치하면 100%로 오버라이드
            if (resultAttrText === searchAttributeText) {
                similarity = 1.0;
            }
            return similarity;
        }
        
        return 0;
    }

    // 공개 API
    return {
        calculateSimilarity: calculateSimilarity,
        findSimilarAttributes: findSimilarAttributes,
        processSearchResults: processSearchResults,
        calculateAttributeSimilarity: calculateAttributeSimilarity
    };
})();

