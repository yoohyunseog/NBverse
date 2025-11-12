/**
 * 우측 데이터 관리 스크립트
 * 저장, 조회, 삭제 기능을 담당
 */

(function() {
    'use strict';
    
    console.info('[우측 데이터 관리] 초기화 중...');
    
    // 전역 변수 및 DOM 요소 접근 (attribute_data.js에서 제공)
    let getDOMElements = null;
    let getGlobalVariables = null;
    
    // DOM 요소 및 전역 변수 설정 함수
    window.setRightDataManagerConfig = function(config) {
        if (config.getDOMElements) {
            getDOMElements = config.getDOMElements;
        }
        if (config.getGlobalVariables) {
            getGlobalVariables = config.getGlobalVariables;
        }
        if (config.getServerUrl) {
            window.getServerUrl = config.getServerUrl;
        }
        if (config.calculateBitValues) {
            window.calculateBitValues = config.calculateBitValues;
        }
        if (config.updateSaveStatus) {
            window.updateSaveStatus = config.updateSaveStatus;
        }
        if (config.loadAttributes) {
            window.loadAttributes = config.loadAttributes;
        }
        if (config.loadNovelList) {
            window.loadNovelList = config.loadNovelList;
        }
    };
    
    // DOM 요소 가져오기
    function getElements() {
        if (getDOMElements) {
            return getDOMElements();
        }
        return {
            $novelTitleInput: document.getElementById('novelTitleInput'),
            $attributeInput: document.getElementById('attributeInput'),
            $dataInput: document.getElementById('dataInput'),
            $attributeBitInfo: document.getElementById('attributeBitInfo'),
            $dataBitInfo: document.getElementById('dataBitInfo'),
            $saveStatus: document.getElementById('saveStatus'),
            $attributeFilterInput: document.getElementById('attributeFilterInput'),
            $additionalSearchInput: document.getElementById('additionalSearchInput')
        };
    }
    
    // 전역 변수 가져오기
    function getGlobals() {
        if (getGlobalVariables) {
            return getGlobalVariables();
        }
        return {
            STORAGE_KEY_ATTRIBUTE_TEXT: 'novel_ai_input_attribute_text',
            STORAGE_KEY_DATA_TEXT: 'novel_ai_input_data_text',
            STORAGE_KEY_NOVEL_TITLE: 'novel_ai_input_novel_title'
        };
    }
    
    // 서버 URL 헬퍼
    function getServerUrl(path) {
        if (typeof window.getServerUrl === 'function') {
            return window.getServerUrl(path);
        }
        try {
            const base = window.location.origin || 'http://localhost:8123';
            if (!path) return base;
            if (path.startsWith('http://') || path.startsWith('https://')) return path;
            return `${base}${path}`;
        } catch (e) {
            console.error('getServerUrl 오류:', e);
            return path;
        }
    }
    
    // BIT 값 계산 함수
    function calculateBitValues(text) {
        if (typeof window.calculateBitValues === 'function') {
            return window.calculateBitValues(text);
        }
        if (!text || typeof text !== 'string' || text.trim() === '') {
            return { max: null, min: null };
        }
        try {
            if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
                return { max: null, min: null };
            }
            const arr = wordNbUnicodeFormat(text);
            if (!arr || arr.length === 0) {
                return { max: null, min: null };
            }
            const max = BIT_MAX_NB(arr);
            const min = BIT_MIN_NB(arr);
            return {
                max: isFinite(max) ? max : null,
                min: isFinite(min) ? min : null
            };
        } catch (e) {
            console.error('BIT 계산 오류:', e);
            return { max: null, min: null };
        }
    }
    
    // 중복 저장 체크 함수
    async function checkDuplicate(attributeText, dataText, attributeBits, dataBits) {
        try {
            const url = getServerUrl(`/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=100`);
            const response = await fetch(url);
            
            if (!response.ok) return false;
            
            const data = await response.json();
            if (!data.ok || !data.items) return false;
            
            const duplicate = data.items.some(item => {
                const itemAttribute = item.attribute?.text || item.attributeText || '';
                const itemData = item.s || item.text || item.data?.text || '';
                return itemAttribute === attributeText && itemData === dataText;
            });
            
            return duplicate;
        } catch (error) {
            console.error('[중복 체크] 오류:', error);
            return false;
        }
    }
    
    // 자동 저장 함수
    async function autoSave() {
        const elements = getElements();
        const globals = getGlobals();
        const $novelTitleInput = elements.$novelTitleInput;
        const $attributeInput = elements.$attributeInput;
        const $dataInput = elements.$dataInput;
        const $attributeFilterInput = elements.$attributeFilterInput;
        const $additionalSearchInput = elements.$additionalSearchInput;
        
        // 저장 상태 관리 (전역 변수에서 가져오기)
        let isSaving = window.rightDataManagerSaving || false;
        let lastSavedAttribute = window.rightDataManagerLastAttribute || '';
        let lastSavedData = window.rightDataManagerLastData || '';
        
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const attributeText = ($attributeInput && $attributeInput.value || '').trim();
        const dataText = ($dataInput && $dataInput.value || '').trim();
        
        console.log('[자동 저장] 호출:', { novelTitle, attributeText, dataText, dataText길이: dataText ? dataText.length : 0 });
        
        // 소설 제목과 속성 텍스트는 필수, 데이터 텍스트는 선택 (속성만 저장 가능)
        if (!novelTitle) {
            console.log('[자동 저장] 소설 제목이 없음 - 저장하지 않음');
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('⚠️ 소설 제목을 입력해주세요.', 'warning');
            }
            return;
        }
        
        // 속성 텍스트가 비어있으면 추가 검색 키워드(현재 챕터 제목)를 사용
        let attributeTextToUse = attributeText.trim();
        if (!attributeTextToUse || attributeTextToUse.length === 0) {
            let currentChapterTitle = ($additionalSearchInput && $additionalSearchInput.value || '').trim();
            
            if (!currentChapterTitle && $attributeFilterInput) {
                const filterText = ($attributeFilterInput.value || '').trim();
                const filterParts = filterText.split(' → ').map(p => p.trim()).filter(p => p && p.length > 0);
                if (filterParts.length >= 2) {
                    const chapterPart = filterParts[1];
                    const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                    if (chapterMatch) {
                        const chapterNum = chapterMatch[1];
                        const chapterTitleOnly = (chapterMatch[2] || '').trim() || `제${chapterNum}장`;
                        currentChapterTitle = `챕터 ${chapterNum}: ${chapterTitleOnly}`;
                    }
                }
            }
            
            if (currentChapterTitle) {
                attributeTextToUse = currentChapterTitle;
                const fullAttributeTextForInput = `${novelTitle} → ${currentChapterTitle}`;
                if ($attributeInput) {
                    $attributeInput.value = fullAttributeTextForInput;
                    localStorage.setItem(globals.STORAGE_KEY_ATTRIBUTE_TEXT, fullAttributeTextForInput);
                    if ($additionalSearchInput) {
                        $additionalSearchInput.value = currentChapterTitle;
                    }
                }
            } else {
                console.log('[자동 저장] 속성 텍스트가 비어있고 현재 챕터 정보도 없음 - 저장하지 않음');
                if (typeof window.updateSaveStatus === 'function') {
                    window.updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
                }
                return;
            }
        }
        
        const attributeLines = attributeTextToUse.split('\n').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        let finalAttributeText = attributeTextToUse.trim();
        
        if (!finalAttributeText || finalAttributeText.length === 0) {
            console.log('[자동 저장] 속성 텍스트가 비어있음 - 저장하지 않음');
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
            }
            return;
        }
        
        if (attributeLines.length > 1) {
            finalAttributeText = attributeLines[0].trim();
            if ($attributeInput && finalAttributeText !== attributeText) {
                $attributeInput.value = finalAttributeText;
                if (typeof window.updateSaveStatus === 'function') {
                    window.updateSaveStatus('⚠️ 속성은 1개만 사용됩니다. 첫 번째 속성만 저장됩니다.', 'warning');
                }
                setTimeout(() => {
                    if (typeof window.triggerAutoSave === 'function') {
                        window.triggerAutoSave();
                    }
                }, 500);
                return;
            }
        }
        
        let fullAttributeText;
        if (finalAttributeText.startsWith(`${novelTitle} → `)) {
            fullAttributeText = finalAttributeText;
        } else if (finalAttributeText.length > 0) {
            fullAttributeText = `${novelTitle} → ${finalAttributeText}`;
        } else {
            console.log('[자동 저장] 속성 텍스트가 비어있음 - 저장하지 않음');
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
            }
            return;
        }
        
        let attributeTextOnly = finalAttributeText;
        if (fullAttributeText.startsWith(`${novelTitle} → `)) {
            attributeTextOnly = fullAttributeText.substring(`${novelTitle} → `.length).trim();
        } else {
            attributeTextOnly = fullAttributeText;
        }
        
        if (attributeTextOnly === lastSavedAttribute && dataText === lastSavedData) {
            return;
        }
        
        if (isSaving) {
            return;
        }
        
        if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('⚠️ BIT 계산 함수 로드 중...', 'warning');
            }
            return;
        }
        
        // BIT 값 계산: 입력 필드 값(finalAttributeText) 그대로 사용
        // 사용자가 입력 필드에 입력한 값의 BIT를 그대로 사용해야 함
        const attributeBits = calculateBitValues(finalAttributeText);
        
        const hasDataText = Boolean(dataText && dataText.trim().length > 0);
        let dataBits = { max: null, min: null };
        if (hasDataText) {
            dataBits = calculateBitValues(dataText);
        }
        
        // 속성 BIT는 필수, 데이터 BIT는 선택 (데이터가 있을 때만 필요)
        if (!attributeBits.max || !attributeBits.min) {
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('⚠️ BIT 값 계산 중...', 'warning');
            }
            return;
        }
        
        // 데이터가 있을 때는 dataBits도 필요
        if (hasDataText && (dataBits.max === null || dataBits.min === null)) {
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('⚠️ 데이터 BIT 값 계산 중...', 'warning');
            }
            return;
        }
        
        // 중복 체크: dataText가 빈 문자열이어도 체크 가능
        const isDup = await checkDuplicate(fullAttributeText, dataText || '', attributeBits, dataBits);
        if (isDup) {
            if (typeof window.addRightLog === 'function') {
                const dupDisplay = attributeTextOnly ? (attributeTextOnly.length > 50 ? attributeTextOnly.substring(0, 50) + '...' : attributeTextOnly) : '';
                window.addRightLog('info', `[우측 저장] 중복 데이터로 저장 건너뜀: "${dupDisplay}"`);
            }
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus('ℹ️ 이미 저장된 데이터입니다 (중복 방지)', 'info');
            }
            window.rightDataManagerLastAttribute = attributeTextOnly;
            window.rightDataManagerLastData = dataText;
            setTimeout(() => {
                if ($attributeFilterInput && $attributeFilterInput.value.trim()) {
                    if (typeof window.loadAttributes === 'function') {
                        window.loadAttributes();
                    }
                }
            }, 500);
            return;
        }
        
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
        
        window.rightDataManagerSaving = true;
        if (typeof window.updateSaveStatus === 'function') {
            window.updateSaveStatus('💾 저장 중...', 'info');
        }
        
        try {
            const url = getServerUrl('/api/attributes/data');
            
            if (!chapter || !chapter.number) {
                const finalParts = fullAttributeText.split(' → ').map(p => (p || '').trim()).filter(p => p && p.length > 0);
                if (finalParts.length >= 2) {
                    const finalChapterPart = finalParts[1];
                    const finalChapterMatch = finalChapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                    if (finalChapterMatch) {
                        const finalChapterNumber = finalChapterMatch[1];
                        const finalChapterTitle = (finalChapterMatch[2] || '').trim();
                        chapter = {
                            number: finalChapterNumber,
                            title: finalChapterTitle || `제${finalChapterNumber}장`
                        };
                    }
                }
            }
            
            if (chapter && chapter.number === '1' && fullAttributeText.includes('챕터 2')) {
                const recheckParts = fullAttributeText.split(' → ');
                if (recheckParts.length >= 2) {
                    const recheckChapterPart = recheckParts[1].trim();
                    const recheckMatch = recheckChapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                    if (recheckMatch && recheckMatch[1] !== '1') {
                        chapter = {
                            number: recheckMatch[1],
                            title: (recheckMatch[2] || '').trim() || `제${recheckMatch[1]}장`
                        };
                    }
                }
            }
            
            const novelTitleBits = novelTitle ? calculateBitValues(novelTitle) : { max: null, min: null };
            
            // text 필드: dataText가 비어있으면 null을 보내서 속성만 저장
            // dataText가 있으면 해당 값을 사용
            const textValue = (dataText && dataText.trim().length > 0) ? String(dataText) : null;
            
            const requestBody = {
                attributeText: fullAttributeText, // 전체 속성 텍스트 (소설 제목 포함)
                attributeBitMax: attributeBits.max, // 입력 필드 값의 BIT
                attributeBitMin: attributeBits.min, // 입력 필드 값의 BIT
                text: textValue, // null이면 속성만 저장, 값이 있으면 데이터도 저장
                dataBitMax: dataBits.max, // null이어도 허용
                dataBitMin: dataBits.min, // null이어도 허용
                novelTitle: novelTitle,
                novelTitleBitMax: novelTitleBits.max,
                novelTitleBitMin: novelTitleBits.min,
                chapter: chapter,
                chapterBitMax: chapterBits.max,
                chapterBitMin: chapterBits.min
            };
            
            console.log('[자동 저장] 서버에 전송할 데이터:', {
                attributeText: requestBody.attributeText,
                text: requestBody.text,
                textType: typeof requestBody.text,
                text길이: requestBody.text ? requestBody.text.length : 0,
                dataText원본: dataText,
                dataTextType: typeof dataText,
                dataBitMax: requestBody.dataBitMax,
                dataBitMin: requestBody.dataBitMin,
                fullAttributeText: fullAttributeText,
                requestBodyJSON: JSON.stringify(requestBody).substring(0, 200)
            });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('[자동 저장] 오류:', errorText);
                if (typeof window.updateSaveStatus === 'function') {
                    window.updateSaveStatus(`✗ 저장 실패: ${errorText.substring(0, 50)}`, 'danger');
                }
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            const savedRecord = result.record || {};
            const savedAttribute = savedRecord.attribute || {};
            const savedChapter = savedRecord.chapter || {};
            
            if (result.ok) {
                if (typeof window.addRightLog === 'function') {
                    const savedAttributeText = savedAttribute.text || attributeTextOnly || '';
                    const savedChapterInfo = savedChapter.number ? ` (챕터 ${savedChapter.number})` : '';
                    const savedDisplay = savedAttributeText ? (savedAttributeText.length > 50 ? savedAttributeText.substring(0, 50) + '...' : savedAttributeText) : '';
                    window.addRightLog('info', `[우측 저장] 저장 완료: "${savedDisplay}"${savedChapterInfo}`);
                }
                if (typeof window.updateSaveStatus === 'function') {
                    window.updateSaveStatus('✓ 저장 완료!', 'success');
                }
                window.rightDataManagerLastAttribute = attributeTextOnly;
                window.rightDataManagerLastData = dataText;
                
                if ($dataInput) {
                    $dataInput.value = '';
                    $dataInput.style.height = 'auto';
                    if (elements.$dataBitInfo) {
                        elements.$dataBitInfo.textContent = 'BIT: 계산 중...';
                    }
                    localStorage.removeItem(globals.STORAGE_KEY_DATA_TEXT);
                }
                
                setTimeout(async () => {
                    try {
                        const verifyUrl = getServerUrl(`/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=10`);
                        const verifyResponse = await fetch(verifyUrl);
                        
                        if (verifyResponse.ok) {
                            const verifyResult = await verifyResponse.json();
                            if (verifyResult.ok && verifyResult.items && verifyResult.items.length > 0) {
                                const foundItem = verifyResult.items.find(item => {
                                    const itemText = (item.s || item.data?.text || '').trim();
                                    const savedText = (dataText || '').trim();
                                    const itemChapter = item.chapter || {};
                                    const savedChapterNumber = chapter?.number || savedChapter?.number;
                                    return itemText === savedText && 
                                           (itemChapter.number === savedChapterNumber || !savedChapterNumber);
                                });
                                
                                if (foundItem) {
                                    const foundChapter = foundItem.chapter || {};
                                    const foundDataText = foundItem.s || foundItem.data?.text || '없음';
                                    const foundAttributeText = foundItem.attribute?.text || '없음';
                                    // 조회된 속성의 BIT 값 가져오기
                                    const foundAttributeBitMax = foundItem.attribute?.bitMax || foundItem.max || null;
                                    const foundAttributeBitMin = foundItem.attribute?.bitMin || foundItem.min || null;
                                    
                                    if (typeof window.addRightLog === 'function') {
                                        const chapterInfo = foundChapter.number ? ` (챕터 ${foundChapter.number})` : '';
                                        const attributeMatch = foundAttributeText === fullAttributeText ? '✓' : '⚠';
                                        const dataMatch = foundDataText === dataText ? '✓' : '⚠';
                                        const chapterMatch = foundChapter.number === (chapter?.number || savedChapter?.number) ? '✓' : '⚠';
                                        
                                        const attributeDisplay = (foundAttributeText && foundAttributeText.length > 60) ? foundAttributeText.substring(0, 60) + '...' : (foundAttributeText || '');                                        
                                        const dataDisplay = (foundDataText && foundDataText.length > 80) ? foundDataText.substring(0, 80) + '...' : (foundDataText || '');
                                        
                                        window.addRightLog('info', `[우측 저장] 확인 완료: 속성${attributeMatch} 데이터${dataMatch} 챕터${chapterMatch}${chapterInfo}`);
                                        window.addRightLog('info', `[조회] 속성: "${attributeDisplay}"`);
                                        
                                        // 조회된 속성 BIT 값 출력
                                        if (foundAttributeBitMax !== null && foundAttributeBitMin !== null) {
                                            const foundAttributeDisplay = foundAttributeText.length > 50 ? foundAttributeText.substring(0, 50) + '...' : foundAttributeText;
                                            window.addRightLog('info', `[조회] 속성 BIT (텍스트: "${foundAttributeDisplay}"): MAX=${foundAttributeBitMax.toFixed(15)}, MIN=${foundAttributeBitMin.toFixed(15)}`);
                                        }
                                        
                                        if (foundAttributeText === fullAttributeText) {
                                            window.addRightLog('success', `[확인] 속성 일치 ✓`);
                                        } else {
                                            const savedAttributeDisplay = (fullAttributeText && fullAttributeText.length > 60) ? fullAttributeText.substring(0, 60) + '...' : (fullAttributeText || '');
                                            window.addRightLog('warn', `[확인] 속성 불일치 ⚠ 저장: "${savedAttributeDisplay}"`);
                                        }
                                        
                                        window.addRightLog('info', `[조회] 데이터: "${dataDisplay}"`);
                                        
                                        if (foundDataText === dataText) {
                                            window.addRightLog('success', `[확인] 데이터 일치 ✓`);
                                        } else {
                                            const savedDataDisplay = (dataText && dataText.length > 80) ? dataText.substring(0, 80) + '...' : (dataText || '');
                                            window.addRightLog('warn', `[확인] 데이터 불일치 ⚠ 저장: "${savedDataDisplay}"`);
                                        }
                                        
                                        if (foundChapter.number) {
                                            const foundChapterText = `챕터 ${foundChapter.number}: ${foundChapter.title || ''}`;
                                            const savedChapterText = chapter?.number ? `챕터 ${chapter.number}: ${chapter.title || ''}` : (savedChapter?.number ? `챕터 ${savedChapter.number}: ${savedChapter.title || ''}` : '없음');
                                            window.addRightLog('info', `[조회] 챕터: ${foundChapterText}`);
                                            if (foundChapter.number === (chapter?.number || savedChapter?.number)) {
                                                window.addRightLog('success', `[확인] 챕터 일치 ✓`);
                                            } else {
                                                window.addRightLog('warn', `[확인] 챕터 불일치 ⚠ 저장: ${savedChapterText}`);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (verifyError) {
                        console.error('[자동 저장] 저장 확인 중 오류 발생:', verifyError);
                    }
                }, 500);
                
                setTimeout(() => {
                    if (typeof window.updateSaveStatus === 'function') {
                        window.updateSaveStatus('', '');
                    }
                }, 2000);
                
                setTimeout(() => {
                    if ($attributeFilterInput) {
                        if ($attributeFilterInput.value.trim()) {
                            if (typeof window.loadAttributes === 'function') {
                                window.loadAttributes();
                            }
                        } else {
                            if (typeof window.loadNovelList === 'function') {
                                window.loadNovelList();
                            }
                        }
                    } else {
                        if (typeof window.loadNovelList === 'function') {
                            window.loadNovelList();
                        }
                    }
                }, 500);
            } else {
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[우측 저장] 저장 실패: ${result.error || 'Unknown error'}`);
                }
                if (typeof window.updateSaveStatus === 'function') {
                    window.updateSaveStatus(`✗ 저장 실패: ${result.error || 'Unknown error'}`, 'danger');
                }
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
            if (typeof window.updateSaveStatus === 'function') {
                window.updateSaveStatus(`✗ 저장 오류: ${errorMessage}`, 'danger');
            }
        } finally {
            window.rightDataManagerSaving = false;
        }
    }
    
    // 자동 저장 트리거 함수
    function triggerAutoSave() {
        clearTimeout(window.rightDataManagerAutoSaveTimer);
        window.rightDataManagerAutoSaveTimer = setTimeout(() => {
            autoSave();
        }, 1000);
    }
    
    // 데이터 항목 삭제 함수
    window.deleteDataItem = async function(attrBitMax, attrBitMin, dataBitMax, dataBitMin, dataText) {
        try {
            const attrMax = parseFloat(attrBitMax);
            const attrMin = parseFloat(attrBitMin);
            const dataMax = parseFloat(dataBitMax);
            const dataMin = parseFloat(dataBitMin);
            
            if (!Number.isFinite(attrMax) || !Number.isFinite(attrMin) || 
                !Number.isFinite(dataMax) || !Number.isFinite(dataMin)) {
                throw new Error('유효하지 않은 BIT 값입니다.');
            }
            
            const dataPreview = dataText ? (dataText.length > 40 ? dataText.substring(0, 40) + '...' : dataText) : '';
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('info', `[좌측 삭제] 데이터 삭제 시작: ${dataPreview}`);
            }
            console.log('[데이터 삭제] 시작:', { attrMax, attrMin, dataMax, dataMin });
            
            const url = getServerUrl('/api/attributes/data/delete');
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    attributeBitMax: attrMax,
                    attributeBitMin: attrMin,
                    dataBitMax: dataMax,
                    dataBitMin: dataMin
                })
            });
            
            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = `HTTP ${response.status}`;
                }
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json().catch(() => ({ ok: true }));
            
            if (result && result.ok) {
                const deletedCount = result.deletedCount || 0;
                console.log('[데이터 삭제] 완료, 삭제된 항목:', deletedCount);
                
                if (deletedCount === 0) {
                    if (typeof window.addLeftLog === 'function') {
                        window.addLeftLog('warn', `[좌측 삭제] 데이터 삭제 실패: 삭제된 항목 0개`);
                    }
                    alert('⚠️ 삭제된 항목이 없습니다. BIT 값이 일치하지 않거나 이미 삭제되었을 수 있습니다.');
                } else {
                    if (typeof window.addLeftLog === 'function') {
                        window.addLeftLog('info', `[좌측 삭제] 데이터 삭제 완료: ${deletedCount}개 항목 삭제됨`);
                    }
                }
            } else {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('error', `[좌측 삭제] 데이터 삭제 실패: ${result?.error || '알 수 없는 오류'}`);
                }
                alert(`✗ 삭제 실패: ${result?.error || '알 수 없는 오류'}`);
            }
            
            setTimeout(async () => {
                if (typeof window.loadAttributes === 'function') {
                    await window.loadAttributes();
                }
            }, 300);
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 삭제] 데이터 삭제 오류: ${error.message}`);
            }
            console.error('[데이터 삭제] 오류:', error);
            alert(`✗ 삭제 실패: ${error.message}`);
            setTimeout(async () => {
                if (typeof window.loadAttributes === 'function') {
                    await window.loadAttributes();
                }
            }, 300);
        }
    };
    
    // 속성 삭제 함수
    window.deleteAttribute = async function(attrBitMax, attrBitMin, attrText) {
        try {
            const attrMax = parseFloat(attrBitMax);
            const attrMin = parseFloat(attrBitMin);
            
            if (!Number.isFinite(attrMax) || !Number.isFinite(attrMin)) {
                throw new Error('유효하지 않은 속성 BIT 값입니다.');
            }
            
            const attrPreview = attrText ? (attrText.length > 40 ? attrText.substring(0, 40) + '...' : attrText) : '';
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('info', `[좌측 삭제] 속성 삭제 시작: ${attrPreview}`);
            }
            console.log('[속성 삭제] 시작:', { attrMax, attrMin, attrText });
            
            const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attrMax}&bitMin=${attrMin}&limit=1000`);
            const dataResponse = await fetch(dataUrl);
            
            if (!dataResponse.ok) {
                throw new Error(`데이터 조회 실패: HTTP ${dataResponse.status}`);
            }
            
            const dataData = await dataResponse.json();
            const dataItems = (dataData.ok && dataData.items) ? dataData.items : [];
            
            console.log(`[속성 삭제] 발견된 데이터 항목: ${dataItems.length}개`);
            
            let deletedCount = 0;
            let errorCount = 0;
            
            for (const item of dataItems) {
                // BIT 값 추출 (여러 필드 확인)
                let itemBitsMax = null;
                let itemBitsMin = null;
                
                // 1순위: 최상위 max/min (null이 아닌 경우만)
                if (item.max !== null && item.max !== undefined && Number.isFinite(item.max)) {
                    itemBitsMax = item.max;
                } else if (item.data?.bitMax !== null && item.data?.bitMax !== undefined && Number.isFinite(item.data.bitMax)) {
                    itemBitsMax = item.data.bitMax;
                } else if (item.dataBitMax !== null && item.dataBitMax !== undefined && Number.isFinite(item.dataBitMax)) {
                    itemBitsMax = item.dataBitMax;
                }
                
                if (item.min !== null && item.min !== undefined && Number.isFinite(item.min)) {
                    itemBitsMin = item.min;
                } else if (item.data?.bitMin !== null && item.data?.bitMin !== undefined && Number.isFinite(item.data.bitMin)) {
                    itemBitsMin = item.data.bitMin;
                } else if (item.dataBitMin !== null && item.dataBitMin !== undefined && Number.isFinite(item.dataBitMin)) {
                    itemBitsMin = item.dataBitMin;
                }
                
                // BIT 값 유효성 검사
                if (!Number.isFinite(itemBitsMax) || !Number.isFinite(itemBitsMin)) {
                    // 디버깅을 위한 상세 정보 수집
                    const debugInfo = {
                        메시지: 'BIT 값이 모두 null이거나 유효하지 않은 데이터 항목입니다. 이 항목은 삭제에서 제외됩니다.',
                        데이터항목정보: {
                            id: item.id || 'ID 없음',
                            text: item.text || item.data?.text || '텍스트 없음',
                            textLength: (item.text || item.data?.text || '').length,
                            전체구조: {
                                max: item.max,
                                min: item.min,
                                dataBitMax: item.dataBitMax,
                                dataBitMin: item.dataBitMin,
                                data: item.data
                            },
                            추출시도결과: { 
                                max: itemBitsMax, 
                                min: itemBitsMin,
                                max유효성: Number.isFinite(itemBitsMax) ? '유효' : '무효',
                                min유효성: Number.isFinite(itemBitsMin) ? '유효' : '무효'
                            }
                        },
                        권장사항: '이 데이터는 서버에서 수동으로 확인하거나 정리해야 할 수 있습니다.'
                    };
                    
                    console.warn('[속성 삭제] 유효하지 않은 데이터 BIT 값 - 건너뜀:', debugInfo);
                    
                    // 로그에도 기록 (addLeftLog가 있는 경우)
                    if (typeof window.addLeftLog === 'function') {
                        const preview = (item.text || item.data?.text || '텍스트 없음').substring(0, 30);
                        window.addLeftLog('warn', `[속성 삭제] BIT 값 없음으로 건너뜀: "${preview}${preview.length >= 30 ? '...' : ''}"`);
                    }
                    
                    continue;
                }
                
                const itemBits = { max: itemBitsMax, min: itemBitsMin };
                
                try {
                    const url = getServerUrl('/api/attributes/data/delete');
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            attributeBitMax: attrMax,
                            attributeBitMin: attrMin,
                            dataBitMax: itemBits.max,
                            dataBitMin: itemBits.min
                        })
                    });
                    
                    if (response.ok) {
                        const result = await response.json().catch(() => ({ ok: true }));
                        if (result && result.ok) {
                            deletedCount++;
                        } else {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }
                } catch (e) {
                    console.error('[속성 삭제] 데이터 삭제 오류:', e);
                    errorCount++;
                }
            }
            
            if (errorCount === 0) {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('info', `[좌측 삭제] 속성 삭제 완료: ${deletedCount}개 데이터 삭제됨`);
                }
                console.log(`[속성 삭제] 완료: ${deletedCount}개 데이터 삭제`);
            } else {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('warn', `[좌측 삭제] 속성 삭제 일부 실패: ${deletedCount}개 성공, ${errorCount}개 실패`);
                }
            }
            
            setTimeout(async () => {
                if (typeof window.loadAttributes === 'function') {
                    await window.loadAttributes();
                }
            }, 500);
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 삭제] 속성 삭제 오류: ${error.message}`);
            }
            console.error('[속성 삭제] 오류:', error);
            alert(`✗ 삭제 실패: ${error.message}`);
            setTimeout(async () => {
                if (typeof window.loadAttributes === 'function') {
                    await window.loadAttributes();
                }
            }, 300);
        }
    };
    
    // 소설 삭제 함수
    window.deleteNovel = async function(novelTitle, novelBitMax, novelBitMin) {
        try {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('info', `[좌측 삭제] 소설 삭제 시작: "${novelTitle}"`);
            }
            console.log('[소설 삭제] 시작:', { novelTitle, novelBitMax, novelBitMin });
            
            if (!novelTitle) {
                throw new Error('소설 제목이 없습니다.');
            }
            
            const attrUrl = getServerUrl('/api/attributes/all');
            const attrResponse = await fetch(attrUrl);
            
            if (!attrResponse.ok) {
                throw new Error(`속성 조회 실패: HTTP ${attrResponse.status}`);
            }
            
            const attrData = await attrResponse.json();
            const allAttributes = (attrData.ok && attrData.attributes) ? attrData.attributes : [];
            
            const novelAttributes = allAttributes.filter(attr => {
                const attrText = (attr.text || '').trim();
                return attrText.startsWith(novelTitle + ' →');
            });
            
            let deletedAttrCount = 0;
            let deletedDataCount = 0;
            let errorCount = 0;
            
            for (const attr of novelAttributes) {
                try {
                    console.log(`[소설 삭제] 속성 "${attr.text}" 처리 시작 (BIT: ${attr.bitMax}, ${attr.bitMin})`);
                    
                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=1000`);
                    const dataResponse = await fetch(dataUrl);
                    
                    let dataItems = [];
                    if (dataResponse.ok) {
                        const dataData = await dataResponse.json();
                        dataItems = (dataData.ok && dataData.items) ? dataData.items : [];
                    }
                    
                    console.log(`[소설 삭제] 속성 "${attr.text}"의 데이터 항목: ${dataItems.length}개`);
                    
                    for (const item of dataItems) {
                        let deleteDataMax = null;
                        let deleteDataMin = null;
                        
                        if (item.max !== null && item.max !== undefined && Number.isFinite(item.max)) {
                            deleteDataMax = item.max;
                        } else if (item.data?.bitMax !== null && item.data?.bitMax !== undefined && Number.isFinite(item.data.bitMax)) {
                            deleteDataMax = item.data.bitMax;
                        } else if (item.dataBitMax !== null && item.dataBitMax !== undefined && Number.isFinite(item.dataBitMax)) {
                            deleteDataMax = item.dataBitMax;
                        }
                        
                        if (item.min !== null && item.min !== undefined && Number.isFinite(item.min)) {
                            deleteDataMin = item.min;
                        } else if (item.data?.bitMin !== null && item.data?.bitMin !== undefined && Number.isFinite(item.data.bitMin)) {
                            deleteDataMin = item.data.bitMin;
                        } else if (item.dataBitMin !== null && item.dataBitMin !== undefined && Number.isFinite(item.dataBitMin)) {
                            deleteDataMin = item.dataBitMin;
                        }
                        
                        if (!Number.isFinite(deleteDataMax) || !Number.isFinite(deleteDataMin)) {
                            // 디버깅을 위한 상세 정보 수집
                            const debugInfo = {
                                메시지: 'BIT 값이 모두 null이거나 유효하지 않은 데이터 항목입니다. 이 항목은 삭제에서 제외됩니다.',
                                속성정보: {
                                    text: attr.text,
                                    bitMax: attr.bitMax,
                                    bitMin: attr.bitMin
                                },
                                데이터항목정보: {
                                    id: item.id || 'ID 없음',
                                    text: item.text || item.data?.text || '텍스트 없음',
                                    textLength: (item.text || item.data?.text || '').length,
                                    전체구조: {
                                        max: item.max,
                                        min: item.min,
                                        dataBitMax: item.dataBitMax,
                                        dataBitMin: item.dataBitMin,
                                        data: item.data
                                    },
                                    추출시도결과: { 
                                        max: deleteDataMax, 
                                        min: deleteDataMin,
                                        max유효성: Number.isFinite(deleteDataMax) ? '유효' : '무효',
                                        min유효성: Number.isFinite(deleteDataMin) ? '유효' : '무효'
                                    }
                                },
                                권장사항: '이 데이터는 서버에서 수동으로 확인하거나 정리해야 할 수 있습니다.'
                            };
                            
                            console.warn('[소설 삭제] 유효하지 않은 데이터 BIT 값 - 건너뜀:', debugInfo);
                            continue;
                        }
                        
                        const attrMaxNum = Number(attr.bitMax);
                        const attrMinNum = Number(attr.bitMin);
                        const dataMaxNum = Number(deleteDataMax);
                        const dataMinNum = Number(deleteDataMin);
                        
                        try {
                            const deleteUrl = getServerUrl('/api/attributes/data/delete');
                            const deleteBody = {
                                attributeBitMax: attrMaxNum,
                                attributeBitMin: attrMinNum,
                                dataBitMax: dataMaxNum,
                                dataBitMin: dataMinNum
                            };
                            
                            const deleteResponse = await fetch(deleteUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(deleteBody)
                            });
                            
                            if (deleteResponse.ok) {
                                const result = await deleteResponse.json().catch(() => ({ ok: true }));
                                if (result && result.ok) {
                                    const count = result.deletedCount || 0;
                                    deletedDataCount += count;
                                    if (count > 0) {
                                        console.log(`[소설 삭제] ✓ ${count}개 데이터 삭제 성공`);
                                    }
                                } else {
                                    errorCount++;
                                }
                            } else {
                                errorCount++;
                            }
                        } catch (e) {
                            console.error('[소설 삭제] 데이터 삭제 오류:', e);
                            errorCount++;
                        }
                    }
                    
                    deletedAttrCount++;
                } catch (e) {
                    console.error(`[소설 삭제] 속성 "${attr.text}" 처리 오류:`, e);
                    errorCount++;
                }
            }
            
            if (errorCount === 0) {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('info', `[좌측 삭제] 소설 삭제 완료: ${deletedAttrCount}개 속성, ${deletedDataCount}개 데이터 삭제됨`);
                }
                console.log(`[소설 삭제] 완료: ${deletedAttrCount}개 속성, ${deletedDataCount}개 데이터 삭제`);
            } else {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('warn', `[좌측 삭제] 소설 삭제 일부 실패: ${deletedAttrCount}개 속성, ${deletedDataCount}개 데이터 삭제, ${errorCount}개 오류`);
                }
            }
            
            setTimeout(async () => {
                if (typeof window.loadNovelList === 'function') {
                    await window.loadNovelList();
                }
            }, 500);
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 삭제] 소설 삭제 오류: ${error.message}`);
            }
            console.error('[소설 삭제] 오류:', error);
            alert(`✗ 삭제 실패: ${error.message}`);
            setTimeout(async () => {
                if (typeof window.loadNovelList === 'function') {
                    await window.loadNovelList();
                }
            }, 500);
        }
    };
    
    // 전역 함수로 노출
    window.autoSave = autoSave;
    window.triggerAutoSave = triggerAutoSave;
    window.checkDuplicate = checkDuplicate;
    
    console.info('[우측 데이터 관리] 초기화 완료');
})();

