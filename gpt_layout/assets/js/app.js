document.addEventListener('DOMContentLoaded', () => {
    console.info('[Louis GPT] 초기화 중...');

    const $chatMessages = document.getElementById('chatMessages');
    const $chatInput = document.getElementById('chatInput');
    const $chatSendBtn = document.getElementById('chatSendBtn');
    const $chatClearBtn = document.getElementById('chatClearBtn');
    const $chatModel = document.getElementById('chatModel');
    const $newChatBtn = document.getElementById('newChatBtn');
    const $listSearch = document.getElementById('listSearch');
    const $convList = document.getElementById('convList');

    // 자동 높이 조절
    if ($chatInput) {
        $chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }

    // 메시지 추가
    function appendMessage(role, text) {
        if (!$chatMessages) return;

        // 환영 메시지 제거
        const welcomeMsg = $chatMessages.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        // 아바타
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? 'U' : 'AI';

        // 메시지 컨텐츠
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = text;

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        contentDiv.appendChild(bubble);
        contentDiv.appendChild(time);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        $chatMessages.appendChild(messageDiv);
        
        // 스크롤
        setTimeout(() => {
            $chatMessages.scrollTop = $chatMessages.scrollHeight;
        }, 100);
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

    // 메시지 전송
    async function sendMessage() {
        const text = ($chatInput && $chatInput.value || '').trim();
        if (!text) return;

        appendMessage('user', text);
        
        if ($chatInput) {
            $chatInput.value = '';
            $chatInput.style.height = 'auto';
        }

        if ($chatSendBtn) {
            $chatSendBtn.disabled = true;
        }

        // GPT API 호출
        const model = ($chatModel && $chatModel.value) || (window.API_CONFIG?.defaultModel || 'gpt-4o');
        const defaultParams = window.API_CONFIG?.defaultParams || { temperature: 0.7, maxTokens: 2000 };
        
        try {
            const url = getServerUrl('/api/gpt/chat');
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: text,
                    model: model,
                    temperature: defaultParams.temperature,
                    maxTokens: defaultParams.maxTokens,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(errorText || `HTTP ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.ok) {
                throw new Error(data.error || 'GPT 응답 오류');
            }

            const responseText = (data.response || '').trim();
            appendMessage('assistant', responseText || '응답이 비어있습니다.');
        } catch (error) {
            console.error('메시지 전송 오류:', error);
            const errorMsg = error.message || '오류가 발생했습니다.';
            
            // API 키 미설정 오류인 경우 안내 메시지
            if (errorMsg.includes('API key') || errorMsg.includes('key')) {
                appendMessage('assistant', `❌ API 키가 설정되지 않았습니다.\n\n서버에서 /api/gpt/key 엔드포인트를 통해 OpenAI API 키를 설정해주세요.`);
            } else {
                appendMessage('assistant', `❌ 오류: ${errorMsg}\n\n서버 연결을 확인하고 다시 시도해주세요.`);
            }
        } finally {
            if ($chatSendBtn) $chatSendBtn.disabled = false;
        }
    }

    // 이벤트 리스너
    if ($chatSendBtn) {
        $chatSendBtn.addEventListener('click', sendMessage);
    }

    if ($chatInput) {
        $chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // 포커스 시 자동 높이 조절
        $chatInput.addEventListener('focus', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }

    if ($chatClearBtn) {
        $chatClearBtn.addEventListener('click', () => {
            if (!$chatMessages) return;
            if (confirm('대화 기록을 모두 지우시겠습니까?')) {
                $chatMessages.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">💬</div>
                        <div class="welcome-text">안녕하세요! 무엇을 도와드릴까요?</div>
                    </div>
                `;
            }
        });
    }

    // 새 대화 생성
    if ($newChatBtn) {
        $newChatBtn.addEventListener('click', () => {
            // TODO: 새 대화 생성 로직
            console.log('새 대화 생성');
            
            // 현재 대화를 목록에 추가하는 로직 필요
            // 지금은 단순히 채팅 영역만 초기화
            if ($chatMessages) {
                $chatMessages.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">💬</div>
                        <div class="welcome-text">새 대화를 시작합니다.</div>
                    </div>
                `;
            }
        });
    }

    // 대화 검색
    if ($listSearch) {
        $listSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = $convList.querySelectorAll('.conv-item');
            
            items.forEach(item => {
                const title = item.querySelector('.conv-title')?.textContent.toLowerCase() || '';
                const preview = item.querySelector('.conv-preview')?.textContent.toLowerCase() || '';
                
                if (title.includes(query) || preview.includes(query)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // 대화 목록 아이템 클릭
    if ($convList) {
        $convList.addEventListener('click', (e) => {
            const item = e.target.closest('.conv-item');
            if (!item) return;

            // 활성 상태 변경
            $convList.querySelectorAll('.conv-item').forEach(i => {
                i.classList.remove('active');
            });
            item.classList.add('active');

            // TODO: 해당 대화 로드
            console.log('대화 로드:', item.querySelector('.conv-title')?.textContent);
        });

        // 삭제 버튼 클릭
        $convList.addEventListener('click', (e) => {
            if (e.target.classList.contains('conv-action-btn') || e.target.closest('.conv-action-btn')) {
                e.stopPropagation();
                const item = e.target.closest('.conv-item');
                if (!item) return;

                if (confirm('이 대화를 삭제하시겠습니까?')) {
                    item.remove();
                }
            }
        });
    }

    console.info('[Louis GPT] 초기화 완료');
});
