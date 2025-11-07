/**
 * 데이터 텍스트 자동 저장 모듈
 * 데이터 텍스트 입력 시 자동 저장 기능
 */

(function() {
    'use strict';
    
    // 자동 저장 관련 변수
    let dataAutoSaveTimer = null;
    let lastSavedData = '';
    let isSaving = false;
    
    // DOM 요소 참조 (나중에 초기화)
    let $novelTitleInput = null;
    let $attributeInput = null;
    let $dataInput = null;
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
    const STORAGE_KEY_DATA_TEXT = 'novel_ai_input_data_text';
    const STORAGE_KEY_NOVEL_TITLE = 'novel_ai_input_novel_title';
    const STORAGE_KEY_ATTRIBUTE_TEXT = 'novel_ai_input_attribute_text';
    
    /**
     * 데이터 텍스트 자동 저장 함수
     * 속성 텍스트 값을 데이터 텍스트로 사용하여 저장
     */
    async function saveData() {
        // 중요: 저장 시에는 항상 현재 입력 필드의 실제 값을 사용해야 함
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const attributeText = ($attributeInput && $attributeInput.value || '').trim();
        
        // 속성은 1개만 사용 (여러 줄로 나뉘어 있으면 첫 번째만 사용)
        // saveAttribute()와 동일한 로직으로 처리하여 fullAttributeText가 일치하도록 함
        const attributeLines = attributeText.split('\n').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        let finalAttributeText = attributeText;
        if (attributeLines.length > 1) {
            finalAttributeText = attributeLines[0].trim();
        }
        
        // 속성 텍스트 입력 필드에 소설 제목이 포함되어 있는지 확인
        let attributeTextOnly = finalAttributeText;
        if (novelTitle && finalAttributeText.startsWith(`${novelTitle} → `)) {
            attributeTextOnly = finalAttributeText.substring(`${novelTitle} → `.length);
        }
        
        // 실제 저장할 속성 텍스트: 소설 제목 + 속성 텍스트 (소설 제목 제외)
        // saveAttribute()와 동일한 방식으로 구성하여 BIT 값이 일치하도록 함
        const fullAttributeText = `${novelTitle} → ${attributeTextOnly}`;
        
        // 데이터 텍스트는 속성 텍스트 값을 그대로 사용 (여러 줄 처리된 값)
        let dataText = finalAttributeText;
        
        // 자동 저장 시작 로그
        console.log('[데이터 자동 저장] 데이터 텍스트 자동 저장 함수 호출됨');
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', '[데이터 자동 저장] 데이터 텍스트 자동 저장 시작');
            window.addRightLog('info', `[데이터 입력] 소설 제목: "${novelTitle || '(없음)'}"`);
            window.addRightLog('info', `[데이터 입력] 속성 텍스트: "${attributeText ? attributeText.substring(0, 60) + (attributeText.length > 60 ? '...' : '') : '(없음)'}"`);
            window.addRightLog('info', `[데이터 입력] 데이터 텍스트 (속성 텍스트 값 사용): "${dataText ? dataText.substring(0, 100) + (dataText.length > 100 ? '...' : '') : '(없음)'}" (${dataText ? dataText.length : 0}자)`);
        }
        console.log('[데이터 자동 저장] 호출:', { novelTitle, attributeText, dataText, dataTextLength: dataText ? dataText.length : 0 });
        
        // 소설 제목과 속성 텍스트는 필수
        if (!novelTitle || !attributeText) {
            console.log('[데이터 자동 저장] 입력값 부족 - 저장하지 않음', { novelTitle: !!novelTitle, attributeText: !!attributeText });
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[데이터 자동 저장] 입력값 부족 - 저장하지 않음 (소설제목: ${!!novelTitle}, 속성: ${!!attributeText})`);
            }
            return;
        }
        
        // 이미 저장된 것과 동일하면 저장하지 않음
        if (fullAttributeText === lastSavedData) {
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
        // 데이터 텍스트 BIT 값은 속성 텍스트 BIT 값을 사용
        const dataBits = {
            max: attributeBits.max,
            min: attributeBits.min
        };
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[데이터 BIT 계산] 속성 BIT: MAX=${attributeBits.max ? attributeBits.max.toFixed(15) : 'null'}, MIN=${attributeBits.min ? attributeBits.min.toFixed(15) : 'null'}`);
            window.addRightLog('info', `[데이터 BIT 계산] 데이터 BIT (속성 BIT 사용): MAX=${dataBits.max ? dataBits.max.toFixed(15) : 'null'}, MIN=${dataBits.min ? dataBits.min.toFixed(15) : 'null'}`);
        }
        
        if (!attributeBits.max || !attributeBits.min) {
            updateSaveStatus('⚠️ BIT 값 계산 중...', 'warning');
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[데이터 BIT 계산] BIT 값 계산 실패 - 저장 중단`);
            }
            return;
        }
        
        // 중복 체크
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[데이터 중복 체크] 중복 여부 확인 중...`);
        }
        const isDuplicate = await checkDuplicate(fullAttributeText, dataText, attributeBits, dataBits);
        if (isDuplicate) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[데이터 중복 체크] 중복 데이터 발견 - 저장 건너뜀`);
                window.addRightLog('info', `[데이터 중복 체크] 속성: "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
                window.addRightLog('info', `[데이터 중복 체크] 데이터: "${dataText ? dataText.substring(0, 80) + (dataText.length > 80 ? '...' : '') : '(빈 문자열)'}"`);
            }
            updateSaveStatus('ℹ️ 이미 저장된 데이터입니다 (중복 방지)', 'info');
            lastSavedData = fullAttributeText;
            return;
        }
        
        // 챕터 정보 추출
        let chapter = null;
        const parts = fullAttributeText.split(' → ').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        
        if (parts.length >= 2) {
            const chapterPart = parts[1];
            const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
            if (chapterMatch) {
                const chapterNumber = chapterMatch[1];
                const chapterTitle = (chapterMatch[2] || '').trim();
                chapter = {
                    number: chapterNumber,
                    title: chapterTitle || `제${chapterNumber}장`
                };
            }
        }
        
        if (!chapter) {
            const fallbackMatch = attributeTextOnly.match(/챕터\s*(\d+)(?:\s*[:：]\s*([^→]+?))(?:\s*→|$)/i);
            if (fallbackMatch) {
                const chapterNumber = fallbackMatch[1];
                const chapterTitle = (fallbackMatch[2] || '').trim();
                chapter = {
                    number: chapterNumber,
                    title: chapterTitle || `제${chapterNumber}장`
                };
            }
        }
        
        const chapterText = chapter ? `챕터 ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}` : '';
        const chapterBits = chapterText ? calculateBitValues(chapterText) : { max: null, min: null };
        
        if (typeof window.addRightLog === 'function') {
            if (chapter) {
                window.addRightLog('info', `[데이터 챕터 추출] 챕터 정보: ${chapterText}`);
            }
        }
        
        isSaving = true;
        updateSaveStatus('💾 데이터 저장 중...', 'info');
        
        try {
            const url = getServerUrl('/api/attributes/data');
            console.log('[데이터 자동 저장] URL:', url);
            console.log('[데이터 자동 저장] 전송할 데이터:', { 
                attributeText: fullAttributeText.substring(0, 50), 
                dataText: dataText ? dataText.substring(0, 50) + '...' : '(빈 문자열)',
                dataTextLength: dataText ? dataText.length : 0
            });
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[데이터 서버 전송] 저장 요청 시작`);
                window.addRightLog('info', `[데이터 서버 전송] 속성: "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
                window.addRightLog('info', `[데이터 서버 전송] 데이터: "${dataText ? dataText.substring(0, 100) + (dataText.length > 100 ? '...' : '') : '(빈 문자열)'}" (${dataText ? dataText.length : 0}자)`);
                window.addRightLog('info', `[데이터 서버 전송] 속성 BIT: MAX=${attributeBits.max.toFixed(15)}, MIN=${attributeBits.min.toFixed(15)}`);
                window.addRightLog('info', `[데이터 서버 전송] 데이터 BIT: MAX=${dataBits.max.toFixed(15)}, MIN=${dataBits.min.toFixed(15)}`);
            }
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    attributeText: fullAttributeText,
                    attributeBitMax: attributeBits.max,
                    attributeBitMin: attributeBits.min,
                    text: dataText || '',
                    dataBitMax: dataBits.max,
                    dataBitMin: dataBits.min,
                    novelTitle: novelTitle,
                    chapter: chapter,
                    chapterBitMax: chapterBits.max,
                    chapterBitMin: chapterBits.min
                }),
            });
            
            console.log('[데이터 자동 저장] 응답 상태:', response.status);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[데이터 서버 응답] HTTP 상태: ${response.status}`);
            }
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('[데이터 자동 저장] HTTP 오류:', response.status, errorText);
                
                let errorMessage = errorText;
                try {
                    const trimmedText = errorText.trim();
                    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
                        try {
                            const errorJson = JSON.parse(trimmedText);
                            errorMessage = errorJson.error || errorJson.message || JSON.stringify(errorJson);
                        } catch (parseError) {
                            const errorMatch = trimmedText.match(/"error"\s*:\s*"([^"]+)"/);
                            if (errorMatch) {
                                errorMessage = errorMatch[1];
                            } else {
                                errorMessage = trimmedText;
                            }
                        }
                    }
                } catch (e) {
                    console.error('[데이터 자동 저장] 에러 텍스트 (JSON 아님):', errorText);
                }
                
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                
                errorMessage = String(errorMessage || errorText || '알 수 없는 오류');
                const displayMessage = errorMessage.substring(0, 200);
                
                console.error('[데이터 자동 저장] 최종 에러 메시지:', displayMessage);
                updateSaveStatus(`✗ 데이터 저장 실패: ${displayMessage}`, 'danger');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[데이터 자동 저장 실패] ${displayMessage}`);
                }
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            console.log('[데이터 자동 저장] 결과:', result);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[데이터 서버 응답] JSON 파싱 완료: ok=${result.ok}`);
            }
            
            if (!result.ok) {
                let errorMessage = result.error || '알 수 없는 오류';
                console.error('[데이터 자동 저장] 서버 응답 오류:', result);
                
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                
                const displayMessage = String(errorMessage).substring(0, 200);
                updateSaveStatus(`✗ 데이터 저장 실패: ${displayMessage}`, 'danger');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[데이터 자동 저장 실패] ${displayMessage}`);
                }
                return;
            }
            
            if (result.ok) {
                if (typeof window.addRightLog === 'function') {
                    const savedAttribute = result.record?.attribute || {};
                    const savedAttributeText = savedAttribute.text || fullAttributeText;
                    const savedDataText = result.record?.data?.text || result.record?.s || '';
                    const savedChapter = result.record?.chapter || {};
                    const savedChapterInfo = savedChapter.number ? ` (챕터 ${savedChapter.number})` : '';
                    window.addRightLog('success', `[데이터 저장 완료] 속성: "${savedAttributeText.substring(0, 60) + (savedAttributeText.length > 60 ? '...' : '')}"${savedChapterInfo}`);
                    window.addRightLog('info', `[데이터 저장 완료] 데이터: "${savedDataText ? savedDataText.substring(0, 100) + (savedDataText.length > 100 ? '...' : '') : '(빈 문자열)'}" (${savedDataText ? savedDataText.length : 0}자)`);
                }
                updateSaveStatus('✓ 데이터 저장 완료!', 'success');
                lastSavedData = fullAttributeText;
                
                // 챗봇 상단에 Novel AI 상태 업데이트
                if (typeof updateNovelAIStatus === 'function') {
                    updateNovelAIStatus({
                        novelTitle: novelTitle,
                        attributeText: attributeTextOnly,
                        attributeBits: attributeBits,
                        dataText: dataText,
                        dataBits: dataBits,
                        filterText: ($attributeFilterInput && $attributeFilterInput.value || '').trim(),
                        additionalSearch: null,
                        saveTime: new Date()
                    });
                }
                
                // 데이터 입력란 초기화
                if ($dataInput) {
                    $dataInput.value = '';
                    $dataInput.style.height = 'auto';
                    if ($dataBitInfo) {
                        $dataBitInfo.textContent = '(속성 BIT 값을 사용합니다)';
                    }
                    localStorage.removeItem(STORAGE_KEY_DATA_TEXT);
                }
                
                // 저장 완료 후 상태만 업데이트
                setTimeout(() => {
                    updateSaveStatus('', '');
                }, 2000);
                
                // 자동 호출: 좌측 목록 새로고침
                setTimeout(() => {
                    const savedAttribute = result.record?.attribute || {};
                    const savedAttributeText = savedAttribute.text || fullAttributeText;
                    
                    if ($attributeFilterInput) {
                        const parts = savedAttributeText.split(' → ');
                        let filterText = '';
                        
                        if (parts.length >= 2) {
                            filterText = parts.slice(0, 2).join(' → ');
                        } else if (parts.length === 1) {
                            filterText = parts[0];
                        } else {
                            filterText = novelTitle || '';
                        }
                        
                        if (filterText) {
                            $attributeFilterInput.value = filterText;
                            saveFilterValues();
                            loadAttributes();
                        } else if ($attributeFilterInput.value.trim()) {
                            loadAttributes();
                        } else {
                            loadNovelList();
                        }
                    } else {
                        loadNovelList();
                    }
                }, 500);
            }
        } catch (error) {
            console.error('[데이터 자동 저장] 오류:', error);
            
            let errorMessage = error.message || 'Unknown error';
            if (error.message === 'Failed to fetch') {
                errorMessage = '서버 연결 실패';
            }
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('error', `[데이터 자동 저장] 저장 오류: ${errorMessage}`);
            }
            updateSaveStatus(`✗ 데이터 저장 오류: ${errorMessage}`, 'danger');
        } finally {
            isSaving = false;
        }
    }
    
    /**
     * 데이터 텍스트 자동 저장 트리거 함수 (debounce)
     */
    function triggerDataAutoSave() {
        console.log('[데이터 자동 저장 트리거] 호출됨');
        clearTimeout(dataAutoSaveTimer);
        dataAutoSaveTimer = setTimeout(() => {
            console.log('[데이터 자동 저장 트리거] 실제 저장 실행');
            saveData();
        }, 1000); // 1초 대기 후 저장
    }
    
    /**
     * 데이터 텍스트 자동 저장 모듈 초기화
     * @param {Object} options - 초기화 옵션
     */
    function initDataAutoSave(options = {}) {
        // DOM 요소 참조
        $novelTitleInput = options.novelTitleInput || document.getElementById('novelTitleInput');
        $attributeInput = options.attributeInput || document.getElementById('attributeInput');
        $dataInput = options.dataInput || document.getElementById('dataInput');
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
        
        // dataBitInfo 초기화: 속성 BIT 값을 사용한다는 안내 메시지 표시
        if ($dataBitInfo) {
            $dataBitInfo.textContent = '(속성 BIT 값을 사용합니다)';
        }
        
        // 데이터 입력 시 자동 저장 트리거
        if ($dataInput) {
            let dataTimer = null;
            $dataInput.addEventListener('input', () => {
                // 로컬 스토리지에 저장
                const value = $dataInput.value || '';
                localStorage.setItem(STORAGE_KEY_DATA_TEXT, value);
                
                // 입력 감지 로그
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('info', `[데이터 입력] 입력 감지 (${value.length}자)`);
                }
                console.log('[데이터 자동 저장] 입력 감지:', { length: value.length });
                
                clearTimeout(dataTimer);
                dataTimer = setTimeout(() => {
                    const text = $dataInput.value.trim();
                    const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                    const attributeText = ($attributeInput && $attributeInput.value || '').trim();
                    
                    // 입력 필드 읽기 완료 로그
                    if (typeof window.addRightLog === 'function') {
                        window.addRightLog('info', `[데이터 자동 저장] 입력 필드 읽기 완료`);
                        window.addRightLog('info', `[데이터 입력] 소설 제목: "${novelTitle || '(없음)'}"`);
                        window.addRightLog('info', `[데이터 입력] 속성 텍스트: "${attributeText ? attributeText.substring(0, 60) + (attributeText.length > 60 ? '...' : '') : '(없음)'}"`);
                        window.addRightLog('info', `[데이터 입력] 데이터 텍스트: "${text ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : '(없음)'}" (${text ? text.length : 0}자)`);
                    }
                    console.log('[데이터 자동 저장] 입력 필드 값:', {
                        novelTitle,
                        attributeText: attributeText ? attributeText.substring(0, 50) + '...' : attributeText,
                        dataText: text ? text.substring(0, 50) + '...' : text,
                        dataTextLength: text ? text.length : 0
                    });
                    
                    // 데이터 BIT 값은 속성 BIT 값을 사용하므로 별도 계산하지 않음
                    // dataBitInfo 영역에 안내 메시지만 표시
                    if ($dataBitInfo) {
                        $dataBitInfo.textContent = '(속성 BIT 값을 사용합니다)';
                    }
                    
                    // 데이터가 입력되면 자동 저장 트리거
                    // 데이터 텍스트는 속성 텍스트 값을 사용하므로, 속성 텍스트가 있으면 저장
                    if (novelTitle && attributeText) {
                        // 데이터 자동 저장 트리거 (속성 텍스트 값을 데이터 텍스트로 사용)
                        triggerDataAutoSave();
                    } else {
                        if (typeof window.addRightLog === 'function') {
                            window.addRightLog('warn', `[데이터 자동 저장] 소설 제목 또는 속성 텍스트 없음 - 저장하지 않음`);
                        }
                        console.log('[데이터 자동 저장] 소설 제목 또는 속성 텍스트 없음 - 저장하지 않음');
                    }
                }, 1000); // 1초 대기 후 저장
            });
        }
        
        console.info('[데이터 자동 저장 모듈] 초기화 완료');
    }
    
    // 전역으로 노출
    window.saveData = saveData;
    window.triggerDataAutoSave = triggerDataAutoSave;
    window.initDataAutoSave = initDataAutoSave;
    
    // 내부 상태 접근 함수
    window.getDataAutoSaveState = function() {
        return {
            isSaving: isSaving,
            lastSavedData: lastSavedData
        };
    };
    
    window.resetDataAutoSaveState = function() {
        lastSavedData = '';
        isSaving = false;
        if (dataAutoSaveTimer) {
            clearTimeout(dataAutoSaveTimer);
            dataAutoSaveTimer = null;
        }
    };
    
})();

