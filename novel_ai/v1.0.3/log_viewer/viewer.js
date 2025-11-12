(() => {
    const LOG_STORAGE_KEY = 'novel_ai_log_history';
    const FLOW_STEPS = [
        {
            id: 'init',
            label: '앱 초기화',
            description: '페이지 로딩 및 초기 상태 설정 단계',
            keywords: [/초기화/i, /\[n\/b novel ai]/i, /hydrate/i]
        },
        {
            id: 'fetch',
            label: 'API 요청',
            description: '외부/서버와 통신하는 단계',
            keywords: [/\[fetch/i, /요청/i, /응답/i, /server/i]
        },
        {
            id: 'data',
            label: '데이터/저장',
            description: '속성, 데이터 저장과 파일 쓰기 단계',
            keywords: [/저장/i, /data/i, /attribute/i, /chapter/i, /데이터/i, /속성/i]
        },
        {
            id: 'ui',
            label: 'UI & 로그 시스템',
            description: 'UI 갱신, 필터링, 로그 처리 단계',
            keywords: [/로그/i, /render/i, /필터/i, /ui/i, /display/i]
        },
        {
            id: 'issues',
            label: '경고/오류 감지',
            description: '경고 또는 오류가 발생한 단계',
            keywords: [],
            isIssueBucket: true
        },
        {
            id: 'other',
            label: '기타',
            description: '위 단계에 속하지 않는 로그',
            keywords: [],
            isFallback: true
        }
    ];

    const state = {
        logs: [],
        steps: [],
        selectedStepId: null
    };

    const els = {
        totalLogs: document.getElementById('totalLogs'),
        warnCount: document.getElementById('warnCount'),
        errorCount: document.getElementById('errorCount'),
        lastUpdated: document.getElementById('lastUpdated'),
        flowChart: document.getElementById('flowChart'),
        flowEmpty: document.getElementById('flowEmptyMessage'),
        flowDetailsTitle: document.getElementById('flowDetailsTitle'),
        flowDetailsCount: document.getElementById('flowSelectedCount'),
        flowDetailsList: document.getElementById('flowDetailsList'),
        emptyMessage: document.getElementById('emptyMessage'),
        detailDiagram: document.getElementById('detailDiagram'),
        detailDiagramTotal: document.getElementById('detailDiagramTotal')
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function loadLogsFromStorage() {
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
        } catch (error) {
            console.warn('[로그 뷰어] 저장된 로그를 불러오지 못했습니다.', error);
            return [];
        }
    }

    function categoriseLog(log, steps) {
        const text = (log.message || '').toLowerCase();
        if ((log.type === 'error' || log.type === 'warn') && steps.some(step => step.isIssueBucket)) {
            return 'issues';
        }
        for (const step of steps) {
            if (!step.keywords || !step.keywords.length) continue;
            if (step.keywords.some(rx => rx.test(text))) {
                return step.id;
            }
        }
        const fallback = steps.find(step => step.isFallback);
        return fallback ? fallback.id : steps[steps.length - 1].id;
    }

    function buildFlowState(logs) {
        const stepStates = FLOW_STEPS.map(step => ({
            id: step.id,
            label: step.label,
            description: step.description,
            keywords: step.keywords,
            isIssueBucket: step.isIssueBucket || false,
            isFallback: step.isFallback || false,
            status: 'idle',
            logs: [],
            count: 0
        }));

        logs.forEach(log => {
            const stepId = categoriseLog(log, stepStates);
            const step = stepStates.find(s => s.id === stepId);
            if (!step) return;
            step.logs.push(log);
            step.count += 1;
            if (log.type === 'error') {
                step.status = 'error';
            } else if (log.type === 'warn' && step.status !== 'error') {
                step.status = 'warn';
            } else if (step.status === 'idle') {
                step.status = 'success';
            }
        });

        stepStates.forEach(step => {
            if (step.status === 'idle' && step.count > 0) {
                step.status = 'success';
            }
        });

        return stepStates;
    }

    function updateSummary(logs) {
        const warnCount = logs.filter(log => log.type === 'warn').length;
        const errorCount = logs.filter(log => log.type === 'error').length;

        els.totalLogs.textContent = `${logs.length}건`;
        els.warnCount.textContent = `${warnCount}건`;
        els.errorCount.textContent = `${errorCount}건`;

        if (logs.length) {
            const latest = logs[0];
            const datetime = new Date(latest.createdAt || Date.now());
            els.lastUpdated.textContent = `${datetime.toLocaleDateString()} ${datetime.toLocaleTimeString()}`;
        } else {
            els.lastUpdated.textContent = '-';
        }
    }

    function renderFlowChart(steps) {
        els.flowChart.innerHTML = '';
        if (!steps.length) {
            els.flowEmpty.classList.remove('hidden');
            return;
        }
        els.flowEmpty.classList.add('hidden');

        steps.forEach(step => {
            const stepButton = document.createElement('button');
            stepButton.type = 'button';
            stepButton.className = [
                'flow-step',
                `status-${step.status || 'idle'}`,
                state.selectedStepId === step.id ? 'active' : ''
            ].join(' ').trim();

            stepButton.innerHTML = `
                <div class="step-header">
                    <div class="step-title">${escapeHtml(step.label)}</div>
                    <div class="step-count">${step.count}건</div>
                </div>
                <div class="step-description">${escapeHtml(step.description || '')}</div>
                <div class="step-footer">
                    <span class="status-indicator"></span>
                    <span>${step.status === 'idle' ? '대기' :
                        step.status === 'success' ? '정상' :
                        step.status === 'warn' ? '경고' : '오류'}</span>
                </div>
            `;

            stepButton.addEventListener('click', () => {
                state.selectedStepId = step.id;
                renderFlowChart(steps);
                renderFlowDetails(step);
            });

            els.flowChart.appendChild(stepButton);
        });
    }

    function renderDetailDiagram(step) {
        if (!els.detailDiagram) return;
        if (!step || !step.logs.length) {
            els.detailDiagram.classList.add('hidden');
            return;
        }

        const typeOrder = ['info', 'message', 'warn', 'error'];
        const totals = { info: 0, message: 0, warn: 0, error: 0 };
        step.logs.forEach(log => {
            const key = typeOrder.includes(log.type) ? log.type : 'message';
            totals[key] += 1;
        });
        const totalCount = step.logs.length;
        if (els.detailDiagramTotal) {
            els.detailDiagramTotal.textContent = `총 ${totalCount}건`;
        }

        const items = els.detailDiagram.querySelectorAll('.detail-diagram-item');
        items.forEach(item => {
            const type = item.dataset.type;
            const count = totals[type] || 0;
            const percentage = totalCount ? Math.round((count / totalCount) * 100) : 0;

            const bar = item.querySelector('[data-role="bar"]');
            const countEl = item.querySelector('[data-role="count"]');
            const percentageEl = item.querySelector('[data-role="percentage"]');

            if (bar) {
                const width = totalCount ? Math.max(percentage, count > 0 ? 6 : 0) : 0;
                bar.style.width = `${width}%`;
            }
            if (countEl) countEl.textContent = `${count}건`;
            if (percentageEl) percentageEl.textContent = totalCount ? `${percentage}%` : '0%';
        });

        els.detailDiagram.classList.remove('hidden');
    }

    function renderFlowDetails(step) {
        if (!step || !step.logs.length) {
            els.flowDetailsTitle.textContent = step ? `${step.label} - 상세 로그` : '상세 로그';
            els.flowDetailsCount.textContent = '';
            els.flowDetailsList.innerHTML = '';
            els.emptyMessage.classList.remove('hidden');
            if (els.detailDiagram) {
                els.detailDiagram.classList.add('hidden');
            }
            return;
        }

        els.flowDetailsTitle.textContent = `${step.label} - 상세 로그`;
        els.flowDetailsCount.textContent = `${step.logs.length}건`;
        els.emptyMessage.classList.add('hidden');
        renderDetailDiagram(step);

        const itemsHtml = step.logs.map(log => `
            <li class="flow-log-item type-${log.type}">
                <div class="log-meta">
                    <span>${escapeHtml(log.timestamp)}</span>
                    <span>${log.type.toUpperCase()}</span>
                </div>
                <div class="log-message">${escapeHtml(log.message)}</div>
            </li>
        `).join('');

        els.flowDetailsList.innerHTML = itemsHtml;
    }

    function pickDefaultStep(steps) {
        if (state.selectedStepId) {
            const existing = steps.find(step => step.id === state.selectedStepId);
            if (existing) return existing;
        }
        const priorityOrder = ['error', 'warn', 'success'];
        for (const status of priorityOrder) {
            const match = steps.find(step => step.status === status && step.logs.length);
            if (match) {
                state.selectedStepId = match.id;
                return match;
            }
        }
        const firstWithLogs = steps.find(step => step.logs.length);
        if (firstWithLogs) {
            state.selectedStepId = firstWithLogs.id;
            return firstWithLogs;
        }
        state.selectedStepId = null;
        return null;
    }

    function refreshView() {
        state.logs = loadLogsFromStorage();
        state.steps = buildFlowState(state.logs);
        updateSummary(state.logs);
        renderFlowChart(state.steps);
        const defaultStep = pickDefaultStep(state.steps);
        renderFlowDetails(defaultStep);
    }

    window.addEventListener('storage', (event) => {
        if (event.key === LOG_STORAGE_KEY) {
            refreshView();
        }
    });

    refreshView();
})();

