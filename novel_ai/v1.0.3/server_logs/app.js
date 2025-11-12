(() => {
    const state = {
        files: [],
        selectedFile: null,
        level: 'all',
        search: '',
        limit: 200,
        offset: 0,
        hideMismatch: true,
        entries: [],
        originalEntries: [],
    total: 0,
    selectedEntryIndex: null,
    };

    const els = {
        fileCards: document.getElementById('logFileCards'),
        fileEmpty: document.getElementById('logFileEmpty'),
        fileSelect: document.getElementById('logFileSelect'),
        levelSelect: document.getElementById('logLevelSelect'),
        searchInput: document.getElementById('logSearchInput'),
        limitSelect: document.getElementById('logLimitSelect'),
        refreshBtn: document.getElementById('logRefreshBtn'),
        hideMismatchToggle: document.getElementById('hideMismatchToggle'),
        tableBody: document.getElementById('logTableBody'),
        tableEmpty: document.getElementById('logTableEmpty'),
        selectedFileInfo: document.getElementById('selectedFileInfo'),
        levelSummary: document.getElementById('levelSummary'),
        filterResultInfo: document.getElementById('filterResultInfo'),
    };

    const diagramEls = {
        overlay: document.getElementById('logDiagramOverlay'),
        closeBtn: document.getElementById('logDiagramCloseBtn'),
        level: document.getElementById('logDiagramLevel'),
        title: document.getElementById('logDiagramTitle'),
        timestamp: document.getElementById('logDiagramTimestamp'),
        summary: document.getElementById('logDiagramSummary'),
        mermaid: document.getElementById('logDiagramMermaid'),
        mermaidFallback: document.getElementById('logDiagramMermaidFallback'),
        metaList: document.getElementById('logDiagramMetaList'),
        metaEmpty: document.getElementById('logDiagramMetaEmpty'),
        rawJson: document.getElementById('logDiagramRawJson'),
    };

    const diagramState = {
        activeEntry: null,
        previousFocus: null,
    };

    const levelLabels = {
        info: '정보',
        warn: '경고',
        error: '오류',
        debug: '디버그',
    };

    const debounce = (fn, delay = 400) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    };

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    }

    function formatDate(date) {
        if (!date) return '-';
        try {
            return new Date(date).toLocaleString();
        } catch {
            return '-';
        }
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeMermaidLabel(value) {
        if (value === null || value === undefined) return '';
        return escapeHtml(String(value)).replace(/\r?\n/g, '<br/>');
    }

    function toFiniteNumber(value) {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }

    function formatBitValue(value) {
        const num = toFiniteNumber(value);
        if (num === null) return '-';
        return num.toFixed(6);
    }

    function formatBitPair(value) {
        if (!value || typeof value !== 'object') return '-';
        const max = formatBitValue(value.max);
        const min = formatBitValue(value.min);
        return `MAX ${max} · MIN ${min}`;
    }

    function camelToLabel(value) {
        if (!value) return '';
        return String(value)
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    async function fetchJson(url) {
        const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `Request failed (${response.status})`);
        }
        return response.json();
    }

    async function loadFiles() {
        try {
            const data = await fetchJson('/api/server/logs/files');
            state.files = Array.isArray(data.files) ? data.files : [];
            if (!state.selectedFile && state.files.length > 0) {
                state.selectedFile = state.files[0].name;
            }
            renderFileCards();
            populateFileSelect();
        } catch (error) {
            console.error('[ServerLog] loadFiles failed:', error);
            state.files = [];
            renderFileCards();
            populateFileSelect();
        }
    }

    function renderFileCards() {
        if (!els.fileCards || !els.fileEmpty) return;
        if (!state.files.length) {
            els.fileCards.innerHTML = '';
            els.fileEmpty.classList.remove('hidden');
            return;
        }

        els.fileEmpty.classList.add('hidden');
        els.fileCards.innerHTML = state.files.map(file => {
            const active = state.selectedFile === file.name ? 'active' : '';
            return `
                <article class="file-card ${active}">
                    <header>
                        <h3>${file.date || file.name}</h3>
                        <span class="file-meta">${formatBytes(file.size)}</span>
                    </header>
                    <p class="file-meta">
                        행 수: ${file.entries}<br>
                        수정: ${formatDate(file.mtime)}<br>
                        생성: ${formatDate(file.ctime)}
                    </p>
                    <footer>
                        <button class="btn-primary file-select-btn" data-name="${file.name}">선택</button>
                        <a href="${file.url}" target="_blank" rel="noopener">원본 다운로드</a>
                    </footer>
                </article>
            `;
        }).join('');

        els.fileCards.querySelectorAll('.file-select-btn').forEach(button => {
            button.addEventListener('click', () => {
                const name = button.dataset.name;
                if (name && name !== state.selectedFile) {
                    state.selectedFile = name;
                    if (els.fileSelect) {
                        els.fileSelect.value = name;
                    }
                    renderFileCards();
                    fetchLogs();
                }
            });
        });
    }

    function populateFileSelect() {
        if (!els.fileSelect) return;
        els.fileSelect.innerHTML = state.files.map(file => `
            <option value="${file.name}">${file.date || file.name} · ${file.entries}행</option>
        `).join('');
        if (state.selectedFile) {
            els.fileSelect.value = state.selectedFile;
        }
    }

    async function fetchLogs() {
        if (!state.selectedFile) return;
        const params = new URLSearchParams();
        params.set('file', state.selectedFile);
        params.set('limit', String(state.limit));
        params.set('offset', String(state.offset));
        if (state.level && state.level !== 'all') {
            params.set('level', state.level);
        }
        if (state.search && state.search.trim()) {
            params.set('search', state.search.trim());
        }

        try {
            const data = await fetchJson(`/api/server/logs?${params.toString()}`);
            state.originalEntries = Array.isArray(data.entries) ? data.entries : [];
            state.total = data.total || 0;
            if (data.file?.name) {
                state.selectedFile = data.file.name;
                if (els.fileSelect) {
                    els.fileSelect.value = state.selectedFile;
                }
            }
            if (Array.isArray(data.availableFiles) && data.availableFiles.length) {
                const merged = new Map(state.files.map(file => [file.name, file]));
                data.availableFiles.forEach(file => {
                    const existing = merged.get(file.name) || {};
                    merged.set(file.name, { ...existing, ...file });
                });
                state.files = Array.from(merged.values()).sort((a, b) => {
                    if (a.name === b.name) return 0;
                    return a.name < b.name ? 1 : -1;
                });
                renderFileCards();
                populateFileSelect();
            }
            applyEntryFilters();
            if (isOverlayVisible()) {
                closeLogDiagram();
            }
            renderLogSummary(data);
            renderLogTable();
        } catch (error) {
            console.error('[ServerLog] fetchLogs failed:', error);
            state.originalEntries = [];
            state.entries = [];
            state.total = 0;
            if (isOverlayVisible()) {
                closeLogDiagram();
            }
            renderLogSummary();
            renderLogTable();
        }
    }

    function applyEntryFilters() {
        if (!Array.isArray(state.originalEntries)) {
            state.entries = [];
            return;
        }
        const filtered = state.hideMismatch
            ? state.originalEntries.filter(entry => {
                const message = (entry.message || '').toLowerCase();
                return !message.includes('bit mismatch');
            })
            : state.originalEntries.slice();
        state.entries = filtered;
        state.selectedEntryIndex = null;
    }

    function renderLogSummary(data = {}) {
        if (els.selectedFileInfo) {
            const file = state.files.find(f => f.name === state.selectedFile) || data.file || null;
            if (!file) {
                els.selectedFileInfo.textContent = '-';
            } else {
                els.selectedFileInfo.textContent = `${file.date || file.name} · ${formatBytes(file.size || 0)} · ${file.entries || 0}행`;
            }
        }

        if (els.filterResultInfo) {
            const hiddenCount = state.originalEntries.length - state.entries.length;
            if (hiddenCount > 0) {
                els.filterResultInfo.textContent = `총 ${state.total}건 중 ${hiddenCount}건을 숨기고 상위 ${state.entries.length}건을 표시합니다.`;
            } else {
                els.filterResultInfo.textContent = `총 ${state.total}건 중 상위 ${state.entries.length}건을 표시합니다.`;
            }
        }

        if (els.levelSummary) {
            const counts = state.entries.reduce((acc, entry) => {
                const key = (entry.level || 'info').toLowerCase();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            const keys = Object.keys(counts);
            if (!keys.length) {
                els.levelSummary.innerHTML = '<li>표시된 로그가 없습니다.</li>';
            } else {
                els.levelSummary.innerHTML = keys.map(level => `
                    <li><strong>${levelLabels[level] || level}</strong>: ${counts[level]}건</li>
                `).join('');
            }
        }
    }

    function renderLogTable() {
        if (!els.tableBody || !els.tableEmpty) return;
        if (!state.entries.length) {
            els.tableBody.innerHTML = '';
            els.tableEmpty.classList.remove('hidden');
            return;
        }

        els.tableEmpty.classList.add('hidden');
        if (state.selectedEntryIndex !== null && (state.selectedEntryIndex < 0 || state.selectedEntryIndex >= state.entries.length)) {
            state.selectedEntryIndex = null;
        }
        els.tableBody.innerHTML = state.entries.map((entry, index) => {
            const level = (entry.level || 'info').toLowerCase();
            const meta = entry.meta ? escapeHtml(JSON.stringify(entry.meta, null, 2)) : '';
            return `
                <tr class="log-entry-row" data-entry-index="${index}" title="다이어그램 열기">
                    <td>${formatDate(entry.timestamp)}</td>
                    <td class="level-cell ${level}">${level}</td>
                    <td>${entry.message || ''}</td>
                    <td class="meta-cell">${meta ? `<pre>${meta}</pre>` : '-'}</td>
                </tr>
            `;
        }).join('');
        attachLogRowEvents();
        highlightSelectedLogRow();
    }

    function attachLogRowEvents() {
        if (!els.tableBody) return;
        els.tableBody.querySelectorAll('tr.log-entry-row').forEach(row => {
            row.addEventListener('click', () => {
                const index = Number(row.dataset.entryIndex);
                if (Number.isNaN(index) || !state.entries[index]) return;
                openLogDiagram(state.entries[index], index);
            });
        });
    }

    function highlightSelectedLogRow() {
        if (!els.tableBody) return;
        els.tableBody.querySelectorAll('tr.log-entry-row').forEach(row => {
            const index = Number(row.dataset.entryIndex);
            const isActive = state.selectedEntryIndex === index;
            if (isActive) {
                row.classList.add('active');
                row.setAttribute('aria-current', 'true');
            } else {
                row.classList.remove('active');
                row.removeAttribute('aria-current');
            }
        });
    }

    function formatMetaValue(value, type) {
        if (type === 'list') {
            if (!Array.isArray(value) || !value.length) return '-';
            return value.map(item => escapeHtml(String(item))).join('<br>');
        }
        if (type === 'json') {
            if (!value || (typeof value === 'object' && !Object.keys(value).length)) return '-';
            return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        if (type === 'pre') {
            if (value === null || value === undefined || value === '') return '-';
            return `<pre>${escapeHtml(String(value))}</pre>`;
        }
        if (value === null || value === undefined || value === '') return '-';
        if (typeof value === 'number' || typeof value === 'boolean') {
            return escapeHtml(String(value));
        }
        if (Array.isArray(value)) {
            if (!value.length) return '-';
            return value.map(item => escapeHtml(String(item))).join('<br>');
        }
        if (typeof value === 'object') {
            if (!Object.keys(value).length) return '-';
            return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return escapeHtml(String(value)).replace(/\r?\n/g, '<br>');
    }

    const FLOWCHART_CLASS_LINES = [
        'classDef info fill:#0f1c2b,stroke:#38bdf8,color:#e0f2fe;',
        'classDef success fill:#064e3b,stroke:#34d399,color:#ecfdf5;',
        'classDef warn fill:#78350f,stroke:#f59e0b,color:#fef3c7;',
        'classDef error fill:#7f1d1d,stroke:#f87171,color:#fee2e2;',
        'classDef neutral fill:#1f2937,stroke:#475569,color:#e2e8f0;',
    ];

    function buildFlowchart(lines, classAssignments = []) {
        return [
            'flowchart LR',
            ...lines.map(line => `    ${line}`),
            ...FLOWCHART_CLASS_LINES.map(line => `    ${line}`),
            ...classAssignments.map(line => `    ${line}`),
        ].join('\n');
    }

    function buildAttributeSavedDiagram(entry) {
        const meta = entry?.meta || {};
        const attrPair = { max: meta.attributeBitMax, min: meta.attributeBitMin };
        const dataPair = { max: meta.dataBitMax, min: meta.dataBitMin };
        const fileEntries = Object.entries(meta.files || {}).filter(([, path]) => Boolean(path));
        const fileSummary = fileEntries.length ? `${fileEntries.length}개 경로` : '저장 경로 없음';
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `VALIDATION["${escapeMermaidLabel(`BIT 검증\n속성 ${formatBitPair(attrPair)}\n데이터 ${formatBitPair(dataPair)}`)}"]`,
            `STORAGE["${escapeMermaidLabel(`파일 저장\n${fileSummary}`)}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> VALIDATION',
            'VALIDATION --> STORAGE',
            'STORAGE --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class VALIDATION info;',
            'class STORAGE success;',
            'class LOG neutral;',
        ]);
        const summaryParts = [
            '속성/데이터 BIT 검증을 통과했고 서버가 데이터를 저장했습니다.',
        ];
        if (fileEntries.length) {
            summaryParts.push(`${fileEntries.length}개의 파일 경로에 기록되었습니다.`);
        }
        if (meta.textLength !== undefined && meta.textLength !== null) {
            summaryParts.push(`본문 길이 ${Number(meta.textLength).toLocaleString()}자.`);
        }
        const metaItems = [
            { label: '메시지', value: entry.message || '-' },
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
            { label: '챕터', value: meta.chapter !== undefined && meta.chapter !== null ? `#${meta.chapter}` : '-' },
            { label: '텍스트 길이', value: meta.textLength !== undefined && meta.textLength !== null ? `${meta.textLength}자` : '-' },
            { label: '속성 BIT', value: formatBitPair(attrPair) },
            { label: '데이터 BIT', value: formatBitPair(dataPair) },
        ];
        if (fileEntries.length) {
            const filePaths = fileEntries.map(([key, path]) => `${camelToLabel(key)} → ${path}`);
            metaItems.push({ label: '저장 파일 경로', value: filePaths, type: 'list' });
        }
        return {
            title: '속성 데이터 저장',
            summary: summaryParts.join(' '),
            mermaid,
            meta: metaItems,
        };
    }

    function buildAttributeSaveFailedDiagram(entry) {
        const meta = entry?.meta || {};
        const errorMessage = meta.error || entry.message || 'Attribute data save failed';
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `STORAGE["${escapeMermaidLabel('데이터 저장 시도')}"]`,
            `ERROR["${escapeMermaidLabel(`오류 발생\n${errorMessage}`)}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> STORAGE',
            'STORAGE --> ERROR',
            'ERROR --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class STORAGE warn;',
            'class ERROR error;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '오류 메시지', value: errorMessage },
        ];
        if (meta.stack) {
            metaItems.push({ label: '스택', value: meta.stack, type: 'pre' });
        }
        if (meta.payloadPreview) {
            metaItems.push({ label: 'Payload 미리보기', value: meta.payloadPreview, type: 'pre' });
        }
        if (meta.attributeText) {
            metaItems.push({ label: '속성 텍스트', value: meta.attributeText });
        }
        if (meta.novelTitle) {
            metaItems.push({ label: '소설 제목', value: meta.novelTitle });
        }
        return {
            title: '데이터 저장 실패',
            summary: `데이터 저장 중 오류가 발생했습니다: ${errorMessage}`,
            mermaid,
            meta: metaItems,
        };
    }

    function buildAttributeBitMismatchDiagram(entry) {
        const meta = entry?.meta || {};
        const provided = meta.provided || {};
        const computed = meta.computed || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `BITCHECK["${escapeMermaidLabel(`속성 BIT 검증\n제공값 ${formatBitPair(provided)}\n서버 계산 ${formatBitPair(computed)}`)}"]`,
            `ERROR["${escapeMermaidLabel('속성 BIT 불일치')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> BITCHECK',
            'BITCHECK --> ERROR',
            'ERROR --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class BITCHECK warn;',
            'class ERROR error;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
            { label: '제공된 BIT', value: provided, type: 'json' },
            { label: '서버 계산 BIT', value: computed, type: 'json' },
        ];
        return {
            title: '속성 BIT 불일치',
            summary: '클라이언트에서 제공한 속성 BIT 값이 서버에서 재계산한 값과 일치하지 않습니다.',
            mermaid,
            meta: metaItems,
        };
    }

    function buildDataBitMismatchDiagram(entry) {
        const meta = entry?.meta || {};
        const provided = meta.provided || {};
        const computed = meta.computed || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `BITCHECK["${escapeMermaidLabel(`데이터 BIT 검증\n제공값 ${formatBitPair(provided)}\n서버 계산 ${formatBitPair(computed)}`)}"]`,
            `ERROR["${escapeMermaidLabel('데이터 BIT 불일치')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> BITCHECK',
            'BITCHECK --> ERROR',
            'ERROR --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class BITCHECK warn;',
            'class ERROR error;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
            { label: '제공된 데이터 BIT', value: provided, type: 'json' },
            { label: '서버 계산 데이터 BIT', value: computed, type: 'json' },
        ];
        return {
            title: '데이터 BIT 불일치',
            summary: '데이터 텍스트에 대한 BIT 값이 서버 계산 결과와 일치하지 않습니다.',
            mermaid,
            meta: metaItems,
        };
    }

    function buildDuplicateSkippedDiagram(entry) {
        const meta = entry?.meta || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `CHECK["${escapeMermaidLabel('중복 검사\n동일 BIT/텍스트 조합 발견')}"]`,
            `SKIP["${escapeMermaidLabel('중복 감지 → 저장 건너뜀')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> CHECK',
            'CHECK --> SKIP',
            'SKIP --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class CHECK warn;',
            'class SKIP warn;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
            { label: '챕터', value: meta.chapter !== undefined && meta.chapter !== null ? `#${meta.chapter}` : '-' },
        ];
        return {
            title: '중복 데이터 감지',
            summary: '동일한 속성/데이터 조합이 이미 저장되어 있어 이번 요청은 건너뛰었습니다.',
            mermaid,
            meta: metaItems,
        };
    }

    function buildMissingAttributeBitsDiagram(entry) {
        const meta = entry?.meta || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `VALIDATION["${escapeMermaidLabel('BIT 값 확인')}"]`,
            `ERROR["${escapeMermaidLabel('속성 BIT 누락')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> VALIDATION',
            'VALIDATION --> ERROR',
            'ERROR --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class VALIDATION warn;',
            'class ERROR error;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
            { label: '제공된 MAX', value: formatBitValue(meta.receivedMax) },
            { label: '제공된 MIN', value: formatBitValue(meta.receivedMin) },
        ];
        return {
            title: '속성 BIT 누락',
            summary: '클라이언트 요청에 속성 BIT 값이 포함되어 있지 않아 처리가 중단되었습니다.',
            mermaid,
            meta: metaItems,
        };
    }

    function buildTextFieldMissingDiagram(entry) {
        const meta = entry?.meta || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `VALIDATION["${escapeMermaidLabel('Payload 검사\ntext 필드 누락')}"]`,
            `ERROR["${escapeMermaidLabel('본문 필드 없음')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> VALIDATION',
            'VALIDATION --> ERROR',
            'ERROR --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class VALIDATION warn;',
            'class ERROR error;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
        ];
        return {
            title: '본문 필드 누락',
            summary: '요청 Payload에 text 필드가 포함되지 않아 서버가 요청을 거부했습니다.',
            mermaid,
            meta: metaItems,
        };
    }

    function buildTextNotConvertibleDiagram(entry) {
        const meta = entry?.meta || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `API{{${escapeMermaidLabel('POST /api/attributes/data')}}}`,
            `PROCESS["${escapeMermaidLabel('본문 문자열 변환 시도')}"]`,
            `ERROR["${escapeMermaidLabel('본문을 문자열로 변환할 수 없음')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> API',
            'API --> PROCESS',
            'PROCESS --> ERROR',
            'ERROR --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class API info;',
            'class PROCESS warn;',
            'class ERROR error;',
            'class LOG neutral;',
        ]);
        const metaItems = [
            { label: '속성 텍스트', value: meta.attributeText || '-' },
            { label: '소설 제목', value: meta.novelTitle || '-' },
        ];
        return {
            title: '본문 변환 실패',
            summary: '본문 텍스트를 문자열로 변환할 수 없어 저장이 중단되었습니다.',
            mermaid,
            meta: metaItems,
        };
    }

    function buildGenericDiagram(entry) {
        const meta = entry?.meta || {};
        const lines = [
            `CLIENT(["${escapeMermaidLabel('클라이언트')}"])`,
            `SERVER["${escapeMermaidLabel('Express 서버')}"]`,
            `HANDLER["${escapeMermaidLabel(entry.message || '서버 처리')}"]`,
            `LOG["${escapeMermaidLabel('서버 로그 기록')}"]`,
            'CLIENT --> SERVER',
            'SERVER --> HANDLER',
            'HANDLER --> LOG',
        ];
        const mermaid = buildFlowchart(lines, [
            'class SERVER info;',
            'class HANDLER neutral;',
            'class LOG neutral;',
        ]);
        const metaItems = [];
        if (meta && Object.keys(meta).length) {
            metaItems.push({ label: '메타 데이터', value: meta, type: 'json' });
        }
        return {
            title: entry.message || '서버 로그',
            summary: entry.message || '선택한 로그의 처리 흐름입니다.',
            mermaid,
            meta: metaItems,
        };
    }

    const diagramBuilders = [
        { match: entry => /attribute data saved/i.test(entry?.message || ''), build: buildAttributeSavedDiagram },
        { match: entry => /attribute data save failed/i.test(entry?.message || ''), build: buildAttributeSaveFailedDiagram },
        { match: entry => /attribute bit mismatch/i.test(entry?.message || ''), build: buildAttributeBitMismatchDiagram },
        { match: entry => /data bit mismatch/i.test(entry?.message || ''), build: buildDataBitMismatchDiagram },
        { match: entry => /duplicate attribute\/data combination skipped/i.test(entry?.message || ''), build: buildDuplicateSkippedDiagram },
        { match: entry => /missing attribute bit values/i.test(entry?.message || ''), build: buildMissingAttributeBitsDiagram },
        { match: entry => /text field missing/i.test(entry?.message || ''), build: buildTextFieldMissingDiagram },
        { match: entry => /text not convertible to string/i.test(entry?.message || ''), build: buildTextNotConvertibleDiagram },
        { match: () => true, build: buildGenericDiagram },
    ];

    function buildDiagramDetail(entry) {
        if (!entry) return null;
        const builder = diagramBuilders.find(item => item.match(entry)) || diagramBuilders[diagramBuilders.length - 1];
        return builder.build(entry);
    }

    function renderDiagramMeta(items) {
        if (!diagramEls.metaList || !diagramEls.metaEmpty) return;
        if (!Array.isArray(items) || !items.length) {
            diagramEls.metaList.innerHTML = '';
            diagramEls.metaEmpty.classList.remove('hidden');
            return;
        }
        diagramEls.metaEmpty.classList.add('hidden');
        diagramEls.metaList.innerHTML = items.map(item => {
            const label = escapeHtml(item.label || '');
            const valueHtml = formatMetaValue(item.value, item.type);
            return `<li><span class="meta-label">${label}</span><span class="meta-value">${valueHtml}</span></li>`;
        }).join('');
    }

    function renderMermaidDiagram(definition) {
        if (!diagramEls.mermaid) return;
        if (!definition) {
            diagramEls.mermaid.innerHTML = '';
            diagramEls.mermaid.classList.add('hidden');
            if (diagramEls.mermaidFallback) {
                diagramEls.mermaidFallback.textContent = '다이어그램 데이터가 없습니다.';
                diagramEls.mermaidFallback.classList.remove('hidden');
            }
            return;
        }

        diagramEls.mermaid.classList.remove('hidden');
        diagramEls.mermaid.textContent = definition;
        if (diagramEls.mermaidFallback) {
            diagramEls.mermaidFallback.classList.add('hidden');
        }

        if (window.mermaid && typeof window.mermaid.init === 'function') {
            try {
                diagramEls.mermaid.removeAttribute('data-processed');
                window.mermaid.init(undefined, diagramEls.mermaid);
            } catch (error) {
                console.error('[ServerLog] Mermaid render failed:', error);
                if (diagramEls.mermaidFallback) {
                    diagramEls.mermaidFallback.textContent = '다이어그램 생성 중 오류가 발생했습니다.';
                    diagramEls.mermaidFallback.classList.remove('hidden');
                }
            }
        } else if (diagramEls.mermaidFallback) {
            diagramEls.mermaidFallback.textContent = 'Mermaid 라이브러리를 불러올 수 없습니다.';
            diagramEls.mermaidFallback.classList.remove('hidden');
        }
    }

    function isOverlayVisible() {
        return Boolean(diagramEls.overlay && !diagramEls.overlay.classList.contains('hidden'));
    }

    function openLogDiagram(entry, index) {
        if (!entry) return;
        state.selectedEntryIndex = index;
        diagramState.activeEntry = entry;
        highlightSelectedLogRow();

        const detail = buildDiagramDetail(entry) || {};

        if (diagramEls.level) {
            const level = (entry.level || 'info').toLowerCase();
            diagramEls.level.textContent = level.toUpperCase();
            diagramEls.level.className = `log-diagram-level level-${level}`;
        }
        if (diagramEls.title) {
            diagramEls.title.textContent = detail.title || entry.message || '로그 상세';
        }
        if (diagramEls.timestamp) {
            diagramEls.timestamp.textContent = formatDate(entry.timestamp);
        }
        if (diagramEls.summary) {
            diagramEls.summary.textContent = detail.summary || entry.message || '';
        }

        renderMermaidDiagram(detail.mermaid);
        renderDiagramMeta(detail.meta);

        if (diagramEls.rawJson) {
            try {
                diagramEls.rawJson.textContent = JSON.stringify(entry, null, 2);
            } catch {
                diagramEls.rawJson.textContent = String(entry);
            }
        }

        if (diagramEls.overlay) {
            diagramState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            diagramEls.overlay.classList.remove('hidden');
            diagramEls.overlay.setAttribute('aria-hidden', 'false');
            if (document.body) {
                document.body.classList.add('modal-open');
            }
            if (diagramEls.closeBtn) {
                diagramEls.closeBtn.focus();
            }
        }
    }

    function closeLogDiagram() {
        if (!isOverlayVisible()) return;
        if (diagramEls.overlay) {
            diagramEls.overlay.classList.add('hidden');
            diagramEls.overlay.setAttribute('aria-hidden', 'true');
        }
        if (document.body) {
            document.body.classList.remove('modal-open');
        }
        if (diagramEls.mermaid) {
            diagramEls.mermaid.innerHTML = '';
            diagramEls.mermaid.classList.add('hidden');
        }
        if (diagramEls.mermaidFallback) {
            diagramEls.mermaidFallback.classList.add('hidden');
        }
        if (diagramEls.metaList) {
            diagramEls.metaList.innerHTML = '';
        }
        if (diagramEls.metaEmpty) {
            diagramEls.metaEmpty.classList.add('hidden');
        }
        if (diagramEls.summary) {
            diagramEls.summary.textContent = '';
        }
        if (diagramEls.rawJson) {
            diagramEls.rawJson.textContent = '{}';
        }
        if (diagramState.previousFocus && typeof diagramState.previousFocus.focus === 'function') {
            diagramState.previousFocus.focus();
        }
        diagramState.previousFocus = null;
        diagramState.activeEntry = null;
    }

    function setupDiagramInteractions() {
        if (diagramEls.closeBtn) {
            diagramEls.closeBtn.addEventListener('click', () => closeLogDiagram());
        }
        if (diagramEls.overlay) {
            diagramEls.overlay.addEventListener('click', (event) => {
                if (event.target === diagramEls.overlay) {
                    closeLogDiagram();
                }
            });
        }
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && isOverlayVisible()) {
                event.preventDefault();
                closeLogDiagram();
            }
        });
    }

    function handleFileChange(event) {
        state.selectedFile = event.target.value;
        state.offset = 0;
        renderFileCards();
        fetchLogs();
    }

    function handleLevelChange(event) {
        state.level = event.target.value || 'all';
        state.offset = 0;
        fetchLogs();
    }

    function handleLimitChange(event) {
        state.limit = parseInt(event.target.value, 10) || 200;
        state.offset = 0;
        fetchLogs();
    }

    const handleSearchInput = debounce((event) => {
        state.search = event.target.value || '';
        state.offset = 0;
        fetchLogs();
    }, 500);

    function registerEvents() {
        if (els.fileSelect) {
            els.fileSelect.addEventListener('change', handleFileChange);
        }
        if (els.levelSelect) {
            els.levelSelect.addEventListener('change', handleLevelChange);
        }
        if (els.limitSelect) {
            els.limitSelect.addEventListener('change', handleLimitChange);
        }
        if (els.searchInput) {
            els.searchInput.addEventListener('input', (event) => handleSearchInput(event));
        }
        if (els.refreshBtn) {
            els.refreshBtn.addEventListener('click', () => fetchLogs());
        }
        if (els.hideMismatchToggle) {
            els.hideMismatchToggle.addEventListener('change', (event) => {
                state.hideMismatch = Boolean(event.target.checked);
                applyEntryFilters();
                renderLogSummary();
                renderLogTable();
            });
        }
    }

    function init() {
        registerEvents();
        setupDiagramInteractions();
        if (window.mermaid && typeof window.mermaid.initialize === 'function') {
            window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'loose',
                theme: 'dark',
            });
        }
        loadFiles().then(fetchLogs);
    }

    document.addEventListener('DOMContentLoaded', init);
})();

