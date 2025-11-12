(() => {
  'use strict';

  const Shared = window.NovelAIShared;
  if (!Shared) {
    console.error('[ActionRunner] novel_ai_shared.js가 로드되지 않았습니다.');
    return;
  }

  const {
    calculateBitValues,
    buildSampleChapters,
    buildChapterStructureText,
    pickDefaultNovelTitle,
    deleteExistingRecord,
    saveRecord,
    verifyRecord,
    resetTestData,
    fetchRecords
  } = Shared;

  const SECTION_ORDER = Shared.sectionOrder || ['구성', '상세', '스토리', '에필로그', '주요 사건', '등장인물', '과거 스토리'];

  const elements = {
    runBtn: document.getElementById('runTestBtn'),
    clearBtn: document.getElementById('clearLogBtn'),
    resetBtn: document.getElementById('resetDataBtn'),
    loadRecordsBtn: document.getElementById('loadRecordsBtn'),
    generatePromptBtn: document.getElementById('generatePromptBtn'),
    copyPromptBtn: document.getElementById('copyPromptBtn'),
    logContainer: document.getElementById('runnerLog'),
    serverUrlInput: document.getElementById('serverUrlInput'),
    novelTitleInput: document.getElementById('novelTitleInput'),
    chapterCountInput: document.getElementById('chapterCountInput'),
    sectionsInput: document.getElementById('sectionsInput'),
    customDataInput: document.getElementById('customDataInput'),
    statusSteps: Array.from(document.querySelectorAll('.status-step')),
    recordsContainer: document.getElementById('recordsContainer'),
    recordsTitle: document.querySelector('.records-header h2, .records-header h3'),
    cursorPromptOutput: document.getElementById('cursorPromptOutput'),
    detailContent: document.getElementById('detailContent'),
    sidebarList: document.getElementById('sidebarRecordsList')
  };

  const recordsState = {
    items: [],
    selected: new Set(),
    notes: new Map(),
    activeId: null
  };

  function resetStatus() {
    elements.statusSteps.forEach(step => step.classList.remove('done'));
  }

  function markStatus(stepName) {
    elements.statusSteps.forEach(step => {
      if (step.dataset.step === stepName || stepName === 'done') {
        step.classList.add('done');
      }
    });
  }

  function addLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    elements.logContainer.appendChild(entry);
    elements.logContainer.scrollTo({
      top: elements.logContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  function clearRecordsUI() {
    recordsState.items = [];
    recordsState.selected.clear();
    recordsState.notes.clear();
    recordsState.activeId = null;
    if (elements.recordsTitle) {
      elements.recordsTitle.textContent = '데이터 목록 (0)';
    }
    if (elements.recordsContainer) {
      elements.recordsContainer.innerHTML = '<p class="hint-text">아직 불러온 데이터가 없습니다. 테스트 실행 후 또는 “데이터 목록 새로고침” 버튼을 눌러 확인하세요.</p>';
    }
    if (elements.cursorPromptOutput) {
      elements.cursorPromptOutput.value = '';
    }
    renderActiveRecord();
  }

  function createMetaSpan(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  function setActiveRecord(id) {
    if (recordsState.activeId === id) {
      renderRecords();
      return;
    }
    recordsState.activeId = id;
    renderRecords();
  }

  function renderActiveRecord() {
    if (!elements.detailContent) return;
    const container = elements.detailContent;
    container.innerHTML = '';
    const active = recordsState.items.find(item => item.id === recordsState.activeId);
    if (!active) {
      container.innerHTML = '<p class="hint-text">목록에서 “보기” 버튼을 누르면 세부 내용을 여기에서 확인할 수 있습니다.</p>';
      return;
    }

    const attrTitle = document.createElement('strong');
    attrTitle.textContent = active.attributeText || '(속성 없음)';
    container.appendChild(attrTitle);

    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    meta.appendChild(createMetaSpan(`소설: ${active.novelTitle || '미지정'}`));
    if (active.chapter && active.chapter.number) {
      meta.appendChild(createMetaSpan(`챕터: ${active.chapter.number}${active.chapter.title ? ` (${active.chapter.title})` : ''}`));
    } else {
      meta.appendChild(createMetaSpan('챕터: -'));
    }
    meta.appendChild(createMetaSpan(`속성 BIT: ${active.attributeBits.max ?? 'null'} / ${active.attributeBits.min ?? 'null'}`));
    if (active.dataBits && (active.dataBits.max !== undefined || active.dataBits.min !== undefined)) {
      meta.appendChild(createMetaSpan(`데이터 BIT: ${active.dataBits.max ?? 'null'} / ${active.dataBits.min ?? 'null'}`));
    }
    if (active.timestamp) {
      meta.appendChild(createMetaSpan(`저장 시각: ${new Date(active.timestamp).toLocaleString()}`));
    }
    container.appendChild(meta);

    const dataLabel = document.createElement('strong');
    dataLabel.textContent = '데이터 본문';
    container.appendChild(dataLabel);

    const dataBox = document.createElement('div');
    dataBox.className = 'detail-data';
    dataBox.textContent = active.dataText || '(데이터 없음)';
    container.appendChild(dataBox);

    const note = recordsState.notes.get(active.id);
    if (note && note.trim().length > 0) {
      const noteLabel = document.createElement('strong');
      noteLabel.textContent = '메모';
      container.appendChild(noteLabel);
      const noteBox = document.createElement('div');
      noteBox.className = 'detail-data';
      noteBox.textContent = note.trim();
      container.appendChild(noteBox);
    }
  }

  function renderRecords() {
    if (!elements.recordsContainer) return;
    elements.recordsContainer.innerHTML = '';
    if (elements.recordsTitle) {
      const baseLabel = elements.recordsTitle.dataset.baseLabel || elements.recordsTitle.textContent || '데이터 목록';
      elements.recordsTitle.dataset.baseLabel = baseLabel;
      const labelText = baseLabel.replace(/\s*\(.*\)$/u, '').trim();
      elements.recordsTitle.textContent = `${labelText} (${recordsState.items.length})`;
    }

    if (recordsState.items.length === 0) {
      elements.recordsContainer.innerHTML = '<p class="hint-text">조회된 데이터가 없습니다. 테스트를 실행하거나 다른 소설 제목으로 시도해보세요.</p>';
      renderActiveRecord();
      renderSidebarRecords([]);
      return;
    }

    if (!recordsState.activeId || !recordsState.items.some(item => item.id === recordsState.activeId)) {
      recordsState.activeId = recordsState.items[0].id;
    }

    recordsState.items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'record-card';
      if (recordsState.activeId === item.id) {
        card.classList.add('active');
      }

      const top = document.createElement('div');
      top.className = 'record-top';

      const header = document.createElement('div');
      header.className = 'record-header';
      const attrTitle = document.createElement('strong');
      attrTitle.textContent = item.attributeText || '(속성 없음)';
      header.appendChild(attrTitle);
      const actionGroup = document.createElement('div');
      actionGroup.className = 'record-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'mini-btn';
      viewBtn.textContent = '보기';
      viewBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setActiveRecord(item.id);
      });
      actionGroup.appendChild(viewBtn);
      header.appendChild(actionGroup);
      top.appendChild(header);

      const checkboxRow = document.createElement('label');
      checkboxRow.className = 'record-checkbox';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.id = item.id;
      checkbox.checked = recordsState.selected.has(item.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          recordsState.selected.add(item.id);
        } else {
          recordsState.selected.delete(item.id);
        }
      });
      const checkboxText = document.createElement('span');
      checkboxText.textContent = 'Cursor AI에 전달할 항목 선택';
      checkboxRow.append(checkbox, checkboxText);
      top.appendChild(checkboxRow);

      const meta = document.createElement('div');
      meta.className = 'record-meta';
      meta.appendChild(createMetaSpan(`소설: ${item.novelTitle || '미지정'}`));
      meta.appendChild(createMetaSpan(
        item.chapter && item.chapter.number
          ? `챕터: ${item.chapter.number}${item.chapter.title ? ` (${item.chapter.title})` : ''}`
          : '챕터: -'
      ));
      meta.appendChild(createMetaSpan(
        `속성 BIT: ${item.attributeBits.max ?? 'null'} / ${item.attributeBits.min ?? 'null'}`
      ));
      if (item.dataBits && (item.dataBits.max !== undefined || item.dataBits.min !== undefined)) {
        meta.appendChild(createMetaSpan(
          `데이터 BIT: ${item.dataBits.max ?? 'null'} / ${item.dataBits.min ?? 'null'}`
        ));
      }
      top.appendChild(meta);

      const dataBox = document.createElement('div');
      dataBox.className = 'record-data';
      dataBox.textContent = item.dataText || '(데이터 없음)';

      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'record-note';
      const noteLabel = document.createElement('label');
      noteLabel.setAttribute('for', `note-${item.id}`);
      noteLabel.textContent = 'Cursor AI에게 전달할 메모';
      const noteInput = document.createElement('textarea');
      noteInput.id = `note-${item.id}`;
      noteInput.dataset.id = item.id;
      noteInput.placeholder = '예: 속도감 강조, 불필요한 반복 제거 등';
      noteInput.value = recordsState.notes.get(item.id) || '';
      noteInput.addEventListener('input', () => {
        recordsState.notes.set(item.id, noteInput.value);
        if (recordsState.activeId === item.id) {
          renderActiveRecord();
        }
      });
      noteWrapper.append(noteLabel, noteInput);

      card.append(top, dataBox, noteWrapper);
      elements.recordsContainer.appendChild(card);
    });

    renderActiveRecord();
    renderSidebarRecords(recordsState.items);
  }

  function renderChapterCard(chapter) {
    const card = document.createElement('div');
    card.className = 'chapter-card';

    const header = document.createElement('div');
    header.className = 'chapter-header';

    const title = document.createElement('div');
    title.className = 'chapter-title';
    title.textContent = chapter.displayTitle || '기타 구성';
    header.appendChild(title);

    if (chapter.summary) {
      const summary = document.createElement('div');
      summary.className = 'chapter-summary';
      summary.textContent = chapter.summary;
      header.appendChild(summary);
    }

    card.appendChild(header);

    const sectionsWrapper = document.createElement('div');
    sectionsWrapper.className = 'chapter-sections';
    chapter.sections.forEach(section => {
      sectionsWrapper.appendChild(renderChapterSection(section));
    });
    card.appendChild(sectionsWrapper);

    return card;
  }

  function renderChapterSection(section) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chapter-section';
    const item = section.item;
    if (item && recordsState.activeId === item.id) {
      wrapper.classList.add('active');
    }

    const header = document.createElement('div');
    header.className = 'section-header';

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = section.name;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'section-actions';
    if (item) {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'mini-btn';
      viewBtn.textContent = '보기';
      viewBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setActiveRecord(item.id);
      });
      actions.appendChild(viewBtn);
    }
    header.appendChild(actions);
    wrapper.appendChild(header);

    if (!item) {
      const placeholder = document.createElement('div');
      placeholder.className = 'section-placeholder';
      placeholder.textContent = '데이터가 아직 생성되지 않았습니다.';
      wrapper.appendChild(placeholder);
      return wrapper;
    }

    const checkboxRow = document.createElement('label');
    checkboxRow.className = 'section-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.id = item.id;
    checkbox.checked = recordsState.selected.has(item.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        recordsState.selected.add(item.id);
      } else {
        recordsState.selected.delete(item.id);
      }
    });
    checkboxRow.append(checkbox, document.createTextNode('Cursor AI에 전달'));
    wrapper.appendChild(checkboxRow);

    const meta = document.createElement('div');
    meta.className = 'section-meta';
    meta.appendChild(createMetaSpan(`소설: ${item.novelTitle || '미지정'}`));
    if (item.chapter && item.chapter.number) {
      const chapterLabel = item.chapter.title ? `${item.chapter.number} (${item.chapter.title})` : item.chapter.number;
      meta.appendChild(createMetaSpan(`챕터: ${chapterLabel}`));
    } else {
      meta.appendChild(createMetaSpan('챕터: -'));
    }
    meta.appendChild(createMetaSpan(`속성 BIT: ${item.attributeBits.max ?? 'null'} / ${item.attributeBits.min ?? 'null'}`));
    meta.appendChild(createMetaSpan(`데이터 BIT: ${item.dataBits.max ?? 'null'} / ${item.dataBits.min ?? 'null'}`));
    if (item.timestamp) {
      meta.appendChild(createMetaSpan(`저장 시각: ${new Date(item.timestamp).toLocaleString()}`));
    }
    wrapper.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'section-body';

    const dataBox = document.createElement('div');
    dataBox.className = 'section-data';
    dataBox.textContent = item.dataText || '(데이터 없음)';
    body.appendChild(dataBox);

    const noteWrapper = document.createElement('div');
    noteWrapper.className = 'section-note';
    const noteLabel = document.createElement('label');
    noteLabel.setAttribute('for', `note-${item.id}`);
    noteLabel.textContent = 'Cursor AI 메모';
    const noteInput = document.createElement('textarea');
    noteInput.id = `note-${item.id}`;
    noteInput.dataset.id = item.id;
    noteInput.placeholder = '예: 톤을 더 어둡게, 전투 묘사 강화 등';
    noteInput.value = recordsState.notes.get(item.id) || '';
    noteInput.addEventListener('input', () => {
      recordsState.notes.set(item.id, noteInput.value);
      if (recordsState.activeId === item.id) {
        renderActiveRecord();
      }
    });
    noteWrapper.append(noteLabel, noteInput);
    body.appendChild(noteWrapper);

    wrapper.appendChild(body);
    return wrapper;
  }

  function buildChapterGroups(items) {
    const map = new Map();
    const miscItems = [];

    items.forEach(item => {
      const sectionName = extractSectionName(item.attributeText);
      item.__sectionName = sectionName;
      const chapter = item.chapter || {};
      const parsedNumber = parseChapterNumber(chapter.number ?? chapter.id ?? null) ?? parseChapterNumber(chapter.title);
      const key = Number.isFinite(parsedNumber)
        ? `num:${parsedNumber}`
        : chapter.title || chapter.scene || chapter.description || `attr:${sectionName}`;

      if (chapter && (chapter.number !== undefined || chapter.title || chapter.scene || chapter.description)) {
        if (!map.has(key)) {
          map.set(key, {
            key,
            number: Number.isFinite(parsedNumber) ? parsedNumber : null,
            title: chapter.title || null,
            scene: chapter.scene || null,
            synopsis: chapter.synopsis || null,
            items: []
          });
        }
        const group = map.get(key);
        group.items.push(item);
        if (!group.scene && chapter.scene) group.scene = chapter.scene;
        if (!group.synopsis && chapter.synopsis) group.synopsis = chapter.synopsis;
      } else {
        miscItems.push(item);
      }
    });

    const groups = Array.from(map.values()).sort((a, b) => {
      const orderA = Number.isFinite(a.number) ? a.number : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(b.number) ? b.number : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const titleA = a.title || a.scene || '';
      const titleB = b.title || b.scene || '';
      return titleA.localeCompare(titleB, 'ko');
    });

    if (miscItems.length > 0) {
      groups.push({
        key: 'misc',
        number: null,
        title: '기타 구성',
        scene: null,
        synopsis: null,
        items: miscItems
      });
    }

    groups.forEach(group => {
      group.sections = buildOrderedSections(group.items);
      const numberLabel = Number.isFinite(group.number) ? `${group.number}장` : '';
      const baseTitle = group.title || group.scene || group.sections.find(section => section.item)?.item?.chapter?.title || '';
      group.displayTitle = `${numberLabel} ${baseTitle}`.trim() || (Number.isFinite(group.number) ? `${group.number}장` : '기타 구성');
      group.summary = group.synopsis || group.scene || '';
      group.hasActive = group.sections.some(section => section.item && section.item.id === recordsState.activeId);
    });

    return groups;
  }

  function buildOrderedSections(items) {
    const byName = new Map();
    items.forEach(item => {
      const name = item.__sectionName || extractSectionName(item.attributeText);
      if (!byName.has(name)) {
        byName.set(name, item);
      }
    });

    const ordered = SECTION_ORDER.map(name => ({ name, item: byName.get(name) || null }));
    byName.forEach((item, name) => {
      if (!SECTION_ORDER.includes(name)) {
        ordered.push({ name, item });
      }
    });
    return ordered;
  }

  function extractSectionName(attributeText = '') {
    const parts = attributeText.split('→');
    return parts.length ? parts[parts.length - 1].trim() : attributeText.trim();
  }

  function parseChapterNumber(value) {
    if (value === undefined || value === null) return null;
    const match = String(value).match(/(\d{1,3})/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) ? num : null;
  }

  function renderSidebarRecords(items = []) {
    if (!elements.sidebarList) return;
    const container = elements.sidebarList;
    container.innerHTML = '';

    if (!items.length) {
      container.innerHTML = `
        <button type="button" class="active" data-example="true">
          1장 회의실의 긴장
        </button>
        <button type="button" data-example="true">
          2장 전장의 이탈
        </button>
        <button type="button" data-example="true">
          3장 리사의 증언
        </button>
        <button type="button" data-example="true">
          4장 균형의 붕괴
        </button>
        <p class="hint-text" style="margin:0; padding:0 0.4rem;">테스트 실행 후 자동으로 갱신됩니다.</p>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    items.slice(0, 40).forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      if (recordsState.activeId === item.id) button.classList.add('active');
      button.textContent = formatSidebarLabel(item, index);
      button.addEventListener('click', () => {
        setActiveRecord(item.id);
        setTimeout(() => {
          document.getElementById('records')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      });
      fragment.appendChild(button);
    });

    container.appendChild(fragment);
  }

  function formatSidebarLabel(item, index) {
    const chapterNumber = item.chapter?.number ? Number(item.chapter.number) : index + 1;
    const chapterLabel = Number.isFinite(chapterNumber) ? `${chapterNumber}장` : `#${index + 1}`;
    const title = item.chapter?.title || item.chapter?.scene || extractSectionName(item.attributeText) || '구성 항목';
    return `${chapterLabel} ${title}`.trim();
  }

  function lockButton(button, fn) {
    return async () => {
      if (!button || button.disabled) return;
      button.disabled = true;
      try {
        await fn();
      } finally {
        button.disabled = false;
      }
    };
  }

  function guardRun(fn) {
    return async () => {
      if (elements.runBtn.disabled) return;
      elements.runBtn.disabled = true;
      resetStatus();
      try {
        await fn();
      } catch (error) {
        addLog(`오류 발생: ${error.message || error}`, 'error');
      } finally {
        elements.runBtn.disabled = false;
      }
    };
  }

  function getBaseUrl() {
    const manual = elements.serverUrlInput.value.trim();
    if (manual) return manual.replace(/\/$/, '');
    if (typeof window.getServerUrl === 'function') {
      return window.getServerUrl('').replace(/\/$/, '');
    }
    return (window.location.origin || '').replace(/\/$/, '');
  }

  function getNovelTitle() {
    return elements.novelTitleInput.value.trim();
  }

  function pickOrGenerateNovelTitle() {
    let title = getNovelTitle();
    if (!title) {
      title = pickDefaultNovelTitle();
      elements.novelTitleInput.value = title;
      addLog(`소설 제목을 자동으로 설정했습니다: ${title}`, 'info');
    }
    return title;
  }

  async function runTest() {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      addLog('서버 URL을 확인해주세요.', 'warn');
      return;
    }

    const novelTitle = pickOrGenerateNovelTitle();
    const novelBits = calculateBitValues(novelTitle);
    const chapterCount = Math.max(1, Math.min(10, parseInt(elements.chapterCountInput.value, 10) || 3));
    const extraSectionNames = elements.sectionsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    const customTemplate = elements.customDataInput.value;

    addLog(`서버: ${baseUrl}`);
    addLog(`생성할 챕터 수: ${chapterCount}`);
    if (extraSectionNames.length) {
      addLog(`추가 섹션: ${extraSectionNames.join(', ')}`, 'info');
    }
    if (customTemplate && customTemplate.trim().length > 0) {
      addLog('사용자 텍스트 템플릿이 포함됩니다.', 'info');
    }

    markStatus('prepare');

    const chapters = buildSampleChapters(novelTitle, chapterCount, extraSectionNames, customTemplate);

    for (const chapter of chapters) {
      markStatus('saving');
      const chapterLabel = `챕터 ${chapter.number}: ${chapter.title}`;
      const chapterBits = calculateBitValues(chapterLabel);
      const chapterInfo = {
        number: String(chapter.number),
        title: chapter.title,
        description: chapter.scene
      };

      addLog(`[챕터 ${chapter.number}] ${chapterLabel} - ${chapter.scene}`, 'info');

      for (const section of chapter.sections) {
        const attributeText = `${novelTitle} → ${chapterLabel} → ${section.name}`;
        const attributeBits = calculateBitValues(attributeText);
        const dataText = section.text;
        const dataBits = calculateBitValues(dataText);

        addLog(` └─ ${section.name} 저장`, 'info');
        const deletion = await deleteExistingRecord(baseUrl, attributeBits, {
          max: dataBits.max,
          min: dataBits.min,
          text: dataText
        });
        if (deletion?.deletedCount) {
          addLog(`    · 기존 데이터 ${deletion.deletedCount}개 삭제`, 'warn');
        }

        await saveRecord(baseUrl, {
          attributeText,
          attributeBitMax: attributeBits.max,
          attributeBitMin: attributeBits.min,
          text: dataText,
          dataBitMax: dataBits.max,
          dataBitMin: dataBits.min,
          novelTitle,
          novelTitleBitMax: novelBits.max,
          novelTitleBitMin: novelBits.min,
          chapter: chapterInfo,
          chapterBitMax: chapterBits.max,
          chapterBitMin: chapterBits.min
        });

        markStatus('verifying');
        const verified = await verifyRecord(baseUrl, attributeBits, dataText);
        addLog(`    · ${verified ? '검증 완료' : '검증 실패'}`, verified ? 'success' : 'warn');
      }
    }

    const structureAttribute = `${novelTitle} → 챕터 구성`;
    const structureBits = calculateBitValues(structureAttribute);
    const structureData = buildChapterStructureText(novelTitle, chapters);
    const structureDataBits = calculateBitValues(structureData);

    addLog('챕터 구성 요약 저장', 'info');
    const deletion = await deleteExistingRecord(baseUrl, structureBits, {
      max: structureDataBits.max,
      min: structureDataBits.min,
      text: structureData
    });
    if (deletion?.deletedCount) {
      addLog(`    · 기존 구성 ${deletion.deletedCount}개 삭제`, 'warn');
    }
    await saveRecord(baseUrl, {
      attributeText: structureAttribute,
      attributeBitMax: structureBits.max,
      attributeBitMin: structureBits.min,
      text: structureData,
      dataBitMax: structureDataBits.max,
      dataBitMin: structureDataBits.min,
      novelTitle,
      novelTitleBitMax: novelBits.max,
      novelTitleBitMin: novelBits.min
    });
    const verified = await verifyRecord(baseUrl, structureBits, structureData);
    addLog(`    · 구성 요약 ${verified ? '검증 완료' : '검증 실패'}`, verified ? 'success' : 'warn');

    markStatus('done');
    addLog('모든 테스트가 성공적으로 완료되었습니다!', 'success');

    try {
      await loadRecords({ silent: true });
      addLog('데이터 목록을 갱신했습니다.', 'info');
    } catch (error) {
      addLog(`데이터 목록 갱신 중 오류: ${error.message || error}`, 'warn');
    }
  }

  async function resetAllData() {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      addLog('서버 URL을 확인해주세요.', 'warn');
      return;
    }
    if (!confirm('정말로 모든 저장 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) {
      addLog('데이터 삭제가 취소되었습니다.', 'info');
      return;
    }
    addLog('데이터 초기화를 시작합니다...', 'info');
    try {
      await resetTestData(baseUrl);
      addLog('데이터가 초기화되었습니다.', 'success');
      clearRecordsUI();
    } catch (error) {
      addLog(`데이터 초기화 실패: ${error.message || error}`, 'error');
    }
  }

  async function loadRecords(options = {}) {
    const { silent = false } = options;
    const baseUrl = getBaseUrl();
    const novelTitle = getNovelTitle();
    if (!baseUrl) {
      addLog('서버 URL을 확인해주세요.', 'warn');
      return;
    }
    if (!novelTitle) {
      addLog('소설 제목을 입력한 뒤 데이터를 불러오세요.', 'warn');
      return;
    }
    if (!silent) {
      addLog(`데이터 목록을 불러오는 중... (${novelTitle})`, 'info');
    }

    try {
      const result = await fetchRecords(baseUrl, { novelTitle, limit: 200 });
      const items = Array.isArray(result.items) ? result.items : [];
      const preservedNotes = new Map();
      items.forEach(item => {
        if (recordsState.notes.has(item.id)) {
          preservedNotes.set(item.id, recordsState.notes.get(item.id));
        }
      });
      recordsState.items = items;
      recordsState.notes = preservedNotes;
      recordsState.selected.clear();
      if (!items.some(item => item.id === recordsState.activeId)) {
        recordsState.activeId = items[0]?.id || null;
      }
      renderRecords();
      addLog(`총 ${items.length}개의 항목을 불러왔습니다.`, 'success');
    } catch (error) {
      addLog(`데이터 목록 불러오기 실패: ${error.message || error}`, 'error');
    }
  }

  async function generateCursorPrompt() {
    const selectedItems = recordsState.items.filter(item => recordsState.selected.has(item.id));
    if (selectedItems.length === 0) {
      addLog('선택된 항목이 없습니다. 체크박스를 선택해주세요.', 'warn');
      return;
    }

    const lines = [];
    lines.push('다음은 Novel AI 테스트 데이터 중 수정이 필요한 항목입니다. 각 항목을 검토하고, 메모에 따라 해당 데이터만 다듬어주세요.\n');
    selectedItems.forEach((item, index) => {
      const note = recordsState.notes.get(item.id);
      lines.push(`### 항목 ${index + 1}`);
      lines.push(`- 속성: ${item.attributeText || '(없음)'}`);
      if (item.chapter && item.chapter.number) {
        lines.push(`- 챕터: ${item.chapter.number}${item.chapter.title ? ` (${item.chapter.title})` : ''}`);
      }
      if (item.attributeBits) {
        lines.push(`- 속성 BIT: max=${item.attributeBits.max ?? 'null'}, min=${item.attributeBits.min ?? 'null'}`);
      }
      if (item.dataBits) {
        lines.push(`- 데이터 BIT: max=${item.dataBits.max ?? 'null'}, min=${item.dataBits.min ?? 'null'}`);
      }
      lines.push('- 현재 데이터:');
      lines.push('```');
      lines.push(item.dataText || '(데이터 없음)');
      lines.push('```');
      if (note && note.trim().length > 0) {
        lines.push(`- 메모: ${note.trim()}`);
      }
      lines.push('');
    });
    lines.push('각 항목을 별도로 수정하고, 결과만 반환해주세요.');

    const prompt = lines.join('\n').trim();
    if (elements.cursorPromptOutput) {
      elements.cursorPromptOutput.value = prompt;
    }
    addLog(`프롬프트가 생성되었습니다. (${selectedItems.length}개 항목)`, 'success');
  }

  async function copyPromptToClipboard() {
    if (!elements.cursorPromptOutput) return;
    const text = elements.cursorPromptOutput.value.trim();
    if (!text) {
      addLog('복사할 프롬프트가 없습니다.', 'warn');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      addLog('프롬프트가 클립보드에 복사되었습니다.', 'success');
    } catch (error) {
      addLog(`클립보드 복사 실패: ${error.message || error}`, 'error');
    }
  }

  elements.runBtn.addEventListener('click', guardRun(runTest));
  elements.clearBtn.addEventListener('click', () => {
    elements.logContainer.innerHTML = '';
    resetStatus();
    addLog('로그가 초기화되었습니다.', 'info');
  });
  elements.resetBtn.addEventListener('click', lockButton(elements.resetBtn, resetAllData));
  elements.loadRecordsBtn.addEventListener('click', lockButton(elements.loadRecordsBtn, () => loadRecords()));
  elements.generatePromptBtn.addEventListener('click', lockButton(elements.generatePromptBtn, generateCursorPrompt));
  elements.copyPromptBtn.addEventListener('click', lockButton(elements.copyPromptBtn, copyPromptToClipboard));

  if (typeof window.getServerUrl === 'function') {
    const url = window.getServerUrl('');
    if (url) elements.serverUrlInput.value = url.replace(/\/$/, '');
  }

  addLog('테스트 러너가 준비되었습니다. "테스트 실행" 버튼을 눌러 시작하세요.', 'info');
  clearRecordsUI();
})();

