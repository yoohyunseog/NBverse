/**
 * 속성 텍스트 자동 저장 모듈
 * 속성 텍스트 입력 시 자동 저장 기능
 */

(function() {
    'use strict';
    
    // 자동 저장 관련 변수
    let attributeAutoSaveTimer = null;
    let lastSavedAttribute = '';
    let isSaving = false;
    
    // DOM 요소 참조 (나중에 초기화)
    let $novelTitleInput = null;
    let $attributeInput = null;
    let $attributeBitInfo = null;
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
    
    /**
     * 속성 텍스트 자동 저장 함수
     */
    async function saveAttribute() {
        // 중요: 저장 시에는 항상 현재 입력 필드의 실제 값을 사용해야 함
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const attributeText = ($attributeInput && $attributeInput.value || '').trim();
        
        // 자동 저장 시작 로그
        console.log('[속성 자동 저장] 속성 텍스트 자동 저장 함수 호출됨');
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', '[속성 자동 저장] 속성 텍스트 자동 저장 시작');
        }
        
        // 디버깅: 저장 시점의 실제 입력 필드 값 확인
        console.log('[속성 자동 저장] 저장 시점 입력 필드 값:', {
            novelTitle: novelTitle,
            attributeText: attributeText,
            localStorage_속성: localStorage.getItem(STORAGE_KEY_ATTRIBUTE_TEXT),
            localStorage_소설제목: localStorage.getItem(STORAGE_KEY_NOVEL_TITLE)
        });
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[속성 자동 저장] 입력 필드 읽기 완료`);
            window.addRightLog('info', `[속성 입력] 소설 제목: "${novelTitle || '(없음)'}"`);
            window.addRightLog('info', `[속성 입력] 속성 텍스트: "${attributeText ? attributeText.substring(0, 60) + (attributeText.length > 60 ? '...' : '') : '(없음)'}"`);
        }
        console.log('[속성 자동 저장] 호출:', { novelTitle, attributeText });
        
        // 소설 제목과 속성 텍스트는 필수
        if (!novelTitle || !attributeText) {
            console.log('[속성 자동 저장] 입력값 부족 - 저장하지 않음', { novelTitle: !!novelTitle, attributeText: !!attributeText });
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[속성 자동 저장] 입력값 부족 - 저장하지 않음 (소설제목: ${!!novelTitle}, 속성: ${!!attributeText})`);
            }
            return;
        }
        
        // 속성은 1개만 사용 (여러 줄로 나뉘어 있으면 첫 번째만 사용)
        const attributeLines = attributeText.split('\n').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        let finalAttributeText = attributeText;
        if (attributeLines.length > 1) {
            finalAttributeText = attributeLines[0].trim();
            if ($attributeInput && finalAttributeText !== attributeText) {
                $attributeInput.value = finalAttributeText;
                updateSaveStatus('⚠️ 속성은 1개만 사용됩니다. 첫 번째 속성만 저장됩니다.', 'warning');
                setTimeout(() => triggerAttributeAutoSave(), 500);
                return;
            }
        }
        
        // 속성 텍스트 입력 필드에 소설 제목이 포함되어 있는지 확인
        let attributeTextOnly = finalAttributeText;
        if (novelTitle && finalAttributeText.startsWith(`${novelTitle} → `)) {
            attributeTextOnly = finalAttributeText.substring(`${novelTitle} → `.length);
        }
        
        // 실제 저장할 속성 텍스트: 소설 제목 + 속성 텍스트 (소설 제목 제외)
        const fullAttributeText = `${novelTitle} → ${attributeTextOnly}`;
        
        // 디버깅: 저장 전 속성 텍스트 확인
        console.log('[속성 자동 저장] 저장할 속성 텍스트:', {
            novelTitle,
            attributeText,
            finalAttributeText,
            fullAttributeText
        });
        
        // 이미 저장된 것과 동일하면 저장하지 않음
        if (fullAttributeText === lastSavedAttribute) {
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
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[속성 BIT 계산] 속성 BIT: MAX=${attributeBits.max ? attributeBits.max.toFixed(15) : 'null'}, MIN=${attributeBits.min ? attributeBits.min.toFixed(15) : 'null'}`);
        }
        
        if (!attributeBits.max || !attributeBits.min) {
            updateSaveStatus('⚠️ BIT 값 계산 중...', 'warning');
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[속성 BIT 계산] BIT 값 계산 실패 - 저장 중단`);
            }
            return;
        }
        
        // 중복 체크 (데이터 텍스트는 빈 문자열로)
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[속성 중복 체크] 중복 여부 확인 중...`);
        }
        const dataBits = { max: attributeBits.max, min: attributeBits.min };
        const isDuplicate = await checkDuplicate(fullAttributeText, '', attributeBits, dataBits);
        if (isDuplicate) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[속성 중복 체크] 중복 속성 발견 - 저장 건너뜀`);
                window.addRightLog('info', `[속성 중복 체크] 속성: "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
            }
            updateSaveStatus('ℹ️ 이미 저장된 속성입니다 (중복 방지)', 'info');
            lastSavedAttribute = fullAttributeText;
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
            const fallbackMatch = finalAttributeText.match(/챕터\s*(\d+)(?:\s*[:：]\s*([^→]+?))(?:\s*→|$)/i);
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
                window.addRightLog('info', `[속성 챕터 추출] 챕터 정보: ${chapterText}`);
            }
        }
        
        isSaving = true;
        updateSaveStatus('💾 속성 저장 중...', 'info');
        
        try {
            const url = getServerUrl('/api/attributes/data');
            console.log('[속성 자동 저장] URL:', url);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[속성 서버 전송] 저장 요청 시작`);
                window.addRightLog('info', `[속성 서버 전송] 속성: "${fullAttributeText.substring(0, 60) + (fullAttributeText.length > 60 ? '...' : '')}"`);
                window.addRightLog('info', `[속성 서버 전송] 속성 BIT: MAX=${attributeBits.max.toFixed(15)}, MIN=${attributeBits.min.toFixed(15)}`);
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
                    text: '', // 속성만 저장하므로 데이터 텍스트는 빈 문자열
                    dataBitMax: attributeBits.max,
                    dataBitMin: attributeBits.min,
                    novelTitle: novelTitle,
                    chapter: chapter,
                    chapterBitMax: chapterBits.max,
                    chapterBitMin: chapterBits.min
                }),
            });
            
            console.log('[속성 자동 저장] 응답 상태:', response.status);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[속성 서버 응답] HTTP 상태: ${response.status}`);
            }
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('[속성 자동 저장] HTTP 오류:', response.status, errorText);
                
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
                    console.error('[속성 자동 저장] 에러 텍스트 (JSON 아님):', errorText);
                }
                
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                
                errorMessage = String(errorMessage || errorText || '알 수 없는 오류');
                const displayMessage = errorMessage.substring(0, 200);
                
                console.error('[속성 자동 저장] 최종 에러 메시지:', displayMessage);
                updateSaveStatus(`✗ 속성 저장 실패: ${displayMessage}`, 'danger');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[속성 자동 저장 실패] ${displayMessage}`);
                }
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            console.log('[속성 자동 저장] 결과:', result);
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[속성 서버 응답] JSON 파싱 완료: ok=${result.ok}`);
            }
            
            if (!result.ok) {
                let errorMessage = result.error || '알 수 없는 오류';
                console.error('[속성 자동 저장] 서버 응답 오류:', result);
                
                if (typeof errorMessage === 'object') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                
                const displayMessage = String(errorMessage).substring(0, 200);
                updateSaveStatus(`✗ 속성 저장 실패: ${displayMessage}`, 'danger');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[속성 자동 저장 실패] ${displayMessage}`);
                }
                return;
            }
            
            if (result.ok) {
                if (typeof window.addRightLog === 'function') {
                    const savedAttribute = result.record?.attribute || {};
                    const savedAttributeText = savedAttribute.text || fullAttributeText;
                    const savedChapter = result.record?.chapter || {};
                    const savedChapterInfo = savedChapter.number ? ` (챕터 ${savedChapter.number})` : '';
                    window.addRightLog('success', `[속성 저장 완료] 속성: "${savedAttributeText.substring(0, 60) + (savedAttributeText.length > 60 ? '...' : '')}"${savedChapterInfo}`);
                }
                updateSaveStatus('✓ 속성 저장 완료!', 'success');
                lastSavedAttribute = fullAttributeText;
                
                // 챗봇 상단에 Novel AI 상태 업데이트
                if (typeof updateNovelAIStatus === 'function') {
                    updateNovelAIStatus({
                        novelTitle: novelTitle,
                        attributeText: finalAttributeText,
                        attributeBits: attributeBits,
                        dataText: null,
                        dataBits: null,
                        filterText: ($attributeFilterInput && $attributeFilterInput.value || '').trim(),
                        additionalSearch: null,
                        saveTime: new Date()
                    });
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
            console.error('[속성 자동 저장] 오류:', error);
            
            let errorMessage = error.message || 'Unknown error';
            if (error.message === 'Failed to fetch') {
                errorMessage = '서버 연결 실패';
            }
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('error', `[속성 자동 저장] 저장 오류: ${errorMessage}`);
            }
            updateSaveStatus(`✗ 속성 저장 오류: ${errorMessage}`, 'danger');
        } finally {
            isSaving = false;
        }
    }
    
    /**
     * 속성 텍스트 자동 저장 트리거 함수 (debounce)
     */
    function triggerAttributeAutoSave() {
        console.log('[속성 자동 저장 트리거] 호출됨');
        clearTimeout(attributeAutoSaveTimer);
        attributeAutoSaveTimer = setTimeout(() => {
            console.log('[속성 자동 저장 트리거] 실제 저장 실행');
            saveAttribute();
        }, 1000); // 1초 대기 후 저장
    }
    
    /**
     * 속성 텍스트 자동 저장 모듈 초기화
     * @param {Object} options - 초기화 옵션
     */
    function initAttributeAutoSave(options = {}) {
        // DOM 요소 참조
        $novelTitleInput = options.novelTitleInput || document.getElementById('novelTitleInput');
        $attributeInput = options.attributeInput || document.getElementById('attributeInput');
        $attributeBitInfo = options.attributeBitInfo || document.getElementById('attributeBitInfo');
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
                    const attributeText = $attributeInput.value.trim();
                    
                    // 전체 속성 텍스트로 BIT 계산
                    const fullAttributeText = novelTitle && attributeText 
                        ? `${novelTitle} → ${attributeText}` 
                        : attributeText;
                    
                    if (fullAttributeText && calculateBitValues) {
                        const bits = calculateBitValues(fullAttributeText);
                        if (bits.max !== null && bits.min !== null && $attributeBitInfo) {
                            $attributeBitInfo.textContent = `BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}`;
                        } else if ($attributeBitInfo) {
                            $attributeBitInfo.textContent = 'BIT: 계산 중...';
                        }
                    } else if ($attributeBitInfo) {
                        $attributeBitInfo.textContent = 'BIT: 계산 중...';
                    }
                    
                    // 속성 텍스트 입력 시 자동 저장하지 않음
                    // 데이터 텍스트 입력 시에만 저장하도록 변경 (중복 저장 방지)
                    // 속성 텍스트만 입력한 경우는 저장하지 않고, 데이터 텍스트 입력 시 속성과 데이터를 함께 저장
                }, 1000); // 1초 대기 후 저장
            });
        }
        
        console.info('[속성 자동 저장 모듈] 초기화 완료');
    }
    
    // 전역으로 노출
    window.saveAttribute = saveAttribute;
    window.triggerAttributeAutoSave = triggerAttributeAutoSave;
    window.initAttributeAutoSave = initAttributeAutoSave;
    
    // 내부 상태 접근 함수
    window.getAttributeAutoSaveState = function() {
        return {
            isSaving: isSaving,
            lastSavedAttribute: lastSavedAttribute
        };
    };
    
    window.resetAttributeAutoSaveState = function() {
        lastSavedAttribute = '';
        isSaving = false;
        if (attributeAutoSaveTimer) {
            clearTimeout(attributeAutoSaveTimer);
            attributeAutoSaveTimer = null;
        }
    };
    
})();

