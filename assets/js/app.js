document.addEventListener('DOMContentLoaded', () => {
    console.info('[N/B Novel AI] 초기화 중...');

    const $mainContent = document.getElementById('mainContent');
    const $newNovelBtn = document.getElementById('newNovelBtn');
    const $listSearch = document.getElementById('listSearch');
    const $novelList = document.getElementById('novelList');
    const $chatModel = document.getElementById('chatModel');
    const $chatInput = document.getElementById('chatInput');
    const $chatSendBtn = document.getElementById('chatSendBtn');
    const $chatClearBtn = document.getElementById('chatClearBtn');

    // 모델 옵션 로컬 스토리지 저장/불러오기
    const STORAGE_KEY_MODEL = 'novel_ai_selected_model';
    const STORAGE_KEY_CONVERSATIONS = 'novel_ai_conversations';
    
    // 저장된 모델 불러오기
    if ($chatModel) {
        const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
        if (savedModel) {
            $chatModel.value = savedModel;
        }
        
        // 모델 변경 시 저장
        $chatModel.addEventListener('change', () => {
            addLog('info', `[모델 변경] ${$chatModel.value}`);
            localStorage.setItem(STORAGE_KEY_MODEL, $chatModel.value);
            addLog('info', `[모델 저장] 로컬 스토리지에 저장: ${$chatModel.value}`);
        });
    }

    // 대화 목록 관리
    let conversations = [];
    let currentConversationId = null;
    
    // 서버 소설 목록 관리
    let serverNovels = [];
    let expandedNovels = new Set(); // 펼쳐진 소설 ID 목록
    let expandedChapters = new Map(); // 펼쳐진 챕터 목록 (소설 ID → 챕터 번호 Set)

    // 저장된 대화 목록 불러오기
    function loadConversations() {
        addLog('info', '[대화 목록] 로드 시작');
        try {
            const saved = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
            if (saved) {
                conversations = JSON.parse(saved);
                addLog('info', `[대화 목록] 로드 완료: ${conversations.length}개 대화`);
            } else {
                addLog('info', '[대화 목록] 저장된 대화 없음');
                conversations = [];
            }
        } catch (e) {
            addLog('error', `[대화 목록] 로드 오류: ${e.message || e}`);
            console.error('대화 목록 불러오기 오류:', e);
            conversations = [];
        }
        renderConversationList();
    }

    // BIT 값으로 소설 목록 조회 (속성 목록에서 자동 구성)
    async function loadServerNovels() {
        try {
            addLog('info', '[BIT 기반 소설 목록] 로드 시작');
            
            // 속성 목록 조회
            const url = getServerUrl('/api/attributes/all');
            const response = await fetch(url);
            
            if (!response.ok) {
                addLog('error', `[BIT 기반 소설 목록] HTTP 오류: ${response.status}`);
                return;
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                addLog('warn', '[BIT 기반 소설 목록] 속성 데이터 없음');
                serverNovels = [];
                return;
            }
            
            // 속성 텍스트에서 소설 구조 추출 (형식: "소설 제목 → 챕터 1: 제1장 → 속성")
            const novelMap = new Map(); // novelTitle -> { title, chapters: Map }
            
            for (const attr of data.attributes) {
                const attrText = (attr.text || '').trim();
                if (!attrText || !attrText.includes(' → ')) continue;
                
                const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                if (parts.length < 2) continue;
                
                const novelTitle = parts[0];
                const chapterPart = parts[1]; // "챕터 1: 제1장" 또는 "챕터 1"
                
                // 소설이 없으면 생성
                if (!novelMap.has(novelTitle)) {
                    novelMap.set(novelTitle, {
                        id: novelTitle,
                        title: novelTitle,
                        chapters: new Map(),
                        bitMax: attr.bitMax,
                        bitMin: attr.bitMin
                    });
                }
                
                const novel = novelMap.get(novelTitle);
                
                // 챕터 정보 파싱
                const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                if (chapterMatch) {
                    const chapterNum = chapterMatch[1];
                    const chapterTitle = chapterMatch[2] || `제${chapterNum}장`;
                    const chapterKey = `챕터 ${chapterNum}`;
                    
                    if (!novel.chapters.has(chapterKey)) {
                        novel.chapters.set(chapterKey, {
                            number: chapterNum,
                            title: chapterTitle,
                            scenes: []
                        });
                    }
                }
            }
            
            // Map을 배열로 변환
            serverNovels = Array.from(novelMap.values()).map(novel => ({
                id: novel.id,
                title: novel.title,
                chapters: Array.from(novel.chapters.values()),
                bitMax: novel.bitMax,
                bitMin: novel.bitMin
            }));
            
            addLog('info', `[BIT 기반 소설 목록] 로드 완료: ${serverNovels.length}개 소설 (속성 기반 자동 구성)`);
            renderNovelTree();
        } catch (error) {
            addLog('error', `[BIT 기반 소설 목록] 로드 오류: ${error.message}`);
            serverNovels = [];
        }
    }
    
    // HTML 이스케이프 함수
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 트리형 소설 목록 렌더링
    async function renderNovelTree() {
        if (!$novelList) return;
        
        // 기존 내용은 유지하고, 트리 구조를 추가하거나 별도 섹션으로 표시
        // 현재는 대화 목록과 병행 표시
    }
    
    // 대화 목록 렌더링 (기존 기능 유지 + 트리 구조 추가)
    async function renderConversationList() {
        if (!$novelList) return;
        
        addLog('info', `[대화 목록] 렌더링 시작: ${conversations.length}개`);
        
        // 트리 구조 컨테이너
        const treeContainer = document.createElement('div');
        treeContainer.className = 'novel-tree-container';
        treeContainer.innerHTML = '<div class="tree-header">📚 소설 목록</div>';
        
        // 서버 소설 목록 로드 및 트리 렌더링
        await loadServerNovels();
        
        // 서버 소설 트리 렌더링
        if (serverNovels.length > 0) {
            const treeList = document.createElement('div');
            treeList.className = 'novel-tree-list';
            
            for (const novel of serverNovels) {
                const novelItem = await createNovelTreeItem(novel);
                treeList.appendChild(novelItem);
            }
            
            treeContainer.appendChild(treeList);
        }
        
        // 대화 목록 섹션
        const convContainer = document.createElement('div');
        convContainer.className = 'conversation-list-container';
        convContainer.innerHTML = '<div class="tree-header">💬 대화 목록</div>';
        
        if (conversations.length === 0) {
            addLog('info', '[대화 목록] 기본 항목 표시');
            const defaultItem = document.createElement('div');
            defaultItem.className = 'conv-item active';
            defaultItem.innerHTML = `
                <div class="conv-item-content">
                    <div class="conv-title">새 소설</div>
                    <div class="conv-preview">소설 작성을 시작하세요</div>
                </div>
            `;
            convContainer.appendChild(defaultItem);
            currentConversationId = null;
        } else {
            for (const conv of conversations) {
                addLog('info', `[대화 목록] 항목 렌더링: ${conv.id} - ${conv.title || '제목 없음'}`);
                
                const item = document.createElement('div');
                item.className = `conv-item ${conv.id === currentConversationId ? 'active' : ''}`;
                item.dataset.convId = conv.id;
                
                const preview = conv.messages.length > 0 
                    ? (conv.messages[conv.messages.length - 1].text || '').substring(0, 50)
                    : '메시지 없음';
                
                // BIT 값 계산 및 데이터 개수 조회
                let bitInfo = '';
                let dataCount = conv.messages.length;
                
                if (conv.title && typeof wordNbUnicodeFormat !== 'undefined') {
                    addLog('info', `[BIT 계산] 시작: "${conv.title}"`);
                    const titleBits = calculateBitValues(conv.title);
                    if (titleBits.max && titleBits.min) {
                        addLog('info', `[BIT 계산] 완료: MAX=${titleBits.max.toFixed(15)}, MIN=${titleBits.min.toFixed(15)}`);
                        
                        // 데이터 개수 조회 (서버에서)
                        try {
                            addLog('info', `[데이터 개수] 조회 시작: bitMax=${titleBits.max}, bitMin=${titleBits.min}`);
                            const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${titleBits.max}&bitMin=${titleBits.min}&limit=1`);
                            const dataRes = await fetch(dataUrl);
                            if (dataRes.ok) {
                                const dataData = await dataRes.json();
                                if (dataData.ok && dataData.items) {
                                    dataCount = dataData.count || dataData.items.length || conv.messages.length;
                                    addLog('info', `[데이터 개수] 조회 완료: ${dataCount}개`);
                                } else {
                                    addLog('warn', `[데이터 개수] 조회 실패: 응답 데이터 없음`);
                                }
                            } else {
                                addLog('error', `[데이터 개수] 조회 실패: HTTP ${dataRes.status}`);
                            }
                        } catch (e) {
                            addLog('error', `[데이터 개수] 조회 오류: ${e.message || e}`);
                            dataCount = conv.messages.length;
                        }
                        
                        bitInfo = `<div class="conv-bit-info">BIT: ${titleBits.max.toFixed(15)}, ${titleBits.min.toFixed(15)} | 데이터 ${dataCount}개</div>`;
                    }
                }
                
                item.innerHTML = `
                    <div class="conv-item-content">
                        <div class="conv-title">${conv.title || '제목 없음'}</div>
                        <div class="conv-preview">${preview}${preview.length >= 50 ? '...' : ''}</div>
                        ${bitInfo}
                    </div>
                    <div class="conv-actions">
                        <button class="conv-action-btn" title="삭제">×</button>
                    </div>
                `;
                
                convContainer.appendChild(item);
            }
        }
        
        // 전체 목록 구성
        $novelList.innerHTML = '';
        $novelList.appendChild(treeContainer);
        $novelList.appendChild(convContainer);
        
        addLog('info', `[대화 목록] 렌더링 완료: 서버 소설 ${serverNovels.length}개, 대화 ${conversations.length}개`);
    }
    
    // 소설 트리 항목 생성 (소설 → 챕터 → 장면)
    async function createNovelTreeItem(novel) {
        const novelDiv = document.createElement('div');
        novelDiv.className = 'tree-novel-item';
        novelDiv.dataset.novelId = novel.id;
        
        const novelHeader = document.createElement('div');
        novelHeader.className = 'tree-novel-header';
        novelHeader.innerHTML = `
            <span class="tree-toggle">${expandedNovels.has(novel.id) ? '▼' : '▶'}</span>
            <span class="tree-icon">📖</span>
            <span class="tree-title">${novel.title || '제목 없음'}</span>
            <span class="tree-meta">(${novel.chapters || 0}챕터)</span>
        `;
        
        const novelContent = document.createElement('div');
        novelContent.className = 'tree-novel-content';
        novelContent.style.display = expandedNovels.has(novel.id) ? 'block' : 'none';
        
        // 토글 이벤트
        novelHeader.addEventListener('click', async (e) => {
            e.stopPropagation();
            const isExpanded = expandedNovels.has(novel.id);
            
            if (isExpanded) {
                expandedNovels.delete(novel.id);
                novelContent.style.display = 'none';
                novelHeader.querySelector('.tree-toggle').textContent = '▶';
            } else {
                expandedNovels.add(novel.id);
                novelContent.style.display = 'block';
                novelHeader.querySelector('.tree-toggle').textContent = '▼';
                
                // 챕터 로드 (아직 로드되지 않은 경우)
                if (novelContent.children.length === 0) {
                    await loadNovelChapters(novel.id, novelContent);
                }
            }
        });
        
        // 소설 클릭 시 데이터 로드
        novelHeader.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            await loadNovelData(novel.id);
        });
        
        novelDiv.appendChild(novelHeader);
        novelDiv.appendChild(novelContent);
        
        return novelDiv;
    }
    
    // 소설 챕터 로드
    async function loadNovelChapters(novelId, container) {
        try {
            addLog('info', `[챕터 로드] 시작: ${novelId}`);
            const url = getServerUrl(`/api/novels/${encodeURIComponent(novelId)}/chapters`);
            const response = await fetch(url);
            
            if (!response.ok) {
                addLog('error', `[챕터 로드] HTTP 오류: ${response.status}`);
                container.innerHTML = '<div class="tree-error">챕터를 불러올 수 없습니다</div>';
                return;
            }
            
            const data = await response.json();
            if (data.ok && data.chapters) {
                const chapters = data.chapters || [];
                
                for (const chapter of chapters) {
                    const chapterDiv = document.createElement('div');
                    chapterDiv.className = 'tree-chapter-item';
                    chapterDiv.dataset.chapterNum = chapter.num;
                    
                    const chapterHeader = document.createElement('div');
                    chapterHeader.className = 'tree-chapter-header';
                    chapterHeader.innerHTML = `
                        <span class="tree-toggle">▶</span>
                        <span class="tree-icon">📄</span>
                        <span class="tree-title">챕터 ${chapter.num}</span>
                        <span class="tree-preview">${(chapter.text || '').substring(0, 30)}...</span>
                    `;
                    
                    const chapterContent = document.createElement('div');
                    chapterContent.className = 'tree-chapter-content';
                    chapterContent.style.display = 'none';
                    
                    // 챕터 토글
                    chapterHeader.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const isExpanded = expandedChapters.get(novelId)?.has(chapter.num) || false;
                        const chapterSet = expandedChapters.get(novelId) || new Set();
                        
                        if (isExpanded) {
                            chapterSet.delete(chapter.num);
                            chapterContent.style.display = 'none';
                            chapterHeader.querySelector('.tree-toggle').textContent = '▶';
                        } else {
                            chapterSet.add(chapter.num);
                            expandedChapters.set(novelId, chapterSet);
                            chapterContent.style.display = 'block';
                            chapterHeader.querySelector('.tree-toggle').textContent = '▼';
                            
                            // 장면 로드 (필요시)
                            if (chapterContent.children.length === 0) {
                                await loadChapterScenes(novelId, chapter.num, chapterContent, chapter.text);
                            }
                        }
                    });
                    
                    // 챕터 더블클릭 시 데이터 로드
                    chapterHeader.addEventListener('dblclick', async (e) => {
                        e.stopPropagation();
                        await loadChapterData(novelId, chapter.num);
                    });
                    
                    chapterDiv.appendChild(chapterHeader);
                    chapterDiv.appendChild(chapterContent);
                    container.appendChild(chapterDiv);
                }
                
                addLog('info', `[챕터 로드] 완료: ${chapters.length}개 챕터`);
            } else {
                container.innerHTML = '<div class="tree-empty">챕터가 없습니다</div>';
            }
        } catch (error) {
            addLog('error', `[챕터 로드] 오류: ${error.message}`);
            container.innerHTML = '<div class="tree-error">챕터를 불러오는 중 오류 발생</div>';
        }
    }
    
    // 챕터 장면 로드 (텍스트를 장면으로 분할하거나, 서버에서 장면 정보를 가져옴)
    async function loadChapterScenes(novelId, chapterNum, container, chapterText) {
        // 장면은 텍스트를 분석하거나 서버에서 제공하는 경우 사용
        // 현재는 텍스트를 기반으로 간단한 장면 분할
        if (chapterText) {
            const scenes = chapterText.split(/\n\n+/).filter(s => s.trim().length > 0);
            
            scenes.forEach((sceneText, idx) => {
                const sceneDiv = document.createElement('div');
                sceneDiv.className = 'tree-scene-item';
                sceneDiv.dataset.sceneIdx = idx;
                
                const sceneHeader = document.createElement('div');
                sceneHeader.className = 'tree-scene-header';
                sceneHeader.innerHTML = `
                    <span class="tree-icon">🎬</span>
                    <span class="tree-title">장면 ${idx + 1}</span>
                    <span class="tree-preview">${sceneText.substring(0, 40)}...</span>
                `;
                
                // 장면 클릭 시 데이터 로드
                sceneHeader.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadSceneData(novelId, chapterNum, idx, sceneText);
                });
                
                sceneDiv.appendChild(sceneHeader);
                container.appendChild(sceneDiv);
            });
        }
    }
    
    // 소설 데이터 로드 (mainContent에 표시)
    async function loadNovelData(novelId) {
        try {
            addLog('info', `[소설 데이터 로드] 시작: ${novelId}`);
            const novel = serverNovels.find(n => n.id === novelId);
            if (!novel) return;
            
            // 소설 정보 표시
            if ($mainContent) {
                $mainContent.innerHTML = `
                    <div class="novel-view">
                        <div class="novel-header">
                            <h2>${novel.title || '제목 없음'}</h2>
                            <div class="novel-meta">장르: ${novel.genre || '미정'} | 챕터: ${novel.chapters || 0}개</div>
                        </div>
                        <div class="novel-content">
                            <p>소설을 선택하려면 챕터를 클릭하세요.</p>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            addLog('error', `[소설 데이터 로드] 오류: ${error.message}`);
        }
    }
    
    // 챕터 데이터 로드
    async function loadChapterData(novelId, chapterNum) {
        try {
            addLog('info', `[챕터 데이터 로드] 시작: ${novelId} - 챕터 ${chapterNum}`);
            const url = getServerUrl(`/api/novels/${encodeURIComponent(novelId)}/chapters/${chapterNum}`);
            const response = await fetch(url);
            
            if (!response.ok) {
                addLog('error', `[챕터 데이터 로드] HTTP 오류: ${response.status}`);
                return;
            }
            
            const data = await response.json();
            if (data.ok && data.text) {
                if ($mainContent) {
                    const novel = serverNovels.find(n => n.id === novelId);
                    $mainContent.innerHTML = `
                        <div class="novel-view">
                            <div class="novel-header">
                                <h2>${novel?.title || '제목 없음'}</h2>
                                <h3>챕터 ${chapterNum}</h3>
                            </div>
                            <div class="novel-content">
                                <pre class="novel-text">${data.text}</pre>
                            </div>
                        </div>
                    `;
                }
                addLog('info', `[챕터 데이터 로드] 완료: ${data.text.length}자`);
            }
        } catch (error) {
            addLog('error', `[챕터 데이터 로드] 오류: ${error.message}`);
        }
    }
    
    // 장면 데이터 로드
    function loadSceneData(novelId, chapterNum, sceneIdx, sceneText) {
        addLog('info', `[장면 데이터 로드] 시작: ${novelId} - 챕터 ${chapterNum} - 장면 ${sceneIdx}`);
        
        if ($mainContent) {
            const novel = serverNovels.find(n => n.id === novelId);
            $mainContent.innerHTML = `
                <div class="novel-view">
                    <div class="novel-header">
                        <h2>${novel?.title || '제목 없음'}</h2>
                        <h3>챕터 ${chapterNum} - 장면 ${sceneIdx + 1}</h3>
                    </div>
                    <div class="novel-content">
                        <pre class="novel-text">${sceneText}</pre>
                    </div>
                </div>
            `;
        }
    }

    // 대화 저장
    function saveConversation(conversationId, title, messages) {
        addLog('info', `[대화 저장] 시작: ${conversationId || '새 대화'} - "${title || '제목 없음'}"`);
        
        if (!conversationId) {
            conversationId = 'conv_' + Date.now();
            addLog('info', `[대화 저장] 새 ID 생성: ${conversationId}`);
        }

        const existingIndex = conversations.findIndex(c => c.id === conversationId);
        const conversationData = {
            id: conversationId,
            title: title || '제목 없음',
            messages: messages || [],
            chapters: conversations[existingIndex]?.chapters || [],
            updatedAt: new Date().toISOString(),
            createdAt: existingIndex >= 0 ? conversations[existingIndex].createdAt : new Date().toISOString()
        };

        if (existingIndex >= 0) {
            addLog('info', `[대화 저장] 기존 대화 업데이트: 인덱스 ${existingIndex}`);
            conversations[existingIndex] = conversationData;
        } else {
            addLog('info', `[대화 저장] 새 대화 추가: ${conversationData.title}`);
            conversations.unshift(conversationData);
        }

        // 최대 100개까지만 저장
        if (conversations.length > 100) {
            addLog('warn', `[대화 저장] 최대 개수 초과: ${conversations.length}개 → 100개로 제한`);
            conversations = conversations.slice(0, 100);
        }

        try {
            localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations));
            addLog('info', `[대화 저장] 로컬 스토리지 저장 완료: ${conversations.length}개`);
        } catch (e) {
            addLog('error', `[대화 저장] 로컬 스토리지 저장 실패: ${e.message || e}`);
        }
        
        renderConversationList();
        
        // N/B DATA 방식으로 서버에 저장 (비동기로 실행)
        addLog('info', `[대화 저장] N/B DATA 저장 시작: ${conversationData.title}`);
        saveToNBData(conversationData).catch(err => {
            addLog('error', `[N/B DATA] 저장 실패: ${err.message}`);
        });
    }

    // N/B DATA 방식으로 저장 (중복 저장 방지)
    const savedMessages = new Set(); // 저장된 메시지 추적
    
    async function saveToNBData(conversationData) {
        try {
            addLog('info', `[N/B DATA] 저장 시작: ${conversationData.title || '제목 없음'}`);
            
            // BIT 계산 함수가 로드되었는지 확인 (최대 5초 대기)
            let waitCount = 0;
            while ((typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') && waitCount < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }

            if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
                addLog('error', '[N/B DATA] BIT 계산 함수가 로드되지 않았습니다. bitCalculation.js를 확인해주세요.');
                return;
            }

            // 대화 제목의 BIT 값 계산
            const titleBits = calculateBitValues(conversationData.title || '대화');
            
            if (!titleBits.max || !titleBits.min) {
                addLog('warn', `[N/B DATA] 제목 BIT 계산 실패: ${conversationData.title}`);
            }
            
            let savedCount = 0;
            let skippedCount = 0;
            let duplicateCount = 0;
            
            // 각 메시지 저장
            for (const msg of conversationData.messages) {
                if (!msg || !msg.text || !msg.role) {
                    skippedCount++;
                    continue;
                }

                // 중복 체크: 메시지 텍스트 + 역할로 고유 키 생성
                const messageKey = `${msg.role}:${msg.text}`;
                if (savedMessages.has(messageKey)) {
                    duplicateCount++;
                    continue; // 이미 저장된 메시지는 건너뛰기
                }

                const messageBits = calculateBitValues(msg.text);
                
                if (!messageBits.max || !messageBits.min) {
                    addLog('warn', `[N/B DATA] 메시지 BIT 계산 실패: ${msg.text.substring(0, 20)}...`);
                    skippedCount++;
                    continue;
                }

                // 서버에 저장 (/api/attributes/data 엔드포인트 사용)
                try {
                    const url = getServerUrl('/api/attributes/data');
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            attributeText: conversationData.title || '대화',
                            attributeBitMax: titleBits.max || messageBits.max,
                            attributeBitMin: titleBits.min || messageBits.min,
                            text: msg.text,
                            dataBitMax: messageBits.max,
                            dataBitMin: messageBits.min,
                            conversation: {
                                id: conversationData.id,
                                title: conversationData.title,
                                role: msg.role,
                                timestamp: msg.timestamp
                            }
                        }),
                    });

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Unknown error');
                        addLog('error', `[N/B DATA] 저장 실패 (${response.status}): ${errorText.substring(0, 100)}`);
                    } else {
                        const result = await response.json().catch(() => ({}));
                        if (result.ok) {
                            savedCount++;
                            savedMessages.add(messageKey); // 저장된 메시지로 표시
                            addLog('info', `[N/B DATA] 저장 완료: ${msg.role} - ${msg.text.substring(0, 30)}...`);
                        } else {
                            addLog('error', `[N/B DATA] 저장 실패: ${result.error || 'Unknown error'}`);
                        }
                    }
                } catch (fetchError) {
                    addLog('error', `[N/B DATA] 저장 요청 오류: ${fetchError.message}`);
                }
            }

            addLog('info', `[N/B DATA] 저장 완료: ${savedCount}개 저장, ${skippedCount}개 건너뜀, ${duplicateCount}개 중복`);
        } catch (error) {
            addLog('error', `[N/B DATA] 저장 오류: ${error.message || error}`);
            console.error('N/B DATA 저장 오류:', error);
        }
    }

    // 소설 제목 추출 함수
    // GPT 응답에서 속성과 데이터 추출
    function extractAttributesFromResponse(responseText) {
        if (!responseText) return { attributes: [], data: null };
        
        const attributes = [];
        let data = null;
        
        // 줄바꿈으로 분리 (null 안전 처리)
        const lines = (responseText || '').split('\n').map(line => (line || '').trim()).filter(line => line && line.length > 0);
        
        // 속성과 데이터 찾기
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || typeof line !== 'string') continue;
            
            // 속성 패턴: "→"를 포함하는 줄
            if (line.includes('→') && !line.includes('**추출된 속성:**')) {
                // "속성:", "데이터:", "소설 제목:" 같은 접두사 제거
                let cleanLine = (line.replace(/^(속성|데이터|소설\s*제목)[:：]\s*/i, '') || '').trim();
                if (cleanLine && cleanLine.includes('→')) {
                    // 소설 제목 부분 제거 (첫 번째 "→" 앞의 부분이 소설 제목일 수 있음)
                    // "소설 제목 → 챕터..." 형식에서 "챕터..."만 추출
                    const parts = cleanLine.split('→').map(p => (p || '').trim()).filter(p => p && p.length > 0);
                    if (parts.length > 1) {
                        // 첫 번째 부분이 소설 제목일 가능성이 높으므로 제거
                        // "챕터" 또는 "제"로 시작하는 부분부터 사용
                        const chapterIndex = parts.findIndex(p => p && /^(챕터|제\s*\d+)/i.test(p));
                        if (chapterIndex > 0) {
                            cleanLine = parts.slice(chapterIndex).join(' → ');
                        } else if (parts.length >= 2) {
                            // 첫 번째 부분 제거 (소설 제목으로 간주)
                            cleanLine = parts.slice(1).join(' → ');
                        }
                    }
                    if (cleanLine && cleanLine.includes('→')) {
                        attributes.push(cleanLine);
                        
                        // 다음 몇 줄 중에서 데이터 찾기 (최대 3줄까지 확인)
                        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                            const nextLine = lines[j];
                            if (!nextLine || typeof nextLine !== 'string') continue;
                            
                            // "---" 구분선이나 빈 줄은 건너뛰기
                            if (nextLine === '---' || nextLine.startsWith('---')) break;
                            
                            // "속성:" 또는 "데이터:" 접두사 제거
                            const cleanNextLine = (nextLine.replace(/^(속성|데이터|소설\s*제목)[:：]\s*/i, '') || '').trim();
                            
                            // 속성 패턴이 아니고 비어있지 않으면 데이터로 간주
                            if (cleanNextLine && !cleanNextLine.includes('→') && cleanNextLine.length > 10) {
                                // 최소 10자 이상인 텍스트만 데이터로 간주 (너무 짧으면 건너뛰기)
                                data = cleanNextLine;
                                i = j; // 다음 줄부터 다시 시작
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // 패턴 1: "소설 제목 → 챕터 N: 제목" 형식 (기존 패턴 유지)
        const pattern1 = /([^\n→]+(?:\s*→\s*[^\n→]+)+)/g;
        let match;
        while ((match = pattern1.exec(responseText || '')) !== null) {
            if (!match[1]) continue;
            let attrText = (match[1] || '').trim().replace(/^(속성|데이터|소설\s*제목)[:：]\s*/i, '');
            if (attrText && attrText.includes('→') && !attrText.includes('**추출된 속성:**')) {
                // 소설 제목 부분 제거
                const parts = attrText.split('→').map(p => (p || '').trim()).filter(p => p && p.length > 0);
                if (parts.length > 1) {
                    const chapterIndex = parts.findIndex(p => p && /^(챕터|제\s*\d+)/i.test(p));
                    if (chapterIndex > 0) {
                        attrText = parts.slice(chapterIndex).join(' → ');
                    } else if (parts.length >= 2) {
                        attrText = parts.slice(1).join(' → ');
                    }
                }
                if (attrText && attrText.includes('→') && !attributes.includes(attrText)) {
                    attributes.push(attrText);
                }
            }
        }
        
        // 중복 제거 및 정렬 (null 안전 처리)
        const uniqueAttributes = [...new Set(attributes)].filter(attr => attr && typeof attr === 'string' && attr.length > 0);
        
        return {
            attributes: uniqueAttributes.slice(0, 10), // 최대 10개만 반환
            data: data
        };
    }
    
    function extractNovelTitle(messages) {
        if (!messages || messages.length === 0) return null;
        
        // 사용자 메시지와 GPT 응답에서 소설 제목 추출
        const allText = messages.map(m => m.text || '').join('\n');
        
        // 패턴: "소설 제목:", "제목:", "title:" 등
        const patterns = [
            /소설\s*제목\s*[:：]\s*(.+?)(?:\n|$|,|챕터)/i,
            /제목\s*[:：]\s*(.+?)(?:\n|$|,|챕터)/i,
            /title\s*[:：]\s*(.+?)(?:\n|$|,|chapter)/i,
            /^(.+?)\s*→/m, // "제목 → 챕터" 형식
        ];
        
        for (const pattern of patterns) {
            const match = allText.match(pattern);
            if (match && match[1]) {
                const title = match[1].trim();
                if (title.length > 0 && title.length < 100) {
                    addLog('info', `[소설 제목 추출] 발견: "${title}"`);
                    return title;
                }
            }
        }
        
        return null;
    }

    // GPT 응답에서 소설 구성 파싱 및 속성/데이터로 저장
    async function parseNovelInfoFromResponse(responseText, messages) {
        if (!responseText || !messages) return;
        
        addLog('info', '[GPT 파싱] 소설 구성 정보 파싱 시작');
        
        // 소설 제목 추출
        const novelTitle = extractNovelTitle(messages);
        if (!novelTitle) {
            addLog('warn', '[GPT 파싱] 소설 제목을 찾을 수 없음');
            return;
        }
        
        // JSON 형식 파싱 시도
        let novelStructure = null;
        try {
            // JSON 블록 추출
            const jsonMatch = responseText.match(/\{[\s\S]*"title"[\s\S]*\}/);
            if (jsonMatch) {
                novelStructure = JSON.parse(jsonMatch[0]);
                addLog('info', '[GPT 파싱] JSON 형식 발견');
            }
        } catch (e) {
            addLog('warn', '[GPT 파싱] JSON 파싱 실패, 텍스트 형식으로 파싱 시도');
        }
        
        // 텍스트 형식 파싱 (JSON이 없는 경우)
        if (!novelStructure) {
            novelStructure = parseTextStructure(responseText, novelTitle);
        }
        
        // 소설 구조를 속성과 데이터로 분리하여 저장 (저장하지 않음, 우측 패널에서만 저장)
        // 주석 처리: 저장은 우측 패널에서만 수행
        if (novelStructure && novelStructure.title && novelStructure.chapters && novelStructure.chapters.length > 0) {
            // await saveNovelStructureAsAttributes(novelStructure, responseText);
            
            // 대화 정보만 업데이트 (저장은 하지 않음)
            if (currentConversationId) {
                const conversation = conversations.find(c => c.id === currentConversationId);
                if (conversation) {
                    conversation.title = novelStructure.title;
                    conversation.chapters = novelStructure.chapters.map(ch => ({
                        number: `챕터 ${ch.number}`,
                        title: ch.title,
                        description: ch.scenes?.map(s => s.title).join(', ') || ''
                    }));
                    saveConversation(currentConversationId, novelStructure.title, messages);
                }
            }
            
            // 트리 목록 갱신 (저장하지 않으므로 주석 처리)
            // await refreshNovelTree();
        } else {
            addLog('warn', '[GPT 파싱] 소설 구조를 찾을 수 없음');
        }
    }
    
    // 소설 구조를 속성과 데이터로 분리하여 저장 (BIT 값 사용)
    async function saveNovelStructureAsAttributes(novelStructure, responseText) {
        try {
            addLog('info', `[속성/데이터 저장] 시작: "${novelStructure.title}"`);
            
            // BIT 계산 함수 확인
            if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
                addLog('error', '[속성/데이터 저장] BIT 계산 함수가 로드되지 않았습니다.');
                return;
            }
            
            const novelTitle = novelStructure.title;
            const novelTitleBits = calculateBitValues(novelTitle);
            
            if (!novelTitleBits.max || !novelTitleBits.min) {
                addLog('error', `[속성/데이터 저장] 소설 제목 BIT 계산 실패: ${novelTitle}`);
                return;
            }
            
            let savedCount = 0;
            
            // 각 챕터와 장면을 속성과 데이터로 저장
            for (const chapter of novelStructure.chapters || []) {
                const chapterNum = chapter.number || '';
                const chapterTitle = chapter.title || '';
                const chapterText = `챕터 ${chapterNum}${chapterTitle ? `: ${chapterTitle}` : ''}`;
                const chapterBits = calculateBitValues(chapterText);
                
                // 속성: "소설 제목 → 챕터 N: 제목"
                const attributeText = `${novelTitle} → ${chapterText}`;
                const attributeBits = calculateBitValues(attributeText);
                
                // 데이터: 챕터 설명 또는 장면 목록
                let dataText = chapter.description || '';
                if (chapter.scenes && chapter.scenes.length > 0) {
                    const scenesText = chapter.scenes.map(s => 
                        `장면 ${s.number || ''}: ${s.title || ''}${s.description ? ` - ${s.description}` : ''}`
                    ).join('\n');
                    dataText = dataText ? `${dataText}\n\n${scenesText}` : scenesText;
                }
                
                if (!dataText) {
                    dataText = chapterTitle || chapterText;
                }
                
                const dataBits = calculateBitValues(dataText);
                
                // 속성과 데이터로 저장
                try {
                    const url = getServerUrl('/api/attributes/data');
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            attributeText: attributeText,
                            attributeBitMax: attributeBits.max,
                            attributeBitMin: attributeBits.min,
                            text: dataText,
                            dataBitMax: dataBits.max,
                            dataBitMin: dataBits.min,
                            novelTitle: novelTitle,
                            chapter: {
                                number: chapterNum,
                                title: chapterTitle
                            },
                            chapterBitMax: chapterBits.max,
                            chapterBitMin: chapterBits.min
                        }),
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Unknown error');
                        addLog('error', `[속성/데이터 저장] 저장 실패 (${response.status}): ${errorText.substring(0, 100)}`);
                    } else {
                        const result = await response.json().catch(() => ({}));
                        if (result.ok) {
                            savedCount++;
                            addLog('info', `[속성/데이터 저장] 저장 완료: ${attributeText}`);
                        } else {
                            addLog('error', `[속성/데이터 저장] 저장 실패: ${result.error || 'Unknown error'}`);
                        }
                    }
                } catch (fetchError) {
                    addLog('error', `[속성/데이터 저장] 저장 요청 오류: ${fetchError.message}`);
                }
                
                // 각 장면도 개별적으로 저장
                if (chapter.scenes && chapter.scenes.length > 0) {
                    for (const scene of chapter.scenes) {
                        const sceneText = `장면 ${scene.number || ''}`;
                        const sceneAttributeText = `${novelTitle} → ${chapterText} → ${sceneText}`;
                        const sceneAttributeBits = calculateBitValues(sceneAttributeText);
                        const sceneDataText = scene.description || scene.title || '';
                        const sceneDataBits = calculateBitValues(sceneDataText);
                        
                        if (sceneDataText) {
                            try {
                                const url = getServerUrl('/api/attributes/data');
                                const response = await fetch(url, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        attributeText: sceneAttributeText,
                                        attributeBitMax: sceneAttributeBits.max,
                                        attributeBitMin: sceneAttributeBits.min,
                                        text: sceneDataText,
                                        dataBitMax: sceneDataBits.max,
                                        dataBitMin: sceneDataBits.min,
                                        novelTitle: novelTitle,
                                        chapter: {
                                            number: chapterNum,
                                            title: chapterTitle
                                        },
                                        scene: {
                                            number: scene.number,
                                            title: scene.title
                                        }
                                    }),
                                });
                                
                                if (response.ok) {
                                    const result = await response.json().catch(() => ({}));
                                    if (result.ok) {
                                        savedCount++;
                                        addLog('info', `[속성/데이터 저장] 장면 저장 완료: ${sceneAttributeText}`);
                                    }
                                }
                            } catch (fetchError) {
                                addLog('error', `[속성/데이터 저장] 장면 저장 오류: ${fetchError.message}`);
                            }
                        }
                    }
                }
            }
            
            addLog('info', `[속성/데이터 저장] 완료: ${savedCount}개 항목 저장`);
        } catch (error) {
            addLog('error', `[속성/데이터 저장] 오류: ${error.message}`);
            console.error('소설 구조 저장 오류:', error);
        }
    }
    
    // 대화 내용을 속성/데이터로 저장
    async function saveConversationAsAttributes(userMessage, assistantResponse, conversationId) {
        try {
            // BIT 계산 함수 확인
            if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
                addLog('warn', '[대화 저장] BIT 계산 함수가 로드되지 않았습니다.');
                return;
            }
            
            // 대화 제목 가져오기
            const conversation = conversations.find(c => c.id === conversationId);
            const conversationTitle = conversation?.title || extractNovelTitle(currentMessages) || '대화';
            
            // 속성 텍스트: "대화 → [대화 제목] → [사용자 메시지 요약]"
            const userSummary = userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage;
            const attributeText = `대화 → ${conversationTitle} → ${userSummary}`;
            const attributeBits = calculateBitValues(attributeText);
            
            if (!attributeBits.max || !attributeBits.min) {
                addLog('warn', `[대화 저장] 속성 BIT 계산 실패`);
                return;
            }
            
            // 데이터 텍스트: GPT 응답 전체
            const dataText = assistantResponse || '';
            const dataBits = calculateBitValues(dataText);
            
            if (!dataBits.max || !dataBits.min) {
                addLog('warn', `[대화 저장] 데이터 BIT 계산 실패`);
                return;
            }
            
            // 중복 체크 (같은 속성과 데이터가 이미 저장되어 있는지)
            try {
                const checkUrl = getServerUrl(`/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=1`);
                const checkResponse = await fetch(checkUrl);
                
                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    if (checkData.ok && checkData.items && checkData.items.length > 0) {
                        // 동일한 BIT 값을 가진 데이터가 있는지 확인
                        const existingData = checkData.items.find(item => {
                            const itemMax = item.max !== undefined ? item.max : (item.data?.bitMax || item.dataBitMax);
                            const itemMin = item.min !== undefined ? item.min : (item.data?.bitMin || item.dataBitMin);
                            return Math.abs(itemMax - dataBits.max) < 0.0000000000001 && 
                                   Math.abs(itemMin - dataBits.min) < 0.0000000000001;
                        });
                        
                        if (existingData) {
                            addLog('info', `[대화 저장] 중복 데이터로 저장 건너뜀`);
                            return;
                        }
                    }
                }
            } catch (checkError) {
                addLog('warn', `[대화 저장] 중복 체크 오류: ${checkError.message}`);
            }
            
            // 속성과 데이터로 저장
            const url = getServerUrl('/api/attributes/data');
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    attributeText: attributeText,
                    attributeBitMax: attributeBits.max,
                    attributeBitMin: attributeBits.min,
                    text: dataText,
                    dataBitMax: dataBits.max,
                    dataBitMin: dataBits.min,
                    novelTitle: conversationTitle,
                }),
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                addLog('error', `[대화 저장] 저장 실패 (${response.status}): ${errorText.substring(0, 100)}`);
                return;
            }
            
            const result = await response.json().catch(() => ({}));
            if (result.ok) {
                addLog('info', `[대화 저장] 저장 완료: ${attributeText.substring(0, 50)}...`);
            } else {
                addLog('warn', `[대화 저장] 저장 실패: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            addLog('error', `[대화 저장] 오류: ${error.message}`);
            console.error('대화 저장 오류:', error);
        }
    }
    
    // 텍스트 형식에서 소설 구조 파싱
    function parseTextStructure(responseText, title) {
        const structure = {
            title: title,
            chapters: []
        };
        
        // 챕터 패턴
        const chapterPatterns = [
            /(?:챕터|chapter)\s*(\d+)\s*[:：]\s*(.+?)(?:\n|$|,)/gi,
            /제\s*(\d+)\s*장\s*[:：]?\s*(.+?)(?:\n|$|,)/gi,
        ];
        
        const chapters = [];
        for (const pattern of chapterPatterns) {
            let match;
            while ((match = pattern.exec(responseText)) !== null) {
                const number = parseInt(match[1] || '0');
                const chapterTitle = (match[2] || '').trim();
                if (number > 0 && chapterTitle) {
                    chapters.push({
                        number: number,
                        title: chapterTitle,
                        scenes: []
                    });
                }
            }
        }
        
        // 장면 패턴 (각 챕터 아래)
        chapters.forEach(chapter => {
            const scenePattern = /[-•]\s*장면\s*(\d+)\s*[:：]\s*(.+?)(?:\n|$)/gi;
            let sceneMatch;
            while ((sceneMatch = scenePattern.exec(responseText)) !== null) {
                const sceneNum = parseInt(sceneMatch[1] || '0');
                const sceneTitle = (sceneMatch[2] || '').trim();
                if (sceneNum > 0 && sceneTitle) {
                    chapter.scenes.push({
                        number: sceneNum,
                        title: sceneTitle,
                        description: ''
                    });
                }
            }
        });
        
        structure.chapters = chapters;
        return structure;
    }
    
    // 소설 구조를 서버에 저장
    async function saveNovelStructureToServer(novelStructure) {
        try {
            addLog('info', `[서버 저장] 소설 구조 저장 시작: "${novelStructure.title}"`);
            
            // 1. 소설 생성 또는 조회
            let novelId = null;
            const novelsUrl = getServerUrl('/api/novels');
            
            // 기존 소설 검색
            const novelsResponse = await fetch(novelsUrl);
            if (novelsResponse.ok) {
                const novelsData = await novelsResponse.json();
                if (novelsData.ok && novelsData.items) {
                    const existingNovel = novelsData.items.find(n => n.title === novelStructure.title);
                    if (existingNovel) {
                        novelId = existingNovel.id;
                        addLog('info', `[서버 저장] 기존 소설 발견: ${novelId}`);
                    }
                }
            }
            
            // 소설이 없으면 생성
            if (!novelId) {
                const createResponse = await fetch(novelsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: novelStructure.title,
                        genre: novelStructure.genre || ''
                    })
                });
                
                if (createResponse.ok) {
                    const createData = await createResponse.json();
                    if (createData.ok && createData.id) {
                        novelId = createData.id;
                        addLog('info', `[서버 저장] 새 소설 생성: ${novelId}`);
                    }
                }
            }
            
            if (!novelId) {
                addLog('error', '[서버 저장] 소설 ID를 얻을 수 없음');
                return;
            }
            
            // 2. 챕터 및 장면 저장
            for (const chapter of novelStructure.chapters || []) {
                const chapterText = chapter.scenes && chapter.scenes.length > 0
                    ? chapter.scenes.map(s => `[장면 ${s.number}] ${s.title}\n${s.description || ''}`).join('\n\n')
                    : chapter.title;
                
                const chapterUrl = getServerUrl(`/api/novels/${encodeURIComponent(novelId)}/chapters`);
                const chapterResponse = await fetch(chapterUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        num: chapter.number,
                        text: chapterText
                    })
                });
                
                if (chapterResponse.ok) {
                    addLog('info', `[서버 저장] 챕터 저장 완료: 챕터 ${chapter.number}`);
                } else {
                    addLog('error', `[서버 저장] 챕터 저장 실패: 챕터 ${chapter.number}`);
                }
            }
            
            addLog('info', `[서버 저장] 소설 구조 저장 완료: ${novelStructure.chapters.length}개 챕터`);
        } catch (error) {
            addLog('error', `[서버 저장] 오류: ${error.message}`);
            console.error('소설 구조 저장 오류:', error);
        }
    }

    // 챕터 정보를 N/B DATA로 저장
    async function saveChaptersToNBData(novelTitle, chapters) {
        if (!novelTitle || !chapters || chapters.length === 0) return;
        
        addLog('info', `[N/B DATA] 챕터 저장 시작: "${novelTitle}" - ${chapters.length}개 챕터`);
        
        // BIT 계산 함수가 로드되었는지 확인
        let waitCount = 0;
        while ((typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') && waitCount < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }

        if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
            addLog('error', '[N/B DATA] BIT 계산 함수가 로드되지 않았습니다.');
            return;
        }

        // 소설 제목의 BIT 값 계산
        const titleBits = calculateBitValues(novelTitle);
        if (!titleBits.max || !titleBits.min) {
            addLog('warn', `[N/B DATA] 소설 제목 BIT 계산 실패: ${novelTitle}`);
            return;
        }
        
        let savedCount = 0;
        
        // 각 챕터 저장
        for (const chapter of chapters) {
            const chapterText = `${chapter.number || ''} ${chapter.title || ''}`.trim();
            if (!chapterText) continue;
            
            const chapterBits = calculateBitValues(chapterText);
            if (!chapterBits.max || !chapterBits.min) {
                addLog('warn', `[N/B DATA] 챕터 BIT 계산 실패: ${chapterText}`);
                continue;
            }

            try {
                const url = getServerUrl('/api/attributes/data');
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        attributeText: `${novelTitle} → ${chapterText}`,
                        attributeBitMax: titleBits.max,
                        attributeBitMin: titleBits.min,
                        text: chapter.description || chapterText,
                        dataBitMax: chapterBits.max,
                        dataBitMin: chapterBits.min,
                        novel: {
                            title: novelTitle,
                            chapter: chapter
                        }
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    addLog('error', `[N/B DATA] 챕터 저장 실패 (${response.status}): ${errorText.substring(0, 100)}`);
                } else {
                    const result = await response.json().catch(() => ({}));
                    if (result.ok) {
                        savedCount++;
                        addLog('info', `[N/B DATA] 챕터 저장 완료: ${chapterText}`);
                    } else {
                        addLog('error', `[N/B DATA] 챕터 저장 실패: ${result.error || 'Unknown error'}`);
                    }
                }
            } catch (fetchError) {
                addLog('error', `[N/B DATA] 챕터 저장 요청 오류: ${fetchError.message}`);
            }
        }

        addLog('info', `[N/B DATA] 챕터 저장 완료: ${savedCount}/${chapters.length}개 저장`);
    }

    // BIT 값 계산 함수
    function calculateBitValues(text) {
        if (!text || typeof text !== 'string' || text.trim() === '') {
            return { max: null, min: null };
        }
        try {
            if (typeof wordNbUnicodeFormat === 'undefined' || typeof BIT_MAX_NB === 'undefined' || typeof BIT_MIN_NB === 'undefined') {
                addLog('warn', '[BIT 계산] 함수가 로드되지 않았습니다.');
                return { max: null, min: null };
            }
            const arr = wordNbUnicodeFormat(text);
            if (!arr || arr.length === 0) {
                return { max: null, min: null };
            }
            const max = BIT_MAX_NB(arr);
            const min = BIT_MIN_NB(arr);
            const result = { max: isFinite(max) ? max : null, min: isFinite(min) ? min : null };
            
            if (!result.max || !result.min) {
                addLog('warn', `[BIT 계산] 계산 실패: ${text.substring(0, 20)}...`);
            }
            
            return result;
        } catch (e) {
            addLog('error', `[BIT 계산] 오류: ${e.message || e}`);
            console.error('BIT 계산 오류:', e);
            return { max: null, min: null };
        }
    }

    // 서버 URL 헬퍼 (config.js에서 가져오거나 기본값 사용)
    function getServerUrl(path) {
        if (typeof window.getServerUrl === 'function') {
            return window.getServerUrl(path);
        }
        // 기본값: 현재 도메인
        try {
            if (!path) return window.location.origin;
            if (path.startsWith('http://') || path.startsWith('https://')) return path;
            const base = window.location.origin || '';
            return `${base}${path}`;
        } catch { return path; }
    }

    // 자동 높이 조절
    if ($chatInput) {
        $chatInput.addEventListener('input', function() {
            const oldHeight = this.style.height;
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            if (oldHeight !== this.style.height) {
                addLog('info', `[입력창] 높이 조절: ${oldHeight} → ${this.style.height}`);
            }
        });
    }

    // 현재 대화의 메시지 배열
    let currentMessages = [];
    
    // 일반 채팅 모드 (단계별 처리 제거)
    
    // GPT 1차 프롬프트: 소설 구성 목록 초기 수집 (챕터/장면 구성에 집중)
    function buildStep1Prompt(userInput, previousMessages) {
        const context = previousMessages.length > 0 
            ? previousMessages.slice(-3).map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.text}`).join('\n')
            : '';
        
        const systemMessage = `당신은 소설 구성 목록을 작성하는 AI 어시스턴트입니다.
**모든 대화의 목적은 소설 목록의 구성 목록(챕터, 장면)을 만드는 것입니다.**
- 소설 제목, 챕터 목록, 각 챕터의 장면 목록에 집중하세요.
- 응답은 텍스트 형식으로 제공하세요.
- 친절하고 도움이 되는 톤을 유지하세요.`;

        const userPrompt = `사용자 입력:
${userInput}

${context ? `이전 대화:\n${context}\n` : ''}

**목표: 소설 구성 목록 구성 (Title → Chapters → Scenes)**

다음 중 하나를 수행하세요:
1. 사용자의 입력이 소설 제목과 챕터 정보를 포함하고 있다면, 이를 확인하고 각 챕터의 장면 목록을 질문하세요.
2. 사용자의 입력이 불완전하다면, 소설 제목, 챕터 번호, 챕터 제목, 각 챕터의 장면 목록을 명확히 질문하세요.

**중요: 질문할 때는 반드시 선택지 형식으로 제공하세요!**

예시:
질문: 소설 제목을 입력해주세요.
선택지:
A) 제목을 직접 입력하겠습니다
B) 제목 예시를 보여주세요

질문: 챕터 1에 포함될 장면은 무엇인가요?
선택지:
1) 코어 점화 (핵심 사건 시작)
2) 주인공 등장 및 배경 설정
3) 갈등 시작
4) 첫 전환점
5) 기타 (직접 입력)

질문: 몇 개의 챕터를 구성할까요?
선택지:
A) 3-5개 (단편)
B) 6-10개 (중편)
C) 11-20개 (장편)
D) 직접 입력`;

        return { systemMessage, userPrompt };
    }
    
    // GPT 2차 프롬프트: 소설 구성 목록 제안 (챕터/장면 구성에 집중)
    function buildStep2Prompt(userInput, previousMessages, novelInfo) {
        const context = previousMessages.slice(-5).map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.text}`).join('\n');
        
        const systemMessage = `소설 구성 목록을 작성하는 AI 어시스턴트입니다.
**모든 대화의 목적은 소설 목록의 구성 목록(챕터, 장면)을 만드는 것입니다.**
- 챕터와 장면 정보를 구조화하여 제공하세요.
- 응답은 JSON 형식 또는 구조화된 텍스트 형식으로 제공하세요.
- 소설 제목 → 챕터 목록 → 각 챕터의 장면 목록 구조에 집중하세요.`;

        const userPrompt = `**목표: 소설 구성 목록 구성 (Title → Chapters → Scenes)**

사용자가 제공한 소설 정보를 바탕으로, **소설 구성 목록**을 제안하세요.

사용자 입력:
${userInput}

이전 대화:
${context}

현재 소설 정보:
${JSON.stringify(novelInfo, null, 2)}

**다음 구조로 소설 구성 목록을 제안하세요:**

1. **소설 제목** (명확히 명시)
2. **챕터 목록** (각 챕터의 번호와 제목)
3. **각 챕터의 장면 목록** (각 챕터에 포함될 장면들의 번호, 제목, 간단한 설명)

**응답 형식 (JSON 권장):**
{
  "title": "소설 제목",
  "chapters": [
    {
      "number": 1,
      "title": "제1장",
      "scenes": [
        {
          "number": 1,
          "title": "코어 점화",
          "description": "장면 설명"
        },
        {
          "number": 2,
          "title": "주인공 등장",
          "description": "장면 설명"
        }
      ]
    },
    {
      "number": 2,
      "title": "제2장",
      "scenes": [
        {
          "number": 1,
          "title": "장면 제목",
          "description": "장면 설명"
        }
      ]
    }
  ]
}

**또는 구조화된 텍스트 형식:**
소설 제목: [제목]

챕터 1: 제1장
  - 장면 1: 코어 점화 (설명)
  - 장면 2: 주인공 등장 (설명)

챕터 2: 제2장
  - 장면 1: [장면 제목] (설명)
  - 장면 2: [장면 제목] (설명)

**중요: 챕터와 장면 목록에 집중하세요. 각 챕터에는 최소 2-3개의 장면이 포함되어야 합니다.**`;

        return { systemMessage, userPrompt };
    }
    
    // GPT 3차 프롬프트: 소설 구성 목록 완성 및 확장 (챕터/장면 구성에 집중)
    function buildStep3Prompt(userInput, previousMessages, novelInfo, nbDataItems) {
        const context = previousMessages.slice(-7).map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.text}`).join('\n');
        
        const nbDataContext = nbDataItems && nbDataItems.length > 0
            ? `\n\n참고 가능한 속성 목록 (${nbDataItems.length}개):\n` + 
              nbDataItems.slice(0, 10).map((item, idx) => {
                  const attr = item.attribute || item.text || '';
                  return `${idx + 1}. ${attr}`;
              }).join('\n')
            : '\n\n참고 가능한 속성 목록 없음';
        
        const systemMessage = `소설 구성 목록을 작성하는 AI 어시스턴트입니다.
**모든 대화의 목적은 소설 목록의 구성 목록(챕터, 장면)을 만드는 것입니다.**
- 소설 제목 → 챕터 목록 → 각 챕터의 장면 목록 구조에 집중하세요.
- 자연스러운 대화 형식으로 응답하세요.
- 소설 구성 목록을 완성하거나 확장하는 데 집중하세요.`;

        const userPrompt = `**목표: 소설 구성 목록 구성 (Title → Chapters → Scenes)**

사용자 입력:
${userInput}

이전 대화:
${context}

현재 소설 구성 정보:
${JSON.stringify(novelInfo, null, 2)}${nbDataContext}

**다음을 수행하세요:**

1. **소설 구성 목록이 불완전하다면:**
   - 부족한 챕터나 장면 목록을 요청하세요.
   - 각 챕터에 최소 2-3개의 장면이 포함되도록 안내하세요.

2. **소설 구성 목록이 충분하다면:**
   - 완성된 소설 구성 목록을 요약하여 제시하세요.
   - 형식: "소설 제목: [제목] → 챕터 1: [제목] (장면 3개) → 챕터 2: [제목] (장면 2개) ..."
   - 각 챕터와 장면의 구조를 확인하고, 필요시 보완을 제안하세요.

3. **N/B 데이터를 참고하여:**
   - 관련성이 높은 내용을 소설 구성 목록에 반영하세요.
   - 장면 제목이나 설명에 참고할 수 있는 정보가 있다면 활용하세요.

**중요: 소설 본문 작성이 아닌, 소설 구성 목록(챕터/장면 구조)에만 집중하세요.**`;

        return { systemMessage, userPrompt };
    }
    
    // 속성 목록만 조회 (GPT 참고용) - BIT 값으로 속성 텍스트만 반환
    async function queryNBData(novelTitle, chapters, scenes, limit = 50) {
        try {
            addLog('info', `[속성 목록 조회] 시작: "${novelTitle}"`);
            
            if (!novelTitle || typeof wordNbUnicodeFormat === 'undefined') {
                addLog('warn', '[속성 목록 조회] 제목 또는 BIT 함수 없음');
                return [];
            }
            
            // 소설 제목의 BIT 값 계산
            const titleBits = calculateBitValues(novelTitle);
            if (!titleBits.max || !titleBits.min) {
                addLog('warn', '[속성 목록 조회] 제목 BIT 계산 실패');
                return [];
            }
            
            // 속성 목록 조회 (/api/attributes/all)
            const attrUrl = getServerUrl('/api/attributes/all');
            addLog('info', `[속성 목록 조회] 서버 요청: ${attrUrl}`);
            
            const response = await fetch(attrUrl);
            if (!response.ok) {
                addLog('error', `[속성 목록 조회] HTTP 오류: ${response.status}`);
                return [];
            }
            
            const data = await response.json();
            if (!data.ok || !data.attributes) {
                addLog('warn', '[속성 목록 조회] 응답 데이터 없음');
                return [];
            }
            
            // 소설 제목으로 필터링 (BIT 값 유사도 체크)
            let attributes = data.attributes || [];
            
            // 소설 제목으로 시작하는 속성만 필터링
            attributes = attributes.filter(attr => {
                const attrText = (attr.text || '').trim();
                return attrText.startsWith(novelTitle + ' → ');
            });
            
            addLog('info', `[속성 목록 조회] ${attributes.length}개 속성 조회됨`);
            
            // 챕터 정보와 관련된 속성만 필터링
            if (chapters && chapters.length > 0) {
                const chapterKeys = chapters.map(c => {
                    const num = c.number || c.num || '';
                    const title = c.title || '';
                    return `챕터 ${num}${title ? `: ${title}` : ''}`;
                }).filter(Boolean);
                
                attributes = attributes.filter(attr => {
                    const attrText = attr.text || '';
                    return chapterKeys.some(key => attrText.includes(key));
                });
                addLog('info', `[속성 목록 조회] 챕터 필터링 후: ${attributes.length}개`);
            }
            
            // 속성 텍스트만 반환 (GPT 참고용)
            return attributes.slice(0, limit).map(attr => ({
                attribute: attr.text || '',
                bitMax: attr.bitMax,
                bitMin: attr.bitMin
            }));
        } catch (error) {
            addLog('error', `[속성 목록 조회] 오류: ${error.message}`);
            return [];
        }
    }
    
    // 선택지 파싱 함수
    function parseChoices(text) {
        const choices = [];
        
        // 선택지 패턴: A) B) 1) 2) 등
        const choicePatterns = [
            /([A-Z])\)\s*(.+?)(?=\n|$|(?:\n[A-Z]\))|(?:\n\d+\)))/g,
            /(\d+)\)\s*(.+?)(?=\n|$|(?:\n\d+\))|(?:\n[A-Z]\)))/g,
        ];
        
        for (const pattern of choicePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const label = match[1];
                const choiceText = (match[2] || '').trim();
                if (choiceText) {
                    choices.push({ label, text: choiceText });
                }
            }
        }
        
        return choices;
    }
    
    // Novel AI 상태 정보 가져오기 (현재 표시된 상태에서)
    function getNovelAIStatus() {
        if (!$mainContent) return null;
        
        const statusDiv = $mainContent.querySelector('.novel-ai-status-notification');
        if (!statusDiv) return null;
        
        const statusText = statusDiv.textContent || '';
        const statusHtml = statusDiv.innerHTML || '';
        
        // HTML에서 정보 추출
        const novelTitleMatch = statusHtml.match(/소설[:：]\s*([^\n<]+)/);
        const chapterMatch = statusHtml.match(/챕터[:：]\s*([^\n<]+)/);
        const attributeMatch = statusHtml.match(/속성[:：]\s*([^\n<]+)/);
        
        const status = {};
        if (novelTitleMatch) {
            status.novelTitle = novelTitleMatch[1].trim();
        }
        if (chapterMatch) {
            status.chapter = chapterMatch[1].trim().replace(/\s*\([^)]*\)\s*/g, ''); // (1/2) 같은 부분 제거
        }
        if (attributeMatch) {
            status.attributeText = attributeMatch[1].trim();
        }
        
        return Object.keys(status).length > 0 ? status : null;
    }
    
    // Novel AI 상태 업데이트 (챗봇 상단에 자막 형태 알림으로 표시)
    window.updateNovelAIStatus = function(statusData) {
        if (!$mainContent) return;
        
        // 기존 상태 알림 제거
        const existingStatus = $mainContent.querySelector('.novel-ai-status-notification');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        // 상태 알림 생성 (자막 형태) - chat-messages 내부 맨 위에 추가
        const statusDiv = document.createElement('div');
        statusDiv.className = 'novel-ai-status-notification';
        statusDiv.style.cssText = `
            position: sticky;
            top: 0;
            z-index: 100;
            margin-top: 0;
            margin-bottom: 10px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(124, 92, 255, 0.3);
            font-size: 0.75em;
            color: #fff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            animation: slideDown 0.3s ease-out;
        `;
        
        const time = statusData.saveTime ? new Date(statusData.saveTime).toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        }) : new Date().toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        
        let statusHtml = `<div style="font-weight: bold; margin-bottom: 6px; color: #7c5cff; font-size: 0.9em;">📊 Novel AI 상태 [${time}]</div>`;
        
        // 소설 제목
        if (statusData.novelTitle) {
            statusHtml += `<div style="margin-bottom: 3px; font-size: 0.85em;"><strong style="color: #7c5cff;">소설:</strong> ${escapeHtml(statusData.novelTitle)}</div>`;
        }
        
        // 챕터 정보 (챕터 클릭 시)
        if (statusData.chapterInfo) {
            const { currentChapter, chapterNumber, totalChapters } = statusData.chapterInfo;
            if (currentChapter) {
                statusHtml += `<div style="margin-bottom: 3px; font-size: 0.85em;"><strong style="color: #7c5cff;">챕터:</strong> ${escapeHtml(currentChapter)}`;
                if (totalChapters > 0) {
                    statusHtml += ` <span style="color: rgba(255, 255, 255, 0.6);">(${chapterNumber}/${totalChapters})</span>`;
                }
                statusHtml += `</div>`;
            }
        }
        
        // 장면 정보 (장면 클릭 시)
        if (statusData.sceneInfo) {
            const { sceneText, chapterTitle } = statusData.sceneInfo;
            if (sceneText) {
                statusHtml += `<div style="margin-bottom: 3px; font-size: 0.85em;"><strong style="color: #7c5cff;">장면:</strong> ${escapeHtml(sceneText)}</div>`;
            }
            if (chapterTitle) {
                statusHtml += `<div style="margin-bottom: 3px; font-size: 0.75em; color: rgba(255, 255, 255, 0.7);">챕터: ${escapeHtml(chapterTitle)}</div>`;
            }
        }
        
        // 속성 텍스트
        if (statusData.attributeText) {
            const attrPreview = statusData.attributeText.length > 50 
                ? statusData.attributeText.substring(0, 50) + '...' 
                : statusData.attributeText;
            statusHtml += `<div style="margin-bottom: 3px; font-size: 0.85em;"><strong style="color: #7c5cff;">속성:</strong> ${escapeHtml(attrPreview)}</div>`;
        }
        
        // 속성 BIT 값 (간단히)
        if (statusData.attributeBits && statusData.attributeBits.max !== null && statusData.attributeBits.min !== null) {
            statusHtml += `<div style="margin-bottom: 3px; font-size: 0.75em; font-family: monospace; color: rgba(255, 255, 255, 0.7);">속성 BIT: ${statusData.attributeBits.max.toFixed(10)}... / ${statusData.attributeBits.min.toFixed(10)}...</div>`;
        }
        
        // 데이터 텍스트 (미리보기)
        if (statusData.dataText) {
            const dataPreview = statusData.dataText.length > 60 
                ? statusData.dataText.substring(0, 60) + '...' 
                : statusData.dataText;
            statusHtml += `<div style="margin-bottom: 3px; font-size: 0.85em;"><strong style="color: #7c5cff;">데이터:</strong> ${escapeHtml(dataPreview)}</div>`;
        }
        
        // 데이터 BIT 값 (간단히)
        if (statusData.dataBits && statusData.dataBits.max !== null && statusData.dataBits.min !== null) {
            statusHtml += `<div style="margin-bottom: 3px; font-size: 0.75em; font-family: monospace; color: rgba(255, 255, 255, 0.7);">데이터 BIT: ${statusData.dataBits.max.toFixed(10)}... / ${statusData.dataBits.min.toFixed(10)}...</div>`;
        }
        
        statusDiv.innerHTML = statusHtml;
        
        // 환영 메시지 제거
        const welcomeMsg = $mainContent.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }
        
        // chat-messages 내부 맨 위에 추가 (스크롤 가능하지만 상단에 고정)
        $mainContent.insertBefore(statusDiv, $mainContent.firstChild);
        
        // 계속 보이도록 유지 (자동 사라짐 없음)
    };
    
    // CSS 애니메이션 추가 (중복 방지)
    if (!document.getElementById('novel-ai-status-animations')) {
        const style = document.createElement('style');
        style.id = 'novel-ai-status-animations';
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            @keyframes fadeOut {
                from {
                    opacity: 1;
                }
                to {
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 메시지 추가 (선택지 버튼 포함 + BIT 값 표시)
    function appendMessage(role, text, skipArray = false, aiType = 'gpt') {
        if (!$mainContent) return;

        addLog('info', `[메시지 추가] ${role}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}${skipArray ? ' (배열 스킵)' : ''} (AI 타입: ${aiType})`);

        // 환영 메시지 제거
        const welcomeMsg = $mainContent.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
            addLog('info', '[메시지 추가] 환영 메시지 제거');
        }

        // BIT 값 계산 (기존 메시지에 BIT 값이 있으면 사용, 없으면 계산)
        let bitValues = { max: null, min: null };
        if (skipArray && currentMessages.length > 0) {
            // 기존 메시지에서 BIT 값 찾기 (텍스트 일치하는 메시지)
            const existingMsg = currentMessages.find(m => m.text === text && m.role === role);
            if (existingMsg && existingMsg.bitMax !== undefined && existingMsg.bitMin !== undefined) {
                bitValues = { max: existingMsg.bitMax, min: existingMsg.bitMin };
            }
        }
        
        // BIT 값이 없으면 계산
        if (bitValues.max === null || bitValues.min === null) {
            bitValues = calculateBitValues(text);
        }
        
        const bitInfo = (bitValues.max !== null && bitValues.min !== null)
            ? `BIT: ${bitValues.max.toFixed(15)}, ${bitValues.min.toFixed(15)}`
            : 'BIT: 계산 중...';

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        // 아바타 (N/B AI인 경우 'N/B'로 표시, GPT AI인 경우 'AI'로 표시)
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        if (role === 'user') {
            avatar.textContent = 'U';
        } else if (aiType === 'nb' || aiType === 'N/B') {
            avatar.textContent = 'N/B';
        } else {
            avatar.textContent = 'AI';
        }

        // 메시지 컨텐츠
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        // 텍스트를 선택지 전/후로 분리
        if (role === 'assistant') {
            const choices = parseChoices(text);
            if (choices.length > 0) {
                // 선택지가 있는 경우 텍스트와 선택지 분리
                const choiceSection = text.match(/선택지\s*[:：]\s*([\s\S]*?)(?:\n\n|\n질문|$)/i);
                const textBeforeChoices = choiceSection 
                    ? text.substring(0, text.indexOf(choiceSection[0]))
                    : text;
                
                // 메인 텍스트
                const textDiv = document.createElement('div');
                textDiv.className = 'message-text';
                textDiv.textContent = textBeforeChoices.trim() || text;
                bubble.appendChild(textDiv);
                
                // 선택지 버튼 컨테이너
                const choicesContainer = document.createElement('div');
                choicesContainer.className = 'message-choices';
                
                choices.forEach(choice => {
                    const choiceBtn = document.createElement('button');
                    choiceBtn.className = 'choice-btn';
                    choiceBtn.innerHTML = `<span class="choice-label">${choice.label}</span><span class="choice-text">${choice.text}</span>`;
                    
                    // 선택지 클릭 시 해당 텍스트를 입력창에 추가하고 전송
                    choiceBtn.addEventListener('click', () => {
                        if ($chatInput) {
                            $chatInput.value = `${choice.label}) ${choice.text}`;
                            addLog('info', `[선택지 클릭] "${choice.label}) ${choice.text}"`);
                            sendMessage();
                        }
                    });
                    
                    choicesContainer.appendChild(choiceBtn);
                });
                
                bubble.appendChild(choicesContainer);
            } else {
                // 선택지가 없으면 일반 텍스트
                const textDiv = document.createElement('div');
                textDiv.className = 'message-text';
                textDiv.textContent = text;
                bubble.appendChild(textDiv);
            }
        } else {
            // 일반 텍스트인 경우에도 div로 감싸서 구조 유지
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.textContent = text;
            bubble.appendChild(textDiv);
        }

        // BIT 값 표시 추가
        const bitDiv = document.createElement('div');
        bitDiv.className = 'message-bit-info';
        bitDiv.textContent = bitInfo;
        bubble.appendChild(bitDiv);
        
        // 속성 정보 저장용 컨테이너 (나중에 채워짐)
        const attributeInfoContainer = document.createElement('div');
        attributeInfoContainer.className = 'attribute-info-container';
        attributeInfoContainer.style.cssText = 'margin-top: 8px; display: none;';
        bubble.appendChild(attributeInfoContainer);
        
        // GPT 응답 메시지에 "입력" 버튼 추가 (assistant 메시지만)
        if (role === 'assistant') {
            const inputButtonContainer = document.createElement('div');
            inputButtonContainer.className = 'message-input-button-container';
            inputButtonContainer.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.1);';
            
            const inputButton = document.createElement('button');
            inputButton.className = 'btn btn-sm btn-primary';
            inputButton.style.cssText = 'background: var(--accent); border: none; color: white; padding: 6px 16px; border-radius: 5px; cursor: pointer; font-size: 0.85em;';
            inputButton.textContent = '📝 입력';
            inputButton.title = '우측 데이터 필드에 입력';
            
            // 버튼 클릭 시 우측 데이터 필드에 입력
            inputButton.addEventListener('click', () => {
                const $dataInput = document.getElementById('dataInput');
                if ($dataInput) {
                    // GPT 응답 텍스트를 데이터 필드에 입력
                    $dataInput.value = text;
                    // 이벤트 트리거하여 BIT 값 계산 및 자동 저장
                    const inputEvent = new Event('input', { bubbles: true });
                    $dataInput.dispatchEvent(inputEvent);
                    
                    // 버튼 스타일 변경 (입력 완료 표시)
                    inputButton.textContent = '✓ 입력 완료';
                    inputButton.style.background = '#2bd576';
                    inputButton.disabled = true;
                    
                    addLog('info', '[입력 버튼] 우측 데이터 필드에 입력 완료');
                } else {
                    addLog('warn', '[입력 버튼] 데이터 입력 필드를 찾을 수 없습니다');
                }
            });
            
            inputButtonContainer.appendChild(inputButton);
            bubble.appendChild(inputButtonContainer);
        }

        const time = document.createElement('div');
        time.className = 'message-time';
        const timestamp = new Date();
        time.textContent = timestamp.toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        contentDiv.appendChild(bubble);
        contentDiv.appendChild(time);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        $mainContent.appendChild(messageDiv);
        addLog('info', '[메시지 추가] DOM에 추가 완료');
        
        // 메시지 배열에 추가 (skipArray가 false일 때만)
        if (!skipArray) {
            currentMessages.push({
                role: role,
                text: text,
                timestamp: timestamp.toISOString(),
                bitMax: bitValues.max,
                bitMin: bitValues.min
            });
            addLog('info', `[메시지 배열] 추가: 현재 ${currentMessages.length}개 메시지`);
        } else {
            addLog('info', '[메시지 배열] 스킵 (이미 로드된 메시지)');
        }
        
        // 스크롤
        setTimeout(() => {
            $mainContent.scrollTop = $mainContent.scrollHeight;
            addLog('info', '[메시지 추가] 스크롤 이동 완료');
        }, 100);
    }
    
    // appendMessage를 전역으로 노출 (다른 스크립트에서 사용할 수 있도록)
    window.appendMessage = appendMessage;

    // 마크다운 문자 제거 (novel_composition_new5.html에서 가져옴)
    function removeMarkdownChars(input) {
        if (input === null || input === undefined) return '';
        return String(input).replace(/[\*#]/g, '');
    }

    // 섹션 라벨/장식 제거
    function stripSectionLabels(input) {
        if (input === null || input === undefined) return '';
        let t = String(input);
        t = t.replace(/^(데이터|이유|속성\s*\d+|결과|분석|요약)\s*[:：]\s*/gi, '');
        t = t.replace(/^[-=]{3,}\s*/gm, '');
        t = t.replace(/^\s*[-•*]\s+/gm, '');
        return t.trim();
    }

    // 추출된 텍스트 정규화
    function normalizeExtractedText(input) {
        return stripSectionLabels(removeMarkdownChars(input || ''));
    }

    // GPT API 호출 헬퍼 (novel_composition_new5.html 방식으로 업데이트)
    async function callGPTAPI(prompt, model, params, systemMessage = null) {
        const url = getServerUrl('/api/gpt/chat');
        addLog('info', `[GPT API] 요청 URL: ${url}`);
        
        const requestBody = {
            prompt: prompt,
            model: model || 'gpt-4o-mini',
            temperature: params?.temperature || 0.7,
            maxTokens: params?.maxTokens || 2000,
        };

        // systemMessage가 제공되면 추가 (novel_composition_new5.html 방식)
        if (systemMessage) {
            requestBody.systemMessage = systemMessage;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        addLog('info', `[GPT API] 응답 받음: HTTP ${response.status}`);

        if (!response.ok) {
            const raw = await response.text().catch(() => '');
            const errorText = raw || `HTTP ${response.status}`;
            addLog('error', `[GPT API] 응답 오류 (${response.status}): ${errorText.substring(0, 100)}`);
            throw new Error(errorText);
        }

        const data = await response.json();
        
        if (!data.ok) {
            addLog('error', `[GPT API] 응답 데이터 오류: ${data.error || 'Unknown error'}`);
            throw new Error(data.error || 'GPT 응답 오류');
        }

        const responseText = (data.response || '').trim();
        addLog('info', `[GPT API] 응답 텍스트 길이: ${responseText.length}자`);
        
        return responseText;
    }
    
    // 메시지 전송 중 상태 추적 (중복 전송 방지)
    let isMessageSending = false;
    
    // N/B AI 응답 중 상태 추적 (N/B AI 응답 중일 때는 GPT AI 응답하지 않음)
    let isNBAIResponding = false;
    
    // N/B AI 응답 상태를 전역으로 노출 (다른 스크립트에서 설정 가능하도록)
    window.setNBAIResponding = function(value) {
        isNBAIResponding = value;
        addLog('info', `[N/B AI 상태] ${value ? '응답 중' : '응답 완료'}`);
    };

    // 메시지 전송 (단계별 흐름)
    // 전역으로 노출 (다른 스크립트에서 호출 가능하도록)
    window.sendMessage = async function sendMessage() {
        // 중복 전송 방지
        if (isMessageSending) {
            addLog('warn', '[메시지 전송] 이미 전송 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        
        // N/B AI 응답 중일 때는 GPT AI 응답하지 않음
        if (isNBAIResponding) {
            addLog('warn', '[메시지 전송] N/B AI가 응답 중입니다. N/B AI 응답이 완료된 후 다시 시도해주세요.');
            return;
        }

        const text = ($chatInput && $chatInput.value || '').trim();
        if (!text) {
            addLog('warn', '[메시지 전송] 빈 메시지');
            return;
        }

        // 전송 중 상태로 설정
        isMessageSending = true;

        addLog('info', `[메시지 전송] 시작: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // 새 대화인 경우 ID 생성
        if (!currentConversationId) {
            currentConversationId = 'conv_' + Date.now();
            const title = extractNovelTitle([{ role: 'user', text: text }]) || text.substring(0, 30) + (text.length > 30 ? '...' : '');
            addLog('info', `[메시지 전송] 새 대화 생성: ${currentConversationId} - "${title}"`);
            saveConversation(currentConversationId, title, []);
        }

        appendMessage('user', text);
        
        // 입력창 비활성화 및 초기화
        if ($chatInput) {
            $chatInput.value = '';
            $chatInput.style.height = 'auto';
            $chatInput.disabled = true;
            $chatInput.placeholder = 'GPT가 응답 중입니다...';
            addLog('info', '[메시지 전송] 입력창 비활성화 및 초기화');
        }

        // 전송 버튼 비활성화
        if ($chatSendBtn) {
            $chatSendBtn.disabled = true;
            addLog('info', '[메시지 전송] 전송 버튼 비활성화');
        }

        // 로딩 메시지 추가
        let loadingMessageId = null;
        if ($mainContent) {
            const loadingDiv = document.createElement('div');
            loadingMessageId = 'loading_' + Date.now();
            loadingDiv.id = loadingMessageId;
            loadingDiv.className = 'message assistant loading-message';
            
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = 'AI';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.style.cssText = 'opacity: 0.7;';
            
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.innerHTML = '<div style="display: flex; align-items: center; gap: 10px;"><span class="loading-spinner"></span><span>GPT가 응답을 생성하고 있습니다...</span></div>';
            
            bubble.appendChild(textDiv);
            contentDiv.appendChild(bubble);
            loadingDiv.appendChild(avatar);
            loadingDiv.appendChild(contentDiv);
            $mainContent.appendChild(loadingDiv);
            
            // 스크롤을 맨 아래로
            $mainContent.scrollTop = $mainContent.scrollHeight;
            addLog('info', '[메시지 전송] 로딩 메시지 표시');
        }

        const model = ($chatModel && $chatModel.value) || (window.API_CONFIG?.defaultModel || 'gpt-4o');
        const defaultParams = window.API_CONFIG?.defaultParams || { temperature: 0.7, maxTokens: 2000 };
        
        try {
            // 일반 채팅 모드: 단계별 처리 없이 직접 GPT 호출
            addLog('info', '[일반 채팅] GPT 호출 시작');
            
            // 좌측 메뉴 상태 확인 (속성 필터 값)
            const $leftAttributeFilter = document.getElementById('attributeFilterInput');
            const leftFilterValue = ($leftAttributeFilter && $leftAttributeFilter.value || '').trim();
            let leftMenuStatus = '';
            
            if (leftFilterValue) {
                leftMenuStatus = `\n\n**좌측 메뉴 상태:**\n현재 조회 중인 속성 필터: "${leftFilterValue}"\n좌측 Novel AI 패널에서 이 속성과 관련된 데이터를 조회 중입니다.`;
            } else {
                leftMenuStatus = `\n\n**좌측 메뉴 상태:**\n좌측 속성 필터가 비어있습니다. 소설 목록이 표시되고 있습니다.`;
            }
            
            // 좌측 속성/데이터 조회 (참조용)
            let referenceData = '';
            try {
                // 좌측 필터가 있으면 해당 속성의 데이터만 조회, 없으면 전체 조회
                if (leftFilterValue) {
                    // 좌측 필터 값으로 속성 조회
                    const filterBits = calculateBitValues(leftFilterValue);
                    if (filterBits.max && filterBits.min) {
                        const attrUrl = getServerUrl(`/api/attributes/all?bitMax=${filterBits.max}&bitMin=${filterBits.min}`);
                        const attrResponse = await fetch(attrUrl);
                        
                        if (attrResponse.ok) {
                            const attrData = await attrResponse.json();
                            if (attrData.ok && attrData.attributes && attrData.attributes.length > 0) {
                                const referenceItems = [];
                                
                                // 필터된 속성들의 데이터 조회
                                for (const attr of attrData.attributes.slice(0, 20)) {
                                    try {
                                        const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=10`);
                                        const dataResponse = await fetch(dataUrl);
                                        
                                        if (dataResponse.ok) {
                                            const dataData = await dataResponse.json();
                                            if (dataData.ok && dataData.items && dataData.items.length > 0) {
                                                const dataTexts = dataData.items.map(item => {
                                                    const text = item.s || item.text || item.data?.text || '';
                                                    return text.length > 200 ? text.substring(0, 200) + '...' : text;
                                                }).join(' | ');
                                                referenceItems.push(`- ${attr.text || '속성'}: ${dataTexts}`);
                                            }
                                        }
                                    } catch (e) {
                                        // 개별 속성 데이터 조회 실패 시 무시
                                    }
                                }
                                
                                if (referenceItems.length > 0) {
                                    referenceData = `\n\n**현재 조회 중인 속성 및 데이터:**\n${referenceItems.join('\n')}`;
                                }
                            }
                        }
                    }
                } else {
                    // 필터가 없으면 전체 속성 조회 (기존 로직)
                    const attrUrl = getServerUrl('/api/attributes/all');
                    const attrResponse = await fetch(attrUrl);
                    
                    if (attrResponse.ok) {
                        const attrData = await attrResponse.json();
                        if (attrData.ok && attrData.attributes) {
                            const allAttributes = attrData.attributes || [];
                            const referenceItems = [];
                            
                            // 최대 50개 속성만 조회 (성능 고려)
                            for (const attr of allAttributes.slice(0, 50)) {
                                try {
                                    const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${attr.bitMax}&bitMin=${attr.bitMin}&limit=10`);
                                    const dataResponse = await fetch(dataUrl);
                                    
                                    if (dataResponse.ok) {
                                        const dataData = await dataResponse.json();
                                        if (dataData.ok && dataData.items && dataData.items.length > 0) {
                                            const dataTexts = dataData.items.map(item => {
                                                const text = item.s || item.text || item.data?.text || '';
                                                return text.length > 200 ? text.substring(0, 200) + '...' : text;
                                            }).join(' | ');
                                            referenceItems.push(`- ${attr.text || '속성'}: ${dataTexts}`);
                                        }
                                    }
                                } catch (e) {
                                    // 개별 속성 데이터 조회 실패 시 무시
                                }
                            }
                            
                            if (referenceItems.length > 0) {
                                referenceData = `\n\n**참조 가능한 속성 및 데이터 (좌측 Novel AI):**\n${referenceItems.slice(0, 20).join('\n')}${referenceItems.length > 20 ? `\n... 외 ${referenceItems.length - 20}개 더` : ''}`;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('속성/데이터 조회 오류:', e);
            }
            
            // 시스템 메시지: 프롬프트 파일에서 가져오기
            const systemMessage = window.PROMPTS?.SYSTEM_MESSAGE || `소설 구성 목록을 작성하는 AI 어시스턴트입니다.
**모든 대화의 목적은 소설 목록의 구성 목록(챕터, 장면)을 만드는 것입니다.**
소설 제목 → 챕터 목록 → 각 챕터의 장면 목록 구조에 집중하며 자연스러운 대화 형식으로 응답하세요.
좌측 Novel AI에 표시된 속성과 데이터를 참조하여 더 정확하고 일관성 있는 응답을 제공하세요.`;
            
            // 이전 대화 히스토리 포맷팅
            const previousContext = window.PROMPTS?.formatPreviousContext 
                ? window.PROMPTS.formatPreviousContext(currentMessages, 10)
                : (currentMessages.length > 0
                    ? currentMessages.slice(-10).map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.text}`).join('\n')
                    : '');
            
            // 참조 데이터 포맷팅
            let formattedReferenceData = referenceData || '';
            
            // 챕터 데이터가 있으면 추가 (window.chapterDataForGPT)
            if (typeof window !== 'undefined' && window.chapterDataForGPT) {
                const chapterData = window.chapterDataForGPT;
                let chapterDataText = `\n\n**챕터 데이터 (${chapterData.chapterTitle}):**\n`;
                
                for (const attrData of chapterData.attributes) {
                    chapterDataText += `\n**속성: ${attrData.attribute}**\n`;
                    for (let i = 0; i < attrData.data.length; i++) {
                        chapterDataText += `${i + 1}. ${attrData.data[i]}\n`;
                    }
                    chapterDataText += '\n';
                }
                
                formattedReferenceData += chapterDataText;
                
                // 사용 후 초기화 (한 번만 사용)
                window.chapterDataForGPT = null;
            }
            
            // Novel AI 상태 정보 가져오기
            const novelAIStatus = getNovelAIStatus();
            
            // 사용자 프롬프트 생성: 프롬프트 파일의 함수 사용 (좌측 메뉴 상태 포함)
            const contextWithLeftMenu = leftMenuStatus + (formattedReferenceData || '');
            const userPrompt = window.PROMPTS?.buildUserPrompt 
                ? window.PROMPTS.buildUserPrompt(text, previousContext, contextWithLeftMenu, novelAIStatus)
                : `${previousContext ? `이전 대화:\n${previousContext}\n\n` : ''}${contextWithLeftMenu ? contextWithLeftMenu + '\n\n' : ''}사용자: ${text}\n\nAI:`;
            
            // GPT API 호출
            const responseText = await callGPTAPI(userPrompt, model, defaultParams, systemMessage);
            
            // 응답 정규화
            const normalizedResponse = normalizeExtractedText(responseText);
            
            // GPT 응답에서 속성과 데이터 추출
            const extracted = extractAttributesFromResponse(normalizedResponse);
            const extractedAttributes = extracted.attributes || [];
            const extractedData = extracted.data || '';
            
            // 추출된 속성과 데이터를 우측 메뉴에 입력 (좌측 메뉴는 연동 안함)
            if (extractedAttributes && extractedAttributes.length > 0) {
                // 가장 긴 속성(가장 완전한 속성)을 선택하거나 첫 번째 속성 사용
                const validAttributes = extractedAttributes.filter(attr => attr && typeof attr === 'string');
                if (validAttributes.length > 0) {
                    const mainAttribute = validAttributes.reduce((prev, curr) => 
                        (curr || '').length > (prev || '').length ? curr : prev
                    );
                    
                    // 우측 속성 입력란에 자동 입력
                    const $attributeInput = document.getElementById('attributeInput');
                    if ($attributeInput && mainAttribute) {
                        $attributeInput.value = mainAttribute;
                        addLog('info', `[우측 속성 입력] 자동 입력: ${mainAttribute}`);
                        
                        // BIT 값 계산 및 표시 (이벤트 트리거)
                        const inputEvent = new Event('input', { bubbles: true });
                        $attributeInput.dispatchEvent(inputEvent);
                    }
                }
                
                // 우측 데이터 입력란에 자동 입력
                const $dataInput = document.getElementById('dataInput');
                if ($dataInput && extractedData && typeof extractedData === 'string') {
                    $dataInput.value = extractedData;
                    addLog('info', `[우측 데이터 입력] 자동 입력: ${extractedData.substring(0, 50)}...`);
                    
                    // BIT 값 계산 및 표시 (이벤트 트리거)
                    const dataInputEvent = new Event('input', { bubbles: true });
                    $dataInput.dispatchEvent(dataInputEvent);
                }
            }
            
            // 로딩 메시지 제거
            if (loadingMessageId && $mainContent) {
                const loadingMsg = document.getElementById(loadingMessageId);
                if (loadingMsg) {
                    loadingMsg.remove();
                    addLog('info', '[메시지 전송] 로딩 메시지 제거');
                }
            }

            // 속성 정보를 포함하여 메시지 표시
            let displayResponse = normalizedResponse;
            if (extractedAttributes && extractedAttributes.length > 0) {
                const validAttrs = extractedAttributes.filter(attr => attr && typeof attr === 'string');
                if (validAttrs.length > 0) {
                    const attributesText = validAttrs.map(attr => `- ${attr}`).join('\n');
                    displayResponse = `**추출된 속성:**\n${attributesText}\n\n---\n\n${normalizedResponse}`;
                }
            }
            
            appendMessage('assistant', displayResponse);
            
            // 메시지의 주제를 속성으로 사용 (사용자 질문이 주제가 됨)
            // 소설 제목 가져오기
            const $novelTitleInput = document.getElementById('novelTitleInput');
            const novelTitle = ($novelTitleInput && $novelTitleInput.value || '').trim();
            
            // 주제는 사용자 질문 텍스트 (간단히 요약)
            const topic = (text || '').trim();
            // 전체 속성 텍스트 (소설 제목 포함)
            const fullAttributeText = novelTitle && topic 
                ? `${novelTitle} → ${topic}` 
                : topic;
            
            // 응답 데이터는 GPT 응답 텍스트
            const responseData = normalizedResponse;
            
            // 속성 BIT 계산
            const attributeBits = calculateBitValues(fullAttributeText);
            
            // 데이터 BIT 계산
            const dataBits = calculateBitValues(responseData);
            
            // 마지막 메시지의 BIT 값 밑에 속성 정보 추가
            if ($mainContent && fullAttributeText) {
                const lastMessage = $mainContent.querySelector('.message.assistant:last-child');
                if (lastMessage) {
                    // 메시지 버블 내부의 attribute-info-container 찾기
                    const bubble = lastMessage.querySelector('.message-bubble');
                    if (bubble) {
                        const attributeContainer = bubble.querySelector('.attribute-info-container');
                        if (attributeContainer) {
                            attributeContainer.style.display = 'block';
                            attributeContainer.style.cssText = 'margin-top: 8px; padding: 8px; background: rgba(100, 100, 100, 0.1); border-radius: 5px; font-size: 0.85em;';
                            
                            let bitInfoHtml = '<div style="margin-bottom: 8px;"><strong>속성 (주제):</strong></div>';
                            bitInfoHtml += `<div style="margin-left: 10px; margin-bottom: 10px; padding: 5px; background: rgba(0, 0, 0, 0.2); border-radius: 3px; word-break: break-all;">${escapeHtml(fullAttributeText)}</div>`;
                            
                            bitInfoHtml += '<div style="margin-bottom: 5px;"><strong>속성 BIT:</strong></div>';
                            if (attributeBits.max !== null && attributeBits.min !== null) {
                                bitInfoHtml += `<div style="margin-left: 10px; margin-bottom: 10px; font-family: monospace;">MAX: ${attributeBits.max.toFixed(15)}<br>MIN: ${attributeBits.min.toFixed(15)}</div>`;
                            } else {
                                bitInfoHtml += '<div style="margin-left: 10px; margin-bottom: 10px;">계산 중...</div>';
                            }
                            
                            bitInfoHtml += '<div style="margin-bottom: 8px;"><strong>데이터 (응답):</strong></div>';
                            const dataPreview = responseData.length > 200 
                                ? responseData.substring(0, 200) + '...' 
                                : responseData;
                            bitInfoHtml += `<div style="margin-left: 10px; margin-bottom: 10px; padding: 5px; background: rgba(0, 0, 0, 0.2); border-radius: 3px; word-break: break-all; white-space: pre-wrap;">${escapeHtml(dataPreview)}</div>`;
                            
                            bitInfoHtml += '<div style="margin-bottom: 5px;"><strong>데이터 BIT:</strong></div>';
                            if (dataBits.max !== null && dataBits.min !== null) {
                                bitInfoHtml += `<div style="margin-left: 10px; font-family: monospace;">MAX: ${dataBits.max.toFixed(15)}<br>MIN: ${dataBits.min.toFixed(15)}</div>`;
                            } else {
                                bitInfoHtml += '<div style="margin-left: 10px;">계산 중...</div>';
                            }
                            
                            attributeContainer.innerHTML = bitInfoHtml;
                        }
                    }
                }
            }
            
            // GPT 응답에서 소설 제목과 챕터 정보 파싱 (저장은 하지 않음, 우측 패널에서만 저장)
            parseNovelInfoFromResponse(normalizedResponse, currentMessages).catch(err => {
                addLog('warn', `[소설 정보 파싱] 오류: ${err.message}`);
            });
            
            // 대화 저장 (메시지 전송 완료 후)
            if (currentConversationId) {
                const conversation = conversations.find(c => c.id === currentConversationId);
                const title = conversation?.title || extractNovelTitle(currentMessages) || text.substring(0, 30);
                addLog('info', `[메시지 전송] 대화 저장 시작: ${currentConversationId}`);
                saveConversation(currentConversationId, title, currentMessages);
                
                // N/B DATA 저장 (비동기로 실행)
                const conversationData = conversations.find(c => c.id === currentConversationId);
                if (conversationData) {
                    addLog('info', `[메시지 전송] N/B DATA 저장 시작`);
                    saveToNBData(conversationData).catch(err => {
                        addLog('error', `[N/B DATA] 저장 실패: ${err.message}`);
                    });
                }
            }
        } catch (error) {
            // 로딩 메시지 제거
            if (loadingMessageId && $mainContent) {
                const loadingMsg = document.getElementById(loadingMessageId);
                if (loadingMsg) {
                    loadingMsg.remove();
                    addLog('info', '[메시지 전송] 로딩 메시지 제거 (오류 발생)');
                }
            }

            addLog('error', `[메시지 전송] 오류: ${error.message || error}`);
            console.error('메시지 전송 오류:', error);
            const errorMsg = error.message || '오류가 발생했습니다.';
            
            // API 키 미설정 오류인 경우 안내 메시지
            if (errorMsg.includes('API key') || errorMsg.includes('key')) {
                appendMessage('assistant', `❌ API 키가 설정되지 않았습니다.\n\n서버에서 /api/gpt/key 엔드포인트를 통해 OpenAI API 키를 설정해주세요.`);
            } else {
                appendMessage('assistant', `❌ 오류: ${errorMsg}\n\n서버 연결을 확인하고 다시 시도해주세요.`);
            }
        } finally {
            // 전송 중 상태 해제
            isMessageSending = false;

            // 입력창 활성화
            if ($chatInput) {
                $chatInput.disabled = false;
                $chatInput.placeholder = '소설 구성 목록을 작성하세요... 예: 소설 제목: 미드 라이너는 황무지에 있다, 챕터 1: 제1장 (장면: 코어 점화, 주인공 등장) (Shift+Enter 줄바꿈)';
                $chatInput.focus();
                addLog('info', '[메시지 전송] 입력창 활성화');
            }

            // 전송 버튼 활성화
            if ($chatSendBtn) {
                $chatSendBtn.disabled = false;
                addLog('info', '[메시지 전송] 전송 버튼 활성화');
            }
        }
    }

    // 이벤트 리스너
    if ($chatSendBtn) {
        $chatSendBtn.addEventListener('click', () => {
            // 전송 중이면 무시
            if (isMessageSending) {
                addLog('warn', '[이벤트] 전송 버튼 클릭 무시 (전송 중)');
                return;
            }
            addLog('info', '[이벤트] 전송 버튼 클릭');
            sendMessage();
        });
    }

    if ($chatInput) {
        $chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                // 입력창이 비활성화되어 있거나 전송 중이면 전송하지 않음
                if ($chatInput.disabled || isMessageSending) {
                    e.preventDefault();
                    addLog('warn', '[이벤트] Enter 키 입력 무시 (전송 중)');
                    return;
                }
                addLog('info', '[이벤트] Enter 키 입력 (전송)');
                e.preventDefault();
                sendMessage();
            } else if (e.key === 'Enter' && e.shiftKey) {
                addLog('info', '[이벤트] Shift+Enter 키 입력 (줄바꿈)');
            }
        });

        $chatInput.addEventListener('input', function() {
            addLog('info', `[이벤트] 입력창 입력: ${this.value.length}자`);
        });

        // 포커스 시 자동 높이 조절
        $chatInput.addEventListener('focus', function() {
            addLog('info', '[이벤트] 입력창 포커스');
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });

        $chatInput.addEventListener('blur', function() {
            addLog('info', '[이벤트] 입력창 포커스 해제');
        });
    }

    if ($chatClearBtn) {
        $chatClearBtn.addEventListener('click', () => {
            addLog('info', '[이벤트] 대화 지우기 버튼 클릭');
            if (!$mainContent) return;
            if (confirm('대화 기록을 모두 지우시겠습니까?')) {
                addLog('info', '[대화 지우기] 확인됨 - 대화 기록 삭제');
                $mainContent.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">📖</div>
                        <div class="welcome-text">N/B Novel AI에 오신 것을 환영합니다!</div>
                        <div class="welcome-desc">소설 구성 목록(챕터, 장면) 작성을 시작하거나 기존 소설을 불러오세요.</div>
                    </div>
                `;
                currentMessages = [];
            } else {
                addLog('info', '[대화 지우기] 취소됨');
            }
        });
    }

    // 새 대화 생성
    if ($newNovelBtn) {
        $newNovelBtn.addEventListener('click', () => {
            addLog('info', '[이벤트] 새 소설 버튼 클릭');
            currentConversationId = null;
            currentMessages = [];
            conversationStep = 'initial';
            
            if ($mainContent) {
                $mainContent.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">📖</div>
                        <div class="welcome-text">새 소설 구성 목록을 시작합니다</div>
                        <div class="welcome-desc">소설 제목, 챕터, 장면 목록을 대화로 작성하세요.</div>
                    </div>
                `;
                addLog('info', '[새 소설] 화면 초기화');
            }
            
            // 목록에서 active 제거
            if ($novelList) {
                $novelList.querySelectorAll('.conv-item').forEach(item => {
                    item.classList.remove('active');
                });
            }
            addLog('info', '[새 소설] 목록에서 active 상태 제거');
        });
    }

    // 트리형 목록 검색/필터링 알고리즘
    function filterTreeItems(query) {
        if (!$novelList) return;
        
        const queryLower = query.toLowerCase().trim();
        if (!queryLower) {
            // 검색어가 없으면 모든 항목 표시
            $novelList.querySelectorAll('.tree-novel-item, .tree-chapter-item, .tree-scene-item, .conv-item').forEach(item => {
                item.style.display = '';
            });
            return;
        }
        
        let visibleCount = 0;
        let hiddenCount = 0;
        
        // 소설 항목 검색
        $novelList.querySelectorAll('.tree-novel-item').forEach(novelItem => {
            const novelTitle = novelItem.querySelector('.tree-title')?.textContent.toLowerCase() || '';
            const novelMeta = novelItem.querySelector('.tree-meta')?.textContent.toLowerCase() || '';
            
            const matches = novelTitle.includes(queryLower) || novelMeta.includes(queryLower);
            
            if (matches) {
                novelItem.style.display = '';
                novelItem.classList.add('search-match');
                visibleCount++;
                
                // 매칭되는 소설의 챕터도 표시
                novelItem.querySelectorAll('.tree-chapter-item').forEach(chapterItem => {
                    chapterItem.style.display = '';
                });
            } else {
                // 소설이 매칭되지 않으면, 하위 챕터/장면 확인
                let hasMatchingChild = false;
                novelItem.querySelectorAll('.tree-chapter-item').forEach(chapterItem => {
                    const chapterTitle = chapterItem.querySelector('.tree-title')?.textContent.toLowerCase() || '';
                    const chapterPreview = chapterItem.querySelector('.tree-preview')?.textContent.toLowerCase() || '';
                    
                    if (chapterTitle.includes(queryLower) || chapterPreview.includes(queryLower)) {
                        hasMatchingChild = true;
                        chapterItem.style.display = '';
                        chapterItem.classList.add('search-match');
                        
                        // 매칭되는 챕터의 장면도 표시
                        chapterItem.querySelectorAll('.tree-scene-item').forEach(sceneItem => {
                            sceneItem.style.display = '';
                        });
                        visibleCount++;
                    } else {
                        // 챕터가 매칭되지 않으면, 하위 장면 확인
                        let hasMatchingScene = false;
                        chapterItem.querySelectorAll('.tree-scene-item').forEach(sceneItem => {
                            const sceneTitle = sceneItem.querySelector('.tree-title')?.textContent.toLowerCase() || '';
                            const scenePreview = sceneItem.querySelector('.tree-preview')?.textContent.toLowerCase() || '';
                            
                            if (sceneTitle.includes(queryLower) || scenePreview.includes(queryLower)) {
                                hasMatchingScene = true;
                                sceneItem.style.display = '';
                                sceneItem.classList.add('search-match');
                                visibleCount++;
                            } else {
                                sceneItem.style.display = 'none';
                                hiddenCount++;
                            }
                        });
                        
                        if (hasMatchingScene) {
                            chapterItem.style.display = '';
                            hasMatchingChild = true;
                        } else {
                            chapterItem.style.display = 'none';
                            hiddenCount++;
                        }
                    }
                });
                
                if (hasMatchingChild) {
                    novelItem.style.display = '';
                    novelItem.classList.add('search-match');
                } else {
                    novelItem.style.display = 'none';
                    hiddenCount++;
                }
            }
        });
        
        // 대화 목록 검색
        $novelList.querySelectorAll('.conv-item').forEach(item => {
            const title = item.querySelector('.conv-title')?.textContent.toLowerCase() || '';
            const preview = item.querySelector('.conv-preview')?.textContent.toLowerCase() || '';
            const bitInfo = item.querySelector('.conv-bit-info')?.textContent.toLowerCase() || '';
            
            if (title.includes(queryLower) || preview.includes(queryLower) || bitInfo.includes(queryLower)) {
                item.style.display = '';
                item.classList.add('search-match');
                visibleCount++;
            } else {
                item.style.display = 'none';
                item.classList.remove('search-match');
                hiddenCount++;
            }
        });
        
        addLog('info', `[검색] 필터링 완료: "${queryLower}" - ${visibleCount}개 표시, ${hiddenCount}개 숨김`);
    }
    
    // 소설 검색
    if ($listSearch) {
        let searchTimer = null;
        $listSearch.addEventListener('input', (e) => {
            const query = e.target.value;
            addLog('info', `[검색] 입력: "${query}"`);
            
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                filterTreeItems(query);
            }, 300);
        });
        
        // 검색어 초기화 시 모든 항목 표시
        $listSearch.addEventListener('focus', () => {
            addLog('info', '[이벤트] 검색창 포커스');
        });
        
        $listSearch.addEventListener('blur', () => {
            if (!$listSearch.value.trim()) {
                // 검색어가 비어있으면 매칭 클래스 제거
                $novelList.querySelectorAll('.search-match').forEach(item => {
                    item.classList.remove('search-match');
                });
            }
            addLog('info', '[이벤트] 검색창 포커스 해제');
        });
    }
    
    // 트리 목록 실시간 갱신
    async function refreshNovelTree() {
        addLog('info', '[트리 목록] 갱신 시작');
        await loadServerNovels();
        await renderConversationList();
        addLog('info', '[트리 목록] 갱신 완료');
    }

    // 대화 목록 아이템 클릭
    if ($novelList) {
        $novelList.addEventListener('click', (e) => {
            const item = e.target.closest('.conv-item');
            if (!item || e.target.classList.contains('conv-action-btn')) return;

            const convId = item.dataset.convId;
            addLog('info', `[이벤트] 대화 항목 클릭: ${convId || '새 대화'}`);
            
            if (!convId) {
                // 새 대화
                addLog('info', '[대화 선택] 새 대화 선택');
                currentConversationId = null;
                currentMessages = [];
                if ($mainContent) {
                    $mainContent.innerHTML = `
                        <div class="welcome-message">
                            <div class="welcome-icon">📖</div>
                            <div class="welcome-text">N/B Novel AI에 오신 것을 환영합니다!</div>
                            <div class="welcome-desc">소설 작성을 시작하거나 기존 소설을 불러오세요.</div>
                        </div>
                    `;
                }
                return;
            }

            // 활성 상태 변경
            addLog('info', `[대화 선택] 활성 상태 변경: ${convId}`);
            $novelList.querySelectorAll('.conv-item').forEach(i => {
                i.classList.remove('active');
            });
            item.classList.add('active');

            // 대화 로드
            const conversation = conversations.find(c => c.id === convId);
            if (conversation) {
                addLog('info', `[대화 로드] 시작: ${conversation.title || '제목 없음'} (${conversation.messages.length}개 메시지)`);
                currentConversationId = convId;
                currentMessages = conversation.messages || [];
                
                // 단계 정보 복원 제거 (일반 채팅 모드)
                
                if ($mainContent) {
                    $mainContent.innerHTML = '';
                    conversation.messages.forEach((msg, idx) => {
                        addLog('info', `[대화 로드] 메시지 ${idx + 1}/${conversation.messages.length}: ${msg.role} - ${msg.text.substring(0, 30)}...`);
                        appendMessage(msg.role, msg.text, true);
                    });
                    addLog('info', `[대화 로드] 완료: ${conversation.messages.length}개 메시지 표시`);
                }
            } else {
                addLog('error', `[대화 로드] 대화를 찾을 수 없음: ${convId}`);
            }
        });

        // 삭제 버튼 클릭
        $novelList.addEventListener('click', (e) => {
            if (e.target.classList.contains('conv-action-btn') || e.target.closest('.conv-action-btn')) {
                e.stopPropagation();
                const item = e.target.closest('.conv-item');
                if (!item) return;
                
                const convId = item.dataset.convId;
                if (!convId) return;

                addLog('info', `[이벤트] 삭제 버튼 클릭: ${convId}`);
                
                if (confirm('이 소설을 삭제하시겠습니까?')) {
                    addLog('info', `[대화 삭제] 확인됨: ${convId}`);
                    const beforeCount = conversations.length;
                    conversations = conversations.filter(c => c.id !== convId);
                    const afterCount = conversations.length;
                    
                    try {
                        localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations));
                        addLog('info', `[대화 삭제] 로컬 스토리지 업데이트: ${beforeCount}개 → ${afterCount}개`);
                    } catch (e) {
                        addLog('error', `[대화 삭제] 로컬 스토리지 업데이트 실패: ${e.message || e}`);
                    }
                    
                    renderConversationList();
                    
                    if (currentConversationId === convId) {
                        addLog('info', '[대화 삭제] 현재 대화 삭제됨 - 화면 초기화');
                        currentConversationId = null;
                        currentMessages = [];
                        if ($mainContent) {
                            $mainContent.innerHTML = `
                                <div class="welcome-message">
                                    <div class="welcome-icon">📖</div>
                                    <div class="welcome-text">N/B Novel AI에 오신 것을 환영합니다!</div>
                                    <div class="welcome-desc">소설 작성을 시작하거나 기존 소설을 불러오세요.</div>
                                </div>
                            `;
                        }
                    }
                } else {
                    addLog('info', '[대화 삭제] 취소됨');
                }
            }
        });
    }



    // 로그 시스템
    const $logContainer = document.getElementById('logContainer');
    const $toggleLogBtn = document.getElementById('toggleLogBtn');
    const $clearLogBtn = document.getElementById('clearLogBtn');
    const $logWrapper = document.getElementById('topLogWrapper') || document.querySelector('.log-container-wrapper');
    const $topLogResizeHandle = document.getElementById('topLogResizeHandle');
    const MAX_LOG_ENTRIES = 50;

    function addLog(type, ...args) {
        if (!$logContainer) return;
        
        const ts = new Date().toLocaleTimeString();
        const full = args.map(a => {
            try {
                return typeof a === 'object' ? JSON.stringify(a) : String(a);
            } catch {
                return String(a);
            }
        }).join(' ');

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.setAttribute('data-type', type);
        entry.setAttribute('data-timestamp', ts);
        entry.setAttribute('data-full-message', full);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${ts}]`;

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-message';
        msgSpan.textContent = full.length > 100 ? full.substring(0, 97) + '...' : full;

        entry.appendChild(timeSpan);
        entry.appendChild(msgSpan);

        // 상세 내용 모달
        entry.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            const dlg = document.createElement('div');
            dlg.className = 'modal-dialog modal-lg';
            const content = document.createElement('div');
            content.className = 'modal-content';
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.innerHTML = `<h5 class="modal-title">로그 상세 내용</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button>`;
            const body = document.createElement('div');
            body.className = 'modal-body';
            const pre = document.createElement('pre');
            pre.style.cssText = 'max-height:400px;overflow-y:auto;white-space:pre-wrap;font-size:0.75rem;';
            pre.textContent = full;
            body.appendChild(pre);
            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            const close = document.createElement('button');
            close.className = 'btn btn-secondary';
            close.setAttribute('data-bs-dismiss', 'modal');
            close.textContent = '닫기';
            footer.appendChild(close);
            content.appendChild(header);
            content.appendChild(body);
            content.appendChild(footer);
            dlg.appendChild(content);
            modal.appendChild(dlg);
            document.body.appendChild(modal);
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
            modal.addEventListener('hidden.bs.modal', () => {
                document.body.removeChild(modal);
            });
        });

        const first = $logContainer.firstChild;
        if (first) {
            $logContainer.insertBefore(entry, first);
        } else {
            $logContainer.appendChild(entry);
        }

        const all = $logContainer.querySelectorAll('.log-entry');
        if (all.length > MAX_LOG_ENTRIES) {
            const oldest = all[all.length - 1];
            if (oldest && oldest.parentNode) {
                oldest.parentNode.removeChild(oldest);
            }
        }
    }

    // Console 인터셉션
    (function() {
        const origLog = console.log;
        const origErr = console.error;
        const origWarn = console.warn;
        const origInfo = console.info;

        console.log = function(...args) {
            try { addLog('message', ...args); } catch {}
            origLog.apply(console, args);
        };

        console.error = function(...args) {
            try { addLog('error', ...args); } catch {}
            origErr.apply(console, args);
        };

        console.warn = function(...args) {
            try { addLog('warn', ...args); } catch {}
            origWarn.apply(console, args);
        };

        console.info = function(...args) {
            try { addLog('info', ...args); } catch {}
            origInfo.apply(console, args);
        };
    })();

    // 전역 에러 핸들러
    window.addEventListener('error', (e) => {
        try {
            const msg = e && e.message ? e.message : 'Unknown error';
            const loc = e && e.filename ? `${e.filename}:${e.lineno || ''}:${e.colno || ''}` : '';
            const stack = e && e.error && e.error.stack ? e.error.stack : '';
            addLog('error', '[onerror]', msg, loc, stack);
        } catch {}
    });

    window.addEventListener('unhandledrejection', (e) => {
        try {
            const reason = e && e.reason ? String(e.reason) : 'Unhandled rejection';
            addLog('error', '[unhandledrejection]', reason);
        } catch {}
    });

    // Fetch 인터셉션
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const method = args[0] instanceof Request ? args[0].method : (args[1]?.method || 'GET');
        const fetchId = Math.random().toString(36).substring(2, 8);
        
        addLog('info', `[Fetch Start ${fetchId}] ${method} ${url}`);
        
        try {
            const response = await originalFetch(...args);
            addLog('info', `[Fetch End ${fetchId}] ${method} ${url} - Status: ${response.status}`);
            return response;
        } catch (error) {
            addLog('error', `[Fetch Error ${fetchId}] ${method} ${url} - ${error.message}`);
            throw error;
        }
    };

    // 로그 토글
    // 상단 로그 높이 저장 함수
    const saveTopLogHeight = () => {
        if ($logWrapper && !$logWrapper.classList.contains('collapsed')) {
            localStorage.setItem('topLogHeight', $logWrapper.offsetHeight.toString());
        }
    };
    
    if ($toggleLogBtn && $logWrapper) {
        $toggleLogBtn.addEventListener('click', () => {
            $logWrapper.classList.toggle('collapsed');
            $toggleLogBtn.textContent = $logWrapper.classList.contains('collapsed') ? '▼' : '▲';
            // 닫힐 때 높이 저장
            if (!$logWrapper.classList.contains('collapsed')) {
                // 저장된 높이 불러오기
                const savedTopHeight = localStorage.getItem('topLogHeight');
                if (savedTopHeight) {
                    const height = parseInt(savedTopHeight, 10);
                    if (height >= 40 && height <= window.innerHeight * 0.8) {
                        $logWrapper.style.height = height + 'px';
                    }
                }
            } else {
                saveTopLogHeight();
            }
        });
    }

    // 로그 지우기
    if ($clearLogBtn && $logContainer) {
        $clearLogBtn.addEventListener('click', () => {
            if (confirm('모든 로그를 지우시겠습니까?')) {
                $logContainer.innerHTML = '';
                addLog('info', '로그가 지워졌습니다.');
            }
        });
    }
    
    // 상단 로그 높이 저장 및 불러오기
    const TOP_LOG_HEIGHT_KEY = 'topLogHeight';
    if ($logWrapper) {
        // 저장된 높이 불러오기
        const savedTopHeight = localStorage.getItem(TOP_LOG_HEIGHT_KEY);
        if (savedTopHeight && !$logWrapper.classList.contains('collapsed')) {
            const height = parseInt(savedTopHeight, 10);
            if (height >= 40 && height <= window.innerHeight * 0.8) {
                $logWrapper.style.height = height + 'px';
            }
        }
        
        // 상단 로그 리사이즈 핸들
        if ($topLogResizeHandle && $logWrapper) {
            let isResizing = false;
            
            $topLogResizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                const startY = e.clientY;
                const startHeight = $logWrapper.offsetHeight;
                
                const doResize = (e) => {
                    if (!isResizing) return;
                    const deltaY = e.clientY - startY;
                    const newHeight = Math.max(40, Math.min(window.innerHeight * 0.8, startHeight + deltaY));
                    $logWrapper.style.height = newHeight + 'px';
                };
                
                const stopResize = () => {
                    isResizing = false;
                    saveTopLogHeight();
                    document.removeEventListener('mousemove', doResize);
                    document.removeEventListener('mouseup', stopResize);
                };
                
                document.addEventListener('mousemove', doResize);
                document.addEventListener('mouseup', stopResize);
            });
        }
    }

    // 하단 로그 시스템
    const $bottomLogLeftContainer = document.getElementById('bottomLogLeftContainer');
    const $bottomLogRightContainer = document.getElementById('bottomLogRightContainer');
    const $toggleBottomLogBtn = document.getElementById('toggleBottomLogBtn');
    const $clearBottomLogBtn = document.getElementById('clearBottomLogBtn');
    const $clearLeftLogBtn = document.getElementById('clearLeftLogBtn');
    const $clearRightLogBtn = document.getElementById('clearRightLogBtn');
    const $bottomLogWrapper = document.getElementById('bottomLogWrapper') || document.querySelector('.bottom-log-container-wrapper');
    const $bottomLogResizeHandle = document.getElementById('bottomLogResizeHandle');
    const MAX_BOTTOM_LOG_ENTRIES = 50;

    // 하단 로그 함수 (공통 함수)
    function createBottomLogEntry(type, ...args) {
        const ts = new Date().toLocaleTimeString();
        const full = args.map(a => {
            try {
                return typeof a === 'object' ? JSON.stringify(a) : String(a);
            } catch {
                return String(a);
            }
        }).join(' ');

        const entry = document.createElement('div');
        entry.className = 'bottom-log-entry';
        entry.setAttribute('data-type', type);
        entry.setAttribute('data-timestamp', ts);
        entry.setAttribute('data-full-message', full);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'bottom-log-time';
        timeSpan.textContent = `[${ts}]`;

        const msgSpan = document.createElement('span');
        msgSpan.className = 'bottom-log-message';
        msgSpan.textContent = full.length > 100 ? full.substring(0, 97) + '...' : full;

        entry.appendChild(timeSpan);
        entry.appendChild(msgSpan);

        // 상세 내용 모달
        entry.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            const dlg = document.createElement('div');
            dlg.className = 'modal-dialog modal-lg';
            const content = document.createElement('div');
            content.className = 'modal-content';
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.innerHTML = `<h5 class="modal-title">하단 로그 상세</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button>`;
            const body = document.createElement('div');
            body.className = 'modal-body';
            body.innerHTML = `<pre>${full}</pre>`;
            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            const close = document.createElement('button');
            close.className = 'btn btn-secondary';
            close.setAttribute('data-bs-dismiss', 'modal');
            close.textContent = '닫기';
            footer.appendChild(close);
            content.appendChild(header);
            content.appendChild(body);
            content.appendChild(footer);
            dlg.appendChild(content);
            modal.appendChild(dlg);
            document.body.appendChild(modal);
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
            modal.addEventListener('hidden.bs.modal', () => {
                document.body.removeChild(modal);
            });
        });

        return entry;
    }

    // 로그를 컨테이너에 추가하는 함수
    function addLogToContainer($container, entry) {
        if (!$container) return;

        const first = $container.firstChild;
        if (first) {
            $container.insertBefore(entry, first);
        } else {
            $container.appendChild(entry);
        }

        const all = $container.querySelectorAll('.bottom-log-entry');
        if (all.length > MAX_BOTTOM_LOG_ENTRIES) {
            const oldest = all[all.length - 1];
            if (oldest && oldest.parentNode) {
                oldest.parentNode.removeChild(oldest);
            }
        }
    }

    // 좌측 로그 함수
    function addLeftBottomLog(type, ...args) {
        const entry = createBottomLogEntry(type, ...args);
        addLogToContainer($bottomLogLeftContainer, entry);
    }

    // 우측 로그 함수
    function addRightBottomLog(type, ...args) {
        const entry = createBottomLogEntry(type, ...args);
        addLogToContainer($bottomLogRightContainer, entry);
    }

    // 전역으로 노출
    window.addLeftLog = addLeftBottomLog;
    window.addRightLog = addRightBottomLog;

    // 하단 로그 높이 저장 함수
    const saveBottomLogHeight = () => {
        if ($bottomLogWrapper && !$bottomLogWrapper.classList.contains('collapsed')) {
            localStorage.setItem('bottomLogHeight', $bottomLogWrapper.offsetHeight.toString());
        }
    };
    
    // 하단 로그 토글
    if ($toggleBottomLogBtn && $bottomLogWrapper) {
        $toggleBottomLogBtn.addEventListener('click', () => {
            $bottomLogWrapper.classList.toggle('collapsed');
            $toggleBottomLogBtn.textContent = $bottomLogWrapper.classList.contains('collapsed') ? '▼' : '▲';
            if (!$bottomLogWrapper.classList.contains('collapsed')) {
                // 저장된 높이 불러오기
                const savedBottomHeight = localStorage.getItem('bottomLogHeight');
                if (savedBottomHeight) {
                    const height = parseInt(savedBottomHeight, 10);
                    if (height >= 40 && height <= window.innerHeight * 0.8) {
                        $bottomLogWrapper.style.height = height + 'px';
                    }
                }
            } else {
                saveBottomLogHeight();
            }
        });
    }
    
    // 하단 로그 높이 저장 및 불러오기
    if ($bottomLogWrapper) {
        // 저장된 높이 불러오기
        const savedBottomHeight = localStorage.getItem('bottomLogHeight');
        if (savedBottomHeight && !$bottomLogWrapper.classList.contains('collapsed')) {
            const height = parseInt(savedBottomHeight, 10);
            if (height >= 40 && height <= window.innerHeight * 0.8) {
                $bottomLogWrapper.style.height = height + 'px';
            }
        }
        
        // 하단 로그 리사이즈 핸들
        if ($bottomLogResizeHandle && $bottomLogWrapper) {
            let isResizing = false;
            
            $bottomLogResizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                const startY = e.clientY;
                const startHeight = $bottomLogWrapper.offsetHeight;
                
                const doResize = (e) => {
                    if (!isResizing) return;
                    const deltaY = startY - e.clientY; // 하단은 반대 방향
                    const newHeight = Math.max(40, Math.min(window.innerHeight * 0.8, startHeight + deltaY));
                    $bottomLogWrapper.style.height = newHeight + 'px';
                };
                
                const stopResize = () => {
                    isResizing = false;
                    saveBottomLogHeight();
                    document.removeEventListener('mousemove', doResize);
                    document.removeEventListener('mouseup', stopResize);
                };
                
                document.addEventListener('mousemove', doResize);
                document.addEventListener('mouseup', stopResize);
            });
        }
    }

    // 하단 로그 지우기 (전체)
    if ($clearBottomLogBtn) {
        $clearBottomLogBtn.addEventListener('click', () => {
            if (confirm('하단 로그를 모두 지우시겠습니까?')) {
                if ($bottomLogLeftContainer) $bottomLogLeftContainer.innerHTML = '';
                if ($bottomLogRightContainer) $bottomLogRightContainer.innerHTML = '';
            }
        });
    }

    // 좌측 로그 지우기
    if ($clearLeftLogBtn && $bottomLogLeftContainer) {
        $clearLeftLogBtn.addEventListener('click', () => {
            $bottomLogLeftContainer.innerHTML = '';
        });
    }

    // 우측 로그 지우기
    if ($clearRightLogBtn && $bottomLogRightContainer) {
        $clearRightLogBtn.addEventListener('click', () => {
            $bottomLogRightContainer.innerHTML = '';
        });
    }

    // 초기화
    loadConversations();
    
    // 서버 소설 목록 초기 로드
    loadServerNovels().catch(err => {
        addLog('error', `[서버 소설 목록] 초기 로드 실패: ${err.message}`);
    });

    console.info('[N/B Novel AI] 초기화 완료');
});

