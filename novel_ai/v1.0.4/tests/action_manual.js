(() => {
  'use strict';

  const Shared = window.NovelAIShared;
  if (!Shared) {
    console.error('[ManualRunner] novel_ai_shared.js가 로드되지 않았습니다.');
    return;
  }

  const { calculateBitValues, saveRecord, deleteExistingRecord } = Shared;

  const elements = {
    attributeInput: document.getElementById('attributeTextInput'),
    attributeMax: document.getElementById('attributeMaxOutput'),
    attributeMin: document.getElementById('attributeMinOutput'),
    dataInput: document.getElementById('dataTextInput'),
    resultContent: document.getElementById('fetchResultContent'),
    logContainer: document.getElementById('runnerLog')
  };

  const state = {
    debounceId: null,
    lastPayloadSignature: null
  };

  function addLog(message, type = 'info') {
    if (!elements.logContainer) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    elements.logContainer.appendChild(entry);
    elements.logContainer.scrollTo({ top: elements.logContainer.scrollHeight, behavior: 'smooth' });
  }

  function updateAttributeBits(text) {
    if (!text) {
      elements.attributeMax.textContent = '-';
      elements.attributeMin.textContent = '-';
      return null;
    }
    const bits = calculateBitValues(text);
    elements.attributeMax.textContent = String(bits.max ?? '-');
    elements.attributeMin.textContent = String(bits.min ?? '-');
    return bits;
  }

  function getBaseUrl() {
    if (typeof window.getServerUrl === 'function') {
      return window.getServerUrl('').replace(/\/$/, '');
    }
    return window.location.origin.replace(/\/$/, '');
  }

  function buildPayload() {
    const attributeText = elements.attributeInput?.value?.trim();
    const dataText = elements.dataInput?.value || '';
    if (!attributeText || !dataText) return null;
    return {
      attributeText,
      dataText,
      attributeBits: calculateBitValues(attributeText)
    };
  }

  async function saveAndRender() {
    const payload = buildPayload();
    if (!payload) {
      if (elements.resultContent) {
        elements.resultContent.textContent = '속성과 데이터를 모두 입력하면 자동 저장이 실행됩니다.';
      }
      return;
    }

    const signature = `${payload.attributeBits.max}_${payload.attributeBits.min}_${payload.dataText}`;
    if (state.lastPayloadSignature === signature) return;

    const baseUrl = getBaseUrl();

    try {
      await deleteExistingRecord(baseUrl, payload.attributeBits, null);
      await saveRecord(baseUrl, {
        attributeText: payload.attributeText,
        attributeBitMax: payload.attributeBits.max,
        attributeBitMin: payload.attributeBits.min,
        text: payload.dataText
      });
      state.lastPayloadSignature = signature;
      addLog('자동 저장 완료', 'success');
      renderResult(payload.attributeText, payload.attributeBits, payload.dataText);
    } catch (error) {
      addLog(`자동 저장 실패: ${error.message || error}`, 'error');
      state.lastPayloadSignature = null;
    }
  }

  function renderResult(attributeText, attributeBits, dataText) {
    if (!elements.resultContent) return;
    const summary = [
      `속성: ${attributeText}`,
      `속성 BIT: max=${attributeBits.max}, min=${attributeBits.min}`,
      '',
      '저장된 데이터:',
      dataText
    ].join('\n');
    elements.resultContent.textContent = summary;
  }

  function scheduleSave() {
    if (state.debounceId) clearTimeout(state.debounceId);
    state.debounceId = setTimeout(saveAndRender, 500);
  }

  function init() {
    elements.attributeInput?.addEventListener('input', event => {
      updateAttributeBits(event.target.value);
      state.lastPayloadSignature = null;
      scheduleSave();
    });
    elements.dataInput?.addEventListener('input', () => {
      state.lastPayloadSignature = null;
      scheduleSave();
    });
    addLog('심플 수동 입력 페이지가 준비되었습니다.', 'info');
  }

  init();
})();
