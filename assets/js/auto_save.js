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
    
    /**
     * 자동 저장 함수
     * @param {string|null} overrideData - 외부에서 제공된 데이터 텍스트 (선택)
     */
    async function autoSave(overrideData = null) {
        // 중요: 저장 시에는 항상 현재 입력 필드의 실제 값을 사용해야 함
        // 로컬 스토리지에서 값을 읽어오지 않고, DOM 요소의 .value를 직접 사용
        // overrideData가 제공되면 그것을 사용 (자동 조회/저장에서 데이터를 읽은 경우)
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const attributeText = ($attributeInput && $attributeInput.value || '').trim();
        const dataText = overrideData !== null ? (overrideData || '').trim() : (($dataInput && $dataInput.value || '').trim());
        
        // 자동 저장 시작 로그
        console.log('💡 [자동 저장] 속성과 데이터를 입력하면 자동으로 저장됩니다. (입력 후 1초 대기)');
        console.log('[자동 저장] 자동 저장 함수 호출됨');
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', '💡 속성과 데이터를 입력하면 자동으로 저장됩니다. (입력 후 1초 대기)');
        }
        
        // 디버깅: 저장 시점의 실제 입력 필드 값 확인 (로컬 스토리지와 비교)
        console.log('[자동 저장] 저장 시점 입력 필드 값:', {
            novelTitle: novelTitle,
            attributeText: attributeText,
            dataText: dataText ? dataText.substring(0, 50) + '...' : dataText,
            localStorage_속성: localStorage.getItem(STORAGE_KEY_ATTRIBUTE_TEXT),
            localStorage_소설제목: localStorage.getItem(STORAGE_KEY_NOVEL_TITLE),
            일치여부_속성: attributeText === localStorage.getItem(STORAGE_KEY_ATTRIBUTE_TEXT),
            일치여부_소설제목: novelTitle === localStorage.getItem(STORAGE_KEY_NOVEL_TITLE)
        });
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[자동 저장] 입력 필드 읽기 완료`);
            window.addRightLog('info', `[입력] 소설 제목: "${novelTitle || '(없음)'}"`);
            window.addRightLog('info', `[입력] 속성 텍스트: "${attributeText ? attributeText.substring(0, 60) + (attributeText.length > 60 ? '...' : '') : '(없음)'}"`);
            window.addRightLog('info', `[입력] 데이터 텍스트: "${dataText ? dataText.substring(0, 100) + (dataText.length > 100 ? '...' : '') : '(없음)'}" (${dataText ? dataText.length : 0}자)${overrideData !== null ? ' [외부 제공]' : ' [속성 텍스트 값 사용]'}`);
        }
        console.log('[자동 저장] 호출:', { novelTitle, attributeText, dataText, dataTextLength: dataText ? dataText.length : 0 });
        
        // 소설 제목과 속성 텍스트는 필수, 데이터 텍스트는 선택 (빈 문자열 허용)
        if (!novelTitle || !attributeText) {
            console.log('[자동 저장] 입력값 부족 - 저장하지 않음', { novelTitle: !!novelTitle, attributeText: !!attributeText, dataText: !!dataText });
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[자동 저장] 입력값 부족 - 저장하지 않음 (소설제목: ${!!novelTitle}, 속성: ${!!attributeText})`);
            }
            return;
        }
        
        // 속성은 1개만 사용 (여러 줄로 나뉘어 있으면 첫 번째만 사용)
        // 속성 텍스트가 여러 줄로 나뉘어 있는지 확인 (줄바꿈으로 구분)
        // 중요: 속성 텍스트 입력 필드의 값을 직접 사용
        const attributeLines = attributeText.split('\n').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        let finalAttributeText = attributeText; // 속성 텍스트 입력 필드의 값 그대로 사용
        if (attributeLines.length > 1) {
            // 여러 줄이 있으면 첫 번째 줄만 사용
            finalAttributeText = attributeLines[0].trim();
            if ($attributeInput && finalAttributeText !== attributeText) {
                $attributeInput.value = finalAttributeText;
                updateSaveStatus('⚠️ 속성은 1개만 사용됩니다. 첫 번째 속성만 저장됩니다.', 'warning');
                // 수정된 값으로 재시도
                setTimeout(() => triggerAutoSave(), 500);
                return;
            }
        }
        
        // 속성 텍스트 입력 필드에 소설 제목이 포함되어 있는지 확인
        // "소설 제목 → ..." 형태로 시작하면 소설 제목 부분 제거
        let attributeTextOnly = finalAttributeText;
        if (novelTitle && finalAttributeText.startsWith(`${novelTitle} → `)) {
            attributeTextOnly = finalAttributeText.substring(`${novelTitle} → `.length);
        }
        
        // 실제 저장할 속성 텍스트: 소설 제목 + 속성 텍스트 (소설 제목 제외)
        // 속성 텍스트 입력 필드의 값을 정확히 사용 (변경 없이)
        const fullAttributeText = `${novelTitle} → ${attributeTextOnly}`;
        
        // 데이터 텍스트는 속성 텍스트 값을 그대로 사용 (자동 저장 시)
        // overrideData가 제공된 경우에만 그것을 사용 (외부에서 데이터를 읽은 경우)
        // 속성 텍스트 입력 필드의 값을 그대로 사용 (소설 제목 포함 여부와 관계없이)
        let finalDataText = overrideData !== null ? (overrideData || '').trim() : finalAttributeText;
        
        // 디버깅: 저장 전 속성 텍스트 확인
        console.log('[자동 저장] 저장할 속성 텍스트:', {
            novelTitle,
            attributeText,
            finalAttributeText,
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
        
        // BIT 값 계산 (전체 속성 텍스트로 계산)
        const attributeBits = calculateBitValues(fullAttributeText);
        // 중요: 데이터 텍스트 BIT 값은 속성 텍스트 BIT 값을 사용
        const dataBits = {
            max: attributeBits.max,
            min: attributeBits.min
        };
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[BIT 계산] 속성 BIT: MAX=${attributeBits.max ? attributeBits.max.toFixed(15) : 'null'}, MIN=${attributeBits.min ? attributeBits.min.toFixed(15) : 'null'}`);
            window.addRightLog('info', `[BIT 계산] 데이터 BIT (속성 BIT 사용): MAX=${dataBits.max ? dataBits.max.toFixed(15) : 'null'}, MIN=${dataBits.min ? dataBits.min.toFixed(15) : 'null'}`);
        }
        
        if (!attributeBits.max || !attributeBits.min) {
            updateSaveStatus('⚠️ BIT 값 계산 중...', 'warning');
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[BIT 계산] BIT 값 계산 실패 - 저장 중단`);
            }
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
            // finalAttributeText에서만 찾기 (fullAttributeText가 아닌, 소설 제목 제외한 부분)
            // 이렇게 하면 데이터 텍스트에 포함된 챕터 정보를 잘못 추출하지 않음
            const fallbackMatch = finalAttributeText.match(/챕터\s*(\d+)(?:\s*[:：]\s*([^→]+?))(?:\s*→|$)/i);
            if (fallbackMatch) {
                // 정규식 매칭 결과 확인: fallbackMatch[0] = 전체 매칭, fallbackMatch[1] = 챕터 번호, fallbackMatch[2] = 제목
                const chapterNumber = fallbackMatch[1]; // 문자열 "1" (인덱스 1이 맞음)
                const chapterTitle = (fallbackMatch[2] || '').trim();
                
                // 디버깅: fallback 정규식 매칭 결과 확인
                console.warn('[자동 저장] fallback 정규식 매칭 결과:', {
                    전체매칭: fallbackMatch[0],
                    챕터번호_매칭: fallbackMatch[1],
                    제목_매칭: fallbackMatch[2],
                    finalAttributeText: finalAttributeText,
                    인덱스_확인: `fallbackMatch[1] = ${fallbackMatch[1]}, fallbackMatch.length = ${fallbackMatch.length}`
                });
                
                chapter = {
                    number: chapterNumber, // fallbackMatch[1] 사용 (첫 번째 캡처 그룹 = 챕터 번호)
                    title: chapterTitle || `제${chapterNumber}장`
                };
                console.warn('[자동 저장] 챕터 정보 추출 (fallback, 부정확할 수 있음):', { 
                    finalAttributeText,
                    fullAttributeText,
                    chapterNumber: chapter.number, 
                    chapterTitle: chapter.title,
                    타입_확인: typeof chapter.number
                });
            }
        }
        
        if (!chapter) {
            console.warn('[자동 저장] 챕터 정보를 찾을 수 없습니다:', { fullAttributeText, finalAttributeText });
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
                window.addRightLog('info', `[서버 전송] 속성: "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
                window.addRightLog('info', `[서버 전송] 데이터: "${finalDataText ? finalDataText.substring(0, 100) + (finalDataText.length > 100 ? '...' : '') : '(빈 문자열)'}" (${finalDataText ? finalDataText.length : 0}자)`);
                window.addRightLog('info', `[서버 전송] 속성 BIT: MAX=${attributeBits.max.toFixed(15)}, MIN=${attributeBits.min.toFixed(15)}`);
                window.addRightLog('info', `[서버 전송] 데이터 BIT: MAX=${dataBits.max.toFixed(15)}, MIN=${dataBits.min.toFixed(15)}`);
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
                    window.addRightLog('success', `[저장 완료] 속성: "${savedAttributeText.substring(0, 60) + (savedAttributeText.length > 60 ? '...' : '')}"${savedChapterInfo}`);
                    
                    // 저장된 파일 정보 표시
                    if (result.files) {
                        const files = result.files;
                        const fileCount = Object.values(files).filter(f => f !== null).length;
                        window.addRightLog('info', `[저장 완료] ${fileCount}개 파일에 저장됨`);
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
                        attributeText: finalAttributeText,
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
                        $dataBitInfo.textContent = '(속성 BIT 값을 사용합니다)';
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
        const attributeText = ($attributeInput && $attributeInput.value || '').trim();
        const dataText = ($dataInput && $dataInput.value || '').trim();
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[우측 입력 저장] 저장 시작`);
            window.addRightLog('info', `[우측 입력 저장] 소설 제목: "${novelTitle || '(없음)'}"`);
            window.addRightLog('info', `[우측 입력 저장] 속성: "${attributeText ? attributeText.substring(0, 60) + (attributeText.length > 60 ? '...' : '') : '(없음)'}"`);
            window.addRightLog('info', `[우측 입력 저장] 데이터: "${dataText ? dataText.substring(0, 100) + (dataText.length > 100 ? '...' : '') : '(없음)'}" (${dataText ? dataText.length : 0}자)`);
        }
        
        // 소설 제목과 속성 텍스트는 필수, 데이터 텍스트는 선택 (빈 문자열 허용)
        if (!novelTitle || !attributeText) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[우측 입력 저장] 입력값 부족 - 저장하지 않음 (소설제목: ${!!novelTitle}, 속성: ${!!attributeText})`);
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
     * 자동 저장 모듈 초기화 (두 모듈을 조합)
     * 속성 텍스트 자동 저장과 데이터 텍스트 자동 저장을 모두 초기화
     * @param {Object} options - 초기화 옵션
     */
    function initAutoSave(options = {}) {
        // 속성 텍스트 자동 저장 모듈 초기화
        if (typeof window.initAttributeAutoSave === 'function') {
            window.initAttributeAutoSave({
                novelTitleInput: options.novelTitleInput || document.getElementById('novelTitleInput'),
                attributeInput: options.attributeInput || document.getElementById('attributeInput'),
                attributeBitInfo: options.attributeBitInfo || document.getElementById('attributeBitInfo'),
                saveStatus: options.saveStatus || document.getElementById('saveStatus'),
                attributeFilterInput: options.attributeFilterInput || document.getElementById('attributeFilterInput'),
                calculateBitValues: options.calculateBitValues || window.calculateBitValues,
                checkDuplicate: options.checkDuplicate || window.checkDuplicate,
                getServerUrl: options.getServerUrl || window.getServerUrl,
                updateSaveStatus: options.updateSaveStatus || window.updateSaveStatus,
                updateNovelAIStatus: options.updateNovelAIStatus || window.updateNovelAIStatus,
                saveFilterValues: options.saveFilterValues || window.saveFilterValues,
                loadAttributes: options.loadAttributes || window.loadAttributes,
                loadNovelList: options.loadNovelList || window.loadNovelList
            });
        }
        
        // 데이터 텍스트 자동 저장 모듈 초기화
        if (typeof window.initDataAutoSave === 'function') {
            window.initDataAutoSave({
                novelTitleInput: options.novelTitleInput || document.getElementById('novelTitleInput'),
                attributeInput: options.attributeInput || document.getElementById('attributeInput'),
                dataInput: options.dataInput || document.getElementById('dataInput'),
                dataBitInfo: options.dataBitInfo || document.getElementById('dataBitInfo'),
                saveStatus: options.saveStatus || document.getElementById('saveStatus'),
                attributeFilterInput: options.attributeFilterInput || document.getElementById('attributeFilterInput'),
                calculateBitValues: options.calculateBitValues || window.calculateBitValues,
                checkDuplicate: options.checkDuplicate || window.checkDuplicate,
                getServerUrl: options.getServerUrl || window.getServerUrl,
                updateSaveStatus: options.updateSaveStatus || window.updateSaveStatus,
                updateNovelAIStatus: options.updateNovelAIStatus || window.updateNovelAIStatus,
                saveFilterValues: options.saveFilterValues || window.saveFilterValues,
                loadAttributes: options.loadAttributes || window.loadAttributes,
                loadNovelList: options.loadNovelList || window.loadNovelList
            });
        }
        
        console.info('[자동 저장 모듈] 초기화 완료 (속성/데이터 분리 모듈 사용)');
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

