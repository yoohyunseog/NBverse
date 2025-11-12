document.addEventListener('DOMContentLoaded', () => {
    console.info('[속성/데이터 관리] 초기화 중...');
    
    // right_data_manager.js에 필요한 설정 전달
    if (typeof window.setRightDataManagerConfig === 'function') {
        window.setRightDataManagerConfig({
            getDOMElements: () => ({
                $novelTitleInput: $novelTitleInput,
                $attributeInput: $attributeInput,
                $dataInput: $dataInput,
                $attributeBitInfo: $attributeBitInfo,
                $dataBitInfo: $dataBitInfo,
                $saveStatus: $saveStatus,
                $attributeFilterInput: $attributeFilterInput,
                $additionalSearchInput: $additionalSearchInput
            }),
            getGlobalVariables: () => ({
                STORAGE_KEY_ATTRIBUTE_TEXT: STORAGE_KEY_ATTRIBUTE_TEXT,
                STORAGE_KEY_DATA_TEXT: STORAGE_KEY_DATA_TEXT,
                STORAGE_KEY_NOVEL_TITLE: STORAGE_KEY_NOVEL_TITLE
            }),
            getServerUrl: getServerUrl,
            calculateBitValues: calculateBitValues,
            updateSaveStatus: updateSaveStatus,
            loadAttributes: loadAttributes,
            loadNovelList: loadNovelList
        });
    }
    
    // DOM 요소
    const $attributeFilterInput = document.getElementById('attributeFilterInput');
    const $additionalSearchInput = document.getElementById('additionalSearchInput');
    const $additionalSearchBitInfo = document.getElementById('additionalSearchBitInfo');
    const $refreshBtn = document.getElementById('refreshBtn');
    const $clearFilterBtn = document.getElementById('clearFilterBtn');
    const $attributesList = document.getElementById('attributesList');
    
    const $novelTitleInput = document.getElementById('novelTitleInput');
    const $attributeInput = document.getElementById('attributeInput');
    const $dataInput = document.getElementById('dataInput');
    const $attributeBitInfo = document.getElementById('attributeBitInfo');
    const $dataBitInfo = document.getElementById('dataBitInfo');
    const $saveStatus = document.getElementById('saveStatus');
    
    // 자동 저장 관련 변수는 auto_save.js 모듈에서 관리
    
    // 입력 필드 값 저장을 위한 키
    const STORAGE_KEY_NOVEL_TITLE = 'novel_ai_input_novel_title';
    const STORAGE_KEY_ATTRIBUTE_TEXT = 'novel_ai_input_attribute_text';
    const STORAGE_KEY_DATA_TEXT = 'novel_ai_input_data_text';
    const STORAGE_KEY_NOVEL_TITLE_FOR_CHAPTER = 'novel_ai_input_novel_title_for_chapter';
    const $serverUrl = document.getElementById('serverUrl');
    const $serverStatus = document.getElementById('serverStatus');
    const $testConnectionBtn = document.getElementById('testConnectionBtn');
    
    // 입력 필드가 있는지 확인 (attribute_data.html에만 있음)
    const hasInputFields = $attributeInput && $dataInput;
    
    function storageGet(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (error) {
            console.warn('[Storage] get 실패:', key, error);
            return defaultValue;
        }
    }
    
    function storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.warn('[Storage] set 실패:', key, error);
        }
    }
    
    function storageRemove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('[Storage] remove 실패:', key, error);
        }
    }
    
    // BIT 값 계산 함수
    function calculateBitValues(text) {
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
    
    function updateAdditionalSearchBitInfo() {
        if (!$additionalSearchBitInfo) return;
        const text = ($additionalSearchInput && $additionalSearchInput.value || '').trim();
        if (!text) {
            $additionalSearchBitInfo.textContent = 'BIT: 키워드를 입력하세요';
            return;
        }
        if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
            $additionalSearchBitInfo.textContent = 'BIT: 계산 중...';
            return;
        }
        try {
            const bits = calculateBitValues(text);
            if (bits && bits.max != null && bits.min != null) {
                $additionalSearchBitInfo.textContent = `BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}`;
            } else {
                $additionalSearchBitInfo.textContent = 'BIT: 계산 실패';
            }
        } catch (e) {
            console.warn('[추가 검색 BIT] 계산 오류:', e);
            $additionalSearchBitInfo.textContent = 'BIT: 계산 실패';
        }
    }
    
    // 서버 URL 헬퍼
    function getServerUrl(path) {
        // config.js의 getServerUrl 사용 (로드 확인)
        // 무한 재귀 방지: window.getServerUrl이 이 함수 자체가 아닌지 확인
        if (typeof window.getServerUrl === 'function' && window.getServerUrl !== getServerUrl) {
            try {
                return window.getServerUrl(path);
            } catch (e) {
                console.warn('[getServerUrl] window.getServerUrl 호출 실패, 로컬 함수 사용:', e);
                // fallback to local implementation
            }
        }
        // config.js가 로드되지 않은 경우 또는 오류 발생 시 기본값 사용
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
    
    // 서버 연결 테스트
    async function testServerConnection(showStatus = true) {
        const url = getServerUrl('/api/attributes/all');
        
        if (showStatus && $serverUrl) {
            $serverUrl.textContent = `서버 URL: ${url}`;
        }
        
        if (showStatus && $serverStatus) {
            $serverStatus.textContent = '연결 상태: 확인 중...';
            $serverStatus.style.color = '#7c5cff';
        }
        
        try {
            console.log('[서버 연결 테스트] URL:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            console.log('[서버 연결 테스트] 응답 상태:', response.status);
            
            if (response.ok) {
                if (showStatus && $serverStatus) {
                    $serverStatus.textContent = '연결 상태: ✓ 연결됨';
                    $serverStatus.style.color = '#2bd576';
                }
                return true;
            } else {
                if (showStatus && $serverStatus) {
                    $serverStatus.textContent = `연결 상태: ✗ 오류 (${response.status})`;
                    $serverStatus.style.color = '#ef4444';
                }
                return false;
            }
        } catch (error) {
            console.error('[서버 연결 테스트] 실패:', error);
            
            if (showStatus && $serverStatus) {
                if (error.message === 'Failed to fetch') {
                    $serverStatus.innerHTML = '연결 상태: ✗ 연결 실패<br><small class="text-muted">서버가 실행 중인지 확인하세요</small>';
                } else {
                    $serverStatus.textContent = `연결 상태: ✗ 오류 (${error.message})`;
                }
                $serverStatus.style.color = '#ef4444';
            }
            
            return false;
        }
    }
    
    // 연결 테스트 버튼
    if ($testConnectionBtn) {
        $testConnectionBtn.addEventListener('click', async () => {
            $testConnectionBtn.disabled = true;
            $testConnectionBtn.textContent = '테스트 중...';
            await testServerConnection(true);
            $testConnectionBtn.disabled = false;
            $testConnectionBtn.textContent = '🔌 연결 테스트';
        });
    }
    
    // 중복 저장 체크 함수 (right_data_manager.js로 이동)
    async function checkDuplicate(attributeText, dataText, attributeBits, dataBits) {
        // right_data_manager.js의 함수 사용
        if (typeof window.checkDuplicate === 'function') {
            return await window.checkDuplicate(attributeText, dataText, attributeBits, dataBits);
        }
        // fallback (right_data_manager.js가 로드되지 않은 경우)
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
    
    // 챕터 구성을 서버에 저장하는 함수
    async function saveChapterStructure(novelTitle, chapters) {
        if (!novelTitle || !chapters || chapters.length === 0) {
            console.warn('[챕터 구성 저장] 저장할 데이터가 없습니다:', { novelTitle, chapters });
            return;
        }
        
        // 챕터 구성 정보를 JSON 형식으로 변환
        const chapterStructure = {
            chapters: chapters.map(ch => ({
                number: ch.number,
                title: ch.title,
                scenes: ch.scenes || []
            }))
        };
        const dataText = JSON.stringify(chapterStructure, null, 2);
        
        // 속성 텍스트: "소설 제목 → 챕터 구성"
        const attributeText = `${novelTitle} → 챕터 구성`;
        const fullAttributeText = attributeText; // 이미 전체 경로
        
        // BIT 값 계산
        const attributeBits = calculateBitValues(fullAttributeText);
        const dataBits = calculateBitValues(dataText);
        
        if (!attributeBits.max || !attributeBits.min) {
            console.warn('[챕터 구성 저장] BIT 값 계산 실패');
            return;
        }
        
        // 중복 체크 (같은 소설의 챕터 구성이 이미 저장되어 있는지 확인)
        const isDuplicate = await checkDuplicate(fullAttributeText, dataText, attributeBits, dataBits);
        if (isDuplicate) {
            console.log('[챕터 구성 저장] 이미 저장된 챕터 구성입니다:', { novelTitle });
            return;
        }
        
        try {
            const url = getServerUrl('/api/attributes/data');
            console.log('[챕터 구성 저장] 저장 시작:', { novelTitle, chapters: chapters.length });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    attributeText: fullAttributeText,
                    attributeBitMax: attributeBits.max,
                    attributeBitMin: attributeBits.min,
                    text: dataText,
                    dataBitMax: dataBits.max,
                    dataBitMin: dataBits.min,
                    novelTitle: novelTitle,
                    chapter: null, // 챕터 구성은 챕터 정보 없음
                    chapterBitMax: null,
                    chapterBitMin: null
                }),
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('[챕터 구성 저장] 저장 실패:', errorText);
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            if (result.ok) {
                console.log('[챕터 구성 저장] 저장 완료:', { novelTitle, chapters: chapters.length });
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('info', `[챕터 구성 저장] "${novelTitle} → 챕터 구성" 저장 완료`);
                }
            } else {
                console.warn('[챕터 구성 저장] 저장 실패:', result);
            }
        } catch (error) {
            console.error('[챕터 구성 저장] 오류:', error);
        }
    }
    
    // 자동 저장 함수는 auto_save.js 모듈로 이동됨
    // autoSave, saveAttributeAndData, triggerAutoSave 함수는 auto_save.js에서 제공됨
    // 아래 코드는 제거됨 - auto_save.js 참조
    let rightDataManagerAutoSave = null;
    async function autoSave() {
        // auto_save.js의 함수 사용 (순환 참조 방지를 위해 직접 참조)
        if (rightDataManagerAutoSave) {
            return await rightDataManagerAutoSave();
        }
        if (typeof window.autoSave === 'function' && window.autoSave !== autoSave) {
            // auto_save.js의 autoSave를 캐시
            rightDataManagerAutoSave = window.autoSave;
            return await rightDataManagerAutoSave();
        }
        // fallback은 원래 코드 유지 (auto_save.js가 로드되지 않은 경우)
        console.warn('[자동 저장] auto_save.js가 로드되지 않았습니다. 원래 함수를 사용합니다.');
        // 중요: 저장 시에는 항상 현재 입력 필드의 실제 값을 사용해야 함
        // 로컬 스토리지에서 값을 읽어오지 않고, DOM 요소의 .value를 직접 사용
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const attributeText = ($attributeInput && $attributeInput.value || '').trim();
        const dataText = ($dataInput && $dataInput.value || '').trim();
        
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
        
        console.log('[자동 저장] 호출:', { novelTitle, attributeText, dataText, dataText길이: dataText ? dataText.length : 0 });
        
        // 소설 제목과 속성 텍스트는 필수, 데이터 텍스트는 선택 (속성만 저장 가능)
        if (!novelTitle) {
            console.log('[자동 저장] 소설 제목이 없음 - 저장하지 않음');
            updateSaveStatus('⚠️ 소설 제목을 입력해주세요.', 'warning');
            return;
        }
        
        // 속성 텍스트가 비어있으면 추가 검색 키워드(현재 챕터 제목)를 사용
        let attributeTextToUse = attributeText.trim();
        if (!attributeTextToUse || attributeTextToUse.length === 0) {
            // 현재 챕터 제목 찾기 (여러 소스에서 확인)
            let currentChapterTitle = ($additionalSearchInput && $additionalSearchInput.value || '').trim();
            
            // 속성 필터에서도 챕터 정보 추출 시도
            if (!currentChapterTitle && $attributeFilterInput) {
                const filterText = ($attributeFilterInput.value || '').trim();
                // "소설 제목 → 챕터 N: 제목" 형식에서 챕터 부분 추출
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
                // 현재 챕터 제목을 속성 필드에 자동 설정 (소설 제목 포함)
                attributeTextToUse = currentChapterTitle;
                const fullAttributeTextForInput = `${novelTitle} → ${currentChapterTitle}`;
                if ($attributeInput) {
                    $attributeInput.value = fullAttributeTextForInput;
                    localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, fullAttributeTextForInput);
                    // additionalSearchInput도 업데이트
                    if ($additionalSearchInput) {
                        $additionalSearchInput.value = currentChapterTitle;
                    }
                    console.log('[자동 저장] 속성 필드가 비어있어서 현재 챕터 제목으로 자동 설정 (소설 제목 포함):', fullAttributeTextForInput);
                }
            } else {
                console.log('[자동 저장] 속성 텍스트가 비어있고 현재 챕터 정보도 없음 - 저장하지 않음', {
                    additionalSearchInput: $additionalSearchInput?.value,
                    attributeFilterInput: $attributeFilterInput?.value
                });
                updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
                return;
            }
        }
        
        // 속성은 1개만 사용 (여러 줄로 나뉘어 있으면 첫 번째만 사용)
        // 속성 텍스트가 여러 줄로 나뉘어 있는지 확인 (줄바꿈으로 구분)
        const attributeLines = attributeTextToUse.split('\n').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        let finalAttributeText = attributeTextToUse.trim();
        
        // 속성 텍스트가 여전히 비어있으면 저장하지 않음
        if (!finalAttributeText || finalAttributeText.length === 0) {
            console.log('[자동 저장] 속성 텍스트가 비어있음 - 저장하지 않음');
            updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
            return;
        }
        
        if (attributeLines.length > 1) {
            // 여러 줄이 있으면 첫 번째 줄만 사용
            finalAttributeText = attributeLines[0].trim();
            if ($attributeInput && finalAttributeText !== attributeText) {
                $attributeInput.value = finalAttributeText;
                updateSaveStatus('⚠️ 속성은 1개만 사용됩니다. 첫 번째 속성만 저장됩니다.', 'warning');
                // 수정된 값으로 재시도 (auto_save.js의 triggerAutoSave 사용)
                if (typeof window.triggerAutoSave === 'function') {
                    setTimeout(() => window.triggerAutoSave(), 500);
                }
                return;
            }
        }
        
        // 실제 저장할 속성 텍스트: 소설 제목 + 속성 텍스트 (BIT 계산용)
        // 속성 텍스트가 이미 소설 제목으로 시작하는지 확인하여 중복 방지
        let fullAttributeText;
        if (finalAttributeText.startsWith(`${novelTitle} → `)) {
            // 이미 소설 제목이 포함되어 있으면 그대로 사용
            fullAttributeText = finalAttributeText;
        } else if (finalAttributeText.length > 0) {
            // 소설 제목이 없고 속성 텍스트가 있으면 추가
            fullAttributeText = `${novelTitle} → ${finalAttributeText}`;
        } else {
            // 속성 텍스트가 비어있으면 저장하지 않음
            console.log('[자동 저장] 속성 텍스트가 비어있음 - 저장하지 않음');
            updateSaveStatus('⚠️ 속성 텍스트를 입력해주세요.', 'warning');
            return;
        }
        
        // 저장할 속성 텍스트 (소설 제목 제외): 서버에 전송할 때 사용
        // fullAttributeText에서 소설 제목 부분을 제거
        let attributeTextOnly = finalAttributeText;
        if (fullAttributeText.startsWith(`${novelTitle} → `)) {
            // 소설 제목으로 시작하면 제거
            attributeTextOnly = fullAttributeText.substring(`${novelTitle} → `.length).trim();
        } else {
            // 소설 제목이 없으면 그대로 사용
            attributeTextOnly = fullAttributeText;
        }
        
        // 디버깅: 저장 전 속성 텍스트 확인
        console.log('[자동 저장] 저장할 속성 텍스트:', {
            novelTitle,
            원래속성텍스트: attributeText,
            사용할속성텍스트: attributeTextToUse,
            finalAttributeText,
            fullAttributeText: fullAttributeText, // BIT 계산용 (소설 제목 포함)
            attributeTextOnly: attributeTextOnly, // 저장용 (소설 제목 제외)
            중복제거: finalAttributeText.startsWith(`${novelTitle} → `),
            속성필드값: $attributeInput?.value,
            현재챕터제목_추가검색: $additionalSearchInput?.value,
            현재챕터제목_속성필터: $attributeFilterInput?.value,
            fullAttributeText에서챕터추출: fullAttributeText.split(' → ').length >= 2 ? fullAttributeText.split(' → ')[1] : '없음'
        });
        
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('info', `[자동 저장] 우측 패널에서 자동 저장을 시작합니다: "${novelTitle}" → "${finalAttributeText.substring(0, 50)}${finalAttributeText.length > 50 ? '...' : ''}"`);
        }
        
        // 속성 텍스트가 여전히 비어있으면 경고
        if (!finalAttributeText || finalAttributeText.trim().length === 0) {
            console.error('[자동 저장] 오류: finalAttributeText가 비어있습니다!', {
                attributeText,
                attributeTextToUse,
                attributeLines,
                finalAttributeText
            });
            updateSaveStatus('⚠️ 속성 텍스트가 비어있습니다. 속성 필드를 확인해주세요.', 'warning');
            return;
        }
        
        // "→"로 연결된 속성(예: "소설 제목 → 챕터 1: 제1장")은 1개 속성으로 봄
        
        // 이미 저장된 것과 동일하면 저장하지 않음 (속성 텍스트만 비교)
        if (attributeTextOnly === lastSavedAttribute && dataText === lastSavedData) {
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
            updateSaveStatus('⚠️ BIT 값 계산 중...', 'warning');
            return;
        }
        
        // 데이터가 있을 때는 dataBits도 필요
        if (hasDataText && (dataBits.max === null || dataBits.min === null)) {
            updateSaveStatus('⚠️ 데이터 BIT 값 계산 중...', 'warning');
            return;
        }
        
        // 중복 체크: dataText가 빈 문자열이어도 체크 가능
        const isDuplicate = await checkDuplicate(fullAttributeText, dataText || '', attributeBits, dataBits);
        if (isDuplicate) {
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[자동 저장] 중복 방지: 동일한 속성이 이미 저장되어 있어 저장을 건너뜁니다. "${attributeTextOnly.substring(0, 50)}${attributeTextOnly.length > 50 ? '...' : ''}"`);
            }
            updateSaveStatus('ℹ️ 이미 저장된 데이터입니다 (중복 방지)', 'info');
            lastSavedAttribute = attributeTextOnly; // 소설 제목 제외한 속성 텍스트만 저장
            lastSavedData = dataText;
            // 조회 목록 새로고침 (속성 필터는 변경하지 않고 현재 필터 유지)
            setTimeout(() => {
                if ($attributeFilterInput) {
                    // 필터가 이미 있으면 그대로 사용하여 새로고침만 함
                    if ($attributeFilterInput.value.trim()) {
                        loadAttributes();
                    }
                }
            }, 500);
            return;
        }
        
        // 챕터 정보 추출 (속성 구조에서 정확히 찾기)
        // fullAttributeText 형식: "소설 제목 → 챕터 N: 제목 → 속성명" 또는 "소설 제목 → 챕터 N: 제목"
        // 두 번째 부분(인덱스 1)에서만 챕터 정보를 찾아야 정확함
        let chapter = null;
        const parts = fullAttributeText.split(' → ').map(p => (p || '').trim()).filter(p => p && p.length > 0);
        
        console.log('[자동 저장] 챕터 정보 추출 시작:', {
            fullAttributeText,
            parts,
            partsLength: parts.length,
            parts_1: parts[1],
            parts_2: parts[2]
        });
        
        // 두 번째 부분(소설 제목 다음)에서 챕터 정보 찾기
        if (parts.length >= 2) {
            const chapterPart = parts[1]; // "챕터 2: 제2장" 또는 "챕터 2"
            const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
            
            console.log('[자동 저장] 챕터 파싱 시도:', {
                chapterPart,
                chapterMatch,
                match_1: chapterMatch?.[1],
                match_2: chapterMatch?.[2]
            });
            
            if (chapterMatch) {
                // 정규식 매칭 결과 확인: chapterMatch[0] = 전체 매칭, chapterMatch[1] = 챕터 번호, chapterMatch[2] = 제목
                const chapterNumber = chapterMatch[1]; // 문자열 "2"
                const chapterTitle = (chapterMatch[2] || '').trim();
                
                // 디버깅: 정규식 매칭 결과 확인
                console.log('[자동 저장] 정규식 매칭 결과:', {
                    전체매칭: chapterMatch[0],
                    챕터번호_매칭: chapterMatch[1],
                    제목_매칭: chapterMatch[2],
                    chapterPart: chapterPart,
                    추출된번호: chapterNumber,
                    추출된제목: chapterTitle
                });
                
                chapter = {
                    number: chapterNumber, // 문자열 그대로 사용 (서버에서 문자열로 저장)
                    title: chapterTitle || `제${chapterNumber}장`
                };
                console.log('[자동 저장] 챕터 정보 추출 완료 (속성 구조에서):', { 
                    fullAttributeText,
                    chapterPart,
                    chapterNumber: chapter.number, 
                    chapterTitle: chapter.title,
                    chapter객체: chapter,
                    타입_확인: typeof chapter.number
                });
            } else {
                console.warn('[자동 저장] 챕터 정보 추출 실패 - 정규식 매칭 안됨:', {
                    chapterPart,
                    fullAttributeText,
                    parts
                });
            }
        } else {
            console.warn('[자동 저장] 챕터 정보 추출 실패 - parts.length < 2:', {
                fullAttributeText,
                parts,
                partsLength: parts.length
            });
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
        } else {
            // 챕터 정보가 추출되었는지 최종 확인
            console.log('[자동 저장] 챕터 정보 최종 확인:', {
                chapter객체: chapter,
                chapterNumber: chapter.number,
                chapterTitle: chapter.title,
                fullAttributeText에서_확인: fullAttributeText.split(' → ')[1],
                일치여부: fullAttributeText.split(' → ')[1]?.includes(`챕터 ${chapter.number}`)
            });
            
            // 만약 fullAttributeText와 chapter 정보가 일치하지 않으면 경고
            const extractedChapterFromText = fullAttributeText.split(' → ')[1];
            if (extractedChapterFromText && !extractedChapterFromText.includes(`챕터 ${chapter.number}`)) {
                console.error('[자동 저장] ⚠️ 챕터 정보 불일치!', {
                    fullAttributeText,
                    extractedChapterFromText,
                    chapter객체: chapter,
                    chapterNumber: chapter.number
                });
            }
        }
        
        const chapterText = chapter ? `챕터 ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}` : '';
        const chapterBits = chapterText ? calculateBitValues(chapterText) : { max: null, min: null };
        
        isSaving = true;
        updateSaveStatus('💾 저장 중...', 'info');
        
        try {
            const url = getServerUrl('/api/attributes/data');
            console.log('[자동 저장] URL:', url);
            
            // chapter 객체 최종 검증 및 재추출 (혹시 모를 경우를 대비)
            if (!chapter || !chapter.number) {
                // fullAttributeText에서 다시 추출 시도
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
                        console.warn('[자동 저장] chapter 객체 재추출:', {
                            재추출chapter: chapter,
                            fullAttributeText,
                            finalChapterPart
                        });
                    }
                }
            }
            
            // chapter 객체가 여전히 없거나 잘못된 경우 경고
            if (!chapter || !chapter.number) {
                console.error('[자동 저장] ⚠️ chapter 객체가 없거나 잘못됨!', {
                    fullAttributeText,
                    finalAttributeText,
                    chapter,
                    parts: fullAttributeText.split(' → ')
                });
            } else if (chapter.number === '1' && fullAttributeText.includes('챕터 2')) {
                console.error('[자동 저장] ⚠️ 챕터 번호 불일치 감지!', {
                    fullAttributeText,
                    chapter객체: chapter,
                    chapterNumber: chapter.number,
                    fullAttributeText에_챕터2_포함: fullAttributeText.includes('챕터 2')
                });
                // fullAttributeText에서 챕터 2 정보를 다시 추출
                const recheckParts = fullAttributeText.split(' → ');
                if (recheckParts.length >= 2) {
                    const recheckChapterPart = recheckParts[1].trim();
                    const recheckMatch = recheckChapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                    if (recheckMatch && recheckMatch[1] !== '1') {
                        chapter = {
                            number: recheckMatch[1],
                            title: (recheckMatch[2] || '').trim() || `제${recheckMatch[1]}장`
                        };
                        console.log('[자동 저장] 챕터 정보 수정:', {
                            수정후: chapter,
                            fullAttributeText
                        });
                    }
                }
            }
            
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
                chapter: chapter,
                chapterBitMax: chapterBits.max,
                chapterBitMin: chapterBits.min
            };
            
            // 디버깅: 서버에 전송할 데이터 확인
            console.log('[자동 저장] 서버에 전송할 데이터 (최종):', {
                attributeText: requestBody.attributeText, // 소설 제목 제외한 속성 텍스트
                fullAttributeText: fullAttributeText, // BIT 계산용 전체 경로
                attributeBits: `${attributeBits.max}, ${attributeBits.min}`, // 전체 경로로 계산한 BIT
                chapter: requestBody.chapter,
                chapterNumber: requestBody.chapter?.number,
                chapterTitle: requestBody.chapter?.title,
                novelTitle: requestBody.novelTitle,
                chapter객체_타입: typeof requestBody.chapter?.number,
                chapter객체_값: JSON.stringify(requestBody.chapter)
            });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            
            console.log('[자동 저장] 응답 상태:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('[자동 저장] 오류:', errorText);
                updateSaveStatus(`✗ 저장 실패: ${errorText.substring(0, 50)}`, 'danger');
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            console.log('[자동 저장] 결과:', result);
            
            // 디버깅: 서버 응답에서 저장된 속성 확인
            // 서버 응답 구조: { ok: true, record: { attribute: { text: ... }, chapter: {...} }, files: {...} }
            const savedRecord = result.record || {};
            const savedAttribute = savedRecord.attribute || {};
            const savedChapter = savedRecord.chapter || {};
            
            if (result.ok && savedAttribute.text) {
                console.log('[자동 저장] 서버에 저장된 속성:', {
                    저장된_속성: savedAttribute.text,
                    저장한_속성: fullAttributeText,
                    저장된_챕터: savedChapter,
                    저장된_챕터_번호: savedChapter.number,
                    저장된_챕터_제목: savedChapter.title,
                    추출한_챕터: chapter,
                    추출한_챕터_번호: chapter?.number,
                    추출한_챕터_제목: chapter?.title,
                    일치여부_속성: savedAttribute.text === fullAttributeText,
                    일치여부_챕터번호: savedChapter.number === chapter?.number,
                    일치여부_챕터제목: savedChapter.title === chapter?.title,
                    전체_서버응답_record: JSON.stringify(savedRecord, null, 2)
                });
                
                // 챕터 정보가 일치하지 않으면 경고
                if (chapter && savedChapter.number !== chapter.number) {
                    console.error('[자동 저장] ⚠️ 챕터 번호 불일치!', {
                        클라이언트에서_보낸_챕터: chapter,
                        서버에서_저장된_챕터: savedChapter,
                        attributeText에서_추출된_챕터: fullAttributeText.split(' → ')[1]
                    });
                }
            }
            
            if (result.ok) {
                if (typeof window.addRightLog === 'function') {
                    // 저장된 속성 텍스트를 정확히 표시 (서버 응답의 record.attribute.text 사용)
                    const savedAttributeText = savedAttribute.text || attributeTextOnly;
                    const savedChapterInfo = savedChapter.number ? ` (챕터 ${savedChapter.number})` : '';
                    const hasData = hasDataText;
                    window.addRightLog('success', `[자동 저장] 저장 완료: ${hasData ? '속성과 데이터가' : '속성이'} 서버에 저장되었습니다. "${savedAttributeText.substring(0, 50)}${savedAttributeText.length > 50 ? '...' : ''}"${savedChapterInfo}`);
                    
                    // 속성 BIT 값 출력 (녹색) - 텍스트 포함
                    if (attributeBits && attributeBits.max !== null && attributeBits.min !== null) {
                        const attributeTextDisplay = finalAttributeText.length > 50 ? finalAttributeText.substring(0, 50) + '...' : finalAttributeText;
                        window.addRightLog('success', `[자동 저장] 속성 BIT (텍스트: "${attributeTextDisplay}"): MAX=${attributeBits.max.toFixed(15)}, MIN=${attributeBits.min.toFixed(15)}`);
                    }
                    
                    // 데이터 BIT 값 및 데이터 텍스트 출력 (녹색) - 텍스트 포함
                    if (hasData) {
                        if (dataBits && dataBits.max !== null && dataBits.min !== null) {
                            const dataTextDisplay = dataText.length > 50 ? dataText.substring(0, 50) + '...' : dataText;
                            window.addRightLog('success', `[자동 저장] 데이터 BIT (데이터 텍스트 "${dataTextDisplay}" 기준): MAX=${dataBits.max.toFixed(15)}, MIN=${dataBits.min.toFixed(15)}`);
                        } else {
                            window.addRightLog('warn', `[자동 저장] 데이터 BIT 값이 유효하지 않아 출력하지 않습니다.`);
                        }
                        const dataDisplay = dataText.length > 150 ? dataText.substring(0, 150) + '...' : dataText;
                        window.addRightLog('success', `[자동 저장] 저장된 데이터: "${dataDisplay}"`);
                    }
                }
                updateSaveStatus('✓ 저장 완료!', 'success');
                lastSavedAttribute = attributeTextOnly; // 소설 제목 제외한 속성 텍스트만 저장
                lastSavedData = dataText;
                
                // 챗봇 상단에 Novel AI 상태 업데이트
                if (typeof window.updateNovelAIStatus === 'function') {
                    updateNovelAIStatus({
                        novelTitle: novelTitle,
                        attributeText: finalAttributeText,
                        attributeBits: attributeBits,
                        dataText: dataText,
                        dataBits: dataBits,
                        filterText: ($attributeFilterInput && $attributeFilterInput.value || '').trim(),
                        additionalSearch: ($additionalSearchInput && $additionalSearchInput.value || '').trim(),
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
                
                // 저장 완료 후 서버에서 데이터 조회하여 저장 확인
                setTimeout(async () => {
                    try {
                        const verifyUrl = getServerUrl(`/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=10`);
                        const verifyResponse = await fetch(verifyUrl);
                        
                        if (verifyResponse.ok) {
                            const verifyResult = await verifyResponse.json();
                            
                            if (verifyResult.ok && verifyResult.items && verifyResult.items.length > 0) {
                                // 저장된 데이터 중에서 방금 저장한 데이터 찾기 (데이터 텍스트로 비교)
                                // 서버 응답 구조: { s: "데이터 텍스트", attribute: { text: "속성 텍스트" }, chapter: { number, title } }
                                const foundItem = verifyResult.items.find(item => {
                                    // 데이터 텍스트가 일치하는지 확인 (record.s 사용)
                                    const itemText = (item.s || item.data?.text || '').trim();
                                    const savedText = (dataText || '').trim();
                                    
                                    // 챕터 정보도 확인
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
                                    
                                    console.log('[자동 저장] ✅ 저장 확인 성공:', {
                                        조회된_속성: foundAttributeText,
                                        조회된_속성_BIT_MAX: foundAttributeBitMax,
                                        조회된_속성_BIT_MIN: foundAttributeBitMin,
                                        조회된_데이터: foundDataText,
                                        조회된_챕터: foundChapter.number ? `챕터 ${foundChapter.number}: ${foundChapter.title || ''}` : '없음',
                                        저장한_속성: attributeTextOnly, // 소설 제목 제외한 속성 텍스트
                                        저장한_데이터: dataText,
                                        저장한_챕터: chapter?.number ? `챕터 ${chapter.number}: ${chapter.title || ''}` : '없음',
                                        속성_일치: foundAttributeText === attributeTextOnly,
                                        데이터_일치: foundDataText === dataText,
                                        챕터_일치: foundChapter.number === (chapter?.number || savedChapter?.number)
                                    });
                                    
                                    if (typeof window.addRightLog === 'function') {
                                        const chapterInfo = foundChapter.number ? ` (챕터 ${foundChapter.number})` : '';
                                        const attributeMatch = foundAttributeText === attributeTextOnly ? '✓' : '⚠';
                                        const dataMatch = foundDataText === dataText ? '✓' : '⚠';
                                        const chapterMatch = foundChapter.number === (chapter?.number || savedChapter?.number) ? '✓' : '⚠';
                                        
                                        // 조회된 속성과 데이터를 상세히 출력
                                        const attributeDisplay = foundAttributeText.length > 60 ? foundAttributeText.substring(0, 60) + '...' : foundAttributeText;
                                        const dataDisplay = foundDataText.length > 80 ? foundDataText.substring(0, 80) + '...' : foundDataText;
                                        
                                        // 챕터 정보 비교 (먼저 출력)
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
                                        
                                        // 조회된 데이터 출력
                                        window.addRightLog('info', `[조회] 데이터: "${dataDisplay}"`);
                                        
                                        // 저장한 데이터와 비교
                                        if (foundDataText === dataText) {
                                            window.addRightLog('success', `[확인] 데이터 일치 ✓`);
                                        } else {
                                            const savedDataDisplay = dataText.length > 80 ? dataText.substring(0, 80) + '...' : dataText;
                                            window.addRightLog('warn', `[확인] 데이터 불일치 ⚠ 저장: "${savedDataDisplay}"`);
                                        }
                                        
                                        // 조회된 속성 출력 (BIT 값 포함)
                                        window.addRightLog('info', `[조회] 속성: "${attributeDisplay}"`);
                                        
                                        // 조회된 속성 BIT 값 출력 - 텍스트 포함
                                        if (foundAttributeBitMax !== null && foundAttributeBitMin !== null) {
                                            const foundAttributeDisplay = foundAttributeText.length > 50 ? foundAttributeText.substring(0, 50) + '...' : foundAttributeText;
                                            window.addRightLog('info', `[조회] 속성 BIT (텍스트: "${foundAttributeDisplay}"): MAX=${foundAttributeBitMax.toFixed(15)}, MIN=${foundAttributeBitMin.toFixed(15)}`);
                                        }
                                        
                                        // 저장한 속성과 비교 (소설 제목 제외한 속성 텍스트와 비교)
                                        if (foundAttributeText === attributeTextOnly) {
                                            window.addRightLog('success', `[확인] 속성 일치 ✓`);
                        } else {
                                            const savedAttributeDisplay = attributeTextOnly.length > 60 ? attributeTextOnly.substring(0, 60) + '...' : attributeTextOnly;
                                            window.addRightLog('warn', `[확인] 속성 불일치 ⚠ 저장: "${savedAttributeDisplay}"`);
                                        }
                                        
                                        // 일치 여부 요약 (마지막에 출력)
                                        window.addRightLog('info', `[자동 저장] 저장 확인 완료: 속성${attributeMatch} 데이터${dataMatch} 챕터${chapterMatch}${chapterInfo}`);
                                    }
                                    
                                    // 불일치가 있는 경우 경고
                                    if (foundAttributeText !== attributeTextOnly) {
                                        console.warn('[자동 저장] ⚠️ 속성 텍스트 불일치:', {
                                            저장한_속성: attributeTextOnly, // 소설 제목 제외
                                            조회된_속성: foundAttributeText
                                        });
                                    }
                                    if (foundDataText !== dataText) {
                                        console.warn('[자동 저장] ⚠️ 데이터 텍스트 불일치:', {
                                            저장한_데이터: dataText,
                                            조회된_데이터: foundDataText
                                        });
                                    }
                                    if (foundChapter.number !== (chapter?.number || savedChapter?.number)) {
                                        console.warn('[자동 저장] ⚠️ 챕터 번호 불일치:', {
                                            저장한_챕터: chapter?.number || savedChapter?.number,
                                            조회된_챕터: foundChapter.number
                                        });
                                    }
                                } else {
                                    console.warn('[자동 저장] ⚠️ 저장 확인 실패: 조회된 데이터 중에서 저장한 데이터를 찾을 수 없음', {
                                        조회된_항목수: verifyResult.items.length,
                                        조회된_항목들: verifyResult.items.map(item => ({
                                            속성: item.attribute?.text || '없음',
                                            데이터: item.s || item.data?.text || '없음',
                                            챕터: item.chapter?.number || '없음'
                                        })),
                                        저장한_데이터: dataText,
                                        저장한_챕터: chapter?.number || savedChapter?.number
                                    });
                                    
                                    if (typeof window.addRightLog === 'function') {
                                        window.addRightLog('warn', '[자동 저장] 저장 확인 실패: 저장한 데이터를 조회 결과에서 찾을 수 없습니다.');
                                    }
                                }
                            } else {
                                console.warn('[자동 저장] ⚠️ 저장 확인 실패: 조회된 데이터가 없음', {
                                    조회결과: verifyResult
                                });
                                
                                if (typeof window.addRightLog === 'function') {
                                    window.addRightLog('warn', '[자동 저장] 저장 확인 실패: 조회된 데이터가 없습니다.');
                                }
                            }
                        } else {
                            const errorText = await verifyResponse.text().catch(() => 'Unknown error');
                            console.error('[자동 저장] 저장 확인 오류:', errorText);
                        }
                    } catch (verifyError) {
                        console.error('[자동 저장] 저장 확인 중 오류 발생:', verifyError);
                    }
                }, 500); // 저장 후 0.5초 후에 확인
                
                // 저장 완료 후 상태만 업데이트
                setTimeout(() => {
                    updateSaveStatus('', '');
                }, 2000);
                
                // 자동 호출: 좌측 목록 새로고침 (저장 완료 후, 속성 필터는 변경하지 않음)
                setTimeout(() => {
                    // 속성 필터는 변경하지 않고 현재 필터 유지하면서 새로고침만 함
                    if ($attributeFilterInput) {
                        // 필터가 이미 있으면 그대로 사용하여 새로고침만 함
                        if ($attributeFilterInput.value.trim()) {
                            loadAttributes();
                        } else {
                            // 필터가 없으면 소설 목록 표시
                            loadNovelList();
                        }
                    } else {
                        // 속성 필터 입력 필드가 없으면 소설 목록 표시
                        loadNovelList();
                    }
                }, 500);
            } else {
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('error', `[자동 저장] 저장 실패: ${result.error || 'Unknown error'}`);
                }
                updateSaveStatus(`✗ 저장 실패: ${result.error || 'Unknown error'}`, 'danger');
            }
        } catch (error) {
            console.error('[자동 저장] 오류:', error);
            
            let errorMessage = error.message || 'Unknown error';
            if (error.message === 'Failed to fetch') {
                errorMessage = '서버 연결 실패';
            }
            
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('error', `[자동 저장] 저장 오류: ${errorMessage}`);
            }
            updateSaveStatus(`✗ 저장 오류: ${errorMessage}`, 'danger');
        } finally {
            isSaving = false;
        }
    }
    
    // 속성 입력 시 BIT 값 표시 및 자동 저장 트리거 (스위치 알고리즘 사용)
    if ($attributeInput) {
        let attributeValue1 = ''; // 현재 입력값
        let attributeValue2 = ''; // 이전 입력값
        let attributeValue3 = ''; // 정리된 텍스트
        let attributeSwitch = 0; // 스위치 상태
        
        // 초기값 설정
        attributeValue2 = $attributeInput.value || '';
        
        // setInterval로 입력값 변경 감지 및 BIT 계산
        setInterval(function() {
            attributeValue1 = $attributeInput.value || '';
            
            switch (attributeSwitch) {
                case 0:
                    // 현재값과 이전값 비교
                    if (attributeValue1 === attributeValue2) {
                        attributeSwitch = 0;
                    } else {
                        attributeSwitch = 1;
                    }
                    break;
                    
                case 1:
                    // 이전값 업데이트 및 정리된 텍스트 초기화
                    attributeSwitch = 2;
                    attributeValue2 = attributeValue1;
                    attributeValue3 = '';
            // 로컬 스토리지에 저장
                    localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, attributeValue2);
                    break;
                    
                case 2:
                    // 텍스트 정리 (공백 제거, trim)
                    attributeValue2 = attributeValue2.trim();
                    // 필요시 추가 정리 작업 수행
                    attributeValue3 = attributeValue2;
                    attributeSwitch = 3;
                    break;
                    
                case 3:
                    // BIT 값 계산 및 표시
                    if (attributeValue3) {
                const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                
                // 전체 속성 텍스트로 BIT 계산 (저장 시와 동일하게)
                        const fullAttributeText = novelTitle && attributeValue3 
                            ? `${novelTitle} → ${attributeValue3}` 
                            : attributeValue3;
                
                if (fullAttributeText) {
                    const bits = calculateBitValues(fullAttributeText);
                    if (bits.max !== null && bits.min !== null) {
                                // BIT 값과 조회된 데이터 개수 표시 (비동기로 조회)
                                // 먼저 "BIT: 계산 중..." 표시
                                if ($attributeBitInfo) {
                                    $attributeBitInfo.innerHTML = `
                                        <div>BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}</div>
                                        <div style="font-size: 0.9em; color: #666; margin-top: 4px;">조회 중...</div>
                                    `;
                                }
                                
                                // 조회된 데이터 개수 표시 및 자동 저장 (비동기)
                                (async () => {
                                    try {
                                        const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${bits.max}&bitMin=${bits.min}&limit=100`);
                                        console.log('[속성 BIT 조회] 조회 시작:', {
                                            url: dataUrl,
                                            bitMax: bits.max,
                                            bitMin: bits.min,
                                            fullAttributeText: fullAttributeText
                                        });
                                        
                                        const dataResponse = await fetch(dataUrl);
                                        
                                        if (dataResponse.ok) {
                                            const dataResult = await dataResponse.json();
                                            console.log('[속성 BIT 조회] 서버 응답:', {
                                                ok: dataResult.ok,
                                                count: dataResult.count,
                                                itemsLength: dataResult.items ? dataResult.items.length : 0,
                                                items: dataResult.items ? dataResult.items.slice(0, 3).map(item => ({
                                                    attribute: item.attribute?.text || '없음',
                                                    data: (item.s || item.data?.text || '').substring(0, 30),
                                                    bitMax: item.attribute?.bitMax || item.max || '없음',
                                                    bitMin: item.attribute?.bitMin || item.min || '없음'
                                                })) : []
                                            });
                                            
                                            if (dataResult.ok) {
                                                const dataCount = dataResult.count || (dataResult.items ? dataResult.items.length : 0);
                                                
                                                // BIT 값과 조회된 데이터 개수 함께 표시
                                                if ($attributeBitInfo) {
                                                    $attributeBitInfo.innerHTML = `
                                                        <div>BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}</div>
                                                        <div style="font-size: 0.9em; color: #666; margin-top: 4px;">조회된 데이터: ${dataCount}개</div>
                                                    `;
                                                }
                                                
                                                console.log('[속성 BIT 조회] 조회된 데이터 개수:', dataCount, {
                                                    countFromServer: dataResult.count,
                                                    itemsLength: dataResult.items ? dataResult.items.length : 0,
                                                    finalCount: dataCount
                                                });
                                                
                                                // 조회된 데이터가 0개이면 저장 (데이터 입력값 유무에 따라 다르게 처리)
                                                if (dataCount === 0) {
                                                    const currentDataText = ($dataInput && $dataInput.value || '').trim();
                                                    
                                                    console.log('[자동 저장] 조회된 데이터 0개 - 저장 시작:', {
                                                        속성: attributeValue3,
                                                        fullAttributeText: fullAttributeText,
                                                        데이터입력값있음: !!currentDataText
                                                    });
                                                    
                                                    // 속성 텍스트에서 소설 제목 제거 (저장용)
                                                    let attributeTextOnly = attributeValue3;
                                                    if (fullAttributeText.startsWith(`${novelTitle} → `)) {
                                                        attributeTextOnly = fullAttributeText.substring(`${novelTitle} → `.length).trim();
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
                                                    
                                                    const chapterText = chapter ? `챕터 ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}` : '';
                                                    const chapterBits = chapterText ? calculateBitValues(chapterText) : { max: null, min: null };
                                                    
                                                    try {
                                                        const url = getServerUrl('/api/attributes/data');
                                                        const novelTitleBits = novelTitle ? calculateBitValues(novelTitle) : { max: null, min: null };
                                                        
                                                        // 데이터 입력값이 있으면 데이터와 함께 저장, 없으면 데이터 없이 저장
                                                        // text 필드는 항상 문자열로 보장 (빈 문자열도 허용)
                                                        let saveText = '';
                                                        let saveDataBitMax = null;
                                                        let saveDataBitMin = null;
                                                        
                                                        if (currentDataText && currentDataText.trim().length > 0) {
                                                            // 데이터 입력값이 있으면 데이터와 함께 저장
                                                            saveText = String(currentDataText);
                                                            const dataBitResult = calculateBitValues(saveText);
                                                            saveDataBitMax = dataBitResult.max;
                                                            saveDataBitMin = dataBitResult.min;
                                                        } else {
                                                            // 데이터 입력값이 없으면 데이터 없이 저장 (빈 문자열)
                                                            saveText = ''; // 명시적으로 빈 문자열
                                                            saveDataBitMax = null;
                                                            saveDataBitMin = null;
                                                        }
                                                        
                                                        const requestBody = {
                                                            attributeText: fullAttributeText,
                                                            attributeBitMax: bits.max,
                                                            attributeBitMin: bits.min,
                                                            text: saveText, // 항상 문자열 (빈 문자열 포함)
                                                            dataBitMax: saveDataBitMax,
                                                            dataBitMin: saveDataBitMin,
                                                            novelTitle: novelTitle,
                                                            novelTitleBitMax: novelTitleBits.max,
                                                            novelTitleBitMin: novelTitleBits.min,
                                                            chapter: chapter,
                                                            chapterBitMax: chapterBits.max,
                                                            chapterBitMin: chapterBits.min
                                                        };
                                                        
                                                        console.log('[자동 저장] attribute_data.js에서 저장 요청:', {
                                                            attributeText: requestBody.attributeText,
                                                            text: requestBody.text,
                                                            textType: typeof requestBody.text,
                                                            textLength: requestBody.text.length,
                                                            currentDataText: currentDataText,
                                                            currentDataTextType: typeof currentDataText,
                                                            requestBodyJSON: JSON.stringify(requestBody).substring(0, 300)
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
                                                            console.error('[자동 저장] attribute_data.js 저장 실패:', {
                                                                status: response.status,
                                                                errorText: errorText,
                                                                requestBody: requestBody,
                                                                textValue: requestBody.text,
                                                                textType: typeof requestBody.text
                                                            });
                                                            if (typeof window.addRightLog === 'function') {
                                                                window.addRightLog('error', `[자동 저장] 저장 실패: ${errorText.substring(0, 100)}`);
                                                            }
                                                            return;
                                                        }
                                                        
                                                        const result = await response.json().catch(() => ({}));
                                                        if (result.ok) {
                                                                if (currentDataText) {
                                                                    console.log('[자동 저장] 저장 완료 (속성+데이터):', attributeTextOnly);
                                                                    if (typeof window.addRightLog === 'function') {
                                                                        window.addRightLog('success', `[자동 저장] 저장 완료: 속성과 데이터가 서버에 저장되었습니다. "${attributeTextOnly.substring(0, 50)}${attributeTextOnly.length > 50 ? '...' : ''}"`);
                                                                        
                                                                        // 속성 BIT 값 출력 (녹색) - 텍스트 포함
                                                                        if (bits && bits.max !== null && bits.min !== null) {
                                                                            const attributeTextDisplay = attributeValue3.length > 50 ? attributeValue3.substring(0, 50) + '...' : attributeValue3;
                                                                            window.addRightLog('success', `[자동 저장] 속성 BIT (텍스트: "${attributeTextDisplay}"): MAX=${bits.max.toFixed(15)}, MIN=${bits.min.toFixed(15)}`);
                                                                        }
                                                                        
                                                                        // 데이터 BIT 값 및 데이터 텍스트 출력 (녹색) - 텍스트 포함
                                                                        if (saveDataBitMax !== null && saveDataBitMin !== null) {
                                                                            const dataTextDisplay = currentDataText.length > 50 ? currentDataText.substring(0, 50) + '...' : currentDataText;
                                                                            window.addRightLog('success', `[자동 저장] 데이터 BIT (데이터 텍스트 "${dataTextDisplay}" 기준): MAX=${saveDataBitMax.toFixed(15)}, MIN=${saveDataBitMin.toFixed(15)}`);
                                                                        } else {
                                                                            window.addRightLog('warn', `[자동 저장] 데이터 BIT 값이 유효하지 않아 출력하지 않습니다.`);
                                                                        }
                                                                        const dataDisplay = currentDataText.length > 150 ? currentDataText.substring(0, 150) + '...' : currentDataText;
                                                                        window.addRightLog('success', `[자동 저장] 저장된 데이터: "${dataDisplay}"`);
                                                                    }
                                                                    
                                                                    // 저장 후 데이터 입력값 초기화
                                                                    if ($dataInput) {
                                                                        $dataInput.value = '';
                                                                        $dataInput.style.height = 'auto';
                                                                        if ($dataBitInfo) {
                                                                            $dataBitInfo.textContent = 'BIT: 계산 중...';
                                                                        }
                                                                        localStorage.removeItem(STORAGE_KEY_DATA_TEXT);
                                                                    }
                                                                } else {
                                                                    console.log('[자동 저장] 저장 완료 (속성만):', attributeTextOnly);
                                                                    if (typeof window.addRightLog === 'function') {
                                                                        window.addRightLog('success', `[자동 저장] 저장 완료: 속성만 서버에 저장되었습니다. (데이터 없음) "${attributeTextOnly.substring(0, 50)}${attributeTextOnly.length > 50 ? '...' : ''}"`);
                                                                        
                                                                        // 속성 BIT 값 출력 (녹색) - 텍스트 포함
                                                                        if (bits && bits.max !== null && bits.min !== null) {
                                                                            const attributeTextDisplay = attributeValue3.length > 50 ? attributeValue3.substring(0, 50) + '...' : attributeValue3;
                                                                            window.addRightLog('success', `[자동 저장] 속성 BIT (텍스트: "${attributeTextDisplay}"): MAX=${bits.max.toFixed(15)}, MIN=${bits.min.toFixed(15)}`);
                                                                        }
                                                                    }
                                                                }
                                                                
                                                                // BIT 정보 업데이트 (조회된 데이터 개수 갱신)
                                                                setTimeout(async () => {
                                                                    try {
                                                                        const refreshUrl = getServerUrl(`/api/attributes/data?bitMax=${bits.max}&bitMin=${bits.min}&limit=100`);
                                                                        const refreshResponse = await fetch(refreshUrl);
                                                                        if (refreshResponse.ok) {
                                                                            const refreshResult = await refreshResponse.json();
                                                                            if (refreshResult.ok) {
                                                                                const refreshCount = refreshResult.count || (refreshResult.items ? refreshResult.items.length : 0);
                                                                                if ($attributeBitInfo) {
                                                                                    $attributeBitInfo.innerHTML = `
                                                                                        <div>BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}</div>
                                                                                        <div style="font-size: 0.9em; color: #666; margin-top: 4px;">조회된 데이터: ${refreshCount}개</div>
                                                                                    `;
                                                                                }
                                                                            }
                                                                        }
                                                                    } catch (e) {
                                                                        console.error('[자동 저장] 개수 갱신 오류:', e);
                                                                    }
                                                                }, 500);
                                                            }
                                                        else {
                                                            console.error('[자동 저장] attribute_data.js 저장 실패: result.ok가 false', result);
                                                            if (typeof window.addRightLog === 'function') {
                                                                window.addRightLog('error', `[자동 저장] 저장 실패: ${result.error || 'Unknown error'}`);
                                                            }
                                                        }
                                                    } catch (error) {
                                                        console.error('[자동 저장] 저장 오류:', error);
                                                        if (typeof window.addRightLog === 'function') {
                                                            window.addRightLog('error', `[자동 저장] 저장 오류: ${error.message || error}`);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        console.error('[속성 BIT 조회] 데이터 개수 조회 오류:', error, {
                                            bitMax: bits.max,
                                            bitMin: bits.min,
                                            fullAttributeText: fullAttributeText,
                                            errorMessage: error.message,
                                            errorStack: error.stack
                                        });
                                        // 오류 시 BIT 값과 오류 메시지 표시
                                        if ($attributeBitInfo) {
                                            $attributeBitInfo.innerHTML = `
                                                <div>BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}</div>
                                                <div style="font-size: 0.9em; color: #f00; margin-top: 4px;">조회 오류: ${error.message || '알 수 없는 오류'}</div>
                                            `;
                                        }
                                    }
                                })();
                            } else {
                                if ($attributeBitInfo) {
                        $attributeBitInfo.textContent = 'BIT: 계산 중...';
                                }
                    }
                } else {
                            if ($attributeBitInfo) {
                    $attributeBitInfo.textContent = 'BIT: 계산 중...';
                            }
                        }
                        
                    }
                    attributeSwitch = 0;
                    break;
            }
        }, 500); // 500ms마다 체크
    }
    
    // 속성 텍스트와 데이터 텍스트 모두 입력되었을 때 자동 조회 및 저장 (스위치 알고리즘 사용)
    if ($attributeInput && $dataInput) {
        let saveValue1Attr = ''; // 현재 속성 입력값
        let saveValue2Attr = ''; // 이전 속성 입력값
        let saveValue1Data = ''; // 현재 데이터 입력값
        let saveValue2Data = ''; // 이전 데이터 입력값
        let saveValue3Attr = ''; // 정리된 속성 텍스트
        let saveValue3Data = ''; // 정리된 데이터 텍스트
        let saveSwitch = 0; // 스위치 상태
        
        // 초기값 설정
        saveValue2Attr = $attributeInput.value || '';
        saveValue2Data = $dataInput.value || '';
        
        // setInterval로 입력값 변경 감지 및 자동 조회/저장
        setInterval(async function() {
            saveValue1Attr = $attributeInput.value || '';
            saveValue1Data = $dataInput.value || '';
            
            switch (saveSwitch) {
                case 0:
                    // 속성과 데이터 모두 현재값과 이전값 비교
                    if (saveValue1Attr === saveValue2Attr && saveValue1Data === saveValue2Data) {
                        saveSwitch = 0;
                    } else {
                        // 둘 다 입력되어 있고 변경되었으면 진행
                        if (saveValue1Attr.trim() && saveValue1Data.trim()) {
                            saveSwitch = 1;
                        } else {
                            saveSwitch = 0;
                        }
                    }
                    break;
                    
                case 1:
                    // 이전값 업데이트 및 정리된 텍스트 초기화
                    saveSwitch = 2;
                    saveValue2Attr = saveValue1Attr;
                    saveValue2Data = saveValue1Data;
                    saveValue3Attr = '';
                    saveValue3Data = '';
                    break;
                    
                case 2:
                    // 텍스트 정리 (공백 제거, trim)
                    saveValue2Attr = saveValue2Attr.trim();
                    saveValue2Data = saveValue2Data.trim();
                    saveValue3Attr = saveValue2Attr;
                    saveValue3Data = saveValue2Data;
                    saveSwitch = 3;
                    break;
                    
                case 3:
                    // 조회 후 없으면 저장
                    if (saveValue3Attr && saveValue3Data) {
                        try {
                            const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                            
                            // 전체 속성 텍스트로 BIT 계산 (저장 시와 동일하게)
                            const fullAttributeText = novelTitle && saveValue3Attr 
                                ? `${novelTitle} → ${saveValue3Attr}` 
                                : saveValue3Attr;
                            
                            // 속성 텍스트에서 소설 제목 제거 (저장용)
                            let attributeTextOnly = saveValue3Attr;
                            if (fullAttributeText.startsWith(`${novelTitle} → `)) {
                                attributeTextOnly = fullAttributeText.substring(`${novelTitle} → `.length).trim();
                            }
                            
                            // BIT 값 계산
                            const attributeBits = calculateBitValues(fullAttributeText);
                            const dataBits = calculateBitValues(saveValue3Data);
                            
                            if (attributeBits.max && attributeBits.min) {
                                // 조회 수행
                                const checkUrl = getServerUrl(`/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=10`);
                                const checkResponse = await fetch(checkUrl);
                                
                                if (checkResponse.ok) {
                                    const checkResult = await checkResponse.json();
                                    
                                    // 저장된 데이터 중에서 동일한 속성과 데이터가 있는지 확인
                                    const foundItem = checkResult.items?.find(item => {
                                        const itemAttribute = (item.attribute?.text || '').trim();
                                        const itemData = (item.s || item.data?.text || '').trim();
                                        return itemAttribute === attributeTextOnly && itemData === saveValue3Data;
                                    });
                                    
                                    if (!foundItem) {
                                        // 조회 결과 없으면 저장
                                        console.log('[자동 조회/저장] 조회 결과 없음 - 저장 시작:', {
                                            속성: attributeTextOnly,
                                            데이터: saveValue3Data.substring(0, 50)
                                        });
                                        
                                        // 저장 수행 (기존 autoSave 로직 활용)
                                        await autoSave();
                                        
                                        // 저장 후 데이터 입력값 초기화
                                        if ($dataInput) {
                                            $dataInput.value = '';
                                            $dataInput.style.height = 'auto';
                                            // BIT 정보 초기화
                                            if ($dataBitInfo) {
                                                $dataBitInfo.textContent = 'BIT: 계산 중...';
                                            }
                                            // 로컬 스토리지에서도 제거
                                            localStorage.removeItem(STORAGE_KEY_DATA_TEXT);
                                            
                                            // 이전값도 초기화하여 다시 저장되지 않도록
                                            saveValue2Data = '';
                                            
                                            console.log('[자동 조회/저장] 저장 완료 후 데이터 입력값 초기화');
                                            
                                            if (typeof window.addRightLog === 'function') {
                                                window.addRightLog('info', `[자동 저장] 저장 완료: 속성과 데이터가 서버에 저장되었습니다. 데이터 입력 필드를 초기화합니다.`);
                                            }
                                        }
                                    } else {
                                        console.log('[자동 조회/저장] 조회 결과 있음 - 저장 건너뜀:', {
                                            속성: attributeTextOnly,
                                            데이터: saveValue3Data.substring(0, 50)
                                        });
                                        
                                        if (typeof window.addRightLog === 'function') {
                                            window.addRightLog('info', `[자동 저장] 중복 방지: 동일한 속성과 데이터가 이미 저장되어 있어 저장을 건너뜁니다.`);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('[자동 조회/저장] 오류:', error);
                        }
                    }
                    saveSwitch = 0;
                    break;
            }
        }, 500); // 500ms마다 체크
    }
    
    // 챕터 목록 컨테이너 및 소설 제목 입력 필드
    const $chapterListContainer = document.getElementById('chapterListContainer');
    const $novelTitleInputForChapter = document.getElementById('novelTitleInputForChapter');
    
    // 챕터 네비게이션 함수 (전역으로 노출)
    window.showPrevChapter = async function(novelTitle) {
        const storageKey = `chapterListIndex_${novelTitle}`;
        const countKey = `chapterListCount_${novelTitle}`;
        let chapterCount = parseInt(storageGet(countKey, '0') || '0', 10);
        if (!Number.isFinite(chapterCount) || chapterCount <= 0) {
            await loadChapterList(novelTitle);
            chapterCount = parseInt(storageGet(countKey, '0') || '0', 10);
        }
        let currentIndex = parseInt(storageGet(storageKey, '0') || '0', 10);
        if (currentIndex > 0) {
            currentIndex--;
            storageSet(storageKey, String(currentIndex));
            await loadChapterList(novelTitle);
        }
    };
    
    // 다음 챕터로 단순 이동 (요약 생성 없음)
    window.showNextChapter = async function(novelTitle) {
        const storageKey = `chapterListIndex_${novelTitle}`;
        const countKey = `chapterListCount_${novelTitle}`;
        let chapterCount = parseInt(storageGet(countKey, '0') || '0', 10);
        if (!Number.isFinite(chapterCount) || chapterCount <= 0) {
            await loadChapterList(novelTitle);
            chapterCount = parseInt(storageGet(countKey, '0') || '0', 10);
        }
        let currentIndex = parseInt(storageGet(storageKey, '0') || '0', 10);
        if (!Number.isFinite(chapterCount) || chapterCount <= 0) {
            return;
        }
        if (currentIndex < chapterCount - 1) {
            currentIndex++;
            storageSet(storageKey, String(currentIndex));
            await loadChapterList(novelTitle);
        }
    };
    
    // 요약 버튼 클릭 시 요약 생성 및 다음 챕터로 이동
    window.showSummaryChapter = async function(novelTitle) {
        console.log('[요약 챕터] 버튼 클릭됨:', novelTitle);
        
        if (!novelTitle) {
            console.error('[요약 챕터] 소설 제목이 없습니다.');
            return;
        }
        
        const storageKey = `chapterListIndex_${novelTitle}`;
        const countKey = `chapterListCount_${novelTitle}`;
        let currentIndex = parseInt(storageGet(storageKey, '0') || '0', 10);
        console.log('[요약 챕터] 현재 인덱스:', currentIndex);
        
        try {
            // 챕터 구성 데이터 가져오기
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (!response.ok) {
                console.warn('[요약 챕터] 속성 목록 조회 실패:', response.status);
                return;
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                console.warn('[요약 챕터] 속성 데이터 없음');
                return;
            }
            
            // "챕터 구성" 속성 찾기
            const chapterStructureAttr = data.attributes.find(attr => {
                const attrText = (attr.text || '').trim();
                if (!attrText || !attrText.includes(' → ')) return false;
                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                return parts.length === 2 && parts[0] === novelTitle && parts[1] === '챕터 구성';
            });
            
            if (!chapterStructureAttr) {
                console.warn('[요약 챕터] 챕터 구성 속성을 찾을 수 없습니다.');
                return;
            }
            
            // 챕터 구성 데이터 가져오기
            const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${chapterStructureAttr.bitMax}&bitMin=${chapterStructureAttr.bitMin}&limit=1`);
            const dataResponse = await fetch(dataUrl);
            
            if (!dataResponse.ok) {
                console.warn('[요약 챕터] 챕터 구성 데이터 조회 실패:', dataResponse.status);
                return;
            }
            
            const dataData = await dataResponse.json();
            if (!dataData.ok || !dataData.items || dataData.items.length === 0) {
                console.warn('[요약 챕터] 챕터 구성 데이터가 없습니다.');
                return;
            }
            
            // 챕터 구성 파싱
            let chapterStructureData;
            try {
                const item = dataData.items[0];
                const chapterDataText = item.s || item.data?.text || item.text || '{}';
                chapterStructureData = JSON.parse(chapterDataText);
            } catch (parseError) {
                console.error('[요약 챕터] JSON 파싱 오류:', parseError, { item: dataData.items[0] });
                return;
            }
            
            const chapters = chapterStructureData.chapters || [];
            storageSet(countKey, String(chapters.length));
            console.log('[요약 챕터] 챕터 수:', chapters.length, '현재 인덱스:', currentIndex);
            
            // 현재 챕터의 요약 생성 (저장하지 않음)
            let summaryText = null;
            if (currentIndex >= 0 && currentIndex < chapters.length) {
                summaryText = await generateChapterSummaryWithoutSave(novelTitle, chapters, currentIndex);
            }
            
            // 범위 체크: 다음 인덱스가 유효한지 확인
            if (currentIndex + 1 >= chapters.length) {
                // 마지막 챕터이면 새 챕터 생성
                console.log('[요약 챕터] 마지막 챕터입니다. 새 챕터를 생성합니다.');
                
                // 새 챕터 번호 계산 (마지막 챕터 번호 + 1)
                const lastChapter = chapters[chapters.length - 1];
                const lastChapterNum = parseInt(lastChapter.number || String(chapters.length), 10);
                const newChapterNum = lastChapterNum + 1;
                
                // 새 챕터 생성 (과거 줄거리 목록 추가)
                const newChapter = {
                    number: String(newChapterNum),
                    title: `제${newChapterNum}장`,
                    scenes: ['과거 줄거리', '배경 설정', '감정/분위기', '테마/주제', '스타일/톤', '주요 사건', '등장인물', '스토리']
                };
                
                // 챕터 목록에 추가
                chapters.push(newChapter);
                storageSet(countKey, String(chapters.length));
                
                // 챕터 구성 저장
                await saveChapterStructure(novelTitle, chapters);
                
                // 인덱스 증가 (새 챕터로 이동)
                currentIndex++;
                storageSet(storageKey, String(currentIndex));
                
                // 챕터 목록 다시 로드
                await loadChapterList(novelTitle);
                
                // 새 챕터 선택
                const chapterFullTitle = `챕터 ${newChapter.number}: ${newChapter.title}`;
                await selectChapterItem(novelTitle, chapterFullTitle);
                
                // 요약 텍스트가 있으면 대화 상자에 N/B AI 응답으로 표시 (GPT AI가 응답하지 않고, N/B AI가 응답)
                if (summaryText) {
                    // N/B AI 응답 중 상태로 설정 (GPT AI 응답 차단)
                    if (typeof window.setNBAIResponding === 'function') {
                        window.setNBAIResponding(true);
                    }
                    
                    // 대화 상자에 N/B AI 응답으로 표시 (GPT AI가 아닌 N/B AI)
                    if (typeof window.appendMessage === 'function') {
                        window.appendMessage('assistant', summaryText, false, 'nb');
                        console.log('[요약 챕터] 대화 상자에 N/B AI 응답으로 요약 표시 완료');
                    }
                    
                    // N/B AI 응답 완료 상태로 설정 (응답 표시 후)
                    setTimeout(() => {
                        if (typeof window.setNBAIResponding === 'function') {
                            window.setNBAIResponding(false);
                        }
                    }, 100);
                    
                // 속성 필드에 속성 입력 (다음 챕터의 과거 줄거리 속성, 소설 제목 포함)
                    const pastSummaryAttribute = `${novelTitle} → ${chapterFullTitle} → 과거 줄거리`;
                    if ($attributeInput) {
                        // 속성 필드에 소설 제목 포함하여 전체 경로 입력
                        $attributeInput.value = pastSummaryAttribute;
                    storageSet(STORAGE_KEY_ATTRIBUTE_TEXT, pastSummaryAttribute);
                        // 속성 입력 이벤트 트리거
                        const attributeInputEvent = new Event('input', { bubbles: true });
                        $attributeInput.dispatchEvent(attributeInputEvent);
                    }
                    
                    // 데이터 텍스트 필드는 비워두고 사용자가 대화 상자에서 복사해서 입력하도록 함
                    // (데이터 텍스트 필드에 직접 입력하지 않음)
                    if (typeof window.addRightLog === 'function') {
                        window.addRightLog('info', `[요약 챕터] 대화 상자에 요약이 표시되었습니다. 복사하여 데이터 텍스트 필드에 입력하세요.`);
                    }
                }
                
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('info', `[새 챕터 생성] ${chapterFullTitle} 생성 완료`);
                }
            } else {
                // 인덱스 증가
                currentIndex++;
                storageSet(storageKey, String(currentIndex));
                storageSet(countKey, String(chapters.length));
                console.log('[요약 챕터] 인덱스 증가:', currentIndex);
                
                // 챕터 목록 다시 로드 (인덱스 업데이트 후)
                await loadChapterList(novelTitle);
                
                // 현재 챕터 정보로 자동 선택
                if (currentIndex < chapters.length) {
                    const currentChapter = chapters[currentIndex];
                    const chapterFullTitle = `챕터 ${currentChapter.number}: ${currentChapter.title}`;
                    console.log('[요약 챕터] 챕터 선택:', chapterFullTitle);
                    
                    // 자동으로 챕터 선택 함수 호출
                    await selectChapterItem(novelTitle, chapterFullTitle);
                    
                    // 요약 텍스트가 있으면 대화 상자에 N/B AI 응답으로 표시 (GPT AI가 응답하지 않고, N/B AI가 응답)
                    if (summaryText) {
                        // N/B AI 응답 중 상태로 설정 (GPT AI 응답 차단)
                        if (typeof window.setNBAIResponding === 'function') {
                            window.setNBAIResponding(true);
                        }
                        
                        // 대화 상자에 N/B AI 응답으로 표시 (GPT AI가 아닌 N/B AI)
                        if (typeof window.appendMessage === 'function') {
                            window.appendMessage('assistant', summaryText, false, 'nb');
                            console.log('[요약 챕터] 대화 상자에 N/B AI 응답으로 요약 표시 완료');
                        }
                        
                        // N/B AI 응답 완료 상태로 설정 (응답 표시 후)
                        setTimeout(() => {
                            if (typeof window.setNBAIResponding === 'function') {
                                window.setNBAIResponding(false);
                            }
                        }, 100);
                        
                        // 속성 필드에 속성 입력 (다음 챕터의 과거 줄거리 속성, 소설 제목 포함)
                        const pastSummaryAttribute = `${novelTitle} → ${chapterFullTitle} → 과거 줄거리`;
                        if ($attributeInput) {
                            // 속성 필드에 소설 제목 포함하여 전체 경로 입력
                            $attributeInput.value = pastSummaryAttribute;
                            localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, pastSummaryAttribute);
                            // 속성 입력 이벤트 트리거
                            const attributeInputEvent = new Event('input', { bubbles: true });
                            $attributeInput.dispatchEvent(attributeInputEvent);
                        }
                        
                        // 데이터 텍스트 필드는 비워두고 사용자가 대화 상자에서 복사해서 입력하도록 함
                        // (데이터 텍스트 필드에 직접 입력하지 않음)
                        if (typeof window.addRightLog === 'function') {
                            window.addRightLog('info', `[요약 챕터] 대화 상자에 요약이 표시되었습니다. 복사하여 데이터 텍스트 필드에 입력하세요.`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[요약 챕터] 오류:', error);
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('error', `[요약 챕터] 오류: ${error.message}`);
            }
        }
    };
    
    // 챕터 항목 클릭 시 속성 필드에 입력 (전체 경로)
    window.selectChapterItem = async function(novelTitle, chapterTitle) {
        // 속성 필드에 소설 제목 입력 (자동 저장 트리거 없이)
        if ($novelTitleInput) {
            // 값만 변경하고 이벤트는 트리거하지 않음 (제목 변경 시 자동 저장 방지)
            $novelTitleInput.value = novelTitle;
            // 로컬 스토리지만 저장
            localStorage.setItem(STORAGE_KEY_NOVEL_TITLE, novelTitle);
            
            // 속성 입력란의 BIT 값만 재계산 (input 이벤트는 트리거하지 않음)
            if ($attributeInput) {
                const attributeValue = $attributeInput.value || '';
                if (attributeValue) {
                    const fullAttributeText = `${novelTitle} → ${attributeValue}`;
                    const attributeBits = calculateBitValues(fullAttributeText);
                    if (attributeBits.max !== null && attributeBits.min !== null && $attributeBitInfo) {
                        $attributeBitInfo.textContent = `BIT: ${attributeBits.max.toFixed(15)}, ${attributeBits.min.toFixed(15)}`;
                    }
                }
            }
        }
        
        // 챕터 제목에서 챕터 번호 추출
        const chapterMatch = chapterTitle.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
        if (!chapterMatch) {
            console.warn('[챕터 선택] 챕터 형식 파싱 실패:', chapterTitle);
            return;
        }
        
        const chapterNum = chapterMatch[1];
        const chapterTitleOnly = chapterMatch[2] || `제${chapterNum}장`;
        const chapterFullTitle = `챕터 ${chapterNum}: ${chapterTitleOnly}`;
        
        // 챕터 제목 클릭 시에는 "소설 제목 → 챕터 N: 제목" 형식으로 입력 (소설 제목 포함)
        // 속성 입력란에 소설 제목 포함하여 전체 경로 입력
        const fullAttributeTextForInput = `${novelTitle} → ${chapterFullTitle}`;
        if ($attributeInput) {
            $attributeInput.value = fullAttributeTextForInput;
            // 로컬 스토리지에 저장
            localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, fullAttributeTextForInput);
            
            // BIT 값 재계산 및 표시 (일관성 있게 처리)
            const attributeBits = calculateBitValues(fullAttributeTextForInput);
            if (attributeBits.max !== null && attributeBits.min !== null && $attributeBitInfo) {
                $attributeBitInfo.textContent = `BIT: ${attributeBits.max.toFixed(15)}, ${attributeBits.min.toFixed(15)}`;
            }
            
            // 자동 저장은 우측 입력값을 통해서만 실행됨
            // 여기서는 자동 저장하지 않음
        }
        
        if ($dataInput) {
            $dataInput.value = "";
            $dataInput.style.height = "auto";
            localStorage.removeItem(STORAGE_KEY_DATA_TEXT);
            if ($dataBitInfo) {
                $dataBitInfo.textContent = "BIT: 계산 중...";
            }
        }

        // 대화 상자에 챕터의 모든 속성과 데이터 추가
        await appendChapterAllDataToChatInput(novelTitle, chapterFullTitle, chapterNum);
        
        // 챕터 데이터 로드 후에도 속성 입력란에 소설 제목 포함하여 유지되도록 보장
        if ($attributeInput && $attributeInput.value !== fullAttributeTextForInput) {
            $attributeInput.value = fullAttributeTextForInput;
            localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, fullAttributeTextForInput);
        }
        
        // 좌측 속성 필터에 소설 제목 입력
        if ($attributeFilterInput) {
            $attributeFilterInput.value = novelTitle;
            // 이벤트 트리거하여 속성 목록 로드
            const inputEvent = new Event('input', { bubbles: true });
            $attributeFilterInput.dispatchEvent(inputEvent);
        }
        
        // 좌측 추가 검색 키워드에 챕터 제목 입력
        if ($additionalSearchInput) {
            $additionalSearchInput.value = chapterFullTitle;
            // 필터 저장
            saveFilterValues();
            // 이벤트 트리거하여 속성 목록 로드
            const inputEvent = new Event('input', { bubbles: true });
            $additionalSearchInput.dispatchEvent(inputEvent);
        }
        
        // 챕터 목록에서 총 챕터 수 가져오기
        let totalChapters = 0;
        try {
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.ok && data.attributes) {
                    const chapterSet = new Set();
                    for (const attr of data.attributes) {
                        const attrText = (attr.text || '').trim();
                        if (!attrText || !attrText.includes(' → ')) continue;
                        const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                        if (parts.length < 2) continue;
                        const attrNovelTitle = parts[0];
                        if (attrNovelTitle !== novelTitle) continue;
                        const chapterPart = parts[1];
                        const chapterMatch2 = chapterPart.match(/챕터\s*(\d+)/i);
                        if (chapterMatch2) {
                            chapterSet.add(chapterMatch2[1]);
                        }
                    }
                    totalChapters = chapterSet.size;
                }
            }
        } catch (error) {
            console.warn('[챕터 선택] 챕터 수 조회 오류:', error);
        }
        
        // 챗봇 상단에 상태 표시
        if (typeof window.updateNovelAIStatus === 'function') {
            const attributeBits = calculateBitValues(chapterFullTitle);
            window.updateNovelAIStatus({
                novelTitle: novelTitle,
                attributeText: chapterFullTitle,
                attributeBits: attributeBits,
                dataText: null,
                dataBits: null,
                filterText: novelTitle,
                additionalSearch: chapterFullTitle,
                saveTime: new Date(),
                chapterInfo: {
                    currentChapter: chapterFullTitle,
                    chapterNumber: chapterNum,
                    totalChapters: totalChapters
                }
            });
        }
        
        console.log('[챕터 선택] 챕터 제목 입력:', { novelTitle, chapterNum, chapterTitleOnly });
    };
    
    // 장면 항목 클릭 시 속성 필드에 입력 (전체 경로 포함, 현재 챕터 번호 확인)
    window.selectSceneItem = async function(novelTitle, sceneText, currentChapterNum) {
        // 속성 필드에 소설 제목 입력 (자동 저장 트리거 없이)
        if ($novelTitleInput) {
            // 값만 변경하고 이벤트는 트리거하지 않음 (제목 변경 시 자동 저장 방지)
            $novelTitleInput.value = novelTitle;
            // 로컬 스토리지만 저장
            localStorage.setItem(STORAGE_KEY_NOVEL_TITLE, novelTitle);
        }
        
        // 현재 챕터 제목 찾기 (loadChapterList와 동일한 방식으로 챕터 정보 수집)
        let currentChapterTitle = null;
        if (currentChapterNum) {
            try {
                const url = getServerUrl('/api/attributes/all');
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.ok && data.attributes) {
                        // loadChapterList와 동일한 방식으로 챕터 정보 수집
                        const chapterMap = new Map(); // chapterKey -> { number, title, scenes: [] }
                        
                        for (const attr of data.attributes) {
                            const attrText = (attr.text || '').trim();
                            if (!attrText || !attrText.includes(' → ')) continue;
                            
                            const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                            if (parts.length < 2) continue;
                            
                            const attrNovelTitle = parts[0];
                            if (attrNovelTitle !== novelTitle) continue;
                            
                            const chapterPart = parts[1];
                            const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                            if (chapterMatch) {
                                const chapterNum = chapterMatch[1];
                                const chapterTitle = chapterMatch[2] || `제${chapterNum}장`;
                                const chapterKey = `챕터 ${chapterNum}`;
                                
                                // 해당 챕터 번호에 대한 정보만 저장 (여러 속성에서 같은 챕터 정보가 나올 수 있음)
                                if (!chapterMap.has(chapterKey)) {
                                    chapterMap.set(chapterKey, {
                                        number: chapterNum,
                                        title: chapterTitle
                                    });
                                } else {
                                    // 이미 저장된 챕터가 있으면, 제목이 있는 것을 우선 (제목 없이 저장된 경우 대비)
                                    const existing = chapterMap.get(chapterKey);
                                    if (!existing.title || existing.title === `제${chapterNum}장`) {
                                        if (chapterTitle && chapterTitle !== `제${chapterNum}장`) {
                                            existing.title = chapterTitle;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 챕터 정보가 없으면 기본값 사용 (loadChapterList와 동일)
                        const chapterKey = `챕터 ${currentChapterNum}`;
                        if (chapterMap.has(chapterKey)) {
                            const chapter = chapterMap.get(chapterKey);
                            currentChapterTitle = `챕터 ${currentChapterNum}: ${chapter.title}`;
                        } else {
                            // 챕터 정보가 없으면 기본값 사용
                            currentChapterTitle = `챕터 ${currentChapterNum}: 제${currentChapterNum}장`;
                        }
                    }
                }
            } catch (error) {
                console.warn('[장면 선택] 챕터 제목 찾기 오류:', error);
                // 오류 발생 시 기본값 사용
                if (currentChapterNum) {
                    currentChapterTitle = `챕터 ${currentChapterNum}: 제${currentChapterNum}장`;
                }
            }
        }
        
        // 장면 텍스트가 전체 경로의 일부인지 확인하고, 전체 경로 찾기 (현재 챕터 번호 확인)
        try {
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                if (data.ok && data.attributes) {
                    // 해당 소설의 해당 챕터의 해당 장면을 포함하는 전체 경로 찾기
                    let fullPath = null;
                    
                    for (const attr of data.attributes) {
                        const attrText = (attr.text || '').trim();
                        if (!attrText || !attrText.includes(' → ')) continue;
                        
                        const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                        if (parts.length < 2) continue;
                        
                        const attrNovelTitle = parts[0];
                        if (attrNovelTitle !== novelTitle) continue;
                        
                        // 챕터 번호 확인
                        const chapterPart = parts[1];
                        const attrChapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                        if (!attrChapterMatch) continue;
                        
                        const attrChapterNum = parseInt(attrChapterMatch[1], 10);
                        // 현재 챕터 번호와 정확히 일치하는 것만 선택
                        if (currentChapterNum && attrChapterNum !== parseInt(currentChapterNum, 10)) {
                            continue;
                        }
                        
                        // 장면 텍스트가 속성 경로의 어느 부분에 포함되어 있는지 확인
                        const attributePath = parts.slice(1).join(' → ');
                        
                        // 장면 텍스트가 경로에 포함되어 있는지 확인
                        if (attributePath.includes(sceneText)) {
                            // 챕터 제목에서 직접 장면으로 연결하는 경로 생성 (중간 단계 제거)
                            // 예: "챕터 1: 제1장 → 감정/분위기" (개요 제거)
                            const chapterTitle = parts[1]; // "챕터 1: 제1장"
                            const cleanPath = `${chapterTitle} → ${sceneText}`;
                            
                            // 이미 설정된 경로가 없거나, 더 짧고 직접적인 경로인 경우 선택
                            if (!fullPath || cleanPath.length <= fullPath.length) {
                                fullPath = cleanPath;
                            }
                        }
                    }
                    
                    // 속성 텍스트 필드에 입력 (소설 제목 포함)
                    // 챕터 구성 목록에서 클릭한 장면 텍스트를 직접 사용 (저장된 경로 무시)
                    if ($attributeInput) {
                        // 소설 제목, 챕터 제목, 장면 텍스트를 모두 포함
                        // 예: "다크 판타지 → 챕터 1: 제1장 → 감정/분위기"
                        let finalValue = sceneText;
                        if (currentChapterTitle) {
                            // 챕터 제목이 있으면 "소설 제목 → 챕터 제목 → 장면" 형태로 입력
                            finalValue = `${novelTitle} → ${currentChapterTitle} → ${sceneText}`;
                        } else if (currentChapterNum) {
                            // 챕터 번호만 있으면 "소설 제목 → 챕터 N → 장면" 형태로 입력
                            finalValue = `${novelTitle} → 챕터 ${currentChapterNum} → ${sceneText}`;
                        } else {
                            // 챕터 정보가 없으면 "소설 제목 → 장면" 형태로 입력
                            finalValue = `${novelTitle} → ${sceneText}`;
                        }
                        
                        $attributeInput.value = finalValue;
                        // 로컬 스토리지에 저장
                        localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, finalValue);
                        
                        // BIT 값 재계산 및 표시 (일관성 있게 처리)
                        const attributeBits = calculateBitValues(finalValue);
                        if (attributeBits.max !== null && attributeBits.min !== null && $attributeBitInfo) {
                            $attributeBitInfo.textContent = `BIT: ${attributeBits.max.toFixed(15)}, ${attributeBits.min.toFixed(15)}`;
                        }
                        
                        // 자동 저장은 우측 입력값을 통해서만 실행됨
                        // 여기서는 자동 저장하지 않음
                    }
                    
                    // 대화 상자에 장면 정보 추가
                    const sceneAttributeText = currentChapterTitle 
                        ? `${novelTitle} → ${currentChapterTitle} → ${sceneText}`
                        : `${novelTitle} → 챕터 ${currentChapterNum} → ${sceneText}`;
                    appendAttributeToChatInput(sceneAttributeText);
                    
                    // 좌측 속성 필터에 소설 제목 입력
                    if ($attributeFilterInput) {
                        $attributeFilterInput.value = novelTitle;
                        // 이벤트 트리거하여 속성 목록 로드
                        const inputEvent = new Event('input', { bubbles: true });
                        $attributeFilterInput.dispatchEvent(inputEvent);
                    }
            
            // 좌측 추가 검색 키워드에 챕터 제목 입력
            if ($additionalSearchInput) {
                // currentChapterTitle이 있으면 사용, 없으면 currentChapterNum으로 생성
                let chapterTitleForSearch = currentChapterTitle;
                if (!chapterTitleForSearch && currentChapterNum) {
                    chapterTitleForSearch = `챕터 ${currentChapterNum}: 제${currentChapterNum}장`;
                }
                if (chapterTitleForSearch) {
                    $additionalSearchInput.value = chapterTitleForSearch;
                    // 필터 저장
                    saveFilterValues();
                    // 이벤트 트리거하여 속성 목록 로드
                    const inputEvent = new Event('input', { bubbles: true });
                    $additionalSearchInput.dispatchEvent(inputEvent);
                }
            }
            
            // 챗봇 상단에 상태 표시
            if (typeof window.updateNovelAIStatus === 'function') {
                const attributeBits = calculateBitValues(fullPath || sceneText);
                window.updateNovelAIStatus({
                    novelTitle: novelTitle,
                    attributeText: fullPath || sceneText,
                    attributeBits: attributeBits,
                    dataText: null,
                    dataBits: null,
                    filterText: novelTitle,
                    additionalSearch: currentChapterTitle || '',
                    saveTime: new Date(),
                    sceneInfo: {
                        sceneText: sceneText,
                        chapterNumber: currentChapterNum,
                        chapterTitle: currentChapterTitle
                    }
                });
            }
            
            console.log('[장면 선택] 전체 경로 입력:', { novelTitle, sceneText, currentChapterNum, currentChapterTitle, fullPath });
                } else {
                            // 속성을 찾을 수 없으면 소설 제목 포함하여 장면 텍스트 입력
                            if ($attributeInput) {
                                const fullAttributeText = `${novelTitle} → ${sceneText}`;
                                $attributeInput.value = fullAttributeText;
                                // 로컬 스토리지에 저장
                                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, fullAttributeText);
                                
                                // BIT 값 재계산 및 표시 (일관성 있게 처리)
                                const attributeBits = calculateBitValues(fullAttributeText);
                                if (attributeBits.max !== null && attributeBits.min !== null && $attributeBitInfo) {
                                    $attributeBitInfo.textContent = `BIT: ${attributeBits.max.toFixed(15)}, ${attributeBits.min.toFixed(15)}`;
                                }
                                
                                // 자동 저장은 우측 입력값을 통해서만 실행됨
                                // 여기서는 자동 저장하지 않음
                            }
                            
                            // 대화 상자에 장면 정보 추가 (else 블록)
                            const sceneAttributeTextElse = `${novelTitle} → ${sceneText}`;
                            appendAttributeToChatInput(sceneAttributeTextElse);
                    
                    // 좌측 필터도 설정
                    if ($attributeFilterInput) {
                        $attributeFilterInput.value = novelTitle;
                        const inputEvent = new Event('input', { bubbles: true });
                        $attributeFilterInput.dispatchEvent(inputEvent);
                    }
                    
                    // 좌측 추가 검색 키워드에 챕터 제목 입력
                    if ($additionalSearchInput) {
                        // currentChapterTitle이 있으면 사용, 없으면 currentChapterNum으로 생성
                        let chapterTitleForSearch = currentChapterTitle;
                        if (!chapterTitleForSearch && currentChapterNum) {
                            chapterTitleForSearch = `챕터 ${currentChapterNum}: 제${currentChapterNum}장`;
                        }
                        if (chapterTitleForSearch) {
                            $additionalSearchInput.value = chapterTitleForSearch;
                            // 필터 저장
                            saveFilterValues();
                            // 이벤트 트리거하여 속성 목록 로드
                            const inputEvent = new Event('input', { bubbles: true });
                            $additionalSearchInput.dispatchEvent(inputEvent);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[장면 선택] 오류:', error);
                    // 오류 시 소설 제목 포함하여 장면 텍스트 입력
                    if ($attributeInput) {
                        const fullAttributeText = `${novelTitle} → ${sceneText}`;
                        $attributeInput.value = fullAttributeText;
                        // 로컬 스토리지에 저장
                        localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, fullAttributeText);
                        const inputEvent = new Event('input', { bubbles: true });
                        $attributeInput.dispatchEvent(inputEvent);
                    }
            
            // 좌측 필터도 설정
            if ($attributeFilterInput) {
                $attributeFilterInput.value = novelTitle;
                const inputEvent = new Event('input', { bubbles: true });
                $attributeFilterInput.dispatchEvent(inputEvent);
            }
            
            // 좌측 추가 검색 키워드에 챕터 제목 입력 (오류 시에도)
            if ($additionalSearchInput) {
                // currentChapterTitle이 있으면 사용, 없으면 currentChapterNum으로 생성
                let chapterTitleForSearch = currentChapterTitle;
                if (!chapterTitleForSearch && currentChapterNum) {
                    chapterTitleForSearch = `챕터 ${currentChapterNum}: 제${currentChapterNum}장`;
                }
                if (chapterTitleForSearch) {
                    $additionalSearchInput.value = chapterTitleForSearch;
                    // 필터 저장
                    saveFilterValues();
                    // 이벤트 트리거하여 속성 목록 로드
                    const inputEvent = new Event('input', { bubbles: true });
                    $additionalSearchInput.dispatchEvent(inputEvent);
                }
            }
        }
    };
    
    // 챕터 목록 로드 함수
    async function loadChapterList(novelTitle) {
        if (!$chapterListContainer) return;
        
        if (!novelTitle || novelTitle.trim() === '') {
            $chapterListContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📖</div>
                    <div class="small text-muted">소설 제목을 입력하면 챕터 목록이 표시됩니다</div>
                </div>
            `;
            return;
        }
        
        try {
            $chapterListContainer.innerHTML = '<div class="text-center text-muted small">로딩 중...</div>';
            
            // 속성 목록 조회하여 해당 소설의 챕터 정보 추출
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                $chapterListContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📖</div>
                        <div class="small text-muted">챕터 정보를 찾을 수 없습니다</div>
                    </div>
                `;
                return;
            }
            
            // 속성 텍스트에서 챕터 구조 추출 (형식: "소설 제목 → 챕터 1: 제1장 → 속성")
            const chapterMap = new Map(); // chapterKey -> { number, title, scenes: [] }
            
            // 1. 먼저 "챕터 구성" 속성에서 챕터 정보 로드 (데이터 정리 후에도 유지되도록)
            const chapterStructureAttr = data.attributes.find(attr => {
                const attrText = (attr.text || '').trim();
                if (!attrText || !attrText.includes(' → ')) return false;
                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                return parts.length === 2 && parts[0] === novelTitle && parts[1] === '챕터 구성';
            });
            
            if (chapterStructureAttr) {
                // "챕터 구성" 속성의 데이터를 별도로 가져오기
                try {
                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${chapterStructureAttr.bitMax}&bitMin=${chapterStructureAttr.bitMin}&limit=1`);
                    const dataResponse = await fetch(dataUrl);
                    if (dataResponse.ok) {
                        const dataResult = await dataResponse.json();
                        if (dataResult.ok && dataResult.items && dataResult.items.length > 0) {
                            const item = dataResult.items[0];
                            // item.s 또는 item.data.text에서 데이터 가져오기
                            const chapterDataText = item.s || item.data?.text || '';
                            if (chapterDataText) {
                                try {
                                    const chapterStructureData = JSON.parse(chapterDataText);
                                    if (chapterStructureData && chapterStructureData.chapters && Array.isArray(chapterStructureData.chapters)) {
                                        for (const ch of chapterStructureData.chapters) {
                                            const chapterKey = `챕터 ${ch.number}`;
                                            if (!chapterMap.has(chapterKey)) {
                                                chapterMap.set(chapterKey, {
                                                    number: ch.number,
                                                    title: ch.title || `제${ch.number}장`,
                                                    scenes: Array.isArray(ch.scenes) ? [...ch.scenes] : []
                                                });
                                            } else {
                                                // 이미 있는 챕터는 장면 목록 병합 (중복 제거)
                                                const existing = chapterMap.get(chapterKey);
                                                if (Array.isArray(ch.scenes)) {
                                                    for (const scene of ch.scenes) {
                                                        if (!existing.scenes.includes(scene)) {
                                                            existing.scenes.push(scene);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        console.log('[챕터 목록] 챕터 구성에서 로드:', { chapters: chapterStructureData.chapters.length });
                                    } else {
                                        console.warn('[챕터 목록] 챕터 구성 데이터 형식 오류:', chapterStructureData);
                                    }
                                } catch (e) {
                                    console.warn('[챕터 목록] 챕터 구성 데이터 파싱 오류:', e, { chapterDataText: chapterDataText.substring(0, 100) });
                                }
                            } else {
                                console.warn('[챕터 목록] 챕터 구성 데이터가 없습니다:', { item });
                            }
                        } else {
                            console.warn('[챕터 목록] 챕터 구성 데이터 조회 결과 없음:', { dataResult });
                        }
                    }
                } catch (e) {
                    console.warn('[챕터 목록] 챕터 구성 데이터 로드 오류:', e);
                }
            }
            
            // 2. 실제 속성 데이터에서 챕터 정보 추출 및 장면 정보 보완
            for (const attr of data.attributes) {
                const attrText = (attr.text || '').trim();
                if (!attrText || !attrText.includes(' → ')) continue;
                
                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                if (parts.length < 2) continue;
                
                const attrNovelTitle = parts[0];
                if (attrNovelTitle !== novelTitle) continue;
                
                // "챕터 구성" 속성은 건너뛰기 (이미 처리함)
                if (parts.length === 2 && parts[1] === '챕터 구성') continue;
                
                const chapterPart = parts[1]; // "챕터 1: 제1장" 또는 "챕터 1"
                
                // 챕터 정보 파싱
                const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                if (chapterMatch) {
                    const chapterNum = chapterMatch[1];
                    const chapterTitle = chapterMatch[2] || `제${chapterNum}장`;
                    const chapterKey = `챕터 ${chapterNum}`;
                    
                    // 챕터가 없으면 추가
                    if (!chapterMap.has(chapterKey)) {
                        chapterMap.set(chapterKey, {
                            number: chapterNum,
                            title: chapterTitle,
                            scenes: []
                        });
                    } else {
                        // 제목이 더 정확하면 업데이트
                        const existing = chapterMap.get(chapterKey);
                        if (!existing.title || existing.title === `제${chapterNum}장`) {
                            if (chapterTitle && chapterTitle !== `제${chapterNum}장`) {
                                existing.title = chapterTitle;
                            }
                        }
                    }
                    
                    // 장면 정보 추가 (parts[2] 이상이 있으면)
                    if (parts.length > 2) {
                        // 전체 경로에서 마지막 장면만 추출 (중간 단계 제거)
                        // 예: "개요 → 테마/주제" -> "테마/주제"
                        const fullPath = parts.slice(2).join(' → ');
                        const sceneText = parts[parts.length - 1]; // 마지막 부분만 사용
                        const chapter = chapterMap.get(chapterKey);
                        // 중복 체크는 전체 경로로, 저장은 마지막 부분만
                        if (!chapter.scenes.includes(sceneText)) {
                            chapter.scenes.push(sceneText);
                        }
                    }
                }
            }
            
            // 챕터 목록 렌더링 (1개씩만 표시)
            let chapters = Array.from(chapterMap.values()).sort((a, b) => 
                Number(a.number) - Number(b.number)
            );
            
            // 챕터 구성이 없으면 자동 생성 (제목이 입력되어 있는 경우)
            if (chapters.length === 0 && novelTitle && novelTitle.trim()) {
                // 기본 챕터 구성 생성: 챕터 1: 제1장
                const defaultChapter = {
                    number: '1',
                    title: '제1장',
                    scenes: ['배경 설정', '감정/분위기', '테마/주제', '스타일/톤', '주요 사건', '등장인물', '스토리']
                };
                chapters = [defaultChapter];
                
                console.log('[챕터 목록] 챕터 구성 없음 - 기본 구성 자동 생성:', defaultChapter);
                
                // 자동 생성된 챕터 구성을 서버에 저장
                saveChapterStructure(novelTitle, chapters).catch(err => {
                    console.warn('[챕터 구성 저장] 오류:', err);
                });
            }
            
            if (chapters.length === 0) {
                $chapterListContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📖</div>
                        <div class="small text-muted">"${novelTitle}"의 챕터 정보를 찾을 수 없습니다</div>
                    </div>
                `;
                return;
            }
            
            // 현재 표시할 챕터 인덱스 (로컬 스토리지에 저장)
            const storageKey = `chapterListIndex_${novelTitle}`;
            let currentIndex = parseInt(storageGet(storageKey, '0') || '0', 10);
            if (currentIndex < 0 || currentIndex >= chapters.length) {
                currentIndex = 0;
                storageSet(storageKey, String(currentIndex));
            }
            
            const currentChapter = chapters[currentIndex];
            
            // 챕터 수 저장 (다음/이전 버튼 사용 시 활용)
            const chapterCountKey = `chapterListCount_${novelTitle}`;
            storageSet(chapterCountKey, String(chapters.length));
            
            // 네비게이션 버튼
            let html = '<div class="chapter-list">';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <button type="button" class="btn btn-sm btn-outline-light" ${currentIndex === 0 ? 'disabled' : ''} 
                            onclick="window.showPrevChapter('${escapeHtml(novelTitle).replace(/'/g, "\\'")}')" 
                            style="min-width: 60px;">
                        ← 이전
                    </button>
                    <span class="small text-muted">
                        ${currentIndex + 1} / ${chapters.length}
                    </span>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" class="btn btn-sm btn-outline-light" ${currentIndex >= chapters.length - 1 ? 'disabled' : ''}
                            onclick="window.showNextChapter('${escapeHtml(novelTitle).replace(/'/g, "\\'")}')" 
                            style="min-width: 60px;">
                        다음 →
                    </button>
                        <button type="button" class="btn btn-sm btn-outline-primary" 
                                onclick="window.showSummaryChapter('${escapeHtml(novelTitle).replace(/'/g, "\\'")}')" 
                                style="min-width: 60px;">
                            📝 요약
                        </button>
                    </div>
                </div>
            `;
            
            // 현재 챕터 표시 (클릭 가능)
            html += `
                <div class="chapter-item" style="padding: 10px; background: rgba(0, 0, 0, 0.2); border-radius: 5px;">
                    <div class="fw-bold mb-2" style="color: var(--accent); cursor: pointer; padding: 5px; border-radius: 3px; transition: background 0.2s;" 
                         onmouseover="this.style.background='rgba(124, 92, 255, 0.2)'" 
                         onmouseout="this.style.background='transparent'"
                         onclick="window.selectChapterItem('${escapeHtml(novelTitle).replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '챕터 ${currentChapter.number}: ${escapeHtml(currentChapter.title).replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">
                        챕터 ${currentChapter.number}: ${escapeHtml(currentChapter.title)}
                    </div>
                    ${currentChapter.scenes.length > 0 ? `
                        <div class="scene-list" style="margin-left: 10px; margin-top: 8px;">
                            ${currentChapter.scenes.map((scene, idx) => {
                                const sceneId = `scene-${currentChapter.number}-${idx}`;
                                // 안전하게 이스케이프된 값들 (줄바꿈, 특수문자 처리)
                                const novelTitleEscaped = String(novelTitle || '')
                                    .replace(/\\/g, '\\\\')
                                    .replace(/'/g, "\\'")
                                    .replace(/"/g, '&quot;')
                                    .replace(/\n/g, ' ')
                                    .replace(/\r/g, '');
                                const sceneEscaped = String(scene || '')
                                    .replace(/\\/g, '\\\\')
                                    .replace(/'/g, "\\'")
                                    .replace(/"/g, '&quot;')
                                    .replace(/\n/g, ' ')
                                    .replace(/\r/g, '');
                                return `
                                <div class="scene-item small text-muted" style="margin-bottom: 4px; cursor: pointer; padding: 3px; border-radius: 3px; transition: background 0.2s;" 
                                     onmouseover="this.style.background='rgba(124, 92, 255, 0.15)'" 
                                     onmouseout="this.style.background='transparent'"
                                     onclick="window.selectSceneItem('${novelTitleEscaped}', '${sceneEscaped}', ${currentChapter.number})">
                                    • ${escapeHtml(scene)}
                                </div>
                            `;
                            }).join('')}
                        </div>
                    ` : '<div class="small text-muted">장면 정보 없음</div>'}
                </div>
            `;
            html += '</div>';
            
            $chapterListContainer.innerHTML = html;
        } catch (error) {
            console.error('[챕터 목록 로드] 오류:', error);
            $chapterListContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="small text-danger">로드 오류: ${error.message}</div>
                </div>
            `;
        }
    }
    
    // 챕터 목록용 소설 제목 입력 필드 이벤트
    if ($novelTitleInputForChapter) {
        let chapterListTimer = null;
        $novelTitleInputForChapter.addEventListener('input', () => {
            // 챕터 목록 로드 (디바운싱)
            clearTimeout(chapterListTimer);
            chapterListTimer = setTimeout(() => {
                const novelTitle = ($novelTitleInputForChapter.value || '').trim();
                loadChapterList(novelTitle);
            }, 500);
        });
    }
    
    // 소설 제목 입력 시에도 속성 BIT 값 업데이트 및 챕터 목록 로드
    if ($novelTitleInput) {
        let chapterListTimer2 = null;
        let novelTitleTimer = null;
        $novelTitleInput.addEventListener('input', () => {
            // 로컬 스토리지에 저장
            const value = $novelTitleInput.value || '';
            localStorage.setItem(STORAGE_KEY_NOVEL_TITLE, value);
            
            // 속성 입력란의 이벤트 트리거하여 BIT 값 재계산
            if ($attributeInput) {
                const inputEvent = new Event('input', { bubbles: true });
                $attributeInput.dispatchEvent(inputEvent);
            }
            
            // 챕터 목록용 소설 제목 입력 필드도 동기화
            if ($novelTitleInputForChapter) {
                $novelTitleInputForChapter.value = $novelTitleInput.value;
                localStorage.setItem(STORAGE_KEY_NOVEL_TITLE_FOR_CHAPTER, $novelTitleInput.value || '');
                const inputEvent = new Event('input', { bubbles: true });
                $novelTitleInputForChapter.dispatchEvent(inputEvent);
            }
            
            // 제목 변경 시에는 자동 저장하지 않음 (챕터 구성 목록에서 클릭할 때만 저장)
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
                if (text) {
                    const bits = calculateBitValues(text);
                    if (bits.max !== null && bits.min !== null) {
                        $dataBitInfo.textContent = `BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}`;
                    } else {
                        $dataBitInfo.textContent = 'BIT: 계산 중...';
                    }
                } else {
                    $dataBitInfo.textContent = 'BIT: 계산 중...';
                }
                
                // 자동 저장은 우측 입력값을 통해서만 실행됨
                // 여기서는 자동 저장하지 않음
            }, 300);
        });
    }
    
    // triggerAutoSave 함수는 auto_save.js 모듈로 이동됨
    // 아래 코드는 제거됨 - auto_save.js 참조
    let rightDataManagerTriggerAutoSave = null;
    function triggerAutoSave() {
        // auto_save.js의 함수 사용 (순환 참조 방지를 위해 직접 참조)
        if (rightDataManagerTriggerAutoSave) {
            return rightDataManagerTriggerAutoSave();
        }
        if (typeof window.triggerAutoSave === 'function' && window.triggerAutoSave !== triggerAutoSave) {
            // auto_save.js의 triggerAutoSave를 캐시
            rightDataManagerTriggerAutoSave = window.triggerAutoSave;
            return rightDataManagerTriggerAutoSave();
        }
        // fallback
        console.log('[자동 저장 트리거] 호출됨');
        if (typeof window.triggerAutoSave === 'function') {
            window.triggerAutoSave();
        }
    }
    
    
    // 상태 메시지 업데이트
    function updateSaveStatus(message, type) {
        if (!$saveStatus) return;
        $saveStatus.textContent = message;
        $saveStatus.className = 'mt-2 small';
        if (type === 'success') {
            $saveStatus.style.color = '#2bd576';
        } else if (type === 'danger') {
            $saveStatus.style.color = '#ef4444';
        } else if (type === 'info') {
            $saveStatus.style.color = '#7c5cff';
        } else if (type === 'warning') {
            $saveStatus.style.color = '#ffc857';
        } else {
            $saveStatus.style.color = '';
        }
        
        // 여러 줄 메시지 지원
        if (message.includes('\n')) {
            $saveStatus.style.whiteSpace = 'pre-wrap';
        } else {
            $saveStatus.style.whiteSpace = 'normal';
        }
    }
    
    // 소설 목록 로드 (속성 목록에서 소설 제목 추출)
    async function loadNovelList() {
        if (!$attributesList) return;
        
        $attributesList.innerHTML = '<div class="text-muted text-center">Novel AI 로딩 중...</div>';
        
        try {
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                $attributesList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📚</div>
                        <div>저장된 소설이 없습니다.</div>
                    </div>
                `;
                return;
            }
            
            // 속성 목록에서 소설 제목 추출 (형식: "소설 제목 → 챕터 → 속성")
            const novelSet = new Set();
            const novelMap = new Map(); // novelTitle -> { title, bitMax, bitMin, dataCount }
            
            for (const attr of data.attributes || []) {
                const attrText = (attr.text || '').trim();
                if (!attrText || !attrText.includes(' → ')) continue;
                
                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                if (parts.length < 1) continue;
                
                const novelTitle = parts[0];
                if (!novelTitle) continue;
                
                if (!novelMap.has(novelTitle)) {
                    novelMap.set(novelTitle, {
                        title: novelTitle,
                        bitMax: attr.bitMax,
                        bitMin: attr.bitMin,
                        dataCount: 0
                    });
                }
                
                // 데이터 개수 집계 (속성당 데이터 1개로 간주)
                const novel = novelMap.get(novelTitle);
                novel.dataCount++;
            }
            
            const novels = Array.from(novelMap.values());
            
            if (novels.length === 0) {
                $attributesList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📚</div>
                        <div>저장된 소설이 없습니다.</div>
                    </div>
                `;
                return;
            }
            
            // 소설 목록 렌더링
            let html = '<div class="mb-3"><h6 class="text-muted">📚 Novel AI</h6></div>';
            
            novels.forEach(novel => {
                html += `
                    <div class="attribute-item">
                        <div class="attribute-header" onclick="selectNovel('${escapeHtml(novel.title)}')">
                            <div class="attribute-name">${escapeHtml(novel.title)}</div>
                            <div class="attribute-actions">
                                <button class="btn-icon btn-delete" onclick="event.stopPropagation(); deleteNovel('${escapeHtml(novel.title)}', '${novel.bitMax}', '${novel.bitMin}')" title="소설 삭제">🗑️</button>
                            </div>
                        </div>
                        <div class="attribute-bit">BIT: ${novel.bitMax !== undefined && novel.bitMax !== null ? novel.bitMax.toFixed(15) : '-'}, ${novel.bitMin !== undefined && novel.bitMin !== null ? novel.bitMin.toFixed(15) : '-'} | 데이터 ${novel.dataCount}개</div>
                    </div>
                `;
            });
            
            $attributesList.innerHTML = html;
        } catch (error) {
            console.error('소설 목록 로드 오류:', error);
            $attributesList.innerHTML = `
                <div class="text-danger text-center">✗ 소설 목록 로드 실패: ${error.message}</div>
            `;
        }
    }
    
    // 소설 선택 시 해당 소설의 속성으로 필터링
    window.selectNovel = function(novelTitle) {
        // 우측 패널의 속성 필드에 제목만 입력
        if ($novelTitleInput) {
            $novelTitleInput.value = novelTitle;
            // 이벤트 트리거하여 BIT 값 재계산
            const inputEvent = new Event('input', { bubbles: true });
            $novelTitleInput.dispatchEvent(inputEvent);
        }
        
        // 우측 패널의 속성 텍스트 필드는 비워두기
        if ($attributeInput) {
            $attributeInput.value = '';
        }
        
        // 좌측 속성 필터에도 제목 입력 (속성 목록 로드)
        if ($attributeFilterInput) {
            $attributeFilterInput.value = novelTitle;
            loadAttributes();
        }
        
        console.log('[소설 선택] 제목만 입력:', { novelTitle });
    };
    
    // 소설 삭제 함수 (소설의 모든 속성과 데이터 삭제)
    window.deleteNovel = async function(novelTitle, novelBitMax, novelBitMin) {
        try {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('info', `[좌측 삭제] 소설 삭제 시작: "${novelTitle}"`);
            }
            console.log('[소설 삭제] 시작:', { novelTitle, novelBitMax, novelBitMin });
            
            if (!novelTitle) {
                throw new Error('소설 제목이 없습니다.');
            }
            // 먼저 해당 소설의 모든 속성 조회
            const attrUrl = getServerUrl('/api/attributes/all');
            const attrResponse = await fetch(attrUrl);
            
            if (!attrResponse.ok) {
                throw new Error(`속성 조회 실패: HTTP ${attrResponse.status}`);
            }
            
            const attrData = await attrResponse.json();
            const allAttributes = (attrData.ok && attrData.attributes) ? attrData.attributes : [];
            
            // 소설 제목으로 시작하는 속성만 필터링
            const novelAttributes = allAttributes.filter(attr => {
                const attrText = (attr.text || '').trim();
                return attrText.startsWith(novelTitle + ' →');
            });
            
            // 각 속성의 모든 데이터 삭제
            let deletedAttrCount = 0;
            let deletedDataCount = 0;
            let errorCount = 0;
            
            for (const attr of novelAttributes) {
                try {
                    console.log(`[소설 삭제] 속성 "${attr.text}" 처리 시작 (BIT: ${attr.bitMax}, ${attr.bitMin})`);
                    
                    // 속성의 모든 데이터 조회
                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=1000`);
                    const dataResponse = await fetch(dataUrl);
                    
                    let dataItems = [];
                    if (dataResponse.ok) {
                        const dataData = await dataResponse.json();
                        dataItems = (dataData.ok && dataData.items) ? dataData.items : [];
                    }
                    
                    console.log(`[소설 삭제] 속성 "${attr.text}"의 데이터 항목: ${dataItems.length}개`);
                    
                    // 속성의 모든 데이터 삭제
                    for (const item of dataItems) {
                            // 서버 저장 구조: max/min (최상위) 또는 data.bitMax/bitMin
                            // 삭제 시 둘 다 확인해야 함
                            let deleteDataMax = null;
                            let deleteDataMin = null;
                            
                            // 1순위: 최상위 max/min (null이 아닌 경우만)
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
                            
                            // BIT 값 유효성 검사
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
                            
                            // 서버는 정확한 === 비교를 사용하므로, 숫자로 변환
                            const attrMaxNum = Number(attr.bitMax);
                            const attrMinNum = Number(attr.bitMin);
                            const dataMaxNum = Number(deleteDataMax);
                            const dataMinNum = Number(deleteDataMin);
                            
                            console.log('[소설 삭제] 삭제 시도:', {
                                속성: { bitMax: attrMaxNum, bitMin: attrMinNum, text: attr.text },
                                데이터: { bitMax: dataMaxNum, bitMin: dataMinNum },
                                원본데이터구조: { max: item.max, min: item.min, dataBitMax: item.dataBitMax, dataBitMin: item.dataBitMin, data: item.data }
                            });
                            
                            try {
                                const deleteUrl = getServerUrl('/api/attributes/data/delete');
                                const deleteBody = {
                                    attributeBitMax: attrMaxNum,
                                    attributeBitMin: attrMinNum,
                                    dataBitMax: dataMaxNum,
                                    dataBitMin: dataMinNum
                                };
                                
                                console.log('[소설 삭제] 삭제 요청:', deleteBody);
                                
                                const deleteResponse = await fetch(deleteUrl, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify(deleteBody)
                                });
                                
                                if (deleteResponse.ok) {
                                    const result = await deleteResponse.json().catch(() => ({ ok: true }));
                                    console.log('[소설 삭제] 삭제 응답:', result);
                                    
                                    if (result && result.ok) {
                                        // 실제 삭제된 항목 수를 더함
                                        const count = result.deletedCount || 0;
                                        deletedDataCount += count;
                                        if (count === 0) {
                                            console.warn('[소설 삭제] ⚠️ 데이터 삭제 요청 성공했으나 삭제된 항목이 0개:', {
                                                요청: deleteBody,
                                                응답: result,
                                                파일처리: result.details || '없음'
                                            });
                                        } else {
                                            console.log(`[소설 삭제] ✓ ${count}개 데이터 삭제 성공`);
                                        }
                                    } else {
                                        errorCount++;
                                        console.warn('[소설 삭제] 데이터 삭제 실패:', result);
                                    }
                                } else {
                                    errorCount++;
                                    const errorText = await deleteResponse.text().catch(() => '');
                                    console.warn('[소설 삭제] HTTP 오류:', deleteResponse.status, errorText);
                                }
                            } catch (e) {
                                console.error('[소설 삭제] 데이터 삭제 오류:', e);
                                errorCount++;
                            }
                        }
                        
                    // 속성 전체 삭제 (모든 데이터와 폴더 포함) - 데이터가 있어도 없어도 실행
                    await new Promise(resolve => setTimeout(resolve, 300)); // 데이터 삭제 처리 시간 대기
                    
                    try {
                        const deleteAttrUrl = getServerUrl('/api/attributes/delete');
                        const deleteAttrBody = {
                            attributeBitMax: Number(attr.bitMax),
                            attributeBitMin: Number(attr.bitMin)
                        };
                        
                        console.log(`[소설 삭제] 속성 "${attr.text}" 전체 삭제 요청:`, deleteAttrBody);
                        
                        const deleteAttrResponse = await fetch(deleteAttrUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(deleteAttrBody)
                        });
                        
                        if (deleteAttrResponse.ok) {
                            const deleteAttrResult = await deleteAttrResponse.json().catch(() => ({ ok: true }));
                            console.log(`[소설 삭제] 속성 "${attr.text}" 전체 삭제 완료:`, deleteAttrResult);
                            deletedAttrCount++;
                        } else {
                            const errorText = await deleteAttrResponse.text().catch(() => '');
                            console.warn(`[소설 삭제] 속성 "${attr.text}" 삭제 실패 (${deleteAttrResponse.status}):`, errorText);
                            errorCount++;
                        }
                    } catch (e) {
                        console.error(`[소설 삭제] 속성 "${attr.text}" 삭제 오류:`, e);
                        errorCount++;
                    }
                } catch (e) {
                    console.error('[소설 삭제] 속성 데이터 조회 오류:', e);
                    errorCount++;
                }
            }
            
            // 최종 결과 로그
            if (errorCount === 0) {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('info', `[좌측 삭제] 소설 삭제 완료: ${deletedAttrCount}개 속성, ${deletedDataCount}개 데이터 삭제됨`);
                }
                console.log(`[소설 삭제] 완료: ${deletedAttrCount}개 속성, ${deletedDataCount}개 데이터 삭제`);
            } else {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('warn', `[좌측 삭제] 소설 삭제 일부 실패: ${deletedAttrCount}개 속성, ${deletedDataCount}개 데이터, ${errorCount}개 오류`);
                }
                console.warn(`[소설 삭제] 일부 실패: ${deletedAttrCount}개 속성 처리, ${deletedDataCount}개 데이터 삭제, ${errorCount}개 오류`);
            }
            
            // 서버 처리 시간을 고려한 약간의 딜레이 후 목록 새로고침
            setTimeout(async () => {
                await loadNovelList();
            }, 500);
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 삭제] 소설 삭제 오류: ${error.message}`);
            }
            console.error('[소설 삭제] 오류:', error);
            alert(`✗ 삭제 실패: ${error.message}`);
            // 오류 발생 시에도 목록 새로고침
            setTimeout(async () => {
                await loadNovelList();
            }, 500);
        }
    };
    
    // 속성 목록 로드
    async function loadAttributes() {
        if (!$attributesList) return;
        
        const filterText = ($attributeFilterInput && $attributeFilterInput.value || '').trim();
        const additionalSearch = ($additionalSearchInput && $additionalSearchInput.value || '').trim();
        updateAdditionalSearchBitInfo();
        
        if (!filterText) {
            // 필터가 없으면 소설 목록 표시
            await loadNovelList();
            return;
        }
        
        if (typeof window.addLeftLog === 'function') {
            window.addLeftLog('info', `[좌측 조회] 속성 목록 조회 시작: "${filterText}"${additionalSearch ? ` (추가: ${additionalSearch})` : ''}`);
        }
        
        $attributesList.innerHTML = '<div class="text-muted text-center">로딩 중...</div>';
        
        try {
            // BIT 값 계산: 필터 텍스트에서 소설 제목을 제외한 부분(입력 필드 값) 사용
            // 필터 텍스트가 "소설 제목 → 챕터..." 형식이면 "챕터..." 부분만 사용
            let filterTextForBit = filterText;
            if (filterText.includes(' → ')) {
                const parts = filterText.split(' → ').map(p => p.trim()).filter(p => p && p.length > 0);
                if (parts.length >= 2) {
                    // 두 번째 부분부터(소설 제목 제외) 사용
                    filterTextForBit = parts.slice(1).join(' → ');
                }
            }
            
            console.log('[속성 필터] BIT 계산용 텍스트:', {
                원본필터: filterText,
                BIT계산용: filterTextForBit,
                소설제목제외: filterText !== filterTextForBit ? 'Y' : 'N'
            });
            
            // BIT 값 계산 (입력 필드 값 사용)
            const filterBits = calculateBitValues(filterTextForBit);
            
            if (!filterBits.max || !filterBits.min) {
                $attributesList.innerHTML = `
                    <div class="text-danger text-center">✗ BIT 값 계산 실패</div>
                `;
                return;
            }
            
            // 속성 목록 조회
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                $attributesList.innerHTML = `
                    <div class="text-muted text-center">속성 데이터가 없습니다.</div>
                `;
                return;
            }
            
            // 필터링: BIT 값 유사도로 속성 필터링
            let attributes = data.attributes || [];
            
            // BIT 값 유사도 계산 (개선 - 텍스트 매칭과 추가 검색 키워드 고려)
            function calculateSimilarity(bits1, bits2, filterText, attrText, additionalSearch) {
                if (!bits1 || !bits2) return 0;
                
                // BIT 값 유사도 계산
                const dMax = Math.abs(bits1.max - bits2.max);
                const dMin = Math.abs(bits1.min - bits2.min);
                // norm 값을 더 작게 조정하여 유사도 감쇠를 줄임
                const norm = 2;
                const simMax = Math.max(0, 1 - (dMax / norm));
                const simMin = Math.max(0, 1 - (dMin / norm));
                const bitSimilarity = Math.max(0, Math.min(1, (simMax * 0.6 + simMin * 0.4)));
                
                // 텍스트 유사도 계산 (필터 텍스트가 속성 텍스트에 포함되는 정도)
                let textSimilarity = 0;
                if (filterText && attrText) {
                    const filterLower = filterText.toLowerCase().trim();
                    const attrLower = attrText.toLowerCase().trim();
                    
                    // 정확히 일치
                    if (attrLower === filterLower) {
                        textSimilarity = 1.0;
                    }
                    // 속성 텍스트가 필터 텍스트로 시작
                    else if (attrLower.startsWith(filterLower)) {
                        textSimilarity = 0.95;
                    }
                    // 필터 텍스트가 속성 텍스트에 포함
                    else if (attrLower.includes(filterLower)) {
                        // 포함 위치에 따라 점수 조정 (앞쪽에 있을수록 높은 점수)
                        const index = attrLower.indexOf(filterLower);
                        const positionRatio = 1 - (index / Math.max(attrLower.length, 1));
                        textSimilarity = 0.8 + (positionRatio * 0.15);
                    }
                    // 필터 텍스트의 단어들이 속성 텍스트에 포함되는 정도
                    else {
                        const filterWords = filterLower.split(/\s+/).filter(w => w.length > 0);
                        const matchedWords = filterWords.filter(word => attrLower.includes(word));
                        if (filterWords.length > 0) {
                            textSimilarity = matchedWords.length / filterWords.length * 0.6;
                        }
                    }
                }
                
                // 추가 검색 키워드 매칭 보너스
                let additionalSearchBonus = 0;
                if (additionalSearch && attrText) {
                    const keywords = additionalSearch.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                    const attrLower = attrText.toLowerCase().trim();
                    
                    if (keywords.length > 0) {
                        let matchedKeywords = 0;
                        for (const keyword of keywords) {
                            if (attrLower.includes(keyword)) {
                                matchedKeywords++;
                                // 키워드가 정확히 일치하면 더 높은 보너스
                                if (attrLower.includes(` ${keyword} `) || attrLower.startsWith(keyword) || attrLower.endsWith(keyword)) {
                                    additionalSearchBonus += 0.2;
                                } else {
                                    additionalSearchBonus += 0.15;
                                }
                            }
                        }
                        // 모든 키워드가 매칭되면 추가 보너스
                        if (matchedKeywords === keywords.length && keywords.length > 0) {
                            additionalSearchBonus += 0.15;
                        }
                    }
                }
                
                // 필터 텍스트와 추가 검색 키워드가 모두 포함된 경우 특별 보너스
                let combinedBonus = 0;
                if (filterText && additionalSearch && attrText) {
                    const filterLower = filterText.toLowerCase().trim();
                    const attrLower = attrText.toLowerCase().trim();
                    const keywords = additionalSearch.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                    
                    // 필터 텍스트와 모든 추가 검색 키워드가 속성에 포함되어 있는지 확인
                    const hasFilter = attrLower.includes(filterLower);
                    const hasAllKeywords = keywords.length > 0 && keywords.every(keyword => attrLower.includes(keyword));
                    
                    if (hasFilter && hasAllKeywords) {
                        // 필터가 속성의 시작 부분에 있고, 키워드가 순서대로 포함되어 있으면 매우 높은 보너스
                        if (attrLower.startsWith(filterLower)) {
                            combinedBonus = 0.5; // 시작 부분에 있으면 매우 높은 보너스
                        } else {
                            combinedBonus = 0.35; // 포함되어 있으면 높은 보너스
                        }
                    }
                }
                
                // BIT 유사도와 텍스트 유사도를 결합 (텍스트 매칭과 추가 검색이 더 중요)
                // 결합 보너스가 있으면 그것을 우선적으로 사용
                let finalSimilarity;
                if (combinedBonus > 0) {
                    // 필터와 키워드가 모두 포함된 경우는 높은 유사도 보장
                    finalSimilarity = Math.max(0.85, Math.min(1, 
                        bitSimilarity * 0.2 + 
                        textSimilarity * 0.3 + 
                        combinedBonus * 0.5
                    ));
                } else {
                    // 일반적인 경우
                    finalSimilarity = Math.max(0, Math.min(1, 
                        bitSimilarity * 0.3 + 
                        textSimilarity * 0.4 + 
                        Math.min(additionalSearchBonus, 0.3) * 0.3
                    ));
                }
                
                return finalSimilarity;
            }
            
            // BIT 값 유사도로 필터링 및 점수 계산 (추가 검색 키워드도 고려)
            attributes = attributes.map(attr => ({
                ...attr,
                similarity: calculateSimilarity(filterBits, { max: attr.bitMax, min: attr.bitMin }, filterText, attr.text, additionalSearch)
            })).filter(attr => attr.similarity > 0.05).sort((a, b) => b.similarity - a.similarity);
            
            // 추가 검색 키워드 필터링
            if (additionalSearch) {
                const keywords = additionalSearch.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                attributes = attributes.filter(attr => {
                    const attrText = (attr.text || '').toLowerCase();
                    return keywords.some(keyword => attrText.includes(keyword));
                });
            }
            
            // 텍스트 필터링 (속성 텍스트에 필터 텍스트 포함)
            if (filterText) {
                const filterLower = filterText.toLowerCase();
                attributes = attributes.filter(attr => {
                    const attrText = (attr.text || '').toLowerCase();
                    return attrText.includes(filterLower);
                });
            }
            
            // 필터링 후에도 유사도로 다시 정렬 (가장 유사한 것 맨 위로)
            attributes = attributes.sort((a, b) => {
                // 유사도가 높은 순으로 정렬
                if (b.similarity !== a.similarity) {
                    return b.similarity - a.similarity;
                }
                // 유사도가 같으면 텍스트 길이로 정렬 (짧은 것 먼저)
                return (a.text || '').length - (b.text || '').length;
            });
            
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('info', `[좌측 조회] 필터링 완료: ${attributes.length}개 속성 발견`);
            }
            
            // 데이터 조회 (각 속성에 대한 데이터)
            let html = '';
            
            if (attributes.length === 0) {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('warn', `[좌측 조회] 조회된 속성 없음`);
                }
                html = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <div>조회된 속성이 없습니다.</div>
                    </div>
                `;
            } else {
                // 모든 속성 조회 (데이터 유무와 관계없이)
                const attributesWithData = [];
                
                for (const attr of attributes.slice(0, 50)) {
                    // 속성에 대한 데이터 조회
                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=20`);
                    let dataItems = [];
                    
                    try {
                        const dataResponse = await fetch(dataUrl);
                        if (dataResponse.ok) {
                            const dataData = await dataResponse.json();
                            if (dataData.ok && dataData.items) {
                                dataItems = dataData.items || [];
                            }
                        }
                    } catch (e) {
                        console.warn('데이터 조회 오류:', e);
                    }
                    
                    // 데이터 유무와 관계없이 모든 속성 추가
                    attributesWithData.push({ attr, dataItems });
                }
                
                // 모든 속성 표시 (데이터 유무와 관계없이)
                const filteredAttributes = [];

                for (const { attr, dataItems } of attributesWithData) {
                    const filteredDataItems = dataItems.filter(item => {
                        const text = item.s || item.text || item.data?.text || '';
                        return text.trim().length > 1;
                    });
                    if (filteredDataItems.length > 0) {
                        filteredAttributes.push({ attr, dataItems: filteredDataItems });
                    }
                }

                if (filteredAttributes.length === 0) {
                    if (typeof window.addLeftLog === 'function') {
                        window.addLeftLog('warn', `[좌측 조회] 조회된 속성 없음`);
                    }
                    html = `
                        <div class="empty-state">
                            <div class="empty-state-icon">🔍</div>
                            <div>조회된 속성이 없습니다.</div>
                        </div>
                    `;
                } else {
                    if (typeof window.addLeftLog === 'function') {
                        const totals = filteredAttributes.reduce((acc, item) => {
                            const lengthSum = item.dataItems.reduce((sum, dataItem) => {
                                const text = dataItem.s || dataItem.text || dataItem.data?.text || '';
                                return sum + text.length;
                            }, 0);
                            acc.count += item.dataItems.length;
                            acc.length += lengthSum;
                            return acc;
                        }, { count: 0, length: 0 });
                        window.addLeftLog('info', `[좌측 조회] 조회 완료: ${filteredAttributes.length}개 속성 (총 ${totals.count}개 데이터, 총 ${totals.length.toLocaleString()}자)`);
                    }
                    for (const { attr, dataItems } of filteredAttributes) {
                        const dataItemsHtml = dataItems.map((item, itemIndex) => {
                            const text = item.s || item.text || item.data?.text || '';
                            const displayText = text.length > 200 ? text.substring(0, 200) + '...' : text;
                            // itemBits 설정: null 체크 포함
                            const itemBits = (item.max !== undefined && item.max !== null && item.min !== undefined && item.min !== null)
                                ? { max: item.max, min: item.min }
                                : { max: item.dataBitMax !== undefined ? item.dataBitMax : null, min: item.dataBitMin !== undefined ? item.dataBitMin : null };
                            
                            const dataId = `data-${attr.bitMax}-${attr.bitMin}-${itemBits.max}-${itemBits.min}`;
                            
                            // 안전하게 이스케이프된 텍스트 (줄바꿈, 특수문자 처리)
                            const textEscaped = String(text || '')
                                .replace(/\\/g, '\\\\')
                                .replace(/'/g, "\\'")
                                .replace(/"/g, '&quot;')
                                .replace(/\n/g, ' ')
                                .replace(/\r/g, '');
                            
                            // 전체 텍스트를 base64로 인코딩하여 data 속성에 저장 (안전한 방법)
                            const textBase64 = btoa(unescape(encodeURIComponent(text || '')));
                            const uniqueDataId = `data-text-${attr.bitMax}-${attr.bitMin}-${itemBits.max}-${itemBits.min}-${itemIndex}`;
                            
                            // 전역 데이터 저장소에 텍스트 저장 (안전한 방법)
                            if (!window.dataTextStorage) {
                                window.dataTextStorage = {};
                            }
                            window.dataTextStorage[uniqueDataId] = text;
                            
                            return `
                                <div class="data-item" onclick="event.stopPropagation()">
                                    <div class="data-item-header">
                                        <div class="data-text" data-text-id="${uniqueDataId}" onclick="event.stopPropagation(); const textId = this.getAttribute('data-text-id'); if (textId && window.dataTextStorage && window.dataTextStorage[textId]) { window.showDataModal(window.dataTextStorage[textId]); }" style="cursor: pointer; flex: 1; padding: 5px; border-radius: 3px; transition: background 0.2s;" onmouseover="this.style.background='rgba(124, 92, 255, 0.1)'" onmouseout="this.style.background='transparent'" title="클릭하여 전체 내용 보기">${escapeHtml(displayText)}</div>
                                        <button class="btn-icon btn-delete" onclick="event.stopPropagation(); deleteDataItem('${attr.bitMax}', '${attr.bitMin}', '${itemBits.max}', '${itemBits.min}', '${textEscaped}')" title="삭제">🗑️</button>
                                    </div>
                                    <div class="data-bit">BIT: ${itemBits.max !== undefined && itemBits.max !== null ? itemBits.max.toFixed(15) : '-'}, ${itemBits.min !== undefined && itemBits.min !== null ? itemBits.min.toFixed(15) : '-'}</div>
                                    <button class="btn btn-sm btn-outline-success mt-2" onclick="event.stopPropagation(); copyToClipboard('${textEscaped}')">📋 복사</button>
                                </div>
                            `;
                        }).join('');
                        
                        const attrId = `attr-${attr.bitMax}-${attr.bitMin}`;
                        const attrTextEscaped = escapeHtml(attr.text || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        html += `
                            <div class="attribute-item">
                                <div class="attribute-header">
                                    <div class="attribute-name" onclick="window.selectAttributeFromList('${attrTextEscaped}')" style="cursor: pointer; flex: 1; padding: 5px; border-radius: 3px; transition: background 0.2s;" onmouseover="this.style.background='rgba(124, 92, 255, 0.15)'" onmouseout="this.style.background='transparent'">${escapeHtml(attr.text || '')}</div>
                                    <div class="attribute-actions">
                                        <button class="btn-icon btn-delete" onclick="event.stopPropagation(); deleteAttribute('${attr.bitMax}', '${attr.bitMin}', '${attrTextEscaped}')" title="속성 삭제">🗑️</button>
                                        <div class="toggle-icon" id="toggle-${attrId}" onclick="toggleData('${attrId}')" style="cursor: pointer; padding: 5px;">▼</div>
                                    </div>
                                </div>
                                <div class="attribute-bit">BIT: ${attr.bitMax !== undefined && attr.bitMax !== null ? attr.bitMax.toFixed(15) : '-'}, ${attr.bitMin !== undefined && attr.bitMin !== null ? attr.bitMin.toFixed(15) : '-'} | 유사도: ${attr.similarity !== undefined && attr.similarity !== null ? (attr.similarity * 100).toFixed(1) : '-'}% | 데이터 ${dataItems.length}개 | 총 길이 ${dataItems.reduce((sum, item) => {
                                    const text = item.s || item.text || item.data?.text || '';
                                    return sum + text.length;
                                }, 0).toLocaleString()}자</div>
                                <div class="data-list" id="${attrId}" style="display: none;">${dataItemsHtml}</div>
                            </div>
                        `;
                    }
                }
            }
            
            $attributesList.innerHTML = html;
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 조회] 속성 목록 로드 오류: ${error.message}`);
            }
            console.error('속성 목록 로드 오류:', error);
            $attributesList.innerHTML = `
                <div class="text-danger text-center">✗ 로드 실패: ${error.message}</div>
            `;
        }
    }
    
    // 이스케이프 함수
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 클립보드 복사
    window.copyToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('복사 완료');
        }).catch(err => {
            console.error('복사 실패:', err);
        });
    };
    
    // 데이터 전체 내용 모달 표시
    window.showDataModal = function(text) {
        if (!text) return;
        
        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('aria-labelledby', 'dataModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        
        const dlg = document.createElement('div');
        dlg.className = 'modal-dialog modal-lg modal-dialog-scrollable';
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <h5 class="modal-title" id="dataModalLabel">📄 데이터 전체 내용</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.whiteSpace = 'pre-wrap';
        body.style.wordBreak = 'break-word';
        body.style.maxHeight = '70vh';
        body.style.overflowY = 'auto';
        body.style.fontFamily = 'monospace';
        body.style.fontSize = '0.9rem';
        body.style.lineHeight = '1.6';
        body.style.padding = '1.5rem';
        body.style.backgroundColor = 'var(--bg-surface)';
        body.style.borderRadius = '5px';
        body.textContent = text;
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-sm btn-outline-success';
        copyBtn.textContent = '📋 복사';
        copyBtn.onclick = () => {
            copyToClipboard(text);
            copyBtn.textContent = '✓ 복사됨';
            setTimeout(() => {
                copyBtn.textContent = '📋 복사';
            }, 2000);
        };
        
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-sm btn-secondary';
        closeBtn.setAttribute('data-bs-dismiss', 'modal');
        closeBtn.textContent = '닫기';
        
        footer.appendChild(copyBtn);
        footer.appendChild(closeBtn);
        
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        dlg.appendChild(content);
        modal.appendChild(dlg);
        
        document.body.appendChild(modal);
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // 모달이 닫힌 후 DOM에서 제거
        modal.addEventListener('hidden.bs.modal', () => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        });
    };
    
    // 데이터 토글 함수
    window.toggleData = function(attrId) {
        const dataList = document.getElementById(attrId);
        const toggleIcon = document.getElementById(`toggle-${attrId}`);
        
        if (dataList && toggleIcon) {
            if (dataList.style.display === 'none') {
                dataList.style.display = 'block';
                toggleIcon.textContent = '▲';
            } else {
                dataList.style.display = 'none';
                toggleIcon.textContent = '▼';
            }
        }
    };
    
    // 대화 상자에 텍스트 추가하고 자동 전송하는 헬퍼 함수
    function appendToChatInput(text) {
        const $chatInput = document.getElementById('chatInput');
        if ($chatInput) {
            const currentValue = $chatInput.value || '';
            // 기존 내용이 있으면 줄바꿈 후 추가, 없으면 그냥 추가
            const newValue = currentValue ? `${currentValue}\n${text}` : text;
            $chatInput.value = newValue;
            
            // textarea 높이 자동 조절
            $chatInput.style.height = 'auto';
            $chatInput.style.height = Math.min($chatInput.scrollHeight, 200) + 'px';
            
            // 포커스 설정
            $chatInput.focus();
            
            // 입력 이벤트 트리거
            const inputEvent = new Event('input', { bubbles: true });
            $chatInput.dispatchEvent(inputEvent);
            
            // 자동 전송 (Enter 키 이벤트 트리거)
            setTimeout(() => {
                // sendMessage 함수가 있으면 직접 호출
                if (typeof window.sendMessage === 'function') {
                    window.sendMessage();
                } else {
                    // sendMessage 함수가 없으면 Enter 키 이벤트 트리거
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    $chatInput.dispatchEvent(enterEvent);
                }
            }, 100);
        }
    }
    
    // 좌측 메뉴에서 속성 클릭 시 우측 패널에 자동 입력
    window.selectAttributeFromList = function(attributeText) {
        if (!attributeText || typeof attributeText !== 'string') return;
        
        // 디버깅: 클릭된 속성 텍스트 확인
        console.log('[속성 선택] 클릭된 속성:', attributeText);
        
        // 속성 필터와 추가 검색 키워드 확인
        const filterText = ($attributeFilterInput && $attributeFilterInput.value || '').trim();
        const additionalSearch = ($additionalSearchInput && $additionalSearchInput.value || '').trim();
        
        // 속성 텍스트에서 소설 제목과 나머지 부분 분리
        // 형식: "소설 제목 → 챕터 1: 제1장 → 등장인물"
        const parts = attributeText.split(' → ').map(p => p.trim()).filter(p => p && p.length > 0);
        
        if (parts.length === 0) return;
        
        // 첫 번째 부분이 소설 제목
        const novelTitle = parts[0];
        // 나머지 부분이 속성 텍스트 (소설 제목 제외)
        const attributePart = parts.length > 1 ? parts.slice(1).join(' → ') : '';
        
        // 디버깅: 분리된 속성 부분 확인
        console.log('[속성 선택] 분리 결과:', {
            전체속성: attributeText,
            소설제목: novelTitle,
            속성부분: attributePart,
            parts: parts
        });
        
        // 우측 속성 필드에 소설 제목 입력
        if ($novelTitleInput) {
            $novelTitleInput.value = novelTitle;
            // 이벤트 트리거하여 BIT 값 재계산
            const inputEvent = new Event('input', { bubbles: true });
            $novelTitleInput.dispatchEvent(inputEvent);
        }
        
        // 필터와 추가 검색 키워드가 모두 비어있을 때는 제목만 입력
        if (!filterText && !additionalSearch) {
            // 속성 텍스트 필드에 소설 제목만 입력
            if ($attributeInput) {
                $attributeInput.value = novelTitle;
                // 로컬 스토리지에도 저장
                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, novelTitle);
            }
            console.log('[속성 선택] 필터 비어있음 - 제목만 입력:', { novelTitle, fullText: attributeText });
        } else {
            // 필터나 추가 검색 키워드가 있으면 전체 속성 텍스트 입력 (소설 제목 포함)
            if ($attributeInput && attributeText) {
                // 전체 속성 텍스트를 입력 (소설 제목 포함)
                $attributeInput.value = attributeText;
                // 로컬 스토리지에 저장
                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, attributeText);
                // 이벤트 트리거하여 BIT 값 재계산
                const inputEvent = new Event('input', { bubbles: true });
                $attributeInput.dispatchEvent(inputEvent);
            } else if ($attributeInput && parts.length === 1) {
                // 속성 텍스트가 하나만 있으면 (소설 제목만 있는 경우) 소설 제목 입력
                $attributeInput.value = novelTitle;
                // 로컬 스토리지에도 저장
                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, novelTitle);
            }
            console.log('[속성 선택] 필터 있음 - 전체 입력:', { novelTitle, attributeText });
        }
        
        // 대화 상자에 속성 정보 추가 (데이터 포함)
        appendAttributeToChatInput(attributeText);
    };
    
    // 속성과 데이터를 함께 대화 상자에 추가하는 함수
    async function appendAttributeToChatInput(attributeText) {
        // 속성 텍스트로부터 BIT 값 계산
        const attributeBits = calculateBitValues(attributeText);
        
        let chatText = attributeText;
        
        // BIT 값이 있으면 데이터 조회
        if (attributeBits.max !== null && attributeBits.min !== null) {
            try {
                const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=10`);
                const dataResponse = await fetch(dataUrl);
                
                if (dataResponse.ok) {
                    const dataData = await dataResponse.json();
                    if (dataData.ok && dataData.items && dataData.items.length > 0) {
                        // 데이터가 있으면 속성과 함께 추가
                        const dataTexts = dataData.items.map(item => {
                            const text = item.s || item.text || item.data?.text || '';
                            return text;
                        }).filter(text => text && text.length > 0);
                        
                        if (dataTexts.length > 0) {
                            // 속성과 데이터를 구분하여 입력
                            chatText = `${attributeText}\n\n**데이터:**\n${dataTexts.join('\n\n---\n\n')}`;
                            console.log('[속성 선택] 데이터 포함하여 대화 입력:', { 
                                attributeText, 
                                dataCount: dataTexts.length 
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn('[속성 선택] 데이터 조회 오류:', error);
                // 오류가 있어도 속성만 입력
            }
        }
        
        // 대화 상자에 추가
        appendToChatInput(chatText);
    };
    
    // 다음 챕터에서 "과거 줄거리" 데이터 확인 및 자동 생성
    async function checkAndGeneratePastSummary(novelTitle, chapters, nextChapterIndex) {
        try {
            if (nextChapterIndex < 0 || nextChapterIndex >= chapters.length) {
                return;
            }
            
            const nextChapter = chapters[nextChapterIndex];
            const nextChapterFullTitle = `챕터 ${nextChapter.number}: ${nextChapter.title}`;
            const pastSummaryAttribute = `${novelTitle} → ${nextChapterFullTitle} → 과거 줄거리`;
            
            console.log('[과거 줄거리] 확인 시작:', pastSummaryAttribute);
            
            // "과거 줄거리" 속성이 있는지 확인
            const pastSummaryBits = calculateBitValues(pastSummaryAttribute);
            if (!pastSummaryBits.max || !pastSummaryBits.min) {
                console.warn('[과거 줄거리] BIT 값 계산 실패');
                return;
            }
            
            // 데이터 조회
            const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${pastSummaryBits.max}&bitMin=${pastSummaryBits.min}&limit=1`);
            const dataResponse = await fetch(dataUrl);
            
            if (dataResponse.ok) {
                const dataData = await dataResponse.json();
                if (dataData.ok && dataData.items && dataData.items.length > 0) {
                    // 이미 데이터가 있으면 생성하지 않음
                    console.log('[과거 줄거리] 이미 데이터가 있습니다.');
                    return;
                }
            }
            
            // 데이터가 없으면 현재 챕터까지의 모든 데이터로 요약 생성
            console.log('[과거 줄거리] 데이터가 없습니다. 자동 생성 시작...');
            
            // 현재 챕터까지의 모든 데이터 수집 (다음 챕터 이전까지)
            const allChapterData = [];
            const allCharacters = []; // 등장인물 정보 수집
            
            for (let i = 0; i < nextChapterIndex && i < chapters.length; i++) {
                const chapter = chapters[i];
                const chapterFullTitle = `챕터 ${chapter.number}: ${chapter.title}`;
                
                // 해당 챕터의 모든 속성 조회
                try {
                    const url = getServerUrl('/api/attributes/all');
                    const response = await fetch(url);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.ok && data.attributes) {
                            // 해당 챕터와 관련된 속성만 필터링
                            const chapterAttributes = data.attributes.filter(attr => {
                                const attrText = (attr.text || '').trim();
                                if (!attrText || !attrText.includes(' → ')) return false;
                                
                                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                                if (parts.length < 2) return false;
                                
                                const attrNovelTitle = parts[0];
                                if (attrNovelTitle !== novelTitle) return false;
                                
                                const chapterPart = parts[1];
                                const chapterMatch = chapterPart.match(/챕터\s*(\d+)/i);
                                if (!chapterMatch || chapterMatch[1] !== chapter.number) return false;
                                
                                // "과거 줄거리" 속성은 제외
                                if (attrText.includes('과거 줄거리')) return false;
                                
                                return true;
                            });
                            
                            // 각 속성의 데이터 조회
                            for (const attr of chapterAttributes) {
                                try {
                                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=1000`);
                                    const dataResponse = await fetch(dataUrl);
                                    
                                    if (dataResponse.ok) {
                                        const dataData = await dataResponse.json();
                                        if (dataData.ok && dataData.items && dataData.items.length > 0) {
                                            const dataTexts = dataData.items.map(item => {
                                                const text = item.s || item.text || item.data?.text || '';
                                                return text;
                                            }).filter(text => text && text.length > 0);
                                            
                                            if (dataTexts.length > 0) {
                                                const attributePart = attr.text.includes(' → ') 
                                                    ? attr.text.split(' → ').slice(2).join(' → ') || attr.text.split(' → ')[1]
                                                    : attr.text;
                                                
                                                // 등장인물 속성인지 확인
                                                const isCharacterAttribute = attributePart.includes('등장인물') || 
                                                                              attributePart.toLowerCase().includes('character');
                                                
                                                if (isCharacterAttribute) {
                                                    // 등장인물 정보 수집
                                                    dataTexts.forEach(charText => {
                                                        if (charText && !allCharacters.includes(charText)) {
                                                            allCharacters.push(charText);
                                                        }
                                                    });
                                                }
                                                
                                                allChapterData.push({
                                                    chapter: chapterFullTitle,
                                                    attribute: attributePart,
                                                    data: dataTexts
                                                });
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.warn('[과거 줄거리] 속성 데이터 조회 오류:', attr.text, error);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[과거 줄거리] 챕터 데이터 조회 오류:', chapterFullTitle, error);
                }
            }
            
            if (allChapterData.length === 0) {
                console.log('[과거 줄거리] 수집할 데이터가 없습니다.');
                return;
            }
            
            console.log('[과거 줄거리] 수집된 데이터:', allChapterData.length, '개 속성');
            console.log('[과거 줄거리] 수집된 등장인물:', allCharacters.length, '개');
            
            // 등장인물 정보 섹션 생성
            const charactersSection = allCharacters.length > 0 
                ? `\n\n**과거 등장인물 정보:**\n${allCharacters.map((char, idx) => `${idx + 1}. ${char}`).join('\n')}`
                : '';
            
            // GPT API를 사용하여 줄거리 요약 생성 (4개 섹션 구조)
            const summaryPrompt = `다음은 소설 "${novelTitle}"의 챕터 ${nextChapterIndex}까지의 모든 내용입니다. 이를 바탕으로 다음 구조로 작성해주세요:

**챕터별 내용:**

${allChapterData.map((chapterData, idx) => {
    return `**${chapterData.chapter}**
${chapterData.data.map((data, i) => `- ${chapterData.attribute}: ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`).join('\n')}`;
}).join('\n\n')}${charactersSection}

위 내용을 바탕으로 다음 4개 섹션으로 구성하여 작성해주세요:

**1. 이야기 끝나는 장면**
- 챕터 ${nextChapterIndex}의 마지막 장면이 어떻게 끝나는지 생생하게 묘사
- 마지막 대화와 상황, 분위기, 인물들의 행동을 구체적으로 서술
- 요약이 아닌 장면 묘사로 작성
- 예시: "주인공이 창밖을 바라보며 말했다. '그렇다면...' 그녀의 목소리는 떨리고 있었다. 손에 쥔 편지는 바람에 날려갔고, 그녀는 그대로 서 있었다."

**2. 주요 대사**
- 챕터 ${nextChapterIndex}까지의 이야기에서 중요한 대사들을 추출하여 나열
- 각 대사를 따옴표("")로 표시하고, 누가 말했는지 간단히 설명
- 예시: 
"이렇게까지 해야 하는 거냐, 리사?" - 호준의 마지막 말
"왜 이렇게 해야만 해? 내가 왜 너를…" - 리사의 절규

**3. 과거 줄거리**
- 챕터 ${nextChapterIndex}까지의 전체 흐름과 주요 사건들을 시간순으로 서술
- 등장인물들의 주요 대사들을 자연스럽게 포함 (따옴표로 표시)
- 자연스러운 문체로 작성

**4. 과거 등장인물**
- 위에 제공된 과거 등장인물 정보를 바탕으로 등장인물 목록 작성
- 각 등장인물의 특징과 역할을 간단히 설명
${allCharacters.length > 0 ? `- 제공된 등장인물 정보:\n${allCharacters.map((char, idx) => `  ${idx + 1}. ${char}`).join('\n')}` : '- 등장인물 정보가 없습니다.'}

**작성 형식:**
반드시 위 4개 섹션을 모두 순서대로 작성해주세요. 각 섹션은 명확하게 구분되어야 하며, 섹션 제목(예: **1. 이야기 끝나는 장면**)을 반드시 포함해야 합니다. 어떤 섹션도 생략하지 마세요.

**작성 예시:**
**1. 이야기 끝나는 장면**
[챕터의 마지막 장면 묘사]

**2. 주요 대사**
[주요 대사 목록]

**3. 과거 줄거리**
[과거 줄거리 내용]

**4. 과거 등장인물**
[등장인물 목록]`;

            // GPT API 호출
            const gptUrl = getServerUrl('/api/gpt/chat');
            const gptResponse = await fetch(gptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: summaryPrompt,
                    model: window.API_CONFIG?.defaultModel || 'gpt-4o-mini',
                    temperature: 0.7,
                    maxTokens: 2500,
                    systemMessage: '당신은 소설 작성을 돕는 AI 어시스턴트입니다. 주어진 내용을 바탕으로 명확하고 간결한 줄거리 요약을 작성해주세요. 특히 등장인물들의 주요 대사들을 자연스럽게 포함하여 작성해야 합니다. 대사는 따옴표로 표시하여 구분하고, 줄거리 흐름에 자연스럽게 녹아들도록 작성해주세요. 반드시 다음 4개 섹션을 모두 순서대로 작성해야 합니다: 1. 이야기 끝나는 장면, 2. 주요 대사, 3. 과거 줄거리, 4. 과거 등장인물. 어떤 섹션도 생략하지 마세요.'
                }),
            });
            
            if (!gptResponse.ok) {
                console.warn('[과거 줄거리] GPT API 호출 실패:', gptResponse.status);
                return;
            }
            
            const gptData = await gptResponse.json();
            if (!gptData.ok || !gptData.response) {
                console.warn('[과거 줄거리] GPT 응답 오류:', gptData.error);
                return;
            }
            
            const summaryText = (gptData.response || '').trim();
            if (!summaryText) {
                console.warn('[과거 줄거리] 요약 텍스트가 비어있습니다.');
                return;
            }
            
            console.log('[과거 줄거리] 요약 생성 완료:', summaryText.length, '자');
            
            // BIT 값 계산
            const attributeBits = calculateBitValues(pastSummaryAttribute);
            const dataBits = calculateBitValues(summaryText);
            
            if (!attributeBits.max || !attributeBits.min) {
                console.warn('[과거 줄거리] BIT 값 계산 실패');
                return;
            }
            if (!dataBits.max || !dataBits.min) {
                console.warn('[과거 줄거리] 데이터 BIT 값 계산 실패');
                return;
            }
            
            // 중복 체크
            const isDuplicate = await checkDuplicate(pastSummaryAttribute, summaryText, attributeBits, dataBits);
            if (isDuplicate) {
                console.log('[과거 줄거리] 이미 저장된 요약입니다.');
                return;
            }
            
            // 데이터 텍스트 필드를 통해 저장 (모든 데이터는 데이터 텍스트 필드를 거쳐야 함)
            console.log('[과거 줄거리] 데이터 입력 필드를 통해 저장합니다.');
            
            // 이전 저장 상태 초기화 (중복 체크 우회)
            if (typeof lastSavedAttribute !== 'undefined') {
                lastSavedAttribute = '';
                lastSavedData = '';
            }
            
            // 소설 제목 입력 필드에 값 설정
            if ($novelTitleInput) {
                $novelTitleInput.value = novelTitle;
                localStorage.setItem(STORAGE_KEY_NOVEL_TITLE, novelTitle);
            }
            
            // 속성 입력 필드에 값 설정 (소설 제목 포함)
            if ($attributeInput) {
                // 속성 필드에 소설 제목 포함하여 전체 경로 입력
                $attributeInput.value = pastSummaryAttribute;
                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_TEXT, pastSummaryAttribute);
                
                // 속성 입력 이벤트 트리거
                const attributeInputEvent = new Event('input', { bubbles: true });
                $attributeInput.dispatchEvent(attributeInputEvent);
            }
            
            // 데이터 입력 필드에 값 설정
            if ($dataInput) {
                $dataInput.value = summaryText;
                $dataInput.style.height = 'auto';
                $dataInput.style.height = Math.min($dataInput.scrollHeight, 400) + 'px';
                
                // 데이터 입력 이벤트 트리거하여 BIT 값 계산
                const dataInputEvent = new Event('input', { bubbles: true });
                $dataInput.dispatchEvent(dataInputEvent);
                
                // 로컬 스토리지에도 저장 (autoSave 함수가 정확한 값을 읽을 수 있도록)
                localStorage.setItem(STORAGE_KEY_DATA_TEXT, summaryText);
                
                console.log('[과거 줄거리] 입력 필드 값 설정 완료:', {
                    novelTitle: $novelTitleInput?.value,
                    attributeText: $attributeInput?.value,
                    dataText: $dataInput.value.substring(0, 100) + '...'
                });
                
                // autoSave 함수 호출 (데이터 텍스트 필드를 거쳐 저장)
                // 충분한 시간을 두고 여러 번 시도 (값이 제대로 반영될 때까지)
                const attemptSave = () => {
                    console.log('[과거 줄거리] autoSave 호출 시도');
                    const currentNovelTitle = $novelTitleInput?.value?.trim() || '';
                    const currentAttributeText = $attributeInput?.value?.trim() || '';
                    const currentDataText = $dataInput?.value?.trim() || '';
                    
                    console.log('[과거 줄거리] 입력 필드 값 확인:', {
                        novelTitle: currentNovelTitle,
                        attributeText: currentAttributeText,
                        dataText: currentDataText ? currentDataText.substring(0, 100) + '...' : ''
                    });
                    
                    // 값이 모두 채워져 있는지 확인
                    if (!currentNovelTitle || !currentAttributeText || !currentDataText) {
                        console.warn('[과거 줄거리] 입력 필드 값이 부족합니다:', {
                            novelTitle: !!currentNovelTitle,
                            attributeText: !!currentAttributeText,
                            dataText: !!currentDataText
                        });
                        return false;
                    }
                    
                    // triggerAutoSave 함수 사용 (디바운싱 포함)
                    if (typeof triggerAutoSave === 'function') {
                        console.log('[과거 줄거리] triggerAutoSave 호출');
                        triggerAutoSave();
                        return true;
                    } else if (typeof autoSave === 'function') {
                        console.log('[과거 줄거리] autoSave 직접 호출');
                        autoSave().catch(err => {
                            console.error('[과거 줄거리] autoSave 오류:', err);
                            if (typeof window.addRightLog === 'function') {
                                window.addRightLog('error', `[과거 줄거리] 저장 오류: ${err.message}`);
                            }
                        });
                        return true;
                    } else {
                        console.warn('[과거 줄거리] autoSave 함수를 찾을 수 없습니다.');
                        return false;
                    }
                };
                
                // 첫 번째 시도
                setTimeout(() => {
                    if (!attemptSave()) {
                        console.warn('[과거 줄거리] 첫 번째 저장 시도 실패, 재시도 예정');
                    }
                }, 1500);
                
                // 두 번째 시도 (안전장치)
                setTimeout(() => {
                    if (!attemptSave()) {
                        console.warn('[과거 줄거리] 두 번째 저장 시도 실패');
                        if (typeof window.addRightLog === 'function') {
                            window.addRightLog('warn', '[과거 줄거리] 자동 저장 실패. 수동으로 저장 버튼을 눌러주세요.');
                        }
                    }
                }, 3000);
                
                console.log('[과거 줄거리] 입력 필드에 값 설정 완료, autoSave 호출 예정');
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('info', `[과거 줄거리] "${pastSummaryAttribute}" 입력 필드에 설정 완료, 자동 저장 시도 중...`);
                }
            } else {
                console.warn('[과거 줄거리] 데이터 입력 필드를 찾을 수 없습니다.');
            }
            
        } catch (error) {
            console.error('[과거 줄거리] 오류:', error);
        }
    }
    
    // 현재 챕터의 줄거리 요약 생성 (저장하지 않음)
    async function generateChapterSummaryWithoutSave(novelTitle, chapters, currentIndex) {
        try {
            console.log('[줄거리 요약] 생성 시작:', { novelTitle, currentIndex });
            
            // 현재 챕터의 데이터만 수집
            if (currentIndex < 0 || currentIndex >= chapters.length) {
                console.warn('[줄거리 요약] 유효하지 않은 챕터 인덱스:', currentIndex);
                return;
            }
            
            const allChapterData = [];
            const chapter = chapters[currentIndex];
            const chapterFullTitle = `챕터 ${chapter.number}: ${chapter.title}`;
            const chapterPrefix = `${novelTitle} → ${chapterFullTitle}`;
            
            // 해당 챕터의 모든 속성 조회
            try {
                const url = getServerUrl('/api/attributes/all');
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.ok && data.attributes) {
                        // 해당 챕터와 관련된 속성만 필터링
                        const chapterAttributes = data.attributes.filter(attr => {
                            const attrText = (attr.text || '').trim();
                            if (!attrText || !attrText.includes(' → ')) return false;
                            
                            const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                            if (parts.length < 2) return false;
                            
                            const attrNovelTitle = parts[0];
                            if (attrNovelTitle !== novelTitle) return false;
                            
                            const chapterPart = parts[1];
                            const chapterMatch = chapterPart.match(/챕터\s*(\d+)/i);
                            if (!chapterMatch || chapterMatch[1] !== chapter.number) return false;
                            
                            // "과거 줄거리" 속성은 제외
                            if (attrText.includes('과거 줄거리')) return false;
                            
                            return true;
                        });
                        
                        // 각 속성의 데이터 조회
                        for (const attr of chapterAttributes) {
                            try {
                                const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=1000`);
                                const dataResponse = await fetch(dataUrl);
                                
                                if (dataResponse.ok) {
                                    const dataData = await dataResponse.json();
                                    if (dataData.ok && dataData.items && dataData.items.length > 0) {
                                        const dataTexts = dataData.items.map(item => {
                                            const text = item.s || item.text || item.data?.text || '';
                                            return text;
                                        }).filter(text => text && text.length > 0);
                                        
                                        if (dataTexts.length > 0) {
                                            const attributePart = attr.text.includes(' → ') 
                                                ? attr.text.split(' → ').slice(2).join(' → ') || attr.text.split(' → ')[1]
                                                : attr.text;
                                            
                                            allChapterData.push({
                                                chapter: chapterFullTitle,
                                                attribute: attributePart,
                                                data: dataTexts
                                            });
                                        }
                                    }
                                }
                            } catch (error) {
                                console.warn('[줄거리 요약] 속성 데이터 조회 오류:', attr.text, error);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('[줄거리 요약] 챕터 데이터 조회 오류:', chapterFullTitle, error);
            }
            
            if (allChapterData.length === 0) {
                console.log('[줄거리 요약] 수집할 데이터가 없습니다.');
                return;
            }
            
            console.log('[줄거리 요약] 수집된 데이터:', allChapterData.length, '개 속성');
            
            // 등장인물 정보 수집
            const allCharacters = [];
            try {
                const url = getServerUrl('/api/attributes/all');
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.ok && data.attributes) {
                        // 등장인물 관련 속성 필터링
                        const characterAttributes = data.attributes.filter(attr => {
                            const attrText = (attr.text || '').trim();
                            if (!attrText || !attrText.includes(' → ')) return false;
                            
                            const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                            if (parts.length < 2) return false;
                            
                            const attrNovelTitle = parts[0];
                            if (attrNovelTitle !== novelTitle) return false;
                            
                            // 등장인물 관련 속성 찾기 (챕터 제한 없이)
                            const lowerAttrText = attrText.toLowerCase();
                            return lowerAttrText.includes('등장인물') || lowerAttrText.includes('character');
                        });
                        
                        // 각 등장인물 속성의 데이터 조회
                        for (const attr of characterAttributes) {
                            try {
                                const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=1000`);
                                const dataResponse = await fetch(dataUrl);
                                
                                if (dataResponse.ok) {
                                    const dataData = await dataResponse.json();
                                    if (dataData.ok && dataData.items && dataData.items.length > 0) {
                                        const characterTexts = dataData.items.map(item => {
                                            const text = item.s || item.text || item.data?.text || '';
                                            return text;
                                        }).filter(text => text && text.length > 0);
                                        
                                        if (characterTexts.length > 0) {
                                            allCharacters.push(...characterTexts);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.warn('[줄거리 요약] 등장인물 데이터 조회 오류:', attr.text, error);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('[줄거리 요약] 등장인물 정보 조회 오류:', error);
            }
            
            console.log('[줄거리 요약] 수집된 등장인물:', allCharacters.length, '개');
            
            // GPT API를 사용하여 장면 종료와 과거 줄거리 생성
            const summaryPrompt = `다음은 소설 "${novelTitle}"의 ${chapterFullTitle} 내용입니다. 이를 바탕으로 다음 구조로 작성해주세요:

**챕터 내용:**

${allChapterData.map((chapterData, idx) => {
    return `**${chapterData.chapter}**
${chapterData.data.map((data, i) => `- ${chapterData.attribute}: ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`).join('\n')}`;
}).join('\n\n')}
${allCharacters.length > 0 ? `\n\n**과거 등장인물 정보:**\n${allCharacters.map((char, idx) => `${idx + 1}. ${char}`).join('\n')}` : ''}

위 내용을 바탕으로 다음 구조로 작성해주세요:

**1. 이야기 끝나는 장면**
- 챕터의 마지막 장면이 어떻게 종료되는지 생생하게 묘사
- 마지막 대화와 상황, 분위기, 인물들의 행동을 구체적으로 서술
- 요약이 아닌 장면 묘사로 작성
- 예시: "주인공이 창밖을 바라보며 말했다. '그렇다면...' 그녀의 목소리는 떨리고 있었다. 손에 쥔 편지는 바람에 날려갔고, 그녀는 그대로 서 있었다."

**2. 주요 대사**
- 챕터에서 등장한 주요 대사들을 발화자와 함께 나열
- 대사는 따옴표로 표시하고, 발화자를 명시
- 예시: "호준: '이렇게까지 해야 하는 거냐, 리사?'"
- 예시: "리사: '호준, 왜 이렇게 해야만 해? 내가 왜 너를…'"

**3. 과거 줄거리**
- 챕터의 전체 흐름과 주요 사건들을 시간순으로 서술
- 등장인물들의 주요 대사들을 자연스럽게 포함 (따옴표로 표시)
- 과거에 일어난 중요한 대사도 포함하여 작성
- 자연스러운 문체로 작성

**4. 과거 등장인물**
- 위에 제공된 과거 등장인물 정보를 바탕으로 등장인물 목록 작성
- 각 등장인물의 특징과 역할을 간단히 설명
${allCharacters.length > 0 ? `- 제공된 등장인물 정보:\n${allCharacters.map((char, idx) => `  ${idx + 1}. ${char}`).join('\n')}` : '- 등장인물 정보가 없습니다.'}

**작성 형식:**
반드시 위 4개 섹션을 모두 순서대로 작성해주세요. 각 섹션은 명확하게 구분되어야 하며, 섹션 제목(예: **1. 이야기 끝나는 장면**)을 반드시 포함해야 합니다. 어떤 섹션도 생략하지 마세요.

**작성 예시:**
**1. 이야기 끝나는 장면**
[챕터의 마지막 장면 묘사]

**2. 주요 대사**
[주요 대사 목록]

**3. 과거 줄거리**
[과거 줄거리 내용]

**4. 과거 등장인물**
[등장인물 목록]`;

            // GPT API 호출
            const gptUrl = getServerUrl('/api/gpt/chat');
            const gptResponse = await fetch(gptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: summaryPrompt,
                    model: window.API_CONFIG?.defaultModel || 'gpt-4o-mini',
                    temperature: 0.7,
                    maxTokens: 2500,
                    systemMessage: '당신은 소설 작성을 돕는 AI 어시스턴트입니다. 주어진 내용을 바탕으로 명확하고 간결한 줄거리 요약을 작성해주세요. 특히 등장인물들의 주요 대사들을 자연스럽게 포함하여 작성해야 합니다. 대사는 따옴표로 표시하여 구분하고, 줄거리 흐름에 자연스럽게 녹아들도록 작성해주세요. 반드시 다음 4개 섹션을 모두 순서대로 작성해야 합니다: 1. 이야기 끝나는 장면, 2. 주요 대사, 3. 과거 줄거리, 4. 과거 등장인물. 어떤 섹션도 생략하지 마세요.'
                }),
            });
            
            if (!gptResponse.ok) {
                console.warn('[줄거리 요약] GPT API 호출 실패:', gptResponse.status);
                return null;
            }
            
            const gptData = await gptResponse.json();
            if (!gptData.ok || !gptData.response) {
                console.warn('[줄거리 요약] GPT 응답 오류:', gptData.error);
                return null;
            }
            
            let summaryText = (gptData.response || '').trim();
            if (!summaryText) {
                console.warn('[줄거리 요약] 요약 텍스트가 비어있습니다.');
                return null;
            }
            
            // GPT 응답에서 실제 장면 묘사만 추출 (설명 부분 제거)
            summaryText = cleanSummaryText(summaryText);
            
            console.log('[줄거리 요약] 요약 생성 완료:', summaryText.length, '자');
            
            // 요약 텍스트 반환 (저장하지 않음)
            return summaryText;
            
        } catch (error) {
            console.error('[줄거리 요약] 오류:', error);
            return null;
        }
    }
    
    // GPT 응답에서 실제 장면 묘사만 추출하는 함수
    function cleanSummaryText(text) {
        if (!text) return '';
        
        // "*" 문자 제거
        text = text.replace(/\*/g, '');
        
        // "// 이렇게 입력되는데", "// 이 부분만 입력되게 해줘" 같은 주석 제거
        text = text.replace(/\/\/[^\n]*/g, '');
        
        // "이렇게 수정해 보았습니다", "이 장면은..." 같은 메타 설명 제거
        text = text.replace(/이렇게\s+수정해\s+보았습니다[^\n]*/gi, '');
        text = text.replace(/이\s+장면은[^\n]*/gi, '');
        text = text.replace(/이렇게\s+입력되는데[^\n]*/gi, '');
        text = text.replace(/이\s+부분만[^\n]*/gi, '');
        text = text.replace(/필요한\s+부분이\s+더\s+있다면[^\n]*/gi, '');
        text = text.replace(/말씀해\s+주세요[^\n]*/gi, '');
        text = text.replace(/작용할\s+것이다[^\n]*/gi, '');
        text = text.replace(/요소로\s+작용할[^\n]*/gi, '');
        text = text.replace(/고민하게\s+만드는[^\n]*/gi, '');
        text = text.replace(/이어갈지를[^\n]*/gi, '');
        text = text.replace(/앞으로의\s+여정을[^\n]*/gi, '');
        text = text.replace(/내면의\s+갈등과[^\n]*/gi, '');
        text = text.replace(/리사의[^\n]*갈등과[^\n]*/gi, '');
        text = text.replace(/중요한\s+전환점이\s+된다[^\n]*/gi, '');
        text = text.replace(/독자에게\s+강한\s+감정적\s+여운을[^\n]*/gi, '');
        text = text.replace(/이야기의\s+깊이를\s+더하며[^\n]*/gi, '');
        text = text.replace(/복잡한\s+감정을\s+통해[^\n]*/gi, '');
        text = text.replace(/호준의\s+마지막\s+순간과[^\n]*/gi, '');
        
        // 마크다운 헤더 제거 (##, ###, **1. 챕터 장면 종료** 등)
        text = text.replace(/^#{1,6}\s+/gm, '');
        text = text.replace(/\*\*[^\*]+\*\*/g, '');
        text = text.replace(/\*\*1\.\s*(이야기\s*끝나는\s*장면|챕터\s*장면\s*종료)\*\*/gi, '');
        text = text.replace(/\*\*2\.\s*(주요\s*대사)\*\*/gi, '');
        text = text.replace(/\*\*3\.\s*(과거\s*줄거리)\*\*/gi, '');
        text = text.replace(/\*\*4\.\s*(과거\s*등장인물)\*\*/gi, '');
        text = text.replace(/\*\*1\.\s*챕터\s*결말\s*부분[^\*]*\*\*/gi, '');
        
        // "**작성 형식:**" 같은 설명 제거
        text = text.replace(/\*\*작성\s*형식[^\*]*\*\*/gi, '');
        text = text.replace(/먼저\s*"[^"]*"\s*섹션을[^\n]*/gi, '');
        text = text.replace(/그\s+다음\s*"[^"]*"\s*섹션을[^\n]*/gi, '');
        text = text.replace(/작성하고[^\n]*/gi, '');
        text = text.replace(/작성해주세요[^\n]*/gi, '');
        
        // 빈 줄 정리 (3개 이상 연속된 빈 줄은 2개로)
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // 앞뒤 공백 제거
        text = text.trim();
        
        // "리사는 호준의 숨통을 끊으려 단검을 찔렀다" 같은 실제 장면 시작 부분 찾기
        // 만약 설명이 앞에 있으면 실제 장면 부분만 추출
        const sceneStartPatterns = [
            /리사는\s+호준의\s+숨통을/,
            /리사는\s+그의\s+품에서/,
            /호준은\s+약간\s+웃으며/,
            /그때[,\s]+리사의/,
            /"일로와\."/,
            /"새끼들/,
            /리사와\s+앨프\s+가드는/
        ];
        
        let sceneStartIndex = -1;
        for (const pattern of sceneStartPatterns) {
            const match = text.search(pattern);
            if (match !== -1) {
                sceneStartIndex = match;
                break;
            }
        }
        
        // 실제 장면이 시작되는 부분부터 추출
        if (sceneStartIndex !== -1) {
            text = text.substring(sceneStartIndex);
        }
        
        // 끝 부분의 설명 제거 (예: "이 장면은...", "이렇게 수정해 보았습니다...")
        const endPatterns = [
            /이\s+장면은.*$/s,
            /이렇게\s+수정해.*$/s,
            /필요한\s+부분이.*$/s,
            /작용할\s+것이다.*$/s,
            /요소로\s+작용할.*$/s
        ];
        
        for (const pattern of endPatterns) {
            text = text.replace(pattern, '').trim();
        }
        
        return text.trim();
    }
    
    // 챕터의 모든 속성과 데이터를 대화 상자에 추가하는 함수
    async function appendChapterAllDataToChatInput(novelTitle, chapterFullTitle, chapterNum) {
        const chapterPrefix = `${novelTitle} → ${chapterFullTitle}`;
        
        try {
            // 모든 속성 조회
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (!response.ok) {
                console.warn('[챕터 데이터] 속성 조회 실패');
                appendToChatInput(chapterPrefix);
                return;
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                console.warn('[챕터 데이터] 속성 데이터 없음');
                appendToChatInput(chapterPrefix);
                return;
            }
            
            // 해당 챕터와 관련된 속성만 필터링
            const chapterAttributes = data.attributes.filter(attr => {
                const attrText = (attr.text || '').trim();
                if (!attrText || !attrText.includes(' → ')) return false;
                
                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                if (parts.length < 2) return false;
                
                const attrNovelTitle = parts[0];
                if (attrNovelTitle !== novelTitle) return false;
                
                const chapterPart = parts[1];
                const chapterMatch = chapterPart.match(/챕터\s*(\d+)/i);
                if (!chapterMatch || chapterMatch[1] !== chapterNum) return false;
                
                return true;
            });
            
            console.log('[챕터 데이터] 관련 속성 수:', chapterAttributes.length);
            
            // 각 속성의 데이터 조회 및 수집
            const allDataForGPT = []; // GPT에 전달할 전체 데이터
            const chatTextParts = []; // 대화 입력창에 표시할 텍스트 (크기만)
            
            for (const attr of chapterAttributes) {
                try {
                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=1000`);
                    const dataResponse = await fetch(dataUrl);
                    
                    if (dataResponse.ok) {
                        const dataData = await dataResponse.json();
                        if (dataData.ok && dataData.items && dataData.items.length > 0) {
                            const attrText = attr.text || '';
                            const attributePart = attrText.includes(' → ') 
                                ? attrText.split(' → ').slice(2).join(' → ') || attrText.split(' → ')[1]
                                : attrText;
                            
                            // 데이터 텍스트 추출
                            const dataTexts = dataData.items.map(item => {
                                const text = item.s || item.text || item.data?.text || '';
                                return text;
                            }).filter(text => text && text.length > 0);
                            
                            if (dataTexts.length > 0) {
                                // GPT에 전달할 전체 데이터
                                allDataForGPT.push({
                                    attribute: attributePart,
                                    fullAttribute: attrText,
                                    data: dataTexts
                                });
                                
                                // 대화 입력창에는 크기만 표시
                                const totalSize = dataTexts.reduce((sum, text) => sum + text.length, 0);
                                chatTextParts.push(`- ${attributePart}: 데이터 ${dataTexts.length}개 (${totalSize.toLocaleString()}자)`);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[챕터 데이터] 속성 데이터 조회 오류:', attr.text, error);
                }
            }
            
            // GPT에 전달할 데이터를 전역 변수에 저장
            if (typeof window !== 'undefined') {
                window.chapterDataForGPT = {
                    chapterTitle: chapterFullTitle,
                    novelTitle: novelTitle,
                    attributes: allDataForGPT
                };
                console.log('[챕터 데이터] GPT 전달 데이터 저장:', {
                    chapterTitle: chapterFullTitle,
                    attributeCount: allDataForGPT.length,
                    totalDataCount: allDataForGPT.reduce((sum, attr) => sum + attr.data.length, 0)
                });
            }
            
            // 대화 입력창에 추가 (크기만 표시)
            let chatText = `${chapterPrefix}\n\n**챕터 데이터 요약:**\n${chatTextParts.join('\n')}`;
            if (chatTextParts.length === 0) {
                chatText = chapterPrefix;
            }
            
            appendToChatInput(chatText);
            
        } catch (error) {
            console.error('[챕터 데이터] 오류:', error);
            appendToChatInput(chapterPrefix);
        }
    };
    
    // 데이터 항목 삭제 함수
    // 데이터 항목 삭제 함수 (right_data_manager.js로 이동)
    // right_data_manager.js에서 이미 정의되었으므로 여기서는 주석 처리
    /*
    window.deleteDataItem = async function(attrBitMax, attrBitMin, dataBitMax, dataBitMin, dataText) {
        try {
            // BIT 값 검증
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
            
            // 삭제 전 실제 저장된 데이터 확인 (디버깅용)
            try {
                const checkUrl = getServerUrl(`/api/attributes/data?bitMax=${attrMax}&bitMin=${attrMin}&limit=100`);
                const checkResponse = await fetch(checkUrl);
                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    const checkItems = (checkData.ok && checkData.items) ? checkData.items : [];
                    console.log('[데이터 삭제] 저장된 데이터 확인:', {
                        총개수: checkItems.length,
                        데이터: checkItems.map(item => ({
                            dataMax: item.max || item.dataBitMax,
                            dataMin: item.min || item.dataBitMin,
                            text: (item.s || item.text || '').substring(0, 50)
                        }))
                    });
                    
                    // 삭제하려는 데이터와 일치하는 항목 확인
                    const matchingItem = checkItems.find(item => {
                        const itemMax = item.max !== undefined ? item.max : item.dataBitMax;
                        const itemMin = item.min !== undefined ? item.min : item.dataBitMin;
                        // 부동소수점 비교 (작은 오차 허용)
                        const maxDiff = Math.abs((itemMax || 0) - dataMax);
                        const minDiff = Math.abs((itemMin || 0) - dataMin);
                        return maxDiff < 1e-10 && minDiff < 1e-10;
                    });
                    
                    if (matchingItem) {
                        console.log('[데이터 삭제] 일치하는 항목 발견:', matchingItem);
                    } else {
                        console.warn('[데이터 삭제] 일치하는 항목을 찾을 수 없습니다. BIT 값 재확인 필요');
                    }
                }
            } catch (e) {
                console.warn('[데이터 삭제] 저장된 데이터 확인 중 오류:', e);
            }
            
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
            
            console.log('[데이터 삭제] 응답 상태:', response.status);
            
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
            console.log('[데이터 삭제] 응답:', result);
            
            if (result && result.ok) {
                const deletedCount = result.deletedCount || 0;
                console.log('[데이터 삭제] 완료, 삭제된 항목:', deletedCount);
                
                if (deletedCount === 0) {
                    if (typeof window.addLeftLog === 'function') {
                        window.addLeftLog('warn', `[좌측 삭제] 데이터 삭제 실패: 삭제된 항목 0개`);
                    }
                    console.warn('[데이터 삭제] 삭제된 항목이 0개입니다. BIT 값 확인:', {
                        attributeBitMax: attrMax,
                        attributeBitMin: attrMin,
                        dataBitMax: dataMax,
                        dataBitMin: dataMin
                    });
                    alert('⚠️ 삭제된 항목이 없습니다. BIT 값이 일치하지 않거나 이미 삭제되었을 수 있습니다.');
                } else {
                    // 데이터 삭제 성공 - 속성은 유지하고 데이터만 삭제됨
                    if (typeof window.addLeftLog === 'function') {
                        window.addLeftLog('info', `[좌측 삭제] 데이터 삭제 완료: ${deletedCount}개 항목 삭제됨`);
                    }
                    console.log('[데이터 삭제] 데이터 삭제 완료, 속성은 유지됩니다');
                    
                    // 속성 목록 새로고침 (삭제된 데이터가 반영되도록)
                    if ($attributeFilterInput && $attributeFilterInput.value.trim()) {
                        setTimeout(() => {
                            loadAttributes();
                        }, 300);
                    }
                }
            } else {
                if (typeof window.addLeftLog === 'function') {
                    window.addLeftLog('error', `[좌측 삭제] 데이터 삭제 실패: ${result?.error || '알 수 없는 오류'}`);
                }
                console.warn('[데이터 삭제] 응답 확인:', result);
                alert(`✗ 삭제 실패: ${result?.error || '알 수 없는 오류'}`);
            }
            
            // 서버 처리 시간을 고려한 약간의 딜레이 후 목록 새로고침
            setTimeout(async () => {
                await loadAttributes();
            }, 300);
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 삭제] 데이터 삭제 오류: ${error.message}`);
            }
            console.error('[데이터 삭제] 오류:', error);
            alert(`✗ 삭제 실패: ${error.message}`);
            // 오류 발생 시에도 목록 새로고침
            setTimeout(async () => {
                await loadAttributes();
            }, 300);
        }
    };
    */
    // right_data_manager.js에서 제공하는 함수 사용
    
    // 속성 삭제 함수 (속성의 모든 데이터 삭제) - right_data_manager.js로 이동
    /*
    window.deleteAttribute = async function(attrBitMax, attrBitMin, attrText) {
        try {
            // BIT 값 검증
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
            
            // 먼저 해당 속성의 모든 데이터 조회
            const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attrMax}&bitMin=${attrMin}&limit=1000`);
            const dataResponse = await fetch(dataUrl);
            
            if (!dataResponse.ok) {
                throw new Error(`데이터 조회 실패: HTTP ${dataResponse.status}`);
            }
            
            const dataData = await dataResponse.json();
            const dataItems = (dataData.ok && dataData.items) ? dataData.items : [];
            
            console.log(`[속성 삭제] 발견된 데이터 항목: ${dataItems.length}개`);
            
            // 모든 데이터 삭제
            let deletedCount = 0;
            let errorCount = 0;
            
            for (const item of dataItems) {
                const itemBits = item.max !== undefined && item.min !== undefined 
                    ? { max: item.max, min: item.min }
                    : { max: item.dataBitMax, min: item.dataBitMin };
                
                if (!Number.isFinite(itemBits.max) || !Number.isFinite(itemBits.min)) {
                    console.warn('[속성 삭제] 유효하지 않은 데이터 BIT 값:', itemBits);
                    continue;
                }
                
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
                            console.warn('[속성 삭제] 데이터 삭제 실패:', result);
                        }
                    } else {
                        errorCount++;
                        console.warn('[속성 삭제] HTTP 오류:', response.status);
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
                console.warn(`[속성 삭제] 일부 실패: ${deletedCount}개 성공, ${errorCount}개 실패`);
            }
            
            // 서버 처리 시간을 고려한 약간의 딜레이 후 목록 새로고침
            setTimeout(async () => {
                await loadAttributes();
            }, 500);
        } catch (error) {
            if (typeof window.addLeftLog === 'function') {
                window.addLeftLog('error', `[좌측 삭제] 속성 삭제 오류: ${error.message}`);
            }
            console.error('[속성 삭제] 오류:', error);
            alert(`✗ 삭제 실패: ${error.message}`);
            // 오류 발생 시에도 목록 새로고침
            setTimeout(async () => {
                await loadAttributes();
            }, 500);
        }
    };
    */
    // right_data_manager.js에서 제공하는 함수 사용
    
    // 로컬 스토리지 키
    const STORAGE_KEY_ATTRIBUTE_FILTER = 'novel_ai_attribute_filter';
    const STORAGE_KEY_ADDITIONAL_SEARCH = 'novel_ai_additional_search';
    
    // 입력값 자동 저장 함수
    function saveFilterValues() {
        try {
            if ($attributeFilterInput) {
                localStorage.setItem(STORAGE_KEY_ATTRIBUTE_FILTER, $attributeFilterInput.value || '');
            }
            if ($additionalSearchInput) {
                localStorage.setItem(STORAGE_KEY_ADDITIONAL_SEARCH, $additionalSearchInput.value || '');
            }
        } catch (e) {
            console.warn('[필터 저장] 오류:', e);
        }
    }
    
    // 저장된 값 불러오기
    function loadFilterValues() {
        try {
            if ($attributeFilterInput) {
                const savedFilter = localStorage.getItem(STORAGE_KEY_ATTRIBUTE_FILTER);
                if (savedFilter) {
                    $attributeFilterInput.value = savedFilter;
                }
            }
            if ($additionalSearchInput) {
                const savedSearch = localStorage.getItem(STORAGE_KEY_ADDITIONAL_SEARCH);
                if (savedSearch) {
                    $additionalSearchInput.value = savedSearch;
                }
            }
            updateAdditionalSearchBitInfo();
        } catch (e) {
            console.warn('[필터 불러오기] 오류:', e);
        }
    }
    
    // 속성 필터 입력 이벤트
    if ($attributeFilterInput) {
        let filterTimer = null;
        $attributeFilterInput.addEventListener('input', () => {
            // 자동 저장
            saveFilterValues();
            
            clearTimeout(filterTimer);
            filterTimer = setTimeout(() => {
                loadAttributes();
            }, 500);
        });
    }
    
    // 전역 함수로 노출 (다른 스크립트에서 호출 가능하도록)
    window.loadAttributes = loadAttributes;
    
    // 추가 검색 입력 이벤트
    if ($additionalSearchInput) {
        let searchTimer = null;
        $additionalSearchInput.addEventListener('input', () => {
            // 자동 저장
            saveFilterValues();
            updateAdditionalSearchBitInfo();
            
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                loadAttributes();
            }, 500);
        });
    }
    
    // 새로고침 버튼
    if ($refreshBtn) {
        $refreshBtn.addEventListener('click', () => {
            const filterText = ($attributeFilterInput && $attributeFilterInput.value || '').trim();
            if (filterText) {
                loadAttributes();
            } else {
                loadNovelList();
            }
        });
    }
    
    // 필터 초기화 버튼
    if ($clearFilterBtn) {
        $clearFilterBtn.addEventListener('click', () => {
            if ($attributeFilterInput) $attributeFilterInput.value = '';
            if ($additionalSearchInput) $additionalSearchInput.value = '';
            // 저장된 값도 삭제
            saveFilterValues();
            updateAdditionalSearchBitInfo();
            loadNovelList(); // 소설 목록으로 돌아가기
        });
    }
    
    // BIT 계산 함수 로드 대기
    let waitCount = 0;
    const checkBitFunctions = setInterval(() => {
        if (typeof wordNbUnicodeFormat !== 'undefined' && typeof BIT_MAX_NB !== 'undefined' && typeof BIT_MIN_NB !== 'undefined') {
            clearInterval(checkBitFunctions);
            console.info('[속성/데이터 관리] BIT 계산 함수 로드 완료');
            updateAdditionalSearchBitInfo();
            
            // 서버 연결 테스트
            testServerConnection().then(isConnected => {
                if (isConnected) {
                    console.info('[속성/데이터 관리] 서버 연결 성공');
                } else {
                    console.warn('[속성/데이터 관리] 서버 연결 실패 - 서버가 실행 중인지 확인하세요');
                    if ($saveStatus) {
                        updateSaveStatus('⚠️ 서버 연결 실패 - 서버가 실행 중인지 확인하세요', 'warning');
                    }
                }
            });
        } else {
            waitCount++;
            if (waitCount > 50) {
                clearInterval(checkBitFunctions);
                console.warn('[속성/데이터 관리] BIT 계산 함수 로드 타임아웃');
            }
        }
    }, 100);
    
    // 초기 서버 URL 표시
    if ($serverUrl) {
        const url = getServerUrl('/api/attributes/data');
        $serverUrl.textContent = `서버 URL: ${url}`;
    }
    
    // 저장된 필터 값 불러오기
    loadFilterValues();
    
    // 저장된 입력 필드 값 불러오기
    if ($novelTitleInput) {
        const savedNovelTitle = localStorage.getItem(STORAGE_KEY_NOVEL_TITLE);
        if (savedNovelTitle) {
            $novelTitleInput.value = savedNovelTitle;
            // 이벤트 트리거하여 BIT 값 재계산
            const inputEvent = new Event('input', { bubbles: true });
            $novelTitleInput.dispatchEvent(inputEvent);
        }
    }
    
    if ($attributeInput) {
        const savedAttributeText = localStorage.getItem(STORAGE_KEY_ATTRIBUTE_TEXT);
        if (savedAttributeText) {
            $attributeInput.value = savedAttributeText;
            // 이벤트 트리거하여 BIT 값 재계산
            const inputEvent = new Event('input', { bubbles: true });
            $attributeInput.dispatchEvent(inputEvent);
        }
    }
    
    if ($dataInput) {
        const savedDataText = localStorage.getItem(STORAGE_KEY_DATA_TEXT);
        if (savedDataText) {
            $dataInput.value = savedDataText;
            // 이벤트 트리거하여 BIT 값 재계산
            const inputEvent = new Event('input', { bubbles: true });
            $dataInput.dispatchEvent(inputEvent);
        }
    }
    
    if ($novelTitleInputForChapter) {
        const savedNovelTitleForChapter = localStorage.getItem(STORAGE_KEY_NOVEL_TITLE_FOR_CHAPTER);
        if (savedNovelTitleForChapter) {
            $novelTitleInputForChapter.value = savedNovelTitleForChapter;
            // 저장된 인덱스 확인
            const storageKey = `chapterListIndex_${savedNovelTitleForChapter}`;
            const savedIndex = localStorage.getItem(storageKey);
            // 챕터 목록 로드 (저장된 인덱스로 복원)
            if (savedNovelTitleForChapter.trim()) {
                setTimeout(() => {
                    loadChapterList(savedNovelTitleForChapter);
                }, 500);
            }
        }
    }
    
    // 자동 저장 모듈 초기화
    if (typeof window.initAutoSave === 'function') {
        window.initAutoSave({
            novelTitleInput: $novelTitleInput,
            attributeInput: $attributeInput,
            dataInput: $dataInput,
            attributeBitInfo: $attributeBitInfo,
            dataBitInfo: $dataBitInfo,
            saveStatus: $saveStatus,
            attributeFilterInput: $attributeFilterInput,
            calculateBitValues: calculateBitValues,
            checkDuplicate: checkDuplicate,
            getServerUrl: getServerUrl,
            updateSaveStatus: updateSaveStatus,
            updateNovelAIStatus: typeof window.updateNovelAIStatus === 'function' ? window.updateNovelAIStatus : null,
            saveFilterValues: saveFilterValues,
            loadAttributes: loadAttributes,
            loadNovelList: loadNovelList
        });
    }
    
    // 저장된 필터 값이 있으면 자동으로 속성 목록 로드
    const savedFilter = localStorage.getItem(STORAGE_KEY_ATTRIBUTE_FILTER);
    if (savedFilter && savedFilter.trim()) {
        // 필터 값이 있으면 속성 목록 로드
        setTimeout(() => {
            loadAttributes();
        }, 300);
    } else {
        // 필터 값이 없으면 초기 소설 목록 로드
        loadNovelList();
    }
    
    // 서버 연결 상태 확인 (입력 필드가 있는 경우)
    if (hasInputFields) {
        testServerConnection(true);
    }
    
    console.info('[속성/데이터 관리] 초기화 완료');
    console.info('[속성/데이터 관리] 서버 URL:', getServerUrl('/api/attributes/data'));
});

