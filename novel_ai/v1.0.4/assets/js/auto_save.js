/**
 * 자동 저장 모듈
 * 우측 입력값을 통한 자동 저장 기능
 */

(function() {
    'use strict';
    
    // 자동 저장 관련 변수
    let autoSaveTimer = null;
    let lastSavedAttribute = '';
    let lastSavedData = '';
    let isSaving = false;
    
    // DOM 요소 참조 (나중에 초기화)
    let $novelTitleInput = null;
    let $attributeInput = null;
    let $dataInput = null;
    let $attributeBitInfo = null;
    let $dataBitInfo = null;
    let $saveStatus = null;
    let $attributeFilterInput = null;
    
    // 의존성 함수들 (외부에서 주입받음)
    let calculateBitValues = null;
    let checkDuplicate = null;
    let getServerUrl = null;
    let updateSaveStatus = null;
    let updateNovelAIStatus = null;
    let saveFilterValues = null;
    let loadAttributes = null;
    let loadNovelList = null;
    
    // 로컬 스토리지 키
    const STORAGE_KEY_NOVEL_TITLE = 'novel_ai_input_novel_title';
    const STORAGE_KEY_ATTRIBUTE_TEXT = 'novel_ai_input_attribute_text';
    const STORAGE_KEY_DATA_TEXT = 'novel_ai_input_data_text';
    const BIT_TOLERANCE = 1e-12;
    const ATTRIBUTE_BIT_LOADING_TEXT = 'BIT: 계산 중...';
    const DATA_BIT_INFO_MESSAGE = '(속성 BIT 값을 사용합니다)';

    function parseBitText(text) {
        if (!text) return null;
        const match = text.match(/BIT:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/);
        if (!match) return null;
        const max = Number(match[1]);
        const min = Number(match[2]);
        if (Number.isNaN(max) || Number.isNaN(min)) return null;
        return { max, min };
    }

    function bitsApproximatelyEqual(a, b, tolerance = BIT_TOLERANCE) {
        if (!a || !b) return false;
        return (
            Math.abs(a.max - b.max) <= tolerance &&
            Math.abs(a.min - b.min) <= tolerance
        );
    }

    function applyBitText(element, text) {
        if (!element) return;
        const firstElement = element.firstElementChild;
        if (
            firstElement &&
            typeof firstElement.textContent === 'string' &&
            firstElement.textContent.trim().startsWith('BIT:')
        ) {
            firstElement.textContent = text;
        } else {
            element.textContent = text;
        }
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractAttributeParts(rawAttributeText, novelTitle) {
        const lines = (rawAttributeText || '')
            .split('\n')
            .map(line => (line || '').trim())
            .filter(line => line.length > 0);
        let attributeOnly = lines.length > 0 ? lines[0] : '';

        if (novelTitle) {
            const prefixPattern = new RegExp(`^(?:${escapeRegExp(novelTitle)}\\s*→\\s*)+`, 'u');
            attributeOnly = attributeOnly.replace(prefixPattern, '').trim();
            if (!attributeOnly && lines.length > 1) {
                attributeOnly = lines[1];
            }
        }

        if (attributeOnly === undefined || attributeOnly === null) {
            attributeOnly = '';
        }

        const full = novelTitle
            ? (attributeOnly ? `${novelTitle} → ${attributeOnly}` : novelTitle)
            : attributeOnly;

        return { attributeOnly, full };
    }
    
    /**
     * 자동 저장 함수
     * @param {string|null} overrideData - 외부에서 제공된 데이터 텍스트 (선택)
     */
    async function autoSave(overrideData = null) {
        // 중요: 저장 시에는 항상 현재 입력 필드의 실제 값을 사용해야 함
        // 로컬 스토리지에서 값을 읽어오지 않고, DOM 요소의 .value를 직접 사용
        // overrideData가 제공되면 그것을 사용 (자동 조회/저장에서 데이터를 읽은 경우)
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const rawAttributeText = ($attributeInput && $attributeInput.value || '').trim();
        const dataText = overrideData !== null ? (overrideData || '').trim() : (($dataInput && $dataInput.value || '').trim());
        
        // 자동 저장 시작 로그
        console.log('💡 [자동 저장] 속성과 데이터를 입력하면 자동으로 저장됩니다. (입력 후 1초 대기)');
        console.log('[자동 저장] 자동 저장 함수 호출됨');
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', '💡 [자동 저장 기능] 속성과 데이터를 입력하면 1초 후 자동으로 서버에 저장됩니다.');
        }
        
        // 디버깅: 저장 시점의 실제 입력 필드 값 확인 (로컬 스토리지와 비교)
        console.log('[자동 저장] 저장 시점 입력 필드 값:', {
            novelTitle: novelTitle,
            attributeText: rawAttributeText,
            dataText: dataText ? dataText.substring(0, 50) + '...' : dataText,
            localStorage_속성: localStorage.getItem(STORAGE_KEY_ATTRIBUTE_TEXT),
            localStorage_소설제목: localStorage.getItem(STORAGE_KEY_NOVEL_TITLE),
            일치여부_속성: rawAttributeText === localStorage.getItem(STORAGE_KEY_ATTRIBUTE_TEXT),
            일치여부_소설제목: novelTitle === localStorage.getItem(STORAGE_KEY_NOVEL_TITLE)
        });
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[자동 저장] 입력 필드에서 값을 읽었습니다.`);
            window.addRightLog('info', `[자동 저장] 소설 제목: "${novelTitle || '(없음)'}"`);
            window.addRightLog('info', `[자동 저장] 속성 텍스트: "${rawAttributeText ? rawAttributeText.substring(0, 60) + (rawAttributeText.length > 60 ? '...' : '') : '(없음)'}"`);
            window.addRightLog('info', `[자동 저장] 데이터 텍스트: "${dataText ? dataText.substring(0, 100) + (dataText.length > 100 ? '...' : '') : '(없음)'}" (${dataText ? dataText.length : 0}자)${overrideData !== null ? ' [외부 제공]' : ''}`);
        }
        console.log('[자동 저장] 호출:', { novelTitle, attributeText: rawAttributeText, dataText, dataTextLength: dataText ? dataText.length : 0 });
        
        // 소설 제목과 속성 텍스트는 필수, 데이터 텍스트는 선택 (빈 문자열 허용)
        if (!novelTitle || !rawAttributeText) {
            console.log('[자동 저장] 입력값 부족 - 저장하지 않음', { novelTitle: !!novelTitle, attributeText: !!rawAttributeText, dataText: !!dataText });
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[자동 저장] 저장 실패: 소설 제목과 속성 텍스트는 필수입니다. (소설제목: ${!!novelTitle ? '✓' : '✗'}, 속성: ${!!rawAttributeText ? '✓' : '✗'})`);
            }
            return;
        }
        
        // 데이터 텍스트가 없으면 빈 문자열로 설정
        let finalDataText = dataText || '';
        
        // 속성 입력 정규화 (첫 줄, 소설 제목 제거)
        const attributeParts = extractAttributeParts(rawAttributeText, novelTitle);
        if (!attributeParts.attributeOnly) {
            console.log('[자동 저장] 속성 텍스트가 비어있음 - 저장하지 않음');
            updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
            return;
        }

        const fullAttributeText = attributeParts.full;
        
        // 디버깅: 저장 전 속성 텍스트 확인
        console.log('[자동 저장] 저장할 속성 텍스트:', {
            novelTitle,
            attributeInputRaw: rawAttributeText,
            normalizedAttribute: attributeParts.attributeOnly,
            fullAttributeText
        });
        
        // "→"로 연결된 속성(예: "소설 제목 → 챕터 1: 제1장")은 1개 속성으로 봄
        
        // 이미 저장된 것과 동일하면 저장하지 않음
        if (fullAttributeText === lastSavedAttribute && finalDataText === lastSavedData) {
            return;
        }
        
        // 저장 중이면 대기
        if (isSaving) {
            return;
        }
        
        // BIT 계산 함수 확인
        if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
            updateSaveStatus('⚠️ BIT 계산 함수 로드 중...', 'warning');
            return;
        }
        
        // BIT 값 계산: 입력 필드 값(fullAttributeText) 그대로 사용
        // 사용자가 입력 필드에 입력한 값의 BIT를 그대로 사용해야 함
        const attributeBits = calculateBitValues(fullAttributeText);
        const attributeBitElement = $attributeBitInfo || document.getElementById('attributeBitInfo');
        const displayedBits = attributeBitElement ? parseBitText(attributeBitElement.innerText || attributeBitElement.textContent || '') : null;

        if (!attributeBits.max || !attributeBits.min) {
            updateSaveStatus('⚠️ BIT 값 계산 중...', 'warning');
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[BIT 계산] BIT 값 계산 실패 - 저장 중단`);
            }
            if ($dataBitInfo) {
                applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
            }
            return;
        }

        if (!displayedBits) {
            updateSaveStatus('⚠️ 화면에 표시된 속성 BIT를 확인할 수 없어 저장을 중단합니다.', 'warning');
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[우측 저장] 화면에 표시된 속성 BIT를 찾을 수 없어 저장을 중단합니다.`);
            }
            if ($dataBitInfo) {
                applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
            }
            return;
        }

        if (!bitsApproximatelyEqual(displayedBits, attributeBits)) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[우측 저장] 화면에 표시된 속성 BIT와 계산된 BIT가 다릅니다. 저장을 중단합니다.`);
                window.addRightLog('warn', `  표시된 BIT: MAX=${displayedBits.max}, MIN=${displayedBits.min}`);
                window.addRightLog('warn', `  계산된 BIT: MAX=${attributeBits.max}, MIN=${attributeBits.min}`);
            }
            updateSaveStatus('⚠️ 화면에 표시된 속성 BIT와 계산된 BIT가 다릅니다. BIT를 다시 계산한 후 저장하세요.', 'warning');
            if ($dataBitInfo) {
                applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
            }
            return;
        }

        const hasDataText = Boolean(finalDataText && finalDataText.trim().length > 0);
        let dataBits = { max: null, min: null };
        if (hasDataText) {
            dataBits = calculateBitValues(finalDataText);
        }
        
        if (typeof window.addRightLog === 'function') {
            const attributeDisplay = fullAttributeText.length > 50 ? fullAttributeText.substring(0, 50) + '...' : fullAttributeText;
            window.addRightLog('info', `[BIT 계산] 속성 BIT (텍스트 "${attributeDisplay}" 사용): MAX=${attributeBits.max ? attributeBits.max.toFixed(15) : 'null'}, MIN=${attributeBits.min ? attributeBits.min.toFixed(15) : 'null'}`);
            if (hasDataText) {
                const dataDisplay = finalDataText.length > 50 ? finalDataText.substring(0, 50) + '...' : finalDataText;
                if (dataBits.max !== null && dataBits.min !== null) {
                    window.addRightLog('info', `[BIT 계산] 데이터 BIT (데이터 텍스트 "${dataDisplay}" 기준): MAX=${dataBits.max.toFixed(15)}, MIN=${dataBits.min.toFixed(15)}`);
                } else {
                    window.addRightLog('warn', `[BIT 계산] 데이터 BIT을 계산하지 못했습니다 (데이터 텍스트 "${dataDisplay}")`);
                }
            } else {
                window.addRightLog('info', `[BIT 계산] 데이터 텍스트 없음 - BIT 계산 생략`);
            }
        }
        
        if (hasDataText && (dataBits.max === null || dataBits.min === null)) {
            updateSaveStatus('⚠️ 데이터 BIT 값 계산 중...', 'warning');
            return;
        }
        
        // 중복 체크
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[중복 체크] 중복 여부 확인 중...`);
        }
        const isDuplicate = await checkDuplicate(fullAttributeText, finalDataText, attributeBits, dataBits);
        if (isDuplicate) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[중복 체크] 중복 데이터 발견 - 저장 건너뜀`);
                window.addRightLog('info', `[중복 체크] 속성: "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
                window.addRightLog('info', `[중복 체크] 데이터: "${finalDataText ? finalDataText.substring(0, 80) + (finalDataText.length > 80 ? '...' : '') : '(빈 문자열)'}"`);
            }
            updateSaveStatus('ℹ️ 이미 저장된 데이터입니다 (중복 방지)', 'info');
            lastSavedAttribute = fullAttributeText;
            lastSavedData = finalDataText;
            // 조회 목록 새로고침 (저장된 속성 텍스트 기반으로 필터 업데이트)
            setTimeout(() => {
                if ($attributeFilterInput) {
                    // 저장된 속성 텍스트에서 챕터까지 포함한 부분 추출
                    const parts = fullAttributeText.split(' → ');
                    let filterText = '';
                    
                    if (parts.length >= 2) {
                        // "소설 제목 → 챕터 N: 제목"까지 포함
                        filterText = parts.slice(0, 2).join(' → ');
                    } else if (parts.length === 1) {
                        // 소설 제목만 있는 경우
                        filterText = parts[0];
                    } else {
                        // 소설 제목으로 기본 설정
                        filterText = novelTitle || '';
                    }
                    
                    // 필터 입력 필드 업데이트 (저장된 속성과 일치하도록)
                    if (filterText) {
                        $attributeFilterInput.value = filterText;
                        // 필터 저장
                        saveFilterValues();
                        loadAttributes();
                    } else if ($attributeFilterInput.value.trim()) {
                        // 필터가 이미 있으면 그대로 사용
                        loadAttributes();
                    }
                }
            }, 500);
            return;
        }
        
        // 챕터 정보 추출 (속성 구조에서 정확히 찾기)
        // fullAttributeText 형식: "소설 제목 → 챕터 N: 제목 → 속성명"
        // 두 번째 부분(인덱스 1)에서만 챕터 정보를 찾아야 정확함
        let chapter = null;
        const parts = fullAttributeText.split(' → ').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        
        // 두 번째 부분(소설 제목 다음)에서 챕터 정보 찾기
        if (parts.length >= 2) {
            const chapterPart = parts[1]; // "챕터 1: 제1장" 또는 "챕터 1"
            const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
            if (chapterMatch) {
                // 정규식 매칭 결과 확인: chapterMatch[0] = 전체 매칭, chapterMatch[1] = 챕터 번호, chapterMatch[2] = 제목
                const chapterNumber = chapterMatch[1]; // 문자열 "1"
                const chapterTitle = (chapterMatch[2] || '').trim();
                
                // 디버깅: 정규식 매칭 결과 확인
                console.log('[자동 저장] 정규식 매칭 결과:', {
                    전체매칭: chapterMatch[0],
                    챕터번호_매칭: chapterMatch[1],
                    제목_매칭: chapterMatch[2],
                    chapterPart: chapterPart
                });
                
                chapter = {
                    number: chapterNumber, // 문자열 그대로 사용 (서버에서 문자열로 저장)
                    title: chapterTitle || `제${chapterNumber}장`
                };
                console.log('[자동 저장] 챕터 정보 추출 (속성 구조에서):', { 
                    fullAttributeText,
                    chapterPart,
                    chapterNumber: chapter.number, 
                    chapterTitle: chapter.title,
                    타입_확인: typeof chapter.number
                });
            }
        }
        
        // 위에서 찾지 못했으면 fallback: 속성 텍스트 부분에서만 찾기 (데이터 텍스트는 제외)
        // 주의: fallback은 부정확할 수 있으므로 경고와 함께 사용
        if (!chapter) {
            // attributeOnly에서 챕터 정보를 다시 탐색 (데이터 텍스트와 혼동 방지)
            const fallbackSource = attributeParts.attributeOnly || fullAttributeText;
            const fallbackMatch = fallbackSource.match(/챕터\s*(\d+)(?:\s*[:：]\s*([^→]+?))(?:\s*→|$)/i);
            if (fallbackMatch) {
                // 정규식 매칭 결과 확인: fallbackMatch[0] = 전체 매칭, fallbackMatch[1] = 챕터 번호, fallbackMatch[2] = 제목
                const chapterNumber = fallbackMatch[1]; // 문자열 "1" (인덱스 1이 맞음)
                const chapterTitle = (fallbackMatch[2] || '').trim();
                
                // 디버깅: fallback 정규식 매칭 결과 확인
                console.warn('[자동 저장] fallback 정규식 매칭 결과:', {
                    전체매칭: fallbackMatch[0],
                    챕터번호_매칭: fallbackMatch[1],
                    제목_매칭: fallbackMatch[2],
                    attributeOnly: attributeParts.attributeOnly,
                    인덱스_확인: `fallbackMatch[1] = ${fallbackMatch[1]}, fallbackMatch.length = ${fallbackMatch.length}`
                });
                
                chapter = {
                    number: chapterNumber, // fallbackMatch[1] 사용 (첫 번째 캡처 그룹 = 챕터 번호)
                    title: chapterTitle || `제${chapterNumber}장`
                };
                console.warn('[자동 저장] 챕터 정보 추출 (fallback, 부정확할 수 있음):', { 
                    attributeOnly: attributeParts.attributeOnly,
                    fullAttributeText,
                    chapterNumber: chapter.number, 
                    chapterTitle: chapter.title,
                    타입_확인: typeof chapter.number
                });
            }
        }
        
        if (!chapter) {
            console.warn('[자동 저장] 챕터 정보를 찾을 수 없습니다:', { fullAttributeText, attributeInputRaw: rawAttributeText });
        }
        
        const chapterText = chapter ? `챕터 ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}` : '';
        const chapterBits = chapterText ? calculateBitValues(chapterText) : { max: null, min: null };
        
        if (typeof window.addRightLog === 'function') {
            if (chapter) {
                window.addRightLog('info', `[챕터 추출] 챕터 정보: ${chapterText}`);
                window.addRightLog('info', `[BIT 계산] 챕터 BIT: MAX=${chapterBits.max ? chapterBits.max.toFixed(15) : 'null'}, MIN=${chapterBits.min ? chapterBits.min.toFixed(15) : 'null'}`);
            } else {
                window.addRightLog('warn', `[챕터 추출] 챕터 정보를 찾을 수 없음`);
            }
        }
        
        isSaving = true;
        updateSaveStatus('💾 저장 중...', 'info');
        
        try {
            const url = getServerUrl('/api/attributes/data');
            console.log('[자동 저장] URL:', url);
            console.log('[자동 저장] 전송할 데이터:', { 
                attributeText: fullAttributeText.substring(0, 50), 
                dataText: finalDataText ? finalDataText.substring(0, 50) + '...' : '(빈 문자열)',
                dataTextLength: finalDataText ? finalDataText.length : 0,
                dataBitMax: dataBits.max,
                dataBitMin: dataBits.min
            });
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[서버 전송] 저장 요청 시작`);
                window.addRightLog('info', `[서버 전송] URL: ${url}`);
                window.addRightLog('info', `[서버 전송] 속성 (저장할 텍스트): "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
                window.addRightLog('info', `[서버 전송] 속성 BIT (입력 필드 값 "${fullAttributeText.substring(0, 40) + (fullAttributeText.length > 40 ? '...' : '')}" 사용): MAX=${attributeBits.max.toFixed(15)}, MIN=${attributeBits.min.toFixed(15)}`);
                window.addRightLog('info', `[서버 전송] 데이터: "${finalDataText ? finalDataText.substring(0, 100) + (finalDataText.length > 100 ? '...' : '') : '(빈 문자열)'}" (${finalDataText ? finalDataText.length : 0}자)`);
                if (hasDataText) {
                    const dataTextDisplay = finalDataText.length > 50 ? finalDataText.substring(0, 50) + '...' : finalDataText;
                    if (dataBits.max !== null && dataBits.min !== null) {
                        window.addRightLog('info', `[서버 전송] 데이터 BIT (데이터 텍스트 "${dataTextDisplay}" 기준): MAX=${dataBits.max.toFixed(15)}, MIN=${dataBits.min.toFixed(15)}`);
                    } else {
                        window.addRightLog('warn', `[서버 전송] 데이터 BIT 값이 유효하지 않습니다 (데이터 텍스트 "${dataTextDisplay}")`);
                    }
                } else {
                    window.addRightLog('info', `[서버 전송] 데이터 없음 - BIT 전송 생략`);
                }
                if (chapter) {
                    window.addRightLog('info', `[서버 전송] 챕터: ${chapterText} (BIT: MAX=${chapterBits.max ? chapterBits.max.toFixed(15) : 'null'}, MIN=${chapterBits.min ? chapterBits.min.toFixed(15) : 'null'})`);
                }
            }
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    attributeText: fullAttributeText, // 전체 속성 텍스트 (소설 제목 포함)
                    attributeBitMax: attributeBits.max,
                    attributeBitMin: attributeBits.min,
                    text: finalDataText || '', // 빈 문자열도 명시적으로 전달
                    dataBitMax: dataBits.max,
                    dataBitMin: dataBits.min,
                    novelTitle: novelTitle,
                    chapter: chapter,
                    chapterBitMax: chapterBits.max,
                    chapterBitMin: chapterBits.min
                }),
            });
            
            console.log('[자동 저장] 응답 상태:', response.status);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[서버 응답] HTTP 상태: ${response.status}`);
            }
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('[자동 저장] HTTP 오류:', response.status, errorText);
                
                // JSON 파싱 시도
                let errorMessage = errorText;
                try {
                    // 잘린 JSON 문자열도 처리 시도
                    const trimmedText = errorText.trim();
                    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
                        try {
                            const errorJson = JSON.parse(trimmedText);
                            errorMessage = errorJson.error || errorJson.message || JSON.stringify(errorJson);
                            console.error('[자동 저장] 파싱된 에러:', errorJson);
                        } catch (parseError) {
                            // JSON 파싱 실패 시 원본 텍스트에서 error 필드 추출 시도
                            const errorMatch = trimmedText.match(/"error"\s*:\s*"([^"]+)"/);
                            if (errorMatch) {
                                errorMessage = errorMatch[1];
                            } else {
                                errorMessage = trimmedText;
                            }
                            console.error('[자동 저장] JSON 파싱 실패, 원본 텍스트 사용:', parseError);
                        }
                    }
                } catch (e) {
                    // JSON이 아니면 원본 텍스트 사용
                    console.error('[자동 저장] 에러 텍스트 (JSON 아님):', errorText);
                }
                
                // 에러 메시지가 객체인 경우 문자열로 변환
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                
                // 최종적으로 문자열로 변환
                errorMessage = String(errorMessage || errorText || '알 수 없는 오류');
                const displayMessage = errorMessage.substring(0, 200);
                
                console.error('[자동 저장] 최종 에러 메시지:', displayMessage);
                updateSaveStatus(`✗ 저장 실패: ${displayMessage}`, 'danger');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[자동 저장 실패] ${displayMessage}`);
                }
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            console.log('[자동 저장] 결과:', result);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[서버 응답] JSON 파싱 완료: ok=${result.ok}`);
            }
            
            if (!result.ok) {
                let errorMessage = result.error || '알 수 없는 오류';
                console.error('[자동 저장] 서버 응답 오류:', result);
                
                // 에러 메시지가 객체인 경우 문자열로 변환
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                
                const displayMessage = String(errorMessage).substring(0, 200);
                updateSaveStatus(`✗ 저장 실패: ${displayMessage}`, 'danger');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[자동 저장 실패] ${displayMessage}`);
                }
                return;
            }
            
            // 디버깅: 서버 응답에서 저장된 속성 확인
            // 서버 응답 구조: { ok: true, record: { attribute: { text: ... }, chapter: {...} }, files: {...} }
            const savedRecord = result.record || {};
            const savedAttribute = savedRecord.attribute || {};
            const savedChapter = savedRecord.chapter || {};
            
            if (result.ok && savedAttribute.text) {
                const savedDataText = savedRecord.data?.text || savedRecord.s || '';
                console.log('[자동 저장] 서버에 저장된 데이터:', {
                    저장된_속성: savedAttribute.text,
                    저장한_속성: fullAttributeText,
                    저장된_데이터: savedDataText ? savedDataText.substring(0, 50) + '...' : '(빈 문자열)',
                    저장한_데이터: finalDataText ? finalDataText.substring(0, 50) + '...' : '(빈 문자열)',
                    저장된_데이터_길이: savedDataText ? savedDataText.length : 0,
                    저장한_데이터_길이: finalDataText ? finalDataText.length : 0,
                    저장된_챕터: savedChapter,
                    추출한_챕터: chapter,
                    일치여부_속성: savedAttribute.text === fullAttributeText,
                    일치여부_데이터: (savedDataText || '') === (finalDataText || ''),
                    일치여부_챕터: savedChapter.number === chapter?.number
                });
                
                // 저장된 데이터 확인 로그
                if (typeof window.addRightLog === 'function') {
                    const dataMatch = (savedDataText || '') === (finalDataText || '') ? '✓' : '⚠';
                    window.addRightLog('info', `[저장 확인] 데이터 일치: ${dataMatch} (저장: ${savedDataText ? savedDataText.length : 0}자, 전송: ${finalDataText ? finalDataText.length : 0}자)`);
                    if (dataMatch === '⚠') {
                        window.addRightLog('warn', `[저장 확인] 데이터 불일치 상세:`);
                        window.addRightLog('warn', `  저장된 데이터: "${savedDataText ? savedDataText.substring(0, 100) + (savedDataText.length > 100 ? '...' : '') : '(빈 문자열)'}"`);
                        window.addRightLog('warn', `  전송한 데이터: "${finalDataText ? finalDataText.substring(0, 100) + (finalDataText.length > 100 ? '...' : '') : '(빈 문자열)'}"`);
                    }
                }
            }
            
            if (result.ok) {
                if (typeof window.addRightLog === 'function') {
                    // 저장된 속성 텍스트를 정확히 표시 (서버 응답의 record.attribute.text 사용)
                    const savedAttributeText = savedAttribute.text || fullAttributeText;
                    const savedChapterInfo = savedChapter.number ? ` (챕터 ${savedChapter.number})` : '';
                    const hasData = hasDataText;
                    window.addRightLog('success', `[자동 저장] 저장 완료: ${hasData ? '속성과 데이터가' : '속성이'} 서버에 저장되었습니다. "${savedAttributeText.substring(0, 60) + (savedAttributeText.length > 60 ? '...' : '')}"${savedChapterInfo}`);
                    
                    // 속성 BIT 값 출력 (녹색) - 텍스트 포함
                    if (attributeBits && attributeBits.max !== null && attributeBits.min !== null) {
                        const attributeTextDisplay = fullAttributeText.length > 50 ? fullAttributeText.substring(0, 50) + '...' : fullAttributeText;
                        window.addRightLog('success', `[자동 저장] 속성 BIT (텍스트: "${attributeTextDisplay}"): MAX=${attributeBits.max.toFixed(15)}, MIN=${attributeBits.min.toFixed(15)}`);
                    }
                    
                    // 데이터 BIT 값 및 데이터 텍스트 출력 (녹색) - 텍스트 포함
                    if (hasData) {
                        if (dataBits && dataBits.max !== null && dataBits.min !== null) {
                            const dataDisplayForBit = finalDataText.length > 50 ? finalDataText.substring(0, 50) + '...' : finalDataText;
                            window.addRightLog('success', `[자동 저장] 데이터 BIT (데이터 텍스트 "${dataDisplayForBit}" 기준): MAX=${dataBits.max.toFixed(15)}, MIN=${dataBits.min.toFixed(15)}`);
                        } else {
                            window.addRightLog('warn', `[자동 저장] 데이터 BIT 값이 유효하지 않아 출력하지 않습니다.`);
                        }
                        const dataDisplay = finalDataText.length > 150 ? finalDataText.substring(0, 150) + '...' : finalDataText;
                        window.addRightLog('success', `[자동 저장] 저장된 데이터: "${dataDisplay}"`);
                    }
                    
                    // 저장된 파일 정보 표시
                    if (result.files) {
                        const files = result.files;
                        const fileCount = Object.values(files).filter(f => f !== null).length;
                        window.addRightLog('info', `[자동 저장] ${fileCount}개 파일에 저장됨`);
                        if (files.attributeMax) window.addRightLog('info', `  - 속성 MAX: ${files.attributeMax}`);
                        if (files.attributeMin) window.addRightLog('info', `  - 속성 MIN: ${files.attributeMin}`);
                        if (files.dataMax) window.addRightLog('info', `  - 데이터 MAX: ${files.dataMax}`);
                        if (files.dataMin) window.addRightLog('info', `  - 데이터 MIN: ${files.dataMin}`);
                        if (files.attributeAsDataMax) window.addRightLog('info', `  - 속성(데이터) MAX: ${files.attributeAsDataMax}`);
                        if (files.attributeAsDataMin) window.addRightLog('info', `  - 속성(데이터) MIN: ${files.attributeAsDataMin}`);
                    }
                }
                updateSaveStatus('✓ 저장 완료!', 'success');
                lastSavedAttribute = fullAttributeText;
                lastSavedData = finalDataText;
                
                // 챗봇 상단에 Novel AI 상태 업데이트
                if (typeof updateNovelAIStatus === 'function') {
                    updateNovelAIStatus({
                        novelTitle: novelTitle,
                        attributeText: fullAttributeText,
                        attributeBits: attributeBits,
                        dataText: finalDataText,
                        dataBits: dataBits,
                        filterText: ($attributeFilterInput && $attributeFilterInput.value || '').trim(),
                        additionalSearch: null, // 추가 검색은 여기서 관리하지 않음
                        saveTime: new Date()
                    });
                }
                
                // 데이터 입력란 초기화
                if ($dataInput) {
                    $dataInput.value = '';
                    $dataInput.style.height = 'auto';
                    // BIT 정보 초기화
                    if ($dataBitInfo) {
                        $dataBitInfo.textContent = 'BIT: 계산 중...';
                    }
                    // 로컬 스토리지에서도 제거
                    localStorage.removeItem(STORAGE_KEY_DATA_TEXT);
                    console.log('[자동 저장] 데이터 입력란 초기화 완료');
                }
                
                // 저장 완료 후 상태만 업데이트
                setTimeout(() => {
                    updateSaveStatus('', '');
                }, 2000);
                
                // 자동 호출: 좌측 목록 새로고침 (저장 완료 후)
                setTimeout(() => {
                    // 저장된 속성 텍스트를 기반으로 필터 업데이트
                    // 서버 응답에서 저장된 속성 텍스트 사용 (가장 정확함)
                    // 서버 응답 구조: result.record.attribute.text
                    const savedAttributeText = savedAttribute.text || fullAttributeText;
                    
                    // savedAttributeText 형식: "소설 제목 → 챕터 N: 제목 → 속성명"
                    // 필터에는 "소설 제목 → 챕터 N: 제목"까지 포함하도록 설정
                    if ($attributeFilterInput) {
                        // 저장된 속성 텍스트에서 챕터까지 포함한 부분 추출
                        const parts = savedAttributeText.split(' → ');
                        let filterText = '';
                        
                        if (parts.length >= 2) {
                            // "소설 제목 → 챕터 N: 제목"까지 포함
                            filterText = parts.slice(0, 2).join(' → ');
                        } else if (parts.length === 1) {
                            // 소설 제목만 있는 경우
                            filterText = parts[0];
                        } else {
                            // 소설 제목으로 기본 설정
                            filterText = novelTitle || '';
                        }
                        
                        // 디버깅: 필터 설정 확인
                        console.log('[자동 저장] 좌측 필터 설정:', {
                            저장된_속성: savedAttributeText,
                            설정할_필터: filterText
                        });
                        
                        // 필터 입력 필드 업데이트 (저장된 속성과 일치하도록)
                        if (filterText) {
                            $attributeFilterInput.value = filterText;
                            // 필터 저장
                            saveFilterValues();
                            loadAttributes();
                        } else if ($attributeFilterInput.value.trim()) {
                            // 필터가 이미 있으면 그대로 사용
                            loadAttributes();
                        } else {
                            // 소설 목록 표시
                            loadNovelList();
                        }
                    } else {
                        // 속성 필터 입력 필드가 없으면 소설 목록 표시
                        loadNovelList();
                    }
                }, 500);
            } else {
                let errorMessage = result.error || 'Unknown error';
                // 에러 메시지가 객체인 경우 문자열로 변환
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                const displayMessage = String(errorMessage).substring(0, 200);
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[우측 저장] 저장 실패: ${displayMessage}`);
                }
                updateSaveStatus(`✗ 저장 실패: ${displayMessage}`, 'danger');
            }
        } catch (error) {
            console.error('[자동 저장] 오류:', error);
            
            let errorMessage = error.message || 'Unknown error';
            if (error.message === 'Failed to fetch') {
                errorMessage = '서버 연결 실패';
            }
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('error', `[우측 저장] 저장 오류: ${errorMessage}`);
            }
            updateSaveStatus(`✗ 저장 오류: ${errorMessage}`, 'danger');
        } finally {
            isSaving = false;
        }
    }
    
    /**
     * 속성과 데이터를 함께 저장하는 함수 (우측 입력값을 통해서만 호출)
     */
    async function saveAttributeAndData() {
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const rawAttributeText = ($attributeInput && $attributeInput.value || '').trim();
        const dataText = ($dataInput && $dataInput.value || '').trim();
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[우측 입력 저장] 저장 시작`);
            window.addRightLog('info', `[우측 입력 저장] 소설 제목: "${novelTitle || '(없음)'}"`);
            window.addRightLog('info', `[우측 입력 저장] 속성: "${rawAttributeText ? rawAttributeText.substring(0, 60) + (rawAttributeText.length > 60 ? '...' : '') : '(없음)'}"`);
            window.addRightLog('info', `[우측 입력 저장] 데이터: "${dataText ? dataText.substring(0, 100) + (dataText.length > 100 ? '...' : '') : '(없음)'}" (${dataText ? dataText.length : 0}자)`);
        }
        
        // 소설 제목과 속성 텍스트는 필수, 데이터 텍스트는 선택 (빈 문자열 허용)
        if (!novelTitle || !rawAttributeText) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[우측 입력 저장] 입력값 부족 - 저장하지 않음 (소설제목: ${!!novelTitle}, 속성: ${!!rawAttributeText})`);
            }
            return;
        }
        
        // autoSave 함수 호출 (데이터를 직접 전달, 빈 문자열도 허용)
        await autoSave(dataText || '');
    }
    
    /**
     * 자동 저장 트리거 함수 (debounce)
     * @param {string|null} overrideData - 외부에서 제공된 데이터 텍스트 (선택)
     */
    function triggerAutoSave(overrideData = null) {
        console.log('[자동 저장 트리거] 호출됨', overrideData !== null ? '(데이터 제공됨)' : '');
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            console.log('[자동 저장 트리거] 실제 저장 실행');
            autoSave(overrideData);
        }, 1000); // 1초 대기 후 저장
    }
    
    /**
     * 자동 저장 모듈 초기화
     * @param {Object} options - 초기화 옵션
     */
    function initAutoSave(options = {}) {
        // DOM 요소 참조
        $novelTitleInput = options.novelTitleInput || document.getElementById('novelTitleInput');
        $attributeInput = options.attributeInput || document.getElementById('attributeInput');
        $dataInput = options.dataInput || document.getElementById('dataInput');
        $attributeBitInfo = options.attributeBitInfo || document.getElementById('attributeBitInfo');
        $dataBitInfo = options.dataBitInfo || document.getElementById('dataBitInfo');
        $saveStatus = options.saveStatus || document.getElementById('saveStatus');
        $attributeFilterInput = options.attributeFilterInput || document.getElementById('attributeFilterInput');
        
        // 의존성 함수 주입
        calculateBitValues = options.calculateBitValues || window.calculateBitValues;
        checkDuplicate = options.checkDuplicate || window.checkDuplicate;
        getServerUrl = options.getServerUrl || window.getServerUrl;
        updateSaveStatus = options.updateSaveStatus || window.updateSaveStatus;
        updateNovelAIStatus = options.updateNovelAIStatus || window.updateNovelAIStatus;
        saveFilterValues = options.saveFilterValues || window.saveFilterValues;
        loadAttributes = options.loadAttributes || window.loadAttributes;
        loadNovelList = options.loadNovelList || window.loadNovelList;
        
        // 속성 입력 시 BIT 값 표시 및 자동 저장 트리거
        if ($attributeInput) {
            let attributeTimer = null;
            $attributeInput.addEventListener('input', () => {
                // 로컬 스토리지에 저장
                const value = $attributeInput.value || '';
                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, value);
                
                clearTimeout(attributeTimer);
                attributeTimer = setTimeout(() => {
                    const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                    const rawAttributeText = $attributeInput.value.trim();
                    
                    // BIT 계산: 입력 필드 값(attributeText) 그대로 사용
                    if (rawAttributeText && calculateBitValues) {
                        const attributeParts = extractAttributeParts(rawAttributeText, novelTitle);
                        const fullAttributeText = attributeParts.full;

                        if (fullAttributeText) {
                            const bits = calculateBitValues(fullAttributeText);
                            if (bits && bits.max != null && bits.min != null) {
                                const bitText = `BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}`;
                                if ($attributeBitInfo) applyBitText($attributeBitInfo, bitText);
                                if ($dataBitInfo) applyBitText($dataBitInfo, bitText);
                            } else {
                                if ($attributeBitInfo) applyBitText($attributeBitInfo, ATTRIBUTE_BIT_LOADING_TEXT);
                                if ($dataBitInfo) applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
                            }
                        } else {
                            if ($attributeBitInfo) applyBitText($attributeBitInfo, ATTRIBUTE_BIT_LOADING_TEXT);
                            if ($dataBitInfo) applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
                        }
                    } else {
                        if ($attributeBitInfo) applyBitText($attributeBitInfo, ATTRIBUTE_BIT_LOADING_TEXT);
                        if ($dataBitInfo) applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
                    }
                    
                    // 속성 텍스트 입력 시 1회 자동 저장 (속성만 있어도 저장)
                    // 속성과 데이터가 모두 있으면 저장, 속성만 있어도 저장
                    const dataText = ($dataInput && $dataInput.value || '').trim();
                    if (novelTitle && rawAttributeText) {
                        // 속성 텍스트만 있어도 저장 (데이터는 빈 문자열로)
                        saveAttributeAndData();
                    }
                }, 1000); // 1초 대기 후 저장
            });
        }
        
        // 데이터 입력 시 BIT 값 표시 및 자동 저장 트리거
        if ($dataInput) {
            let dataTimer = null;
            $dataInput.addEventListener('input', () => {
                // 로컬 스토리지에 저장
                const value = $dataInput.value || '';
                localStorage.setItem(STORAGE_KEY_DATA_TEXT, value);
                
                clearTimeout(dataTimer);
                dataTimer = setTimeout(() => {
                    const text = $dataInput.value.trim();
                    const rawAttributeText = ($attributeInput && $attributeInput.value || '').trim();
                    const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                    const attributeParts = extractAttributeParts(rawAttributeText, novelTitle);
                    const fullAttributeText = attributeParts.full;
                    
                    if ($dataBitInfo) {
                        if (calculateBitValues && fullAttributeText) {
                            const bits = calculateBitValues(fullAttributeText);
                            if (bits && bits.max != null && bits.min != null) {
                                const bitText = `BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}`;
                                applyBitText($dataBitInfo, bitText);
                            } else {
                                applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
                            }
                        } else {
                            applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
                        }
                    }
                    
                    // 데이터가 입력되면 속성과 데이터를 함께 저장하는 함수 호출
                    if (text) {
                        saveAttributeAndData();
                    } else if ($dataBitInfo) {
                        applyBitText($dataBitInfo, DATA_BIT_INFO_MESSAGE);
                    }
                }, 1000); // 1초 대기 후 저장
            });
        }
        
        console.info('[자동 저장 모듈] 초기화 완료');
    }
    
    // 전역으로 노출
    window.autoSave = autoSave;
    window.triggerAutoSave = triggerAutoSave;
    window.saveAttributeAndData = saveAttributeAndData;
    window.initAutoSave = initAutoSave;
    
    // 내부 상태 접근 함수
    window.getAutoSaveState = function() {
        return {
            isSaving: isSaving,
            lastSavedAttribute: lastSavedAttribute,
            lastSavedData: lastSavedData
        };
    };
    
    window.resetAutoSaveState = function() {
        lastSavedAttribute = '';
        lastSavedData = '';
        isSaving = false;
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    };
    
})();

