(() => {
    const LOG_STORAGE_KEY = 'novel_ai_log_history';

    const SYSTEM_FLOW_STEPS = [
        {
            id: 'input',
            title: '사용자 입력',
            description: '소설 제목 · 속성 · 데이터 입력',
            keywords: [/입력/i, /textarea/i, /saveAttributeAndData/i],
            order: 1
        },
        {
            id: 'bit',
            title: 'BIT 계산',
            description: 'calculateBitValues 수행',
            keywords: [/bit/i, /calculate/i, /wordNbUnicodeFormat/i],
            order: 2
        },
        {
            id: 'storage',
            title: '데이터 저장',
            description: 'server/data/<max|min>/... 에 기록',
            keywords: [/저장/i, /write/i, /fs/i, /ndjson/i],
            order: 3
        },
        {
            id: 'log',
            title: '로그 발행',
            description: '콘솔 → 상단 로그 → localStorage',
            keywords: [/log/i, /console/i, /\[fetch/i, /\[attribute/i],
            order: 4
        },
        {
            id: 'viewer',
            title: '시각화/분석',
            description: '상단 그래프 · 로그 뷰어 · 다이어그램 페이지',
            keywords: [/viewer/i, /flow/i, /diagram/i, /render/i],
            order: 5
        }
    ];

    const els = {
        systemFlow: document.getElementById('systemFlowDiagram'),
        flowFallbackMessage: document.getElementById('flowFallbackMessage'),
        detailTitle: document.getElementById('detailTitle'),
        detailCount: document.getElementById('detailCount'),
        detailDiagram: document.getElementById('detailDiagram'),
        detailStepSelector: document.getElementById('detailStepSelector'),
        detailList: document.getElementById('detailLogList'),
        detailEmptyMessage: document.getElementById('detailEmptyMessage'),
        dataFlowLogList: document.getElementById('dataFlowLogList'),
        dataFlowLogEmpty: document.getElementById('dataFlowLogEmpty'),
        dataFlowLogCount: document.getElementById('dataFlowLogCount'),
        bitFlowList: document.getElementById('bitFlowLogList'),
        bitFlowEmpty: document.getElementById('bitFlowLogEmpty'),
        bitFlowCount: document.getElementById('bitFlowLogCount'),
        bitSummaryInfo: document.getElementById('bitSummaryInfo'),
        bitSummaryDiagram: document.getElementById('bitSummaryDiagram')
    };
    function renderMermaid(el, definition) {
        if (!el) return;
        if (!definition) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }

        el.classList.remove('hidden');
        el.textContent = definition;

        if (window.mermaid && typeof window.mermaid.init === 'function') {
            try {
                el.removeAttribute('data-processed');
                window.mermaid.init(undefined, el);
            } catch (error) {
                console.error('[Mermaid] render error:', error);
            }
        }
    }

    function renderStepSelector() {
        if (!els.detailStepSelector) return;

        if (!state.steps.length) {
            els.detailStepSelector.innerHTML = '';
            els.detailStepSelector.classList.add('hidden');
            return;
        }

        const sorted = state.steps.slice().sort((a, b) => a.order - b.order);
        const buttons = sorted.map(step => {
            const isActive = step.id === state.selectedStepId;
            const label = `${step.order}. ${step.title} (${step.count}건)`;
            return `<button type="button" data-step="${step.id}" class="${isActive ? 'active' : ''}">${label}</button>`;
        }).join('');

        els.detailStepSelector.innerHTML = buttons;
        els.detailStepSelector.classList.remove('hidden');

        els.detailStepSelector.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', () => {
                const stepId = button.dataset.step;
                const step = state.steps.find(item => item.id === stepId);
                state.selectedStepId = stepId;
                renderStepSelector();
                renderSystemFlow();
                renderDetail(step);
            });
        });
    }

    function renderStaticMermaid() {
        if (!window.mermaid || typeof window.mermaid.init !== 'function') return;
        const staticNodes = document.querySelectorAll('.mermaid-section .mermaid');
        if (!staticNodes.length) return;
        staticNodes.forEach(node => node.removeAttribute('data-processed'));
        window.mermaid.init(undefined, staticNodes);
    }

    function renderBitFlowLogs() {
        if (!els.bitFlowList || !els.bitFlowEmpty) return;

        const KEYWORDS = [
            'calculatebitvalues',
            'bit:',
            'attribute bit',
            'data bit',
            'bit 값',
            'bit 계산'
        ];

        const logs = state.logs.filter(log => {
            const text = (log.message || '').toLowerCase();
            return KEYWORDS.some(keyword => text.includes(keyword));
        });

        if (!logs.length) {
            els.bitFlowEmpty.classList.remove('hidden');
            els.bitFlowList.innerHTML = '';
            if (els.bitFlowCount) els.bitFlowCount.textContent = '';
            return;
        }

        els.bitFlowEmpty.classList.add('hidden');
        if (els.bitFlowCount) {
            els.bitFlowCount.textContent = `${logs.length}건`;
        }

        const items = logs.slice(0, 20).map(log => `
            <li class="log-item type-${log.type}">
                <div class="log-meta">
                    <span>${log.timestamp}</span>
                    <span>${log.type.toUpperCase()}</span>
                </div>
                <div class="log-message">${log.message}</div>
            </li>
        `).join('');

        els.bitFlowList.innerHTML = items;
    }

    function extractBitValues(message) {
        if (!message) return null;

        let max;
        let min;

        const maxMatch = message.match(/max\s*(?:=|:)?\s*(-?\d+(?:\.\d+)?)/i);
        const minMatch = message.match(/min\s*(?:=|:)?\s*(-?\d+(?:\.\d+)?)/i);
        if (maxMatch) max = parseFloat(maxMatch[1]);
        if (minMatch) min = parseFloat(minMatch[1]);

        if ((typeof max === 'number' && !Number.isNaN(max)) &&
            (typeof min === 'number' && !Number.isNaN(min))) {
            return { max, min };
        }

        if (/(?:^|\s)bit\s*(?:=|:)/i.test(message)) {
            const lower = message.toLowerCase();
            const bitIndex = lower.indexOf('bit');
            const snippet = bitIndex >= 0 ? message.slice(bitIndex) : message;
            const numberMatches = snippet.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
            if (numberMatches && numberMatches.length >= 2) {
                const parsedMax = parseFloat(numberMatches[0]);
                const parsedMin = parseFloat(numberMatches[1]);
                if (!Number.isNaN(parsedMax) && !Number.isNaN(parsedMin)) {
                    return { max: parsedMax, min: parsedMin };
                }
            }
        }

        return null;
    }

    function categorizeBitLog(messageLower) {
        if (!messageLower) return 'general';
        if (messageLower.includes('attribute') || messageLower.includes('속성')) return 'attribute';
        if (messageLower.includes('data') || messageLower.includes('데이터')) return 'data';
        if (messageLower.includes('novel') || messageLower.includes('제목')) return 'novel';
        if (messageLower.includes('chapter') || messageLower.includes('챕터')) return 'chapter';
        return 'general';
    }

    function renderBitSummary() {
        if (!els.bitSummaryDiagram || !els.bitSummaryInfo) return;

        const summary = {
            attribute: null,
            data: null,
            novel: null,
            chapter: null,
            general: null
        };

        const logs = state.logs.slice().reverse();
        for (const log of logs) {
            const values = extractBitValues(log.message);
            if (!values) continue;
            const category = categorizeBitLog((log.message || '').toLowerCase());
            if (category && !summary[category]) {
                summary[category] = {
                    ...values,
                    timestamp: log.timestamp,
                    createdAt: log.createdAt || Date.now()
                };
            }
            if (!summary.general) {
                summary.general = {
                    ...values,
                    timestamp: log.timestamp,
                    createdAt: log.createdAt || Date.now()
                };
            }
            if (summary.attribute && summary.data && summary.novel && summary.chapter && summary.general) {
                break;
            }
        }

        const order = [
            ['attribute', '속성 BIT'],
            ['data', '데이터 BIT'],
            ['novel', '소설 제목 BIT'],
            ['chapter', '챕터 BIT'],
            ['general', '기타 BIT']
        ];

        const available = order.filter(([key]) => summary[key]);
        if (!available.length) {
            els.bitSummaryInfo.textContent = '최근 BIT 로그 없음';
            renderMermaid(els.bitSummaryDiagram, '');
            return;
        }

        let latestCreatedAt = 0;
        let latestTimestamp = null;
        let definition = 'flowchart LR\n';
        definition += '    Summary[최근 BIT 로그]\n';

        available.forEach(([key, label]) => {
            const info = summary[key];
            if (!info) return;
            const nodeId = key.toUpperCase();
            const nodeLabel = `${label}&lt;br/&gt;MAX: ${info.max.toFixed(8)}&lt;br/&gt;MIN: ${info.min.toFixed(8)}`;
            definition += `    ${nodeId}["${nodeLabel.replace(/"/g, '\'')}"]\n`;
            definition += `    ${nodeId} --> Summary\n`;

            if (info.createdAt && info.createdAt > latestCreatedAt) {
                latestCreatedAt = info.createdAt;
                latestTimestamp = info.timestamp;
            }
        });

        els.bitSummaryInfo.textContent = latestTimestamp ? `마지막 갱신: ${latestTimestamp}` : '최근 BIT 로그';
        renderMermaid(els.bitSummaryDiagram, definition);
    }

    const state = {
        logs: [],
        steps: [],
        selectedStepId: null
    };

    function loadLogs() {
        try {
            const raw = localStorage.getItem(LOG_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map(item => ({
                    type: typeof item.type === 'string' ? item.type : 'message',
                    timestamp: item.timestamp || new Date(item.createdAt || Date.now()).toLocaleTimeString(),
                    message: item.message || '',
                    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
                }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } catch {
            return [];
        }
    }

    function matchStep(log) {
        const text = (log.message || '').toLowerCase();
        for (const step of SYSTEM_FLOW_STEPS) {
            if (step.keywords.some(rx => rx.test(text))) return step.id;
        }
        if (log.type === 'error' || log.type === 'warn') {
            return 'storage';
        }
        return 'log';
    }

    function buildFlow(logs) {
        return SYSTEM_FLOW_STEPS.map(step => {
            const stepLogs = logs.filter(log => matchStep(log) === step.id);
            let status = 'idle';
            if (stepLogs.some(log => log.type === 'error')) status = 'error';
            else if (stepLogs.some(log => log.type === 'warn')) status = 'warn';
            else if (stepLogs.length) status = 'success';

            return {
                ...step,
                logs: stepLogs,
                count: stepLogs.length,
                status
            };
        });
    }

    function renderSystemFlow() {
        if (!els.systemFlow) return;

        if (!state.steps.length) {
            els.systemFlow.innerHTML = '';
            els.systemFlow.classList.add('hidden');
            if (els.flowFallbackMessage) {
                els.flowFallbackMessage.classList.remove('hidden');
            }
            return;
        }

        if (els.flowFallbackMessage) {
            els.flowFallbackMessage.classList.add('hidden');
        }
        els.systemFlow.classList.remove('hidden');

        const sorted = state.steps.slice().sort((a, b) => a.order - b.order);
        const nodeIds = [];
        let definition = 'flowchart LR\n';

        sorted.forEach(step => {
            const nodeId = `S${step.order}`;
            nodeIds.push(nodeId);
            const statusLabel = step.status === 'success' ? '정상'
                : step.status === 'warn' ? '경고'
                : step.status === 'error' ? '오류'
                : '대기';
            const label = `${step.order}. ${step.title}&lt;br/&gt;${step.count}건 · ${statusLabel}`;
            definition += `    ${nodeId}["${label.replace(/"/g, '\'')}"]\n`;
        });

        for (let i = 0; i < nodeIds.length - 1; i += 1) {
            definition += `    ${nodeIds[i]} --> ${nodeIds[i + 1]}\n`;
        }

        definition += '    classDef idle fill:#1f2933,stroke:#334155,color:#94a3b8\n';
        definition += '    classDef success fill:#064e3b,stroke:#34d399,color:#ecfdf5\n';
        definition += '    classDef warn fill:#78350f,stroke:#f59e0b,color:#fef3c7\n';
        definition += '    classDef error fill:#7f1d1d,stroke:#f87171,color:#fee2e2\n';
        definition += '    classDef selected fill:#312e81,stroke:#a855f7,color:#ede9fe\n';

        sorted.forEach(step => {
            const nodeId = `S${step.order}`;
            const classes = [step.status || 'idle'];
            if (step.id === state.selectedStepId) {
                classes.push('selected');
            }
            definition += `    class ${nodeId} ${classes.join(',')}\n`;
        });

        renderMermaid(els.systemFlow, definition);
    }

    function renderDetailDiagram(step) {
        if (!els.detailDiagram) return;
        if (!step || !step.logs.length) {
            renderMermaid(els.detailDiagram, '');
            return;
        }

        const totals = { info: 0, message: 0, warn: 0, error: 0 };
        step.logs.forEach(log => {
            const type = ['info', 'message', 'warn', 'error'].includes(log.type) ? log.type : 'message';
            totals[type] += 1;
        });

        const total = step.logs.length;
        if (!total) {
            renderMermaid(els.detailDiagram, '');
            return;
        }

        let definition = 'pie showData\n';
        definition += `    "정보" : ${totals.info}\n`;
        definition += `    "일반" : ${totals.message}\n`;
        definition += `    "경고" : ${totals.warn}\n`;
        definition += `    "오류" : ${totals.error}\n`;

        renderMermaid(els.detailDiagram, definition);
    }

    function renderDetail(step) {
        if (!els.detailList || !els.detailTitle) return;

        if (!step || !step.logs.length) {
            state.selectedStepId = step ? step.id : null;
            els.detailTitle.textContent = '단계를 선택하세요.';
            if (els.detailCount) els.detailCount.textContent = '';
            els.detailList.innerHTML = '';
            renderDetailDiagram(null);
            if (els.detailEmptyMessage) els.detailEmptyMessage.classList.remove('hidden');
            return;
        }

        state.selectedStepId = step.id;
        els.detailTitle.textContent = `${step.order}. ${step.title} – 상세 로그`;
        if (els.detailCount) els.detailCount.textContent = `${step.count}건`;
        if (els.detailEmptyMessage) els.detailEmptyMessage.classList.add('hidden');
        renderDetailDiagram(step);

        els.detailList.innerHTML = step.logs.map(log => `
            <li class="log-item type-${log.type}">
                <div class="log-meta">
                    <span>${log.timestamp}</span>
                    <span>${log.type.toUpperCase()}</span>
                </div>
                <div class="log-message">${log.message}</div>
            </li>
        `).join('');
    }

    function renderDataFlowLogs() {
        if (!els.dataFlowLogList || !els.dataFlowLogEmpty) return;

        const DATA_FLOW_KEYWORDS = [
            'saveattributeanddata',
            '[attribute]',
            '데이터',
            'data max',
            'data min'
        ];

        const logs = state.logs.filter(log => {
            const text = (log.message || '').toLowerCase();
            return DATA_FLOW_KEYWORDS.some(keyword => text.includes(keyword));
        });

        if (!logs.length) {
            els.dataFlowLogEmpty.classList.remove('hidden');
            els.dataFlowLogList.innerHTML = '';
            if (els.dataFlowLogCount) els.dataFlowLogCount.textContent = '';
            return;
        }

        els.dataFlowLogEmpty.classList.add('hidden');
        if (els.dataFlowLogCount) {
            els.dataFlowLogCount.textContent = `${logs.length}건`;
        }

        const items = logs.slice(0, 20).map(log => `
            <li class="log-item type-${log.type}">
                <div class="log-meta">
                    <span>${log.timestamp}</span>
                    <span>${log.type.toUpperCase()}</span>
                </div>
                <div class="log-message">${log.message}</div>
            </li>
        `).join('');

        els.dataFlowLogList.innerHTML = items;
    }

    function pickInitialStep() {
        if (state.selectedStepId) {
            const existing = state.steps.find(step => step.id === state.selectedStepId);
            if (existing) return existing;
        }
        const priorityStatus = ['error', 'warn', 'success'];
        for (const status of priorityStatus) {
            const match = state.steps.find(step => step.status === status && step.logs.length);
            if (match) {
                state.selectedStepId = match.id;
                return match;
            }
        }
        const firstWithLogs = state.steps.find(step => step.logs.length);
        if (firstWithLogs) {
            state.selectedStepId = firstWithLogs.id;
            return firstWithLogs;
        }
        state.selectedStepId = null;
        return null;
    }

    function refresh() {
        state.logs = loadLogs();
        state.steps = buildFlow(state.logs);
        const step = pickInitialStep();
        renderSystemFlow();
        renderDetail(step);
        renderStepSelector();
        renderDataFlowLogs();
        renderBitFlowLogs();
        renderBitSummary();
    }

    window.addEventListener('storage', (event) => {
        if (event.key === LOG_STORAGE_KEY) {
            refresh();
        }
    });

    refresh();
    renderStaticMermaid();
})();

