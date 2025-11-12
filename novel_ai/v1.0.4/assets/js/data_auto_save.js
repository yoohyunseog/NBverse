/**
 * 데이터 텍스트 자동 저장 모듈
 * 데이터 텍스트 입력 시 자동 저장 기능
 */

(function() {
    'use strict';
    
    // DOM 요소 참조 (나중에 초기화)
    let $novelTitleInput = null;
    let $attributeInput = null;
    let $dataInput = null;
    let $dataBitInfo = null;
    let $attributeBitInfo = null;
    
    // 의존성 함수들 (외부에서 주입받음)
    let calculateBitValues = null;
    
    // 로컬 스토리지 키 및 허용 오차
    const STORAGE_KEY_DATA_TEXT = 'novel_ai_input_data_text';
    const BIT_TOLERANCE = 1e-12;
    
    // 현재 계산된 속성 BIT 캐시
    let currentAttributeBits = { max: null, min: null };
    let currentAttributeBitSource = '';
    
    /**
     * 속성 입력값을 저장 로직과 동일하게 정규화
     * - 여러 줄일 경우 첫 줄만 사용
     * - 소설 제목이 포함되어 있으면 제거
     * @returns {{ attributeOnly: string, full: string }}
     */
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
     * "BIT: x, y" 형태의 문자열에서 값 추출
     */
    function parseBitText(text) {
        if (!text) return null;
        const match = text.match(/BIT:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/);
        if (!match) return null;
        const max = Number(match[1]);
        const min = Number(match[2]);
        if (Number.isNaN(max) || Number.isNaN(min)) return null;
        return { max, min };
    }
    
    /**
     * BIT 값 비교 (허용 오차 포함)
     */
    function bitsApproximatelyEqual(a, b, tolerance = BIT_TOLERANCE) {
        if (!a || !b) return false;
        return (
            Math.abs(a.max - b.max) <= tolerance &&
            Math.abs(a.min - b.min) <= tolerance
        );
    }
    
    /**
     * BIT 정보를 표시하는 요소가 복합 구조일 수 있으므로, 첫 번째 자식의 텍스트만 갱신
     */
    function applyBitText(element, text) {
        if (!element) return;
        const firstElement = element.firstElementChild;
        if (firstElement && typeof firstElement.textContent === 'string' && firstElement.textContent.trim().startsWith('BIT:')) {
            firstElement.textContent = text;
        } else {
            element.textContent = text;
        }
    }
    
    /**
     * attribute 입력값으로 BIT 계산 및 UI 반영
     */
    function computeAndApplyAttributeBits(rawAttributeText) {
        const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
        const { attributeOnly, full } = extractAttributeParts(rawAttributeText, novelTitle);
        if (!calculateBitValues || !full) {
            currentAttributeBits = { max: null, min: null };
            currentAttributeBitSource = '';
            if ($attributeBitInfo) applyBitText($attributeBitInfo, 'BIT: 계산 중...');
            if ($dataBitInfo) applyBitText($dataBitInfo, '(속성 BIT 값을 사용합니다)');
            return;
        }
        const bits = calculateBitValues(full);
        if (bits && bits.max != null && bits.min != null) {
            currentAttributeBits = { max: bits.max, min: bits.min };
            currentAttributeBitSource = full;
            const bitText = `BIT: ${bits.max.toFixed(15)}, ${bits.min.toFixed(15)}`;
            if ($attributeBitInfo) applyBitText($attributeBitInfo, bitText);
            if ($dataBitInfo) applyBitText($dataBitInfo, bitText);
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('info', `[속성 BIT 계산] ${bitText}`);
            }
        } else {
            currentAttributeBits = { max: null, min: null };
            currentAttributeBitSource = '';
            if ($attributeBitInfo) applyBitText($attributeBitInfo, 'BIT: 계산 실패');
            if ($dataBitInfo) applyBitText($dataBitInfo, '(속성 BIT 값을 사용합니다)');
            if (typeof window.addRightLog === 'function') {
                window.addRightLog('warn', `[속성 BIT 계산] 값 계산 실패`);
            }
        }
    }
    
    function parseAttributeBitInfoElement() {
        const element = $attributeBitInfo || document.getElementById('attributeBitInfo');
        if (!element) return null;
        const text = element.innerText || element.textContent || '';
        return parseBitText(text);
    }
    
    function logBitMismatch(displayedBits) {
        if (typeof window.addRightLog === 'function') {
            window.addRightLog('warn', `[데이터 자동 저장] 화면에 표시된 속성 BIT와 계산된 BIT가 일치하지 않아 저장을 중단합니다.`);
            if (displayedBits) {
                window.addRightLog('warn', `  표시된 BIT: MAX=${displayedBits.max}, MIN=${displayedBits.min}`);
            } else {
                window.addRightLog('warn', `  표시된 BIT: (없음)`);
            }
            if (currentAttributeBits.max != null && currentAttributeBits.min != null) {
                window.addRightLog('warn', `  계산된 BIT: MAX=${currentAttributeBits.max}, MIN=${currentAttributeBits.min}`);
            } else {
                window.addRightLog('warn', `  계산된 BIT: (없음)`);
            }
        }
        console.warn('[데이터 자동 저장] BIT 불일치로 저장 중단', {
            displayedBits,
            currentAttributeBits,
            sourceText: currentAttributeBitSource
        });
    }
    
    /**
     * 데이터 텍스트 자동 저장 모듈 초기화
     */
    function initDataAutoSave(options = {}) {
        $novelTitleInput = options.novelTitleInput || document.getElementById('novelTitleInput');
        $attributeInput = options.attributeInput || document.getElementById('attributeInput');
        $dataInput = options.dataInput || document.getElementById('dataInput');
        $dataBitInfo = options.dataBitInfo || document.getElementById('dataBitInfo');
        $attributeBitInfo = options.attributeBitInfo || document.getElementById('attributeBitInfo');
        
        calculateBitValues = options.calculateBitValues || window.calculateBitValues;
        
        try {
            const saved = localStorage.getItem(STORAGE_KEY_DATA_TEXT);
            if (saved && $dataInput) $dataInput.value = saved;
        } catch (error) {
            console.warn('[데이터 자동 저장] 로컬 저장값 복원 실패', error);
        }
        
        if ($attributeInput) {
            let attrTimer = null;
            $attributeInput.addEventListener('input', () => {
                clearTimeout(attrTimer);
                attrTimer = setTimeout(() => {
                    const attributeText = ($attributeInput.value || '').trim();
                    const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                    const { attributeOnly, full } = extractAttributeParts(attributeText, novelTitle);
                    computeAndApplyAttributeBits(full);
                }, 300);
            });
            const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
            const attributeText = ($attributeInput.value || '').trim();
            const { attributeOnly, full } = extractAttributeParts(attributeText, novelTitle);
            computeAndApplyAttributeBits(full);
        }
        
        if ($dataInput) {
            let dataTimer = null;
            $dataInput.addEventListener('input', () => {
                const value = $dataInput.value || '';
                try {
                    localStorage.setItem(STORAGE_KEY_DATA_TEXT, value);
                } catch (error) {
                    console.warn('[데이터 자동 저장] 로컬 저장 실패', error);
                }
                
                if (typeof window.addRightLog === 'function') {
                    window.addRightLog('info', `[데이터 입력] 입력 감지 (${value.length}자)`);
                }
                
                clearTimeout(dataTimer);
                dataTimer = setTimeout(() => {
                    const text = $dataInput.value.trim();
                    const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
                    const attributeRawText = ($attributeInput && $attributeInput.value || '').trim();
                    
                    if (typeof window.addRightLog === 'function') {
                        window.addRightLog('info', `[데이터 자동 저장] 입력 필드 읽기 완료`);
                        window.addRightLog('info', `[데이터 입력] 소설 제목: "${novelTitle || '(없음)'}"`);
                        window.addRightLog('info', `[데이터 입력] 속성 텍스트: "${attributeRawText ? attributeRawText.substring(0, 60) + (attributeRawText.length > 60 ? '...' : '') : '(없음)'}"`);
                        window.addRightLog('info', `[데이터 입력] 데이터 텍스트: "${text ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : '(없음)'}" (${text ? text.length : 0}자)`);
                    }
                    
                    const { attributeOnly, full } = extractAttributeParts(attributeRawText, novelTitle);
                    computeAndApplyAttributeBits(full);
                    const displayedBits = parseAttributeBitInfoElement();
                    
                    if (!displayedBits || currentAttributeBits.max == null || currentAttributeBits.min == null) {
                        logBitMismatch(displayedBits);
                        if ($dataBitInfo) applyBitText($dataBitInfo, '(속성 BIT 값을 사용합니다)');
                        return;
                    }
                    
                    if (!bitsApproximatelyEqual(displayedBits, currentAttributeBits)) {
                        logBitMismatch(displayedBits);
                        if ($dataBitInfo) applyBitText($dataBitInfo, '(속성 BIT 값을 사용합니다)');
                        return;
                    }
                    
                    if ($dataBitInfo) {
                        const bitText = `BIT: ${currentAttributeBits.max.toFixed(15)}, ${currentAttributeBits.min.toFixed(15)}`;
                        applyBitText($dataBitInfo, bitText);
                    }
                    
                    if (!text) {
                        if (typeof window.addRightLog === 'function') {
                            window.addRightLog('warn', `[데이터 자동 저장] 데이터 텍스트 없음 - 저장하지 않음`);
                        }
                        return;
                    }
                    
                    if (typeof window.addRightLog === 'function') {
                        window.addRightLog('info', `[데이터 자동 저장] 저장 시작 - saveAttributeAndData 함수 호출`);
                        window.addRightLog('info', `  - 소설 제목: ${novelTitle ? '✓' : '✗'} "${novelTitle || '(없음)'}"`);
                        window.addRightLog('info', `  - 속성 텍스트: ${attributeOnly ? '✓' : '✗'} "${attributeOnly ? attributeOnly.substring(0, 40) + (attributeOnly.length > 40 ? '...' : '') : '(없음)'}"`);
                        window.addRightLog('info', `  - 데이터 텍스트 길이: ${text.length}자`);
                    }
                    
                    if (typeof window.saveAttributeAndData === 'function') {
                        window.saveAttributeAndData();
                    } else {
                        const errorMsg = '[데이터 자동 저장] saveAttributeAndData 함수를 찾을 수 없습니다.';
                        console.warn(errorMsg);
                        if (typeof window.addRightLog === 'function') {
                            window.addRightLog('error', errorMsg);
                        }
                    }
                }, 1000);
            });
        }
        
        console.info('[데이터 자동 저장 모듈] 초기화 완료');
    }
    
    // 전역으로 노출
    window.initDataAutoSave = initDataAutoSave;
    
})();
