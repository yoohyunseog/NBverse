(() => {
  'use strict';

  const Shared = window.NovelAIShared;
  if (!Shared) {
    console.error('[OutlineRunner] novel_ai_shared.js가 로드되지 않았습니다.');
    return;
  }

  const { calculateBitValues, saveRecord, deleteExistingRecord, fetchRecords } = Shared;
  const SECTION_ORDER = Shared.sectionOrder || ['구성', '상세', '스토리', '에필로그', '주요 사건'];

  const elements = {
    novelTitleInput: document.getElementById('novelTitleInput'),
    chapterNumberInput: document.getElementById('chapterNumberInput'),
    sectionList: document.getElementById('sectionList'),
    summaryList: document.getElementById('summaryList'),
    refreshBtn: document.getElementById('refreshBtn'),
    clearBtn: document.getElementById('clearBtn'),
    log: document.getElementById('runnerLog')
  };

  const state = {
    timeouts: new Map(),
    lastSignatures: new Map(),
    summaries: new Map()
  };

  function addLog(message, type = 'info') {
    if (!elements.log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    elements.log.appendChild(entry);
    elements.log.scrollTo({ top: elements.log.scrollHeight, behavior: 'smooth' });
  }

  function getBaseUrl() {
    if (typeof window.getServerUrl === 'function') {
      return window.getServerUrl('').replace(/\/$/, '');
    }
    return window.location.origin.replace(/\/$/, '');
  }

  function getNovelTitle() {
    return elements.novelTitleInput?.value?.trim() || '';
  }

  function getChapterNumber() {
    const value = elements.chapterNumberInput?.value?.trim();
    return value ? parseInt(value, 10) : null;
  }

  function buildAttributeText(sectionName) {
    const title = getNovelTitle();
    const chapter = getChapterNumber();
    if (!title || !chapter) return '';
    return `${title} → 챕터 ${chapter}: 제${chapter}장 → ${sectionName}`;
  }

  function renderSections() {
    if (!elements.sectionList) return;
    elements.sectionList.innerHTML = '';
    SECTION_ORDER.forEach(sectionName => {
      const item = document.createElement('div');
      item.className = 'section-item';
      item.dataset.section = sectionName;

      const header = document.createElement('div');
      header.className = 'section-header';
      const title = document.createElement('span');
      title.textContent = sectionName;
      const status = document.createElement('span');
      status.className = 'section-status';
      status.textContent = '대기';
      header.append(title, status);

      const textarea = document.createElement('textarea');
      textarea.className = 'section-textarea';
      textarea.placeholder = `${sectionName} 내용을 입력하세요.`;
      textarea.dataset.section = sectionName;
      textarea.addEventListener('input', () => {
        status.textContent = '저장 대기';
        scheduleSave(sectionName, textarea, status);
      });

      item.append(header, textarea);
      elements.sectionList.appendChild(item);
    });
  }

  function scheduleSave(sectionName, textarea, statusEl) {
    if (state.timeouts.has(sectionName)) {
      clearTimeout(state.timeouts.get(sectionName));
    }
    const timeoutId = setTimeout(() => saveSection(sectionName, textarea, statusEl), 600);
    state.timeouts.set(sectionName, timeoutId);
  }

  async function saveSection(sectionName, textarea, statusEl) {
    const attributeText = buildAttributeText(sectionName);
    const dataText = textarea.value;
    if (!attributeText || !dataText.trim()) {
      statusEl.textContent = '입력 필요';
      return;
    }
    const attributeBits = calculateBitValues(attributeText);
    const signature = `${attributeBits.max}_${attributeBits.min}_${dataText}`;
    if (state.lastSignatures.get(sectionName) === signature) {
      statusEl.textContent = '이미 저장됨';
      return;
    }
    try {
      await deleteExistingRecord(getBaseUrl(), attributeBits, null);
      await saveRecord(getBaseUrl(), {
        attributeText,
        attributeBitMax: attributeBits.max,
        attributeBitMin: attributeBits.min,
        text: dataText
      });
      state.lastSignatures.set(sectionName, signature);
      state.summaries.set(sectionName, {
        attributeText,
        bitMax: attributeBits.max,
        bitMin: attributeBits.min,
        length: dataText.length,
        updatedAt: new Date()
      });
      statusEl.textContent = '저장 완료';
      addLog(`${sectionName} 저장 완료`, 'success');
      renderSummary();
    } catch (error) {
      statusEl.textContent = '오류';
      addLog(`${sectionName} 저장 실패: ${error.message || error}`, 'error');
    }
  }

  function renderSummary() {
    if (!elements.summaryList) return;
    if (!state.summaries.size) {
      elements.summaryList.innerHTML = '<span style="color:#9aa4d9;">섹션별 저장 상태가 여기에 표시됩니다.</span>';
      return;
    }
    const fragment = document.createDocumentFragment();
    SECTION_ORDER.forEach(name => {
      const info = state.summaries.get(name);
      if (!info) return;
      const row = document.createElement('div');
      row.className = 'summary-item';
      const left = document.createElement('span');
      left.textContent = name;
      const right = document.createElement('span');
      right.textContent = `BIT(${info.bitMax.toFixed(6)}, ${info.bitMin.toFixed(6)}) · ${info.length}자`;
      row.append(left, right);
      fragment.appendChild(row);
    });
    elements.summaryList.innerHTML = '';
    elements.summaryList.appendChild(fragment);
  }

  async function refreshFromServer() {
    const title = getNovelTitle();
    const chapter = getChapterNumber();
    if (!title || !chapter) {
      addLog('소설 제목과 챕터 번호를 입력하세요.', 'warn');
      return;
    }
    try {
      const response = await fetchRecords(getBaseUrl(), { novelTitle: title, limit: 200 });
      const records = (response.items || []).filter(item => {
        const attr = item.attribute?.text || '';
        return attr.includes(`챕터 ${chapter}: 제${chapter}장`);
      });
      const sectionMap = new Map();
      records.forEach(item => {
        const attr = item.attribute?.text || '';
        const sectionName = attr.split('→').pop()?.trim() || '';
        sectionMap.set(sectionName, item);
      });
      SECTION_ORDER.forEach(name => {
        const textarea = elements.sectionList?.querySelector(`textarea[data-section="${name}"]`);
        const statusEl = elements.sectionList?.querySelector(`.section-item[data-section="${name}"] .section-status`);
        const record = sectionMap.get(name);
        if (textarea && record) {
          const text = record.data?.text || record.s || '';
          textarea.value = text;
          state.lastSignatures.set(name, `${record.attribute.bitMax}_${record.attribute.bitMin}_${text}`);
          state.summaries.set(name, {
            attributeText: record.attribute.text,
            bitMax: record.attribute.bitMax,
            bitMin: record.attribute.bitMin,
            length: text.length,
            updatedAt: new Date(record.timestamp || Date.now())
          });
          if (statusEl) statusEl.textContent = '서버 반영됨';
        } else if (statusEl) {
          statusEl.textContent = '데이터 없음';
        }
      });
      renderSummary();
      addLog('서버에서 구성 목록을 불러왔습니다.', 'info');
    } catch (error) {
      addLog(`서버 조회 실패: ${error.message || error}`, 'error');
    }
  }

  function clearInputs() {
    SECTION_ORDER.forEach(name => {
      const textarea = elements.sectionList?.querySelector(`textarea[data-section="${name}"]`);
      const statusEl = elements.sectionList?.querySelector(`.section-item[data-section="${name}"] .section-status`);
      if (textarea) textarea.value = '';
      if (statusEl) statusEl.textContent = '대기';
      state.lastSignatures.delete(name);
      state.summaries.delete(name);
    });
    renderSummary();
    addLog('입력이 초기화되었습니다.', 'info');
  }

  function attachEvents() {
    elements.novelTitleInput?.addEventListener('input', () => {
      clearTimeouts();
      state.lastSignatures.clear();
      addLog('제목이 변경되었습니다. 기존 저장과 구성이 분리됩니다.', 'warn');
    });
    elements.chapterNumberInput?.addEventListener('input', () => {
      clearTimeouts();
      state.lastSignatures.clear();
      addLog('챕터가 변경되었습니다. 기존 저장과 구성이 분리됩니다.', 'warn');
    });
    elements.refreshBtn?.addEventListener('click', refreshFromServer);
    elements.clearBtn?.addEventListener('click', clearInputs);
  }

  function clearTimeouts() {
    state.timeouts.forEach(id => clearTimeout(id));
    state.timeouts.clear();
  }

  function init() {
    renderSections();
    attachEvents();
    renderSummary();
    addLog('구성 목록 테스트 페이지가 준비되었습니다.', 'info');
  }

  init();
})();
