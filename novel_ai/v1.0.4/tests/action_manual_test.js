(() => {
  'use strict';

  const Shared = window.NovelAIShared;
  if (!Shared) {
    console.error('[ManualTest] novel_ai_shared.js가 로드되지 않았습니다.');
    return;
  }

  const { calculateBitValues, saveRecord, deleteExistingRecord, fetchRecords } = Shared;

  const elements = {
    attributeInput: document.getElementById('attributeTextInput'),
    attributeMax: document.getElementById('attributeMaxOutput'),
    attributeMin: document.getElementById('attributeMinOutput'),
    dataInput: document.getElementById('dataTextInput'),
    dataListMax: document.getElementById('dataListMax'),
    dataListMin: document.getElementById('dataListMin'),
    logMax: document.getElementById('logMax'),
    logMin: document.getElementById('logMin'),
    folderListMax: document.getElementById('folderListMax'),
    folderListMin: document.getElementById('folderListMin'),
    resultContent: document.getElementById('fetchResultContent'),
    logContainer: document.getElementById('runnerLog'),
    apiLink: document.getElementById('folderApiLink'),
    apiSummary: document.getElementById('folderApiSummary'),
    topApiLink: document.getElementById('topApiLink'),
    deleteButton: document.getElementById('deleteCurrentButton'),
  };

  const state = {
    debounceId: null,
    lastSignature: null,
    itemsMax: [],
    itemsMin: [],
    focusAttribute: ''
  };

  function formatLogMessage(message) {
    return `${message}`;
  }

  function addLog(message, type = 'info') {
    if (!elements.logContainer) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = formatLogMessage(`[${new Date().toLocaleTimeString()}] ${message}`);
    elements.logContainer.appendChild(entry);
    elements.logContainer.scrollTo({ top: elements.logContainer.scrollHeight, behavior: 'smooth' });
  }

  function setColumnLog(logElement, message) {
    if (!logElement) return;
    logElement.textContent = formatLogMessage(`[${new Date().toLocaleTimeString()}] ${message}`);
  }

  function updateAttributeBits(value) {
    if (!value) {
      elements.attributeMax.textContent = '-';
      elements.attributeMin.textContent = '-';
      return null;
    }
    const bits = calculateBitValues(value);
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

  function extractNovelTitle(attributeText = '') {
    const parts = attributeText.split('→');
    return parts.length ? parts[0].trim() : '';
  }

  function buildPayload() {
    const attributeText = elements.attributeInput?.value?.trim();
    const dataText = elements.dataInput?.value || '';
    if (!attributeText || !dataText.trim()) return null;
    return {
      attributeText,
      dataText,
      attributeBits: calculateBitValues(attributeText),
      novelTitle: extractNovelTitle(attributeText)
    };
  }

  async function autoSave() {
    const payload = buildPayload();
    if (!payload) {
      if (elements.resultContent) {
        elements.resultContent.textContent = '속성과 데이터를 모두 입력하면 자동 저장이 실행됩니다.';
      }
      return;
    }

    state.focusAttribute = payload.attributeText;
    const signature = `${payload.attributeBits.max}_${payload.attributeBits.min}_${payload.dataText}`;
    if (state.lastSignature === signature) {
      renderResult(payload);
      await refreshList(payload.attributeText, true);
      await refreshFolders(true);
      return;
    }

    try {
      await deleteExistingRecord(getBaseUrl(), payload.attributeBits, null);
      await saveRecord(getBaseUrl(), {
        attributeText: payload.attributeText,
        attributeBitMax: payload.attributeBits.max,
        attributeBitMin: payload.attributeBits.min,
        text: payload.dataText
      });
      state.lastSignature = signature;
      addLog('자동 저장 완료', 'success');
      renderResult(payload);
      await refreshList(payload.attributeText, true);
      await refreshFolders(true);
    } catch (error) {
      addLog(`자동 저장 실패: ${error.message || error}`, 'error');
    }
  }

  function renderResult(payload) {
    if (!elements.resultContent || !payload) return;
    const { attributeText, attributeBits, dataText } = payload;
    const summary = [
      `속성: ${attributeText}`,
      `속성 BIT: max=${attributeBits.max}, min=${attributeBits.min}`,
      '',
      '저장된 데이터:',
      dataText
    ].join('\n');
    elements.resultContent.textContent = summary;
  }

  async function refreshList(focusAttribute = '', silent = false) {
    try {
      const response = await fetchRecords(getBaseUrl(), { limit: 1000 });
      const items = Array.isArray(response.items) ? response.items : [];
      const maxItems = [];
      const minItems = [];
      items.forEach(item => {
        const attr = (item.attribute?.text || item.attributeText || '').trim();
        const text = (item.data?.text || item.dataText || item.s || '').trim();
        const sourcePath = (item.source?.file || '').toLowerCase();
        if (!attr || !text) return;
        let classified = false;
        if (sourcePath.includes('/max/') || sourcePath.includes('\\max\\') || sourcePath.endsWith('/max') || sourcePath.endsWith('\\max')) {
          maxItems.push(item);
          classified = true;
        }
        if (sourcePath.includes('/min/') || sourcePath.includes('\\min\\') || sourcePath.endsWith('/min') || sourcePath.endsWith('\\min')) {
          minItems.push(item);
          classified = true;
        }
        if (!classified) {
          // 분류 정보가 없는 경우 일단 MAX 목록에 표시
          maxItems.push(item);
        }
      });
      const dedupedMax = dedupeRecords(maxItems);
      const dedupedMin = dedupeRecords(minItems);
      state.itemsMax = dedupedMax;
      state.itemsMin = dedupedMin;
      renderList(dedupedMax, elements.dataListMax, focusAttribute, elements.logMax);
      renderList(dedupedMin, elements.dataListMin, focusAttribute, elements.logMin);
      if (!silent) addLog('데이터 목록을 새로고침했습니다.', 'info');
    } catch (error) {
      if (!silent) addLog(`데이터 목록 조회 실패: ${error.message || error}`, 'error');
      if (elements.dataListMax) elements.dataListMax.innerHTML = '<span style="color:#ff9a9a;">데이터를 불러오지 못했습니다.</span>';
      if (elements.dataListMin) elements.dataListMin.innerHTML = '<span style="color:#ff9a9a;">데이터를 불러오지 못했습니다.</span>';
    }
  }

  function renderList(items, container, focusAttribute = '', logElement) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<span style="color:#9aa4d9;">저장된 데이터가 여기 표시됩니다.</span>';
      if (logElement) setColumnLog(logElement, '데이터 없음');
      return;
    }
    if (logElement) {
      setColumnLog(logElement, `${items.length}개 데이터 표시중`);
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const attr = (item.attribute?.text || item.attributeText || '').trim();
      const text = (item.data?.text || item.dataText || item.s || '').trim();
      if (!attr || !text) return;
      const card = createDataCard(item, attr, text, focusAttribute);
      fragment.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  function dedupeRecords(items) {
    const map = new Map();
    items.forEach(item => {
      const attr = (item.attribute?.text || item.attributeText || '').trim();
      const text = (item.data?.text || item.dataText || item.s || '').trim();
      if (!attr || !text) return;
      const key = `${attr}::${text}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }
      const existingDataBitMax = existing.dataBits?.max ?? existing.data?.bitMax ?? existing.max ?? null;
      const existingDataBitMin = existing.dataBits?.min ?? existing.data?.bitMin ?? existing.min ?? null;
      const currentDataBitMax = item.dataBits?.max ?? item.data?.bitMax ?? item.max ?? null;
      const currentDataBitMin = item.dataBits?.min ?? item.data?.bitMin ?? item.min ?? null;
      const existingHasBits = existingDataBitMax !== null && existingDataBitMin !== null;
      const currentHasBits = currentDataBitMax !== null && currentDataBitMin !== null;
      if (!existingHasBits && currentHasBits) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }
  function createDataCard(item, attr, text, focusAttribute) {
    const card = document.createElement('div');
    card.className = 'data-item';
    const bitMax = item.attribute?.bitMax ?? item.attributeBits?.max ?? null;
    const bitMin = item.attribute?.bitMin ?? item.attributeBits?.min ?? null;
    const dataBitMax = item.dataBits?.max ?? item.data?.bitMax ?? item.max ?? null;
    const dataBitMin = item.dataBits?.min ?? item.data?.bitMin ?? item.min ?? null;
    if (focusAttribute && attr === focusAttribute) {
      card.style.borderColor = 'rgba(150,170,255,0.85)';
      card.style.boxShadow = '0 0 0 2px rgba(150,170,255,0.25)';
    }
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = attr;
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.textContent = text.length > 90 ? `${text.slice(0, 90)}…` : text;
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', async event => {
      event.stopPropagation();
      await deleteRecord(attr, bitMax, bitMin, dataBitMax, dataBitMin, text);
    });
    card.append(title, snippet, deleteBtn);
    card.addEventListener('click', () => {
      if (elements.attributeInput) elements.attributeInput.value = attr;
      if (elements.dataInput) elements.dataInput.value = text;
      updateAttributeBits(attr);
      state.lastSignature = `${bitMax}_${bitMin}_${text}`;
      state.focusAttribute = attr;
      renderResult({
        attributeText: attr,
        attributeBits: {
          max: bitMax,
          min: bitMin
        },
        dataText: text
      });
      addLog('목록에서 데이터를 불러왔습니다.', 'info');
    });
    return card;
  }

  async function deleteRecord(attributeText, bitMax, bitMin, dataBitMax, dataBitMin, fallbackDataText = '') {
    if (!attributeText) {
      addLog('삭제할 속성 정보를 찾을 수 없습니다.', 'warn');
      return;
    }
    const bits = {
      max: bitMax ?? calculateBitValues(attributeText).max,
      min: bitMin ?? calculateBitValues(attributeText).min
    };
    const options = {};
    if (Number.isFinite(dataBitMax)) options.max = dataBitMax;
    if (Number.isFinite(dataBitMin)) options.min = dataBitMin;
    if (fallbackDataText) options.text = fallbackDataText.trim();
    try {
      const response = await deleteExistingRecord(getBaseUrl(), bits, options);
      if (response?.ok) {
        addLog(`[삭제] ${attributeText} → 데이터 삭제 완료`, 'success');
      } else {
        addLog(`[삭제] ${attributeText} → 삭제 요청 완료 (삭제된 데이터가 없을 수도 있습니다)`, 'info');
      }
      state.lastSignature = null;
      await refreshList(attributeText, true);
      await refreshFolders(true);
    } catch (error) {
      addLog(`[삭제] 오류 발생: ${error.message || error}`, 'error');
    }
  }

  async function refreshFolders(silent = false) {
    try {
      const summary = await fetchFolderSummary(getBaseUrl());
      const maxFolders = Array.isArray(summary.max) ? summary.max : [];
      const minFolders = Array.isArray(summary.min) ? summary.min : [];
      renderFolderList(elements.folderListMax, maxFolders);
      renderFolderList(elements.folderListMin, minFolders);

      if (elements.apiSummary) {
        const meta = summary.summary || {};
        const maxFolderCount = meta.maxFolders ?? maxFolders.length;
        const minFolderCount = meta.minFolders ?? minFolders.length;
        const totalRecords = (meta.maxRecords ?? 0) + (meta.minRecords ?? 0);
        const generatedAt = summary.generatedAt
          ? new Date(summary.generatedAt).toLocaleTimeString()
          : null;
        elements.apiSummary.textContent = [
          `MAX 폴더 ${maxFolderCount}개`,
          `MIN 폴더 ${minFolderCount}개`,
          `총 레코드 ${totalRecords}개${generatedAt ? ` · ${generatedAt} 기준` : ''}`
        ].join(' · ');
      }

      if (!silent) addLog('폴더 정보를 갱신했습니다.', 'info');
    } catch (error) {
      if (!silent) addLog(`폴더 정보 조회 실패: ${error.message || error}`, 'error');
      renderFolderList(elements.folderListMax, []);
      renderFolderList(elements.folderListMin, []);
      if (elements.apiSummary) {
        elements.apiSummary.textContent = '폴더 정보를 불러오지 못했습니다.';
      }
    }
  }

  function renderFolderList(container, folders) {
    if (!container) return;
    if (!folders || folders.length === 0) {
      container.innerHTML = '<span style="color:#7d88c7;">폴더 경로가 여기 표시됩니다.</span>';
      return;
    }
    const fragment = document.createDocumentFragment();
    folders.forEach(folder => {
      const folderPath = folder.folder || '';
      const fileCount = folder.files ?? 0;
      const recordCount = folder.records ?? 0;
      const item = document.createElement('div');
      item.className = 'folder-item';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = folderPath;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `파일 ${fileCount}개 · 레코드 ${recordCount}개`;
      item.append(label, meta);
      fragment.appendChild(item);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  async function fetchFolderSummary(baseUrl) {
    if (!baseUrl) throw new Error('baseUrl required');
    const response = await fetch(`${baseUrl}/api/tests/folders`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
    return json;
  }

  function scheduleSave() {
    if (state.debounceId) clearTimeout(state.debounceId);
    state.debounceId = setTimeout(autoSave, 500);
  }

  async function manualDelete() {
    const attributeText = elements.attributeInput?.value?.trim();
    const dataText = elements.dataInput?.value || '';
    if (!attributeText) {
      addLog('삭제할 속성 경로를 먼저 입력하세요.', 'warn');
      return;
    }
    if (!dataText.trim()) {
      addLog('삭제할 데이터 본문을 입력하거나 목록에서 선택하세요.', 'warn');
      return;
    }
    const attributeBits = calculateBitValues(attributeText);
    const deleteOptions = { text: dataText.trim() };
    try {
      const response = await deleteExistingRecord(getBaseUrl(), attributeBits, deleteOptions);
      if (response?.ok) {
        addLog('삭제 완료: 현재 속성 데이터가 제거되었습니다.', 'success');
      } else {
        addLog('삭제 요청 완료 (삭제된 데이터가 없을 수도 있습니다).', 'info');
      }
      state.lastSignature = null;
      await refreshList(attributeText, true);
      await refreshFolders(true);
    } catch (error) {
      addLog(`삭제 중 오류: ${error.message || error}`, 'error');
    }
  }

  function updateApiLink() {
    if (!elements.apiLink) return;
    const url = `${getBaseUrl()}/api/tests/folders`;
    elements.apiLink.href = url;
    elements.apiLink.textContent = `GET ${url}`;
    if (elements.topApiLink) {
      elements.topApiLink.href = url;
      elements.topApiLink.textContent = `GET ${url}`;
    }
  }

  function init() {
    elements.attributeInput?.addEventListener('input', event => {
      updateAttributeBits(event.target.value);
      state.lastSignature = null;
      state.focusAttribute = event.target.value.trim();
      scheduleSave();
    });
    elements.dataInput?.addEventListener('input', () => {
      state.lastSignature = null;
      scheduleSave();
    });
    elements.deleteButton?.addEventListener('click', () => {
      manualDelete();
    });
    addLog('수동 입력 테스트 페이지가 준비되었습니다.', 'info');
    updateApiLink();
    refreshList('', true);
    refreshFolders(true);
    setInterval(() => {
      refreshList(state.focusAttribute, true);
      refreshFolders(true);
    }, 5000);
  }

  init();
})();
