/**
 * 메인 애플리케이션 로직
 * 트리 구조 관리, 속성 입력란 동적 생성, 로그 관리
 */

document.addEventListener('DOMContentLoaded', () => {
    console.info('[속성 단위 편집기] 초기화 중...');

    // DOM 요소
    const $novelTree = document.getElementById('novelTree');
    const $novelListTitle = document.getElementById('novelListTitle');
    const $novelListContainer = document.getElementById('novelListContainer');
    const $novelListTopPathInput = document.getElementById('novelListTopPathInput');
    const $attributeInputs = document.getElementById('attributeInputs');
    const $currentPath = document.getElementById('currentPath');
    const $attributeList = document.getElementById('attributeList');
    const $newNovelBtn = document.getElementById('newNovelBtn');
    const $docMenuBtn = document.getElementById('docMenuBtn');
    const $loginInfo = document.getElementById('loginInfo');
    const $userName = document.getElementById('userName');
    const $userBit = document.getElementById('userBit');
    const $currentNovelHeader = document.getElementById('currentNovelHeader');
    const $currentNovelTitle = document.getElementById('currentNovelTitle');
    const $currentNovelGenres = document.getElementById('currentNovelGenres');
    const $novelMenuNav = document.getElementById('novelMenuNav');
    const $logoutBtn = document.getElementById('logoutBtn');
    const $naverLoginBtn = document.getElementById('naverLoginBtn');
    const $userInfo = document.getElementById('userInfo');
    const $loginInfoContainer = document.getElementById('loginInfoContainer');

    // 상태 관리
    let currentNovel = null;
    let currentChapter = null;
    let currentAttribute = null;
    let attributeEditors = new Map(); // 속성명 -> AttributeEditor 인스턴스
    let allAttributes = []; // 서버에서 로드한 모든 속성
    let novelInfoManager = null; // 소설 정보 관리자
    const $novelInfoContainer = document.getElementById('novelInfoContainer');

    // 속성 목록 (기본)
    const DEFAULT_ATTRIBUTES = [
        '줄거리 요약',
        '본문',
        '등장인물',
        '배경',
        '아이템',
        '주요 사건',
        '레벨',
        'BIT 구조',
        '관계도'
    ];

    // 로그 함수 (수동 입력 로그)
    function addLog(type, message) {
        const $logContainer = document.getElementById('manualLogContainer');
        if (!$logContainer) return;
        const timestamp = new Date().toLocaleString('ko-KR');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        $logContainer.insertBefore(logEntry, $logContainer.firstChild);
        
        // 최대 100개 로그만 유지
        while ($logContainer.children.length > 100) {
            $logContainer.removeChild($logContainer.lastChild);
        }
    }
    
    // 최상위 경로 데이터 로그 함수
    function addTopPathLog(type, message) {
        const $logContainer = document.getElementById('topPathLogContainer');
        if (!$logContainer) return;
        const timestamp = new Date().toLocaleString('ko-KR');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        $logContainer.insertBefore(logEntry, $logContainer.firstChild);
        
        // 최대 100개 로그만 유지
        while ($logContainer.children.length > 100) {
            $logContainer.removeChild($logContainer.lastChild);
        }
    }

    // 수동 입력 로그 지우기
    const $clearManualLogBtn = document.getElementById('clearManualLogBtn');
    if ($clearManualLogBtn) {
        $clearManualLogBtn.addEventListener('click', () => {
            const $logContainer = document.getElementById('manualLogContainer');
            if ($logContainer) {
                $logContainer.innerHTML = '';
                addLog('info', '로그가 지워졌습니다.');
            }
        });
    }
    
    // 최상위 경로 데이터 로그 지우기
    const $clearTopPathLogBtn = document.getElementById('clearTopPathLogBtn');
    if ($clearTopPathLogBtn) {
        $clearTopPathLogBtn.addEventListener('click', () => {
            const $logContainer = document.getElementById('topPathLogContainer');
            if ($logContainer) {
                $logContainer.innerHTML = '';
                addTopPathLog('info', '로그가 지워졌습니다.');
            }
        });
    }

    // 초기 로그
    const serverUrl = getServerUrl('');
    addLog('info', `[시스템 준비] 서버 URL: ${serverUrl}`);
    addLog('info', `[시스템 준비] 현재 시간: ${new Date().toLocaleString('ko-KR')}`);
    addLog('info', '[시스템 준비] 모든 기능이 준비되었습니다.');
    
    addTopPathLog('info', `[시스템 준비] 서버 URL: ${serverUrl}`);
    addTopPathLog('info', `[시스템 준비] 현재 시간: ${new Date().toLocaleString('ko-KR')}`);
    addTopPathLog('info', '[시스템 준비] 모든 기능이 준비되었습니다.');

    /**
     * 사용자 정보 업데이트
     */
    function updateUserInfo() {
        const loginInfo = $loginInfo?.value || '';
        if (loginInfo) {
            const parts = loginInfo.split('/');
            const userName = parts[0]?.trim() || '호떡';
            const userIp = parts[1]?.trim() || '';
            
            // displayUserName 업데이트
            const displayUserName = document.getElementById('displayUserName');
            if (displayUserName) {
                displayUserName.textContent = userName;
            }
            
            if ($userName) {
                $userName.textContent = userName;
            }

            // IP BIT 계산 및 표시
            if (userIp && typeof Worker !== 'undefined') {
                const worker = new Worker('../../bit_worker.js');
                worker.onmessage = (e) => {
                    if (e.data.ok) {
                        const bitMax = e.data.max.toFixed(15);
                        const bitMin = e.data.min.toFixed(15);
                        const displayPcIpBitMax = document.getElementById('displayPcIpBitMax');
                        const displayPcIpBitMin = document.getElementById('displayPcIpBitMin');
                        if (displayPcIpBitMax) {
                            displayPcIpBitMax.textContent = bitMax;
                        }
                        if (displayPcIpBitMin) {
                            displayPcIpBitMin.textContent = bitMin;
                        }
                    }
                    worker.terminate();
                };
                worker.onerror = () => {
                    worker.terminate();
                };
                worker.postMessage({ text: userIp });
            }

            // 사용자 BIT 계산 및 표시
            if (loginInfo && typeof Worker !== 'undefined') {
                const worker = new Worker('../../bit_worker.js');
                worker.onmessage = (e) => {
                    if (e.data.ok) {
                        const bitMax = e.data.max.toFixed(15);
                        const bitMin = e.data.min.toFixed(15);
                        if ($userBit) {
                            $userBit.textContent = `사용자 BIT: ${bitMax} / ${bitMin}`;
                        }
                    }
                    worker.terminate();
                };
                worker.onerror = () => {
                    if ($userBit) {
                        $userBit.textContent = '사용자 BIT: 계산 실패';
                    }
                    worker.terminate();
                };
                worker.postMessage({ text: loginInfo });
            }
        }
    }

    /**
     * 현재 소설 정보 헤더 업데이트
     */
    function updateCurrentNovelHeader() {
        if (currentNovel) {
            if ($currentNovelHeader) {
                $currentNovelHeader.style.display = 'block';
            }
            if ($currentNovelTitle) {
                $currentNovelTitle.textContent = currentNovel;
            }
            if ($novelMenuNav) {
                $novelMenuNav.style.display = 'block';
            }

            // 장르 태그는 novelInfoManager에서 가져오기
            if (novelInfoManager && novelInfoManager.novelData) {
                const genres = novelInfoManager.novelData.genreTags || [];
                if ($currentNovelGenres) {
                    if (genres.length > 0) {
                        $currentNovelGenres.innerHTML = genres.map(g => `<span class="badge bg-secondary me-1">${g}</span>`).join('');
                    } else {
                        $currentNovelGenres.textContent = '-';
                    }
                }
            }
        } else {
            if ($currentNovelHeader) {
                $currentNovelHeader.style.display = 'none';
            }
            if ($novelMenuNav) {
                $novelMenuNav.style.display = 'none';
            }
        }
    }

    // 로그인 정보 변경 시 사용자 정보 업데이트
    if ($loginInfo) {
        $loginInfo.addEventListener('input', updateUserInfo);
        $loginInfo.addEventListener('change', updateUserInfo);
    }

    // 메뉴 버튼 클릭 이벤트
    if ($novelMenuNav) {
        $novelMenuNav.addEventListener('click', (e) => {
            if (e.target.dataset.menu) {
                const menu = e.target.dataset.menu;
                
                // 모든 버튼 비활성화
                $novelMenuNav.querySelectorAll('button').forEach(btn => {
                    btn.classList.remove('active');
                    btn.classList.add('btn-outline-secondary');
                    btn.classList.remove('btn-outline-primary');
                });

                // 클릭한 버튼 활성화
                e.target.classList.add('active');
                e.target.classList.remove('btn-outline-secondary');
                e.target.classList.add('btn-outline-primary');

                // 메뉴에 따라 다른 동작
                if (menu === 'info') {
                    // 소설 메인 정보 표시
                    const infoPane = document.getElementById('info-pane');
                    const attributesPane = document.getElementById('attributes-pane');
                    if (infoPane) {
                        infoPane.classList.add('show', 'active');
                    }
                    if (attributesPane) {
                        attributesPane.classList.remove('show', 'active');
                    }
                } else {
                    // 다른 메뉴는 속성 편집 탭으로 이동
                    const infoPane = document.getElementById('info-pane');
                    const attributesPane = document.getElementById('attributes-pane');
                    if (infoPane) {
                        infoPane.classList.remove('show', 'active');
                    }
                    if (attributesPane) {
                        attributesPane.classList.add('show', 'active');
                    }
                }
            }
        });
    }

    /**
     * 네이버 로그인
     */
    function handleNaverLogin() {
        // 서버의 네이버 로그인 API로 리다이렉트 (state에 버전 정보 포함)
        const serverUrl = getServerUrl('/api/auth/naver?state=index&version=v1.0.7');
        window.location.href = serverUrl;
    }

    /**
     * 네이버 로그인 콜백 처리
     */
    function handleNaverLoginCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const userInfo = urlParams.get('userInfo');
        const token = urlParams.get('token');

        if (error) {
            addLog('error', `네이버 로그인 오류: ${decodeURIComponent(error)}`);
            // URL에서 에러 파라미터 제거
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        // 토큰이 있으면 JWT 토큰 방식으로 처리
        if (token) {
            try {
                // 토큰 저장
                localStorage.setItem('authToken', token);
                sessionStorage.setItem('authToken', token);
                
                // 토큰에서 사용자 정보 추출 (JWT 디코딩)
                try {
                    // JWT 토큰 디코딩 (base64url 디코딩)
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        // base64url을 일반 base64로 변환
                        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                        // padding 추가
                        while (base64.length % 4) {
                            base64 += '=';
                        }
                        const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
                        
                        console.log('[OAuth 콜백] 토큰에서 추출한 사용자 정보:', payload);
                        
                        const user = {
                            id: payload.id,
                            email: payload.email || '',
                            nickname: payload.nickname || payload.name || ''
                        };
                        
                        console.log('[OAuth 콜백] 처리된 사용자 정보:', user);
                        
                        // 사용자 정보 저장
                        sessionStorage.setItem('naverUser', JSON.stringify(user));
                        sessionStorage.setItem('loginProvider', 'naver');
                        localStorage.setItem('userInfo', JSON.stringify(user));
                        localStorage.setItem('userNickname', user.nickname || '');
                        
                        // 사용자 정보 표시
                        displayUserInfo(user);

                        addLog('success', `네이버 로그인 성공: ${user.nickname || user.email || user.id}`);
                        
                        // URL에서 파라미터 제거
                        window.history.replaceState({}, document.title, window.location.pathname);
                    } else {
                        console.warn('토큰 형식이 올바르지 않습니다:', token);
                        addLog('error', '토큰 형식이 올바르지 않습니다.');
                    }
                } catch (e) {
                    console.warn('토큰 디코딩 실패, 토큰만 저장:', e);
                    addLog('success', '로그인 토큰이 저장되었습니다.');
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (e) {
                addLog('error', `토큰 처리 오류: ${e.message}`);
            }
            return;
        }

        if (userInfo) {
            try {
                const user = JSON.parse(decodeURIComponent(userInfo));
                // 제공자 정보 확인 (URL 경로 또는 파라미터에서)
                let provider = urlParams.get('provider');
                if (!provider) {
                    // URL 경로에서 provider 추출 시도 (예: /api/auth/naver/callback)
                    const pathMatch = window.location.pathname.match(/\/api\/auth\/(\w+)\/callback/);
                    if (pathMatch) {
                        provider = pathMatch[1];
                    } else {
                        provider = 'naver'; // 기본값은 naver
                    }
                }
                
                // 사용자 정보 저장 (제공자별로 구분)
                sessionStorage.setItem('naverUser', JSON.stringify(user));
                sessionStorage.setItem('loginProvider', provider); // 로그인 제공자 저장
                if (token) {
                    sessionStorage.setItem('authToken', token);
                }
                
                // 사용자 정보 표시
                const userNameDisplay = document.getElementById('userNameDisplay');
                const userEmailDisplay = document.getElementById('userEmailDisplay');
                const displayUserName = document.getElementById('displayUserName');
                
                if (userNameDisplay) {
                    userNameDisplay.textContent = user.nickname || user.name || '호떡';
                }
                if (userEmailDisplay) {
                    userEmailDisplay.textContent = user.email || '';
                }
                if (displayUserName) {
                    displayUserName.textContent = user.nickname || user.name || '호떡';
                }
                if ($userName) {
                    $userName.textContent = user.nickname || user.name || '호떡';
                }
                const userInfoContainer = document.getElementById('userInfoContainer');
                if (userInfoContainer) {
                    userInfoContainer.style.display = 'flex';
                }
                if ($userInfo) {
                    $userInfo.style.display = 'block';
                }
                if ($naverLoginBtn) {
                    $naverLoginBtn.style.display = 'none';
                }
                if ($logoutBtn) {
                    $logoutBtn.style.display = 'block';
                }

                // 로그인 정보 필드에 사용자 정보 설정
                const loginText = `${user.nickname || user.name || '호떡'}/${user.id || ''}`;
                if ($loginInfo) {
                    $loginInfo.value = loginText;
                }

                // 사용자 BIT 계산
                updateUserInfo();

                addLog('success', `네이버 로그인 성공: ${user.nickname || user.name}`);
                
                // URL에서 파라미터 제거
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {
                addLog('error', `사용자 정보 파싱 오류: ${e.message}`);
            }
        }
    }

    /**
     * 로그인 상태 확인
     */
    function checkLoginStatus() {
        // 먼저 토큰에서 사용자 정보 확인
        const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
        if (token) {
            try {
                // JWT 토큰 디코딩 (base64url 디코딩)
                const parts = token.split('.');
                if (parts.length === 3) {
                    // base64url을 일반 base64로 변환
                    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    // padding 추가
                    while (base64.length % 4) {
                        base64 += '=';
                    }
                    // UTF-8 디코딩을 위한 안전한 방법
                    const binaryString = atob(base64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const decoder = new TextDecoder('utf-8');
                    const jsonString = decoder.decode(bytes);
                    const payload = JSON.parse(jsonString);
                    
                    console.log('[로그인 상태] 토큰에서 추출한 사용자 정보:', payload);
                    
                    const user = {
                        id: payload.id,
                        email: payload.email || '',
                        nickname: payload.nickname || payload.name || ''
                    };
                    
                    console.log('[로그인 상태] 처리된 사용자 정보:', user);
                    
                    // sessionStorage에 사용자 정보 저장 (항상 업데이트)
                    sessionStorage.setItem('naverUser', JSON.stringify(user));
                    sessionStorage.setItem('loginProvider', 'naver');
                    
                    // 사용자 정보 표시
                    displayUserInfo(user);
                    return;
                }
            } catch (e) {
                console.error('토큰에서 사용자 정보 추출 실패:', e);
                console.error('토큰:', token);
            }
        }
        
        // 토큰이 없으면 sessionStorage에서 확인
        const naverUser = sessionStorage.getItem('naverUser');
        if (naverUser) {
            try {
                const user = JSON.parse(naverUser);
                console.log('[로그인 상태] sessionStorage에서 사용자 정보:', user);
                displayUserInfo(user);
            } catch (e) {
                console.error('로그인 상태 확인 오류:', e);
                addLog('error', `로그인 상태 확인 오류: ${e.message}`);
            }
        }
    }
    
    /**
     * 사용자 정보 표시
     */
    function displayUserInfo(user) {
                const userNameDisplay = document.getElementById('userNameDisplay');
                const userEmailDisplay = document.getElementById('userEmailDisplay');
                const displayUserName = document.getElementById('displayUserName');
                
        const nickname = user.nickname || user.name || '';
        const email = user.email || '';
        
        // 닉네임만 표시 (이메일은 별도로만 표시)
                if (userNameDisplay) {
            userNameDisplay.textContent = nickname || '호떡';
                }
                if (userEmailDisplay) {
            // 이메일이 실제 이메일인 경우만 표시 (oauth.local 제외)
            if (email && !email.includes('@oauth.local')) {
                userEmailDisplay.textContent = email;
            } else {
                userEmailDisplay.textContent = '';
            }
                }
                if (displayUserName) {
            displayUserName.textContent = nickname || '호떡';
                }
                if ($userName) {
            $userName.textContent = nickname || '호떡';
                }
                const userInfoContainer = document.getElementById('userInfoContainer');
                if (userInfoContainer) {
                    userInfoContainer.style.display = 'flex';
                }
                if ($userInfo) {
                    $userInfo.style.display = 'block';
                }
                if ($naverLoginBtn) {
                    $naverLoginBtn.style.display = 'none';
                }
                if ($logoutBtn) {
                    $logoutBtn.style.display = 'block';
                }

        // 로그인 정보에는 닉네임만 사용 (이메일 제외)
        const loginText = `${nickname || '호떡'}/${user.id || ''}`;
                if ($loginInfo) {
                    $loginInfo.value = loginText;
                }

                updateUserInfo();
    }

    // 네이버 로그인 버튼
    if ($naverLoginBtn) {
        $naverLoginBtn.addEventListener('click', handleNaverLogin);
    }

    // 로그아웃 버튼
    if ($logoutBtn) {
        $logoutBtn.addEventListener('click', () => {
            // 모든 로그인 정보 제거
            sessionStorage.removeItem('naverUser');
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('loginProvider');
            localStorage.removeItem('authToken');
            localStorage.removeItem('userInfo');
            localStorage.removeItem('userNickname');
            
            // UI 초기화
            if ($loginInfo) {
                $loginInfo.value = '';
            }
            if ($userName) {
                $userName.textContent = '호떡';
            }
            if ($userBit) {
                $userBit.textContent = '사용자 BIT: 계산 중...';
            }
            const userInfoContainer = document.getElementById('userInfoContainer');
            if (userInfoContainer) {
                userInfoContainer.style.display = 'none';
            }
            if ($userInfo) {
                $userInfo.style.display = 'none';
            }
            if ($naverLoginBtn) {
                $naverLoginBtn.style.display = 'block';
            }
            if ($logoutBtn) {
                $logoutBtn.style.display = 'none';
            }
            const userNameDisplay = document.getElementById('userNameDisplay');
            const userEmailDisplay = document.getElementById('userEmailDisplay');
            const displayUserName = document.getElementById('displayUserName');
            if (userNameDisplay) {
                userNameDisplay.textContent = '';
            }
            if (userEmailDisplay) {
                userEmailDisplay.textContent = '';
            }
            if (displayUserName) {
                displayUserName.textContent = '-';
            }
            currentNovel = null;
            currentChapter = null;
            updateCurrentNovelHeader();
            if ($novelInfoContainer) {
                $novelInfoContainer.innerHTML = '<div class="text-muted text-center py-5">소설을 선택하면 메인 정보가 표시됩니다.</div>';
            }
            addLog('info', '로그아웃되었습니다.');
            
            // 페이지 새로고침하여 완전히 초기화
            setTimeout(() => {
                window.location.reload();
            }, 500);
        });
    }

    // 페이지 로드 시 네이버 로그인 콜백 처리
    handleNaverLoginCallback();
    checkLoginStatus();

    // 초기 사용자 정보 업데이트
    updateUserInfo();

    // 키 설정 모달 제어
    (function() {
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const saveGptKeyBtn = document.getElementById('saveGptKeyBtn');
        const saveOAuthConfigBtn = document.getElementById('saveOAuthConfigBtn');
        const gptApiKeyInput = document.getElementById('gptApiKeyInput');
        const settingsBtn = document.getElementById('settingsBtn');
        
        // 설정 모달 열기
        function openSettingsModal() {
            if (settingsModal) {
                settingsModal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
                loadSettings();
            }
        }
        
        // 설정 모달 닫기
        function closeSettingsModalFunc() {
            if (settingsModal) {
                settingsModal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }
        
        // 설정 불러오기
        async function loadSettings() {
            const baseUrl = getServerUrl('');
            
            // GPT API 키 불러오기
            try {
                const gptResponse = await fetch(`${baseUrl}/api/gpt/key`);
                if (gptResponse.ok) {
                    const gptData = await gptResponse.json();
                    if (gptData.ok && gptData.apiKey && gptApiKeyInput) {
                        gptApiKeyInput.value = gptData.apiKey;
                    }
                }
            } catch (e) {
                addLog('error', `GPT API 키 불러오기 오류: ${e.message}`);
            }
            
            // OAuth 설정 불러오기
            try {
                const oauthResponse = await fetch(`${baseUrl}/api/auth/config`);
                if (oauthResponse.ok) {
                    const oauthData = await oauthResponse.json();
                    if (oauthData.ok && oauthData.config) {
                        const cfg = oauthData.config;
                        
                        // Naver
                        const naverClientId = document.getElementById('naverClientId');
                        const naverClientSecret = document.getElementById('naverClientSecret');
                        const naverRedirectUri = document.getElementById('naverRedirectUri');
                        if (naverClientId && cfg.naver) {
                            naverClientId.value = cfg.naver.clientId || '';
                            if (naverClientSecret) {
                                naverClientSecret.value = cfg.naver.clientSecret || '';
                            }
                            if (naverRedirectUri) {
                                naverRedirectUri.value = cfg.naver.redirectUri || 'http://127.0.0.1:8123/api/auth/naver/callback';
                            }
                        }
                    }
                }
            } catch (e) {
                addLog('error', `OAuth 설정 불러오기 오류: ${e.message}`);
            }
        }
        
        // GPT API 키 저장
        async function saveGptKey() {
            if (!gptApiKeyInput) return;
            
            const apiKey = gptApiKeyInput.value.trim();
            if (!apiKey) {
                addLog('error', 'API 키를 입력해주세요.');
                return;
            }
            
            const baseUrl = getServerUrl('');
            
            try {
                const response = await fetch(`${baseUrl}/api/gpt/key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.ok) {
                        addLog('success', 'GPT API 키가 저장되었습니다.');
                    } else {
                        addLog('error', `저장 실패: ${data.error || '알 수 없는 오류'}`);
                    }
                } else {
                    addLog('error', '저장 실패: 서버 오류');
                }
            } catch (e) {
                addLog('error', `GPT API 키 저장 오류: ${e.message}`);
            }
        }
        
        // OAuth 설정 저장
        async function saveOAuthConfig() {
            const baseUrl = getServerUrl('');
            
            const naverClientId = document.getElementById('naverClientId')?.value.trim() || '';
            const naverClientSecret = document.getElementById('naverClientSecret')?.value.trim() || '';
            const naverRedirectUri = document.getElementById('naverRedirectUri')?.value.trim() || '';
            
            const payload = {
                naver: {
                    clientId: naverClientId,
                    clientSecret: naverClientSecret,
                    redirectUri: naverRedirectUri || 'http://127.0.0.1:8123/api/auth/naver/callback'
                }
            };
            
            try {
                const response = await fetch(`${baseUrl}/api/auth/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.ok) {
                        addLog('success', 'OAuth 설정이 저장되었습니다.');
                    } else {
                        addLog('error', `저장 실패: ${data.error || '알 수 없는 오류'}`);
                    }
                } else {
                    addLog('error', '저장 실패: 서버 오류');
                }
            } catch (e) {
                addLog('error', `OAuth 설정 저장 오류: ${e.message}`);
            }
        }
        
        // 이벤트 리스너
        if (closeSettingsModal) {
            closeSettingsModal.addEventListener('click', closeSettingsModalFunc);
        }
        
        if (settingsModal) {
            settingsModal.addEventListener('click', function(e) {
                if (e.target === settingsModal) {
                    closeSettingsModalFunc();
                }
            });
        }
        
        if (saveGptKeyBtn) {
            saveGptKeyBtn.addEventListener('click', saveGptKey);
        }
        
        if (saveOAuthConfigBtn) {
            saveOAuthConfigBtn.addEventListener('click', saveOAuthConfig);
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettingsModal);
        }
        
        // ESC 키로 모달 닫기
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && settingsModal && settingsModal.style.display === 'flex') {
                closeSettingsModalFunc();
            }
        });
        
        // 전역 함수로 노출
        window.openSettingsModal = openSettingsModal;
    })();

    /**
     * 속성 경로 생성
     */
    function buildAttributePath(attributeName) {
        const parts = [];
        if (currentNovel) {
            parts.push(currentNovel);
        }
        if (currentChapter) {
            parts.push(currentChapter);
        }
        if (attributeName) {
            parts.push(attributeName);
        }
        return parts.join(' → ');
    }

    /**
     * 현재 경로 업데이트
     */
    function updateCurrentPath() {
        if ($currentPath) {
            const path = buildAttributePath('');
            $currentPath.innerHTML = `<small>경로: ${path || '선택된 항목이 없습니다.'}</small>`;
        }
    }

    /**
     * 소설 목록 로드 (서버에서)
     */
    async function loadNovels() {
        try {
            addLog('info', '[소설 목록] 로드 시작...');
            const url = getServerUrl('/api/attributes/all');
            addLog('info', `[API 호출] URL: ${url}`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                addLog('error', `[API 오류] HTTP ${response.status} ${response.statusText}`);
                if (errorText) {
                    addLog('error', `[API 오류 상세] ${errorText.substring(0, 200)}`);
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            addLog('info', `[API 응답] 속성 개수: ${data.attributes?.length || 0}개`);
            
            if (data.ok && data.attributes) {
                allAttributes = data.attributes;
                
                // 속성에서 소설 구조 추출
                const novelMap = new Map();
                
                // "네이버 닉네임 → 호떡" 같은 최상위 경로는 제외하고 처리
                // 실제 소설 제목은 3개 이상의 경로에서 추출하거나, 최상위 경로의 데이터에서 추출
                const topPathAttributes = new Map(); // 최상위 경로 속성 저장
                
                for (const attr of data.attributes) {
                    const attrText = (attr.text || '').trim();
                    if (!attrText || !attrText.includes(' → ')) continue;
                    
                    const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                    if (parts.length < 2) continue;
                    
                    // "네이버 닉네임 → 호떡" 같은 최상위 경로는 별도 저장
                    if (parts.length === 2 && (parts[0] === '네이버 닉네임' || parts[1] === '호떡')) {
                        topPathAttributes.set(attrText, attr);
                        continue; // 최상위 경로는 소설 제목이 아님
                    }
                    
                    // 소설 제목 추출
                    let novelTitle = '';
                    let chapterPart = '';
                    
                    // 챕터 패턴 찾기
                    let chapterIndex = -1;
                    for (let i = 0; i < parts.length; i++) {
                        if (parts[i].match(/챕터\s*\d+/i)) {
                            chapterIndex = i;
                            break;
                        }
                    }
                    
                    if (chapterIndex >= 0) {
                        // 챕터가 있으면 챕터 앞 부분이 소설 제목
                        if (chapterIndex > 0) {
                            novelTitle = parts[chapterIndex - 1];
                        } else {
                            novelTitle = parts[0];
                        }
                        chapterPart = parts[chapterIndex];
                    } else {
                        // 챕터가 없으면 마지막 부분이 소설 제목
                        if (parts.length >= 3) {
                            // 3개 이상이면 마지막이 소설 제목
                            novelTitle = parts[parts.length - 1];
                        } else if (parts.length === 2) {
                            // 2개면 두 번째가 소설 제목
                            novelTitle = parts[1];
                        } else {
                            novelTitle = parts[0];
                        }
                    }
                    
                    // "네이버 닉네임", "호떡"은 소설 제목이 아님
                    if (novelTitle === '네이버 닉네임' || novelTitle === '호떡') {
                        continue;
                    }
                    
                    // 소설 제목이 있으면 추가
                    if (novelTitle) {
                        if (!novelMap.has(novelTitle)) {
                            // 일반 속성 경로에서 찾은 소설은 MAX 폴더로 간주
                            novelMap.set(novelTitle, {
                                title: novelTitle,
                                chapters: new Map(),
                                bitMax: 0,
                                bitMin: 0,
                                folderType: 'MAX'
                            });
                        }
                        
                        const novel = novelMap.get(novelTitle);
                        const chapterMatch = chapterPart.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                        if (chapterMatch) {
                            const chapterNum = chapterMatch[1];
                            const chapterTitle = chapterMatch[2] || `제${chapterNum}장`;
                            const chapterKey = `챕터 ${chapterNum}`;
                            
                            if (!novel.chapters.has(chapterKey)) {
                                novel.chapters.set(chapterKey, {
                                    number: chapterNum,
                                    title: chapterTitle
                                });
                            }
                        }
                    }
                }
                
                // 최상위 경로의 데이터를 BIT 값으로 조회하여 모든 소설 제목 찾기
                for (const [topPath, topAttr] of topPathAttributes) {
                    try {
                        addLog('info', `[소설 목록] 최상위 경로 데이터 조회: ${topPath}`);
                        const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${topAttr.bitMax}&bitMin=${topAttr.bitMin}&limit=1000`);
                        const dataResponse = await fetch(dataUrl);
                        if (dataResponse.ok) {
                            const dataResult = await dataResponse.json();
                            if (dataResult.ok && dataResult.items && dataResult.items.length > 0) {
                                addLog('info', `[소설 목록] 최상위 경로 데이터 개수: ${dataResult.items.length}개`);
                                
                                // 모든 데이터에서 소설 제목 찾기 (첫 번째만이 아닌 모든 데이터)
                                const foundNovels = new Set(); // 중복 제거용
                                for (const item of dataResult.items) {
                                    const dataText = (item.data?.text || item.s || '').trim();
                                    // 데이터 텍스트가 속성 경로와 다르고, "→"가 없으면 소설 제목으로 간주
                                    if (dataText && dataText !== topPath && !dataText.includes(' → ')) {
                                        const novelTitle = dataText;
                                        
                                        // 중복 제거
                                        if (!foundNovels.has(novelTitle)) {
                                            foundNovels.add(novelTitle);
                                            
                                            if (!novelMap.has(novelTitle)) {
                                                // 소설 정보에 BIT 값과 폴더 정보 저장
                                                const sourcePath = (item.source?.file || '').toLowerCase();
                                                const isMaxFolder = sourcePath.includes('/max/') || sourcePath.includes('\\max\\') || sourcePath.includes('/max_bit/') || sourcePath.includes('\\max_bit\\') || !sourcePath;
                                                const folderType = isMaxFolder ? 'MAX' : 'MIN';
                                                
                                                novelMap.set(novelTitle, {
                                                    title: novelTitle,
                                                    chapters: new Map(),
                                                    bitMax: item.data?.bitMax || item.max || 0,
                                                    bitMin: item.data?.bitMin || item.min || 0,
                                                    folderType: folderType
                                                });
                                                addLog('info', `[소설 목록] 소설 추가: ${novelTitle} (${folderType}, BIT: ${item.data?.bitMax || item.max || 0})`);
                                            }
                                            
                                            // 해당 소설의 챕터 찾기
                                            const novel = novelMap.get(novelTitle);
                                            for (const otherAttr of data.attributes) {
                                                const otherText = (otherAttr.text || '').trim();
                                                // "네이버 닉네임 → 호떡 → [소설제목] → 챕터" 형식 찾기
                                                if (otherText.includes(topPath + ' → ' + novelTitle + ' → ')) {
                                                    const otherParts = otherText.split(' → ').map(p => p.trim()).filter(Boolean);
                                                    for (const part of otherParts) {
                                                        const chapterMatch = part.match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                                                        if (chapterMatch) {
                                                            const chapterNum = chapterMatch[1];
                                                            const chapterTitle = chapterMatch[2] || `제${chapterNum}장`;
                                                            const chapterKey = `챕터 ${chapterNum}`;
                                                            
                                                            if (!novel.chapters.has(chapterKey)) {
                                                                novel.chapters.set(chapterKey, {
                                                                    number: chapterNum,
                                                                    title: chapterTitle
                                                                });
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('[소설 목록] 최상위 경로 데이터 조회 실패:', topPath, error);
                        addLog('warning', `[소설 목록] 최상위 경로 데이터 조회 실패: ${topPath} - ${error.message}`);
                    }
                }
                
                // 추가로 모든 속성 경로에서 소설 제목 추출 (누락 방지)
                // 단, 이미 최상위 경로 데이터에서 찾은 소설은 제외
                addLog('info', `[소설 목록] 속성 경로에서 소설 추출 중...`);
                const alreadyFoundNovels = new Set(Array.from(novelMap.keys())); // 이미 찾은 소설 목록
                
                for (const attr of data.attributes) {
                    const attrText = (attr.text || '').trim();
                    if (!attrText || !attrText.includes(' → ')) continue;
                    
                    const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
                    if (parts.length < 3) continue; // 3개 이상인 경우만
                    
                    // "네이버 닉네임 → 호떡 → [소설제목]" 형식에서 소설 제목 추출
                    if (parts.length >= 3 && parts[0] === '네이버 닉네임' && parts[1] === '호떡') {
                        const novelTitle = parts[2];
                        
                        // "네이버 닉네임", "호떡"이 아닌 경우만 추가
                        // 이미 최상위 경로 데이터에서 찾은 소설은 제외 (중복 방지)
                        if (novelTitle && novelTitle !== '네이버 닉네임' && novelTitle !== '호떡' && !alreadyFoundNovels.has(novelTitle)) {
                            if (!novelMap.has(novelTitle)) {
                                // 속성 경로에서 찾은 소설은 MAX 폴더로 간주 (기본값)
                                novelMap.set(novelTitle, {
                                    title: novelTitle,
                                    chapters: new Map(),
                                    bitMax: 0, // 속성 경로에서는 BIT 값이 없을 수 있음
                                    bitMin: 0,
                                    folderType: 'MAX'
                                });
                                addLog('info', `[소설 목록] 속성 경로에서 소설 추가: ${novelTitle}`);
                            }
                            
                            // 챕터 정보 추가
                            const novel = novelMap.get(novelTitle);
                            for (let i = 3; i < parts.length; i++) {
                                const chapterMatch = parts[i].match(/챕터\s*(\d+)(?:\s*[:：]\s*(.+))?/i);
                                if (chapterMatch) {
                                    const chapterNum = chapterMatch[1];
                                    const chapterTitle = chapterMatch[2] || `제${chapterNum}장`;
                                    const chapterKey = `챕터 ${chapterNum}`;
                                    
                                    if (!novel.chapters.has(chapterKey)) {
                                        novel.chapters.set(chapterKey, {
                                            number: chapterNum,
                                            title: chapterTitle
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                
                // 최종 중복 제거 및 정렬 (같은 제목의 소설이 여러 번 추가되지 않도록)
                const finalNovelMap = new Map();
                const seenTitles = new Set(); // 정확한 제목 중복 체크
                
                for (const [title, novel] of novelMap) {
                    const trimmedTitle = title.trim();
                    
                    // 정확한 제목으로 중복 체크 (대소문자 구분)
                    if (!seenTitles.has(trimmedTitle)) {
                        seenTitles.add(trimmedTitle);
                        finalNovelMap.set(trimmedTitle, novel);
                    } else {
                        // 이미 있는 경우 챕터 정보만 병합
                        const existingNovel = finalNovelMap.get(trimmedTitle);
                        for (const [chapterKey, chapter] of novel.chapters) {
                            if (!existingNovel.chapters.has(chapterKey)) {
                                existingNovel.chapters.set(chapterKey, chapter);
                            }
                        }
                    }
                }
                
                // 소설 제목으로 정렬 (가나다순)
                const finalNovels = Array.from(finalNovelMap.values()).sort((a, b) => {
                    return a.title.localeCompare(b.title, 'ko');
                });
                
                // 트리 렌더링 (최종 중복 제거된 목록)
                renderNovelTree(finalNovels);
                addLog('success', `[소설 목록] 로드 완료: ${finalNovels.length}개 소설 (MAX 폴더만, 중복 제거됨)`);
            } else {
                addLog('info', '[소설 목록] 저장된 소설 없음');
                $novelTree.innerHTML = '<div class="text-muted small">저장된 소설이 없습니다.</div>';
            }
        } catch (error) {
            addLog('error', `[소설 목록] 로드 오류: ${error.message}`);
            console.error('소설 목록 로드 오류:', error);
        }
    }

    /**
     * 소설 트리 렌더링
     */
    function renderNovelTree(novels) {
        if (!$novelTree) return;
        
        if (novels.length === 0) {
            $novelTree.innerHTML = '<div class="text-muted small">저장된 소설이 없습니다.</div>';
            return;
        }

        const html = novels.map(novel => {
            const chapters = Array.from(novel.chapters.values());
            const chaptersHtml = chapters.map(ch => {
                return `
                    <div class="tree-item-children">
                        <div class="tree-item" data-novel="${novel.title}" data-chapter="${ch.number}">
                            <span class="tree-toggle">📄</span>
                            챕터 ${ch.number}: ${ch.title}
                        </div>
                    </div>
                `;
            }).join('');
            
            // BIT 값 표시 (있는 경우)
            const bitInfo = (novel.bitMax && novel.bitMin) 
                ? ` <span style="color: #7d88c7; font-size: 0.75rem; margin-left: 0.5rem;">[${novel.folderType || 'MAX'}] BIT: ${novel.bitMax.toFixed(6)} / ${novel.bitMin.toFixed(6)}</span>`
                : ` <span style="color: #7d88c7; font-size: 0.75rem; margin-left: 0.5rem;">[${novel.folderType || 'MAX'}]</span>`;
            
            return `
                <div class="tree-item" data-novel="${novel.title}">
                    <span class="tree-toggle">📁</span>
                    ${novel.title}${bitInfo}
                </div>
                ${chaptersHtml}
            `;
        }).join('');

        $novelTree.innerHTML = html;

        // 클릭 이벤트
        $novelTree.querySelectorAll('.tree-item').forEach(item => {
            // 클릭 이벤트
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const novelTitle = item.dataset.novel;
                const chapterNum = item.dataset.chapter;
                
                if (novelTitle) {
                    if (chapterNum) {
                        // 챕터 선택
                        currentNovel = novelTitle;
                        currentChapter = `챕터 ${chapterNum}`;
                        addLog('info', `[선택] 챕터: ${currentNovel} → ${currentChapter}`);
                        
                        // 속성 편집 탭으로 전환
                        const attributesTab = document.getElementById('attributes-tab');
                        if (attributesTab) {
                            const tab = new bootstrap.Tab(attributesTab);
                            tab.show();
                        }
                        
                        updateCurrentPath();
                        renderAttributeInputs();
                    } else {
                        // 소설 선택
                        currentNovel = novelTitle;
                        currentChapter = null;
                        addLog('info', `[선택] 소설: ${currentNovel}`);
                        
                        // 소설 메인 정보 탭으로 전환
                        const infoTab = document.getElementById('info-tab');
                        if (infoTab) {
                            const tab = new bootstrap.Tab(infoTab);
                            tab.show();
                        }
                        
                        // 소설 정보 로드 및 표시
                        loadNovelInfo();
                        updateCurrentNovelHeader();
                    }
                    
                    // 활성화 표시
                    $novelTree.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                }
            });
            
            // 마우스 다운 시 피드백
            item.addEventListener('mousedown', (e) => {
                item.style.transform = 'translateX(2px)';
                item.style.opacity = '0.9';
            });
            
            item.addEventListener('mouseup', (e) => {
                item.style.transform = '';
                item.style.opacity = '';
            });
            
            item.addEventListener('mouseleave', (e) => {
                item.style.transform = '';
                item.style.opacity = '';
            });
        });
    }

    /**
     * 속성 입력란 렌더링
     */
    function renderAttributeInputs() {
        if (!$attributeInputs) return;
        
        if (!currentNovel) {
            $attributeInputs.innerHTML = '<div class="text-muted text-center py-5">소설을 선택하세요.</div>';
            return;
        }

        // 기본 속성 목록 + 프롤로그 (챕터가 없을 때)
        const attributesToShow = currentChapter ? DEFAULT_ATTRIBUTES : ['프롤로그', ...DEFAULT_ATTRIBUTES];
        
        // 기존 에디터 정리
        attributeEditors.clear();
        
        // 속성 입력란 생성 (비동기)
        $attributeInputs.innerHTML = '<div class="text-center py-3"><div class="spinner-border" role="status"></div> <span class="ms-2">속성 입력란 생성 중...</span></div>';
        
        // 각 속성에 대해 에디터 생성 및 데이터 로드
        const editorPromises = attributesToShow.map(async (attrName) => {
            const attributePath = buildAttributePath(attrName);
            const editor = new AttributeEditor(attrName, attributePath, handleSave, addLog);
            attributeEditors.set(attrName, editor);
            
            // 데이터 로드
            await editor.loadData();
            
            return editor.createInputElement();
        });
        
        Promise.all(editorPromises).then(elements => {
            $attributeInputs.innerHTML = '';
            elements.forEach(element => {
                $attributeInputs.appendChild(element);
            });
            addLog('success', `[속성 입력란] ${attributesToShow.length}개 생성 완료`);
        }).catch(error => {
            addLog('error', `[속성 입력란] 생성 오류: ${error.message}`);
            $attributeInputs.innerHTML = '<div class="alert alert-danger">속성 입력란 생성 중 오류가 발생했습니다.</div>';
        });
    }

    /**
     * 저장 핸들러
     */
    async function handleSave(editor) {
        // 저장은 AttributeEditor에서 처리
        addLog('info', `[저장 요청] ${editor.attributeName}`);
    }

    /**
     * 새 소설 생성
     */
    (function() {
        const cancelNewNovelBtn = document.getElementById('cancelNewNovelBtn');
        const createNovelBtn = document.getElementById('createNovelBtn');
        const newNovelTitleInput = document.getElementById('newNovelTitleInput');
        const newNovelAttributePathInput = document.getElementById('newNovelAttributePathInput');
        const newNovelTopPathInput = document.getElementById('newNovelTopPathInput');
        const newNovelTopDataInput = document.getElementById('newNovelTopDataInput');
        const newNovelTopMaxOutput = document.getElementById('newNovelTopMaxOutput');
        const newNovelTopMinOutput = document.getElementById('newNovelTopMinOutput');
        const newNovelAttributePathDisplay = document.getElementById('newNovelAttributePathDisplay');
        const newNovelAttributeDataInput = document.getElementById('newNovelAttributeDataInput');
        const newNovelAttributeMaxOutput = document.getElementById('newNovelAttributeMaxOutput');
        const newNovelAttributeMinOutput = document.getElementById('newNovelAttributeMinOutput');
        const newNovelResultContent = document.getElementById('newNovelResultContent');
        const newNovelPane = document.getElementById('newNovel-pane');
        const infoPane = document.getElementById('info-pane');
        const attributesPane = document.getElementById('attributes-pane');
        
        // 최상위 경로 추출 함수
        function extractTopPath(attributePath) {
            if (!attributePath || !attributePath.trim()) {
                return '';
            }
            let trimmedPath = attributePath.trim();
            
            // 끝에 화살표가 있으면 그 이전까지가 최상위 경로
            if (trimmedPath.endsWith(' → ')) {
                // "네이버 닉네임 → 호떡 → " -> "네이버 닉네임 → 호떡"
                return trimmedPath.slice(0, -3).trim();
            } else if (trimmedPath.endsWith('→')) {
                // "네이버 닉네임 → 호떡→" -> "네이버 닉네임 → 호떡"
                return trimmedPath.slice(0, -1).trim();
            }
            
            // 끝에 화살표가 없으면 마지막 부분을 제거
            const parts = trimmedPath.split(' → ').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                // 마지막 부분을 제거하여 최상위 경로 생성
                return parts.slice(0, -1).join(' → ');
            }
            return '';
        }
        
        // BIT 계산 함수 (최상위 경로용)
        async function calculateBitForTopPath(topPath) {
            if (!topPath || !topPath.trim()) {
                if (newNovelTopMaxOutput) newNovelTopMaxOutput.textContent = '-';
                if (newNovelTopMinOutput) newNovelTopMinOutput.textContent = '-';
                return Promise.resolve(null);
            }
            
            try {
                // novel_ai_shared.js의 calculateBitValues 함수 사용 (우선)
                const Shared = window.NovelAIShared;
                if (Shared && Shared.calculateBitValues) {
                    const bits = Shared.calculateBitValues(topPath.trim());
                    if (bits && bits.max !== undefined && bits.min !== undefined) {
                        if (newNovelTopMaxOutput) {
                            // 소수점 제한 없이 전체 정밀도로 표시
                            newNovelTopMaxOutput.textContent = String(bits.max);
                        }
                        if (newNovelTopMinOutput) {
                            // 소수점 제한 없이 전체 정밀도로 표시
                            newNovelTopMinOutput.textContent = String(bits.min);
                        }
                        return Promise.resolve({ max: bits.max, min: bits.min });
                    }
                }
                
                // fallback: Web Worker 사용
                if (typeof Worker !== 'undefined' && window.BitWorker) {
                    return new Promise((resolve) => {
                        const worker = new window.BitWorker();
                        worker.postMessage({ text: topPath.trim() });
                        worker.onmessage = (e) => {
                            const { max, min } = e.data;
                            if (newNovelTopMaxOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelTopMaxOutput.textContent = String(max);
                            }
                            if (newNovelTopMinOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelTopMinOutput.textContent = String(min);
                            }
                            resolve({ max, min });
                        };
                        worker.onerror = () => {
                            if (newNovelTopMaxOutput) newNovelTopMaxOutput.textContent = '-';
                            if (newNovelTopMinOutput) newNovelTopMinOutput.textContent = '-';
                            resolve(null);
                        };
                    });
                } else {
                    // fallback: 서버 API 사용
                    const baseUrl = getServerUrl('');
                    const response = await fetch(`${baseUrl}/api/attributes/data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            attributeText: topPath.trim(),
                            text: '',
                            novelTitle: ''
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.ok && data.attributeBit) {
                            const max = data.attributeBit.max || 0;
                            const min = data.attributeBit.min || 0;
                            if (newNovelTopMaxOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelTopMaxOutput.textContent = String(max);
                            }
                            if (newNovelTopMinOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelTopMinOutput.textContent = String(min);
                            }
                            return Promise.resolve({ max, min });
                        }
                    }
                }
            } catch (e) {
                console.error('[BIT 계산] 오류:', e);
                addTopPathLog('error', `BIT 계산 오류: ${e.message}`);
                if (newNovelTopMaxOutput) newNovelTopMaxOutput.textContent = '-';
                if (newNovelTopMinOutput) newNovelTopMinOutput.textContent = '-';
                return Promise.resolve(null);
            }
            
            if (newNovelTopMaxOutput) newNovelTopMaxOutput.textContent = '-';
            if (newNovelTopMinOutput) newNovelTopMinOutput.textContent = '-';
            return Promise.resolve(null);
        }
        
        // BIT 계산 함수 (속성 경로용)
        async function calculateBitForAttributePath(attributePath) {
            if (!attributePath || !attributePath.trim()) {
                if (newNovelAttributeMaxOutput) newNovelAttributeMaxOutput.textContent = '-';
                if (newNovelAttributeMinOutput) newNovelAttributeMinOutput.textContent = '-';
                return null;
            }
            
            try {
                // novel_ai_shared.js의 calculateBitValues 함수 사용 (우선)
                const Shared = window.NovelAIShared;
                if (Shared && Shared.calculateBitValues) {
                    const bits = Shared.calculateBitValues(attributePath.trim());
                    if (bits && bits.max !== undefined && bits.min !== undefined) {
                        if (newNovelAttributeMaxOutput) {
                            // 소수점 제한 없이 전체 정밀도로 표시
                            newNovelAttributeMaxOutput.textContent = String(bits.max);
                        }
                        if (newNovelAttributeMinOutput) {
                            // 소수점 제한 없이 전체 정밀도로 표시
                            newNovelAttributeMinOutput.textContent = String(bits.min);
                        }
                        console.log('[BIT 계산] 완료:', { max: bits.max, min: bits.min, path: attributePath });
                        return { max: bits.max, min: bits.min };
                    }
                }
                
                // fallback: Web Worker 사용
                if (typeof Worker !== 'undefined' && window.BitWorker) {
                    return new Promise((resolve) => {
                        const worker = new window.BitWorker();
                        worker.postMessage({ text: attributePath.trim() });
                        worker.onmessage = (e) => {
                            const { max, min } = e.data;
                            if (newNovelAttributeMaxOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMaxOutput.textContent = String(max);
                            }
                            if (newNovelAttributeMinOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMinOutput.textContent = String(min);
                            }
                            resolve({ max, min });
                        };
                        worker.onerror = () => {
                            if (newNovelAttributeMaxOutput) newNovelAttributeMaxOutput.textContent = '-';
                            if (newNovelAttributeMinOutput) newNovelAttributeMinOutput.textContent = '-';
                            resolve(null);
                        };
                    });
                } else {
                    // fallback: 서버 API 사용
                    const baseUrl = getServerUrl('');
                    const response = await fetch(`${baseUrl}/api/attributes/data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            attributeText: attributePath.trim(),
                            text: '',
                            novelTitle: ''
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.ok && data.attributeBit) {
                            const max = data.attributeBit.max || 0;
                            const min = data.attributeBit.min || 0;
                            if (newNovelAttributeMaxOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMaxOutput.textContent = String(max);
                            }
                            if (newNovelAttributeMinOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMinOutput.textContent = String(min);
                            }
                            return { max, min };
                        }
                    }
                }
            } catch (e) {
                console.error('[BIT 계산] 오류:', e);
                addLog('error', `BIT 계산 오류: ${e.message}`);
            }
            
            if (newNovelAttributeMaxOutput) newNovelAttributeMaxOutput.textContent = '-';
            if (newNovelAttributeMinOutput) newNovelAttributeMinOutput.textContent = '-';
            return null;
        }
        
        // 새 소설 만들기 화면 표시
        function showNewNovelPane() {
            if (newNovelPane) {
                newNovelPane.classList.add('show', 'active');
            }
            if (infoPane) {
                infoPane.classList.remove('show', 'active');
            }
            if (attributesPane) {
                attributesPane.classList.remove('show', 'active');
            }
            if (newNovelTitleInput) {
                newNovelTitleInput.value = '';
            }
            if (newNovelAttributePathInput) {
                // 로그인한 경우 제공자 닉네임으로 초기값 설정
                const loginInfo = getLoginInfo();
                if (loginInfo) {
                    // 로그인한 경우: "제공자 닉네임 → 호떡 → " 형식
                    newNovelAttributePathInput.value = `${loginInfo.fullName} → 호떡 → `;
                } else {
                    // 로그인하지 않은 경우: "호떡 → " 형식
                    newNovelAttributePathInput.value = '호떡 → ';
                }
            }
            if (newNovelTopPathInput) {
                newNovelTopPathInput.value = '';
            }
            if (newNovelTopDataInput) {
                newNovelTopDataInput.value = '';
            }
            if (newNovelTopMaxOutput) {
                newNovelTopMaxOutput.textContent = '-';
            }
            if (newNovelTopMinOutput) {
                newNovelTopMinOutput.textContent = '-';
            }
            if (newNovelAttributePathDisplay) {
                newNovelAttributePathDisplay.value = '';
            }
            if (newNovelAttributeDataInput) {
                newNovelAttributeDataInput.value = '';
            }
            if (newNovelAttributeMaxOutput) {
                newNovelAttributeMaxOutput.textContent = '-';
            }
            if (newNovelAttributeMinOutput) {
                newNovelAttributeMinOutput.textContent = '-';
            }
            if (newNovelResultContent) {
                newNovelResultContent.textContent = '소설 정보를 입력하고 생성 버튼을 누르면 저장 정보가 표시됩니다.';
            }
            setTimeout(() => {
                if (newNovelTitleInput) newNovelTitleInput.focus();
            }, 100);
        }
        
        // 소설 목록 관리 패널 표시
        function showNovelListPane() {
            const novelListPane = document.getElementById('novel-list-pane');
            if (novelListPane) {
                novelListPane.style.display = 'block';
                novelListPane.classList.add('show', 'active');
            }
            if (newNovelPane) {
                newNovelPane.classList.remove('show', 'active');
            }
            if (infoPane) {
                infoPane.classList.remove('show', 'active');
            }
            if (attributesPane) {
                attributesPane.classList.remove('show', 'active');
            }
            const docPane = document.getElementById('doc-pane');
            if (docPane) {
                docPane.style.display = 'none';
                docPane.classList.remove('show', 'active');
            }
            // 소설 목록 자동 로드 (약간의 지연을 두어 DOM이 완전히 렌더링된 후 실행)
            setTimeout(() => {
                // 입력 필드를 다시 찾아서 자동으로 값 설정
                const inputField = document.getElementById('novelListTopPathInput');
                if (inputField) {
                    const loginInfo = getLoginInfo();
                    if (loginInfo && loginInfo.nickname && loginInfo.nickname.trim()) {
                        const providerName = loginInfo.provider || '네이버';
                        const autoPath = `${providerName} 닉네임 → ${loginInfo.nickname} →`;
                        inputField.value = autoPath;
                        console.log('[소설 목록 관리] 자동 입력:', autoPath);
                    } else {
                        // 로그인 정보가 없거나 닉네임이 없으면 기본값 설정
                        inputField.value = '네이버 닉네임 → 호떡 → ';
                        console.log('[소설 목록 관리] 기본값 입력 (로그인 정보 없음)');
                    }
                }
                loadNovelListForManagement();
            }, 200);
        }
        
        // 소설 목록 관리용 로드 (최상위 경로 입력 필드 사용) - 전역 스코프로 노출
        let isLoadingNovelList = false; // 무한 루프 방지 플래그
        // 폴더 파일 목록 로드 함수
        // topAttrBitMax/Min: 최상위 경로 BIT (폴더 찾기용)
        // attrPathBitMax/Min: 각 소설의 속성 경로 BIT (필터링용)
        // dataBitMax/Min: 각 소설의 데이터 BIT (필터링용)
        // dataText: 각 소설의 데이터 텍스트 (정확한 매칭용)
        async function loadFolderFiles(topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, dataText, container) {
            try {
                console.log('[파일 목록 로드] 시작:', { topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, dataText });
                
                // 개별 소설 카드인 경우 (속성 경로 BIT와 데이터 BIT가 모두 제공된 경우) 새 API 사용
                let url;
                if (attrPathBitMax && attrPathBitMin && dataBitMax && dataBitMin) {
                    // 새 API: 속성 경로 BIT와 데이터 BIT로 필터링, dataText로 정확한 매칭
                    url = getServerUrl(`/api/attributes/files/by-novel?attributePathBitMax=${attrPathBitMax}&attributePathBitMin=${attrPathBitMin}&dataBitMax=${dataBitMax}&dataBitMin=${dataBitMin}`);
                    if (topAttrBitMax && topAttrBitMin) {
                        url += `&topAttributeBitMax=${topAttrBitMax}&topAttributeBitMin=${topAttrBitMin}`;
                    }
                    if (dataText) {
                        url += `&dataText=${encodeURIComponent(dataText)}`;
                    }
                } else {
                    // 상위 속성 경로 뷰: 모든 파일 표시
                    url = getServerUrl(`/api/attributes/files?attributeBitMax=${topAttrBitMax}&attributeBitMin=${topAttrBitMin}`);
                }
                console.log('[파일 목록 로드] URL:', url);
                const response = await fetch(url);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[파일 목록 로드] HTTP 오류:', response.status, errorText);
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const data = await response.json();
                console.log('[파일 목록 로드] 응답:', data);
                
                if (data.ok && data.files) {
                    let html = '';
                    
                    // MAX 파일 목록
                    if (data.files.max && data.files.max.length > 0) {
                        html += '<div class="novel-card-folder-path-item">';
                        html += '<div class="novel-card-folder-path-label">MAX:</div>';
                        html += '<div class="novel-card-folder-path-file-list">';
                        data.files.max.forEach((file) => {
                            const escapedUrl = file.url.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            html += `<div style="margin: 2px 0;"><a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="novel-card-folder-path-link" title="클릭하여 새 창에서 파일 열기">${file.name}</a></div>`;
                        });
                        html += '</div></div>';
                    }
                    
                    // MIN 파일 목록
                    if (data.files.min && data.files.min.length > 0) {
                        html += '<div class="novel-card-folder-path-item">';
                        html += '<div class="novel-card-folder-path-label">MIN:</div>';
                        html += '<div class="novel-card-folder-path-file-list">';
                        data.files.min.forEach((file) => {
                            const escapedUrl = file.url.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            html += `<div style="margin: 2px 0;"><a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="novel-card-folder-path-link" title="클릭하여 새 창에서 파일 열기">${file.name}</a></div>`;
                        });
                        html += '</div></div>';
                    }
                    
                    if (html === '') {
                        html = '<div class="novel-card-folder-path-empty">파일이 없습니다.</div>';
                    }
                    
                    // API 주소 표시
                    const escapedApiUrl = url.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    html += `<div class="novel-card-folder-path-api" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem; color: #888;">`;
                    html += `<div style="margin-bottom: 4px;"><strong>API:</strong></div>`;
                    html += `<div style="word-break: break-all;"><a href="${escapedApiUrl}" target="_blank" rel="noopener noreferrer" style="color: #4a9eff; text-decoration: none;" title="클릭하여 API 응답 확인">${url}</a></div>`;
                    html += `</div>`;
                    
                    container.innerHTML = html;
                    console.log('[파일 목록 로드] 완료:', html);
                } else {
                    console.warn('[파일 목록 로드] 응답 데이터 오류:', data);
                    container.innerHTML = '<div class="novel-card-folder-path-empty">파일 목록을 불러올 수 없습니다.</div>';
                }
            } catch (error) {
                console.error('[파일 목록 로드] 오류:', error);
                container.innerHTML = `<div class="novel-card-folder-path-empty">파일 목록 로드 실패: ${error.message || error}</div>`;
            }
        }
        
        window.loadNovelListForManagement = async function loadNovelListForManagement() {
            if (!$novelListContainer) {
                console.error('[소설 목록 관리] novelListContainer 요소를 찾을 수 없습니다.');
                return;
            }
            
            // 이미 로딩 중이면 중복 호출 방지
            if (isLoadingNovelList) {
                console.log('[소설 목록 관리] 이미 로딩 중입니다. 중복 호출 무시.');
                return;
            }
            
            // 입력 필드에서 직접 값을 가져오기 (이벤트 트리거 대신)
            let topPath = '';
            if ($novelListTopPathInput) {
                topPath = $novelListTopPathInput.value.trim();
            }
            
            // 입력 필드가 비어있으면 로그인 정보 기반으로 자동 입력
            if (!topPath) {
                const loginInfo = getLoginInfo();
            if (loginInfo && loginInfo.nickname) {
                const providerName = loginInfo.provider || '네이버';
                    topPath = `${providerName} 닉네임 → ${loginInfo.nickname} → `;
            } else {
                const loginInfoInput = document.getElementById('loginInfo');
                if (loginInfoInput && loginInfoInput.value) {
                    const parts = loginInfoInput.value.split('/');
                    const nickname = parts[0]?.trim() || '호떡';
                        topPath = `네이버 닉네임 → ${nickname} → `;
                } else {
                        topPath = '네이버 닉네임 → 호떡 → ';
                }
            }
            
                // 입력 필드에 값 설정 (이벤트 트리거 없이)
            if ($novelListTopPathInput) {
                $novelListTopPathInput.value = topPath;
                }
            }
            
            if (!topPath) {
                $novelListContainer.innerHTML = '<div class="text-muted text-center py-5">속성 경로를 입력하세요.</div>';
                // 폴더 경로 숨기기
                const folderPathContainer = document.getElementById('novelListFolderPath');
                if (folderPathContainer) {
                    folderPathContainer.style.display = 'none';
                }
                return;
            }
            
            console.log('[소설 목록 관리] 사용할 최상위 경로:', topPath);
            
            isLoadingNovelList = true; // 로딩 시작
            
            try {
                $novelListContainer.innerHTML = '<div class="text-muted text-center py-5">소설 목록을 불러오는 중...</div>';
                console.log('[소설 목록 관리] 로드 시작:', topPath);
                addLog('info', `[소설 목록 관리] 로드 시작: ${topPath}`);
                
                // 최상위 경로의 BIT 값 계산
                let topPathBits;
                try {
                    console.log('[소설 목록 관리] BIT 계산 시작...');
                    topPathBits = await calculateBitForTopPath(topPath);
                    console.log('[소설 목록 관리] BIT 계산 결과:', topPathBits);
                } catch (bitError) {
                    console.error('[소설 목록 관리] BIT 계산 오류:', bitError);
                    $novelListContainer.innerHTML = '<div class="alert alert-warning">최상위 경로의 BIT 값을 계산할 수 없습니다.<br><small>' + (bitError.message || String(bitError)) + '</small></div>';
                    addLog('error', `[소설 목록 관리] BIT 계산 실패: ${bitError.message}`);
                    return;
                }
                
                if (!topPathBits || !topPathBits.max || !topPathBits.min) {
                    console.warn('[소설 목록 관리] BIT 계산 결과가 유효하지 않음:', topPathBits);
                    $novelListContainer.innerHTML = '<div class="alert alert-warning">최상위 경로의 BIT 값을 계산할 수 없습니다.<br><small>BIT 계산 결과가 없습니다.</small></div>';
                    addLog('error', '[소설 목록 관리] BIT 계산 실패: 결과가 없습니다.');
                    return;
                }
                
                addLog('info', `[소설 목록 관리] 최상위 경로 BIT: MAX ${topPathBits.max} / MIN ${topPathBits.min}`);
                
                // 폴더 경로 계산 및 표시 (모든 파일 목록)
                const folderPathContainer = document.getElementById('novelListFolderPath');
                const folderPathContent = document.getElementById('novelListFolderPathContent');
                if (folderPathContainer && folderPathContent && topPathBits.max && topPathBits.min) {
                    // 상위 속성 경로 뷰에서는 모든 파일 표시 (필터링 없음)
                    folderPathContent.innerHTML = '<div style="color: #9aa4d9; font-size: 0.7rem;">파일 목록 로딩 중...</div>';
                    folderPathContainer.style.display = 'block';
                    // loadFolderFiles 함수를 사용하여 모든 파일 목록 로드
                    loadFolderFiles(topPathBits.max, topPathBits.min, null, null, null, null, null, folderPathContent);
                } else if (folderPathContainer) {
                    folderPathContainer.style.display = 'none';
                }
                
                // 최상위 경로의 데이터 조회
                // BIT 값이 유효한 숫자인지 확인
                if (!Number.isFinite(topPathBits.max) || !Number.isFinite(topPathBits.min)) {
                    throw new Error(`유효하지 않은 BIT 값: MAX=${topPathBits.max}, MIN=${topPathBits.min}`);
                }
                
                // 서버는 bitMax와 bitMin 쿼리 파라미터를 기대함
                const dataUrl = getServerUrl(`/api/attributes/data?bitMax=${encodeURIComponent(topPathBits.max)}&bitMin=${encodeURIComponent(topPathBits.min)}&limit=1000`);
                addLog('info', `[소설 목록 관리] 데이터 조회: ${dataUrl}`);
                
                const dataResponse = await fetch(dataUrl);
                if (!dataResponse.ok) {
                    const errorText = await dataResponse.text().catch(() => '');
                    throw new Error(`HTTP ${dataResponse.status}: ${dataResponse.statusText}${errorText ? ' - ' + errorText : ''}`);
                }
                
                const dataResult = await dataResponse.json();
                console.log('[소설 목록 관리] API 응답:', dataResult);
                addLog('info', `[소설 목록 관리] 데이터 조회 결과: ${dataResult.items?.length || 0}개`);
                
                if (!dataResult.ok) {
                    const errorMsg = dataResult.error || '데이터 조회 실패';
                    $novelListContainer.innerHTML = `<div class="alert alert-danger">${errorMsg}</div>`;
                    addLog('error', `[소설 목록 관리] ${errorMsg}`);
                    return;
                }
                
                if (!dataResult.items || dataResult.items.length === 0) {
                    $novelListContainer.innerHTML = '<div class="text-muted text-center py-5">저장된 소설이 없습니다.</div>';
                    addLog('info', '[소설 목록 관리] 저장된 데이터가 없습니다.');
                    return;
                }
                
                // 소설 목록 구성
                const novelMap = new Map();
                const alreadyFoundNovels = new Set(); // 중복 제거용
                
                // 최상위 경로의 데이터에서 소설 찾기
                for (const item of dataResult.items) {
                    const dataText = (item.data?.text || item.s || '').trim();
                    // 데이터 텍스트가 속성 경로와 다르고, "→"가 없으면 소설 제목으로 간주
                    if (dataText && dataText !== topPath && !dataText.includes(' → ')) {
                        const novelTitle = dataText;
                        
                        // 중복 제거
                        if (!alreadyFoundNovels.has(novelTitle)) {
                            alreadyFoundNovels.add(novelTitle);
                            
                            if (!novelMap.has(novelTitle)) {
                                // 속성 경로 구성: 최상위 경로 → 소설 제목
                                // topPath가 이미 "→ "로 끝나면 중복 추가 방지
                                const trimmedTopPath = topPath.trim();
                                const attributePath = trimmedTopPath.endsWith('→') 
                                    ? `${trimmedTopPath} ${novelTitle}`
                                    : `${trimmedTopPath} → ${novelTitle}`;
                                
                                novelMap.set(novelTitle, {
                                    title: novelTitle,
                                    attributePath: attributePath,
                                    bitMax: item.data?.bitMax || item.max || 0,
                                    bitMin: item.data?.bitMin || item.min || 0,
                                    attributeBitMax: topPathBits.max,
                                    attributeBitMin: topPathBits.min,
                                    topPathBitMax: topPathBits.max, // 최상위 경로 BIT (파일 목록 조회용)
                                    topPathBitMin: topPathBits.min, // 최상위 경로 BIT (파일 목록 조회용)
                                    folderType: 'MAX'
                                });
                                addLog('info', `[소설 목록 관리] 소설 추가: ${novelTitle}`);
                            }
                        }
                    }
                }
                
                const novels = Array.from(novelMap.values()).sort((a, b) => {
                    return a.title.localeCompare(b.title, 'ko');
                });
                
                // 각 소설의 속성 경로 BIT 값 계산
                addLog('info', `[소설 목록 관리] 속성 경로 BIT 계산 시작: ${novels.length}개`);
                for (const novel of novels) {
                    try {
                        const attributeBit = await calculateBitForAttributePath(novel.attributePath);
                        if (attributeBit && attributeBit.max && attributeBit.min) {
                            novel.attributePathBitMax = attributeBit.max;
                            novel.attributePathBitMin = attributeBit.min;
                        }
                    } catch (error) {
                        console.warn(`[소설 목록 관리] 속성 경로 BIT 계산 실패 (${novel.attributePath}):`, error);
                    }
                }
                
                addLog('info', `[소설 목록 관리] 최종 소설 개수: ${novels.length}개`);
                
                if (novels.length === 0) {
                    $novelListContainer.innerHTML = '<div class="text-muted text-center py-5">저장된 소설이 없습니다.</div>';
                    return;
                }
                
                // 소설 목록 렌더링 (입력폼 형태)
                const html = novels.map((novel, index) => {
                    const bitInfo = (novel.bitMax && novel.bitMin) 
                        ? `[${novel.folderType || 'MAX'}] BIT: ${novel.bitMax.toFixed(6)} / ${novel.bitMin.toFixed(6)}`
                        : `[${novel.folderType || 'MAX'}]`;
                    
                    // 속성 경로 BIT 정보
                    const attributePathBitInfo = (novel.attributePathBitMax && novel.attributePathBitMin)
                        ? `속성 경로 BIT: ${novel.attributePathBitMax.toFixed(6)} / ${novel.attributePathBitMin.toFixed(6)}`
                        : '';
                    
                    // 폴더 경로 계산 함수 (기본 경로만)
                    function calculateFolderPath(bitValue, type = 'max') {
                        if (!Number.isFinite(bitValue)) return '';
                        const str = Math.abs(bitValue).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
                        const digits = str.match(/\d/g) || [];
                        const folderPath = `data/${type}/${digits.join('/')}/${type}_bit`;
                        return folderPath;
                    }
                    
                    // 속성 경로 BIT 값의 폴더 경로 계산
                    const maxFolderPath = novel.attributePathBitMax ? calculateFolderPath(novel.attributePathBitMax, 'max') : '';
                    const minFolderPath = novel.attributePathBitMin ? calculateFolderPath(novel.attributePathBitMin, 'min') : '';
                    
                    // HTML 이스케이프
                    const escapedTitle = novel.title.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    const escapedAttributePath = (novel.attributePath || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    
                    // 파일 목록을 비동기로 가져오기 위한 플레이스홀더
                    const novelCardId = `novel-card-${index}-${Date.now()}`;
                    
                    return `
                        <div class="novel-card" data-novel-index="${index}" data-original-title="${escapedTitle}" data-attribute-path="${escapedAttributePath}" data-bit-max="${novel.attributeBitMax}" data-bit-min="${novel.attributeBitMin}">
                            <div class="novel-card-header">
                                <div class="novel-card-title-row">
                                    <input type="text" class="novel-title-input novel-card-title-input" value="${escapedTitle}" 
                                        data-original-title="${escapedTitle}" 
                                        data-attribute-path="${escapedAttributePath}"
                                        data-bit-max="${novel.attributeBitMax}" 
                                        data-bit-min="${novel.attributeBitMin}"
                                        placeholder="소설 제목">
                                    <div class="novel-card-actions">
                                        <button class="btn btn-sm btn-outline-danger delete-novel-btn novel-card-btn" 
                                            data-novel="${escapedTitle}" 
                                            data-bit-max="${novel.attributeBitMax}" 
                                            data-bit-min="${novel.attributeBitMin}"
                                            title="삭제">
                                            <span class="btn-icon">🗑️</span>
                                            <span class="btn-text d-none d-md-inline"> 삭제</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="novel-card-info">
                                <div class="novel-card-info-item">
                                    <small>${bitInfo}</small>
                                </div>
                                ${novel.attributePath ? `
                                    <div class="novel-card-info-item">
                                        <small><strong>속성 경로:</strong> ${novel.attributePath}</small>
                                    </div>
                                ` : ''}
                                ${attributePathBitInfo ? `
                                    <div class="novel-card-info-item">
                                        <small>${attributePathBitInfo}</small>
                                    </div>
                                ` : ''}
                                  ${(novel.topPathBitMax || novel.topPathBitMin) ? `
                                    <div class="novel-card-folder-path" data-attr-bit-max="${novel.topPathBitMax || ''}" data-attr-bit-min="${novel.topPathBitMin || ''}">
                                      <div class="novel-card-folder-path-title">📁 폴더 경로</div>
                                      <div class="novel-card-folder-path-files">
                                        <div class="novel-card-folder-path-loading">파일 목록 로딩 중...</div>
                                      </div>
                                    </div>
                                  ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Bootstrap 그리드 시스템으로 렌더링
                const gridHtml = `
                  <div class="row g-3">
                    ${novels.map((novel, index) => {
                      const bitInfo = (novel.bitMax && novel.bitMin) 
                        ? `[${novel.folderType || 'MAX'}] BIT: ${novel.bitMax.toFixed(6)} / ${novel.bitMin.toFixed(6)}`
                        : `[${novel.folderType || 'MAX'}]`;
                      
                      const attributePathBitInfo = (novel.attributePathBitMax && novel.attributePathBitMin)
                        ? `속성 경로 BIT: ${novel.attributePathBitMax.toFixed(6)} / ${novel.attributePathBitMin.toFixed(6)}`
                        : '';
                      
                      function calculateFolderPath(bitValue, type = 'max') {
                        if (!Number.isFinite(bitValue)) return '';
                        const str = Math.abs(bitValue).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
                        const digits = str.match(/\d/g) || [];
                        const folderPath = `data/${type}/${digits.join('/')}/${type}_bit/log.ndjson`;
                        return folderPath;
                      }
                      
                      const maxFolderPath = novel.attributePathBitMax ? calculateFolderPath(novel.attributePathBitMax, 'max') : '';
                      const minFolderPath = novel.attributePathBitMin ? calculateFolderPath(novel.attributePathBitMin, 'min') : '';
                      
                      const escapedTitle = novel.title.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      const escapedAttributePath = (novel.attributePath || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      
                      const baseUrl = getServerUrl('');
                      const fullMaxUrl = maxFolderPath ? `${baseUrl}/novel_ai/v1.0.7/${maxFolderPath}` : '';
                      const fullMinUrl = minFolderPath ? `${baseUrl}/novel_ai/v1.0.7/${minFolderPath}` : '';
                      const escapedMaxUrl = fullMaxUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      const escapedMinUrl = fullMinUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      
                      return `
                        <div class="col-12">
                          <div class="novel-card" data-novel-index="${index}" data-original-title="${escapedTitle}" data-attribute-path="${escapedAttributePath}" data-bit-max="${novel.attributeBitMax}" data-bit-min="${novel.attributeBitMin}">
                            <div class="row g-2">
                              <div class="col-12">
                                <div class="novel-card-header">
                                  <div class="novel-card-title-row">
                                    <input type="text" class="novel-title-input novel-card-title-input" value="${escapedTitle}" 
                                      data-original-title="${escapedTitle}" 
                                      data-attribute-path="${escapedAttributePath}"
                                      data-bit-max="${novel.attributeBitMax}" 
                                      data-bit-min="${novel.attributeBitMin}"
                                      placeholder="소설 제목">
                                    <div class="novel-card-actions">
                                      <button class="btn btn-sm btn-outline-danger delete-novel-btn novel-card-btn" 
                                        data-novel="${escapedTitle}" 
                                        data-bit-max="${novel.attributeBitMax}" 
                                        data-bit-min="${novel.attributeBitMin}"
                                        title="삭제">
                                        <span class="btn-icon">🗑️</span>
                                        <span class="btn-text d-none d-md-inline"> 삭제</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div class="col-12">
                                <div class="novel-card-info">
                                  <div class="novel-card-info-item">
                                    <small>${bitInfo}</small>
                                  </div>
                                  ${novel.attributePath ? `
                                    <div class="novel-card-info-item">
                                      <small><strong>속성 경로:</strong> ${novel.attributePath}</small>
                                    </div>
                                  ` : ''}
                                  ${attributePathBitInfo ? `
                                    <div class="novel-card-info-item">
                                      <small>${attributePathBitInfo}</small>
                                    </div>
                                  ` : ''}
                                  ${(novel.topPathBitMax || novel.topPathBitMin) ? `
                                    <div class="novel-card-folder-path" 
                                         data-attr-bit-max="${novel.topPathBitMax || ''}" 
                                         data-attr-bit-min="${novel.topPathBitMin || ''}"
                                         data-attr-path-bit-max="${novel.attributePathBitMax || ''}" 
                                         data-attr-path-bit-min="${novel.attributePathBitMin || ''}"
                                         data-bit-max="${novel.bitMax || ''}" 
                                         data-bit-min="${novel.bitMin || ''}"
                                         data-text="${escapedTitle}">
                                      <div class="novel-card-folder-path-title">📁 폴더 경로</div>
                                      <div class="novel-card-folder-path-files">
                                        <div class="novel-card-folder-path-loading">파일 목록 로딩 중...</div>
                                      </div>
                                    </div>
                                  ` : ''}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
                
                $novelListContainer.innerHTML = gridHtml;
                addLog('success', `[소설 목록 관리] 렌더링 완료: ${novels.length}개 소설`);
                
                // 파일 목록 로드
                $novelListContainer.querySelectorAll('.novel-card-folder-path').forEach(folderPathEl => {
                    // 최상위 경로 BIT로 폴더 찾기
                    const topAttrBitMax = folderPathEl.dataset.attrBitMax;
                    const topAttrBitMin = folderPathEl.dataset.attrBitMin;
                    // 각 소설의 속성 경로 BIT와 데이터 BIT로 필터링
                    const attrPathBitMax = folderPathEl.dataset.attrPathBitMax;
                    const attrPathBitMin = folderPathEl.dataset.attrPathBitMin;
                    const dataBitMax = folderPathEl.dataset.bitMax;
                    const dataBitMin = folderPathEl.dataset.bitMin;
                    const dataText = folderPathEl.dataset.text; // 소설 제목 (data.text 값)
                    const filesContainer = folderPathEl.querySelector('.novel-card-folder-path-files');
                    
                    console.log('[파일 목록 로드] BIT:', { topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, dataText, filesContainer: !!filesContainer });
                    
                    if (topAttrBitMax && topAttrBitMin && filesContainer) {
                        // 최상위 경로만 있는 경우 (상위 속성 경로 뷰): 모든 파일 표시
                        if (!attrPathBitMax || !attrPathBitMin || !dataBitMax || !dataBitMin) {
                            loadFolderFiles(topAttrBitMax, topAttrBitMin, null, null, null, null, null, filesContainer);
                        } else {
                            // 개별 소설 뷰: 필터링하여 표시 (dataText 추가)
                            loadFolderFiles(topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, dataText, filesContainer);
                        }
                    } else {
                        console.warn('[파일 목록 로드] 필요한 데이터가 없습니다:', { topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, filesContainer: !!filesContainer });
                    }
                });
                
                // 실시간 수정 기능: 소설 제목 입력 필드
                $novelListContainer.querySelectorAll('.novel-title-input').forEach(input => {
                    let saveTimeout;
                    let reloadTimeout;
                    
                    // 입력 중 실시간 업데이트 (디바운스)
                    input.addEventListener('input', (e) => {
                        clearTimeout(saveTimeout);
                        clearTimeout(reloadTimeout);
                        const newTitle = e.target.value.trim();
                        const originalTitle = e.target.dataset.originalTitle;
                        
                        // 폴더 경로의 data-text 속성 업데이트 및 파일 목록 다시 로드
                        const folderPathEl = e.target.closest('.novel-card')?.querySelector('.novel-card-folder-path');
                        if (folderPathEl && newTitle) {
                            // data-text 속성 업데이트
                            folderPathEl.dataset.text = newTitle;
                            
                            // 파일 목록 다시 로드 (디바운스)
                            reloadTimeout = setTimeout(() => {
                                const topAttrBitMax = folderPathEl.dataset.attrBitMax;
                                const topAttrBitMin = folderPathEl.dataset.attrBitMin;
                                const attrPathBitMax = folderPathEl.dataset.attrPathBitMax;
                                const attrPathBitMin = folderPathEl.dataset.attrPathBitMin;
                                const dataBitMax = folderPathEl.dataset.bitMax;
                                const dataBitMin = folderPathEl.dataset.bitMin;
                                const filesContainer = folderPathEl.querySelector('.novel-card-folder-path-files');
                                
                                if (topAttrBitMax && topAttrBitMin && filesContainer && 
                                    attrPathBitMax && attrPathBitMin && dataBitMax && dataBitMin) {
                                    // 로딩 표시
                                    filesContainer.innerHTML = '<div class="novel-card-folder-path-loading">파일 목록 로딩 중...</div>';
                                    // 파일 목록 다시 로드
                                    loadFolderFiles(topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, newTitle, filesContainer);
                                }
                            }, 500); // 0.5초 후 파일 목록 다시 로드
                        }
                        
                        // 값이 변경되었을 때만 저장
                        if (newTitle && newTitle !== originalTitle) {
                            saveTimeout = setTimeout(async () => {
                                await updateNovelTitle(originalTitle, newTitle, e.target.dataset.bitMax, e.target.dataset.bitMin);
                                // 업데이트 후 원본 제목도 업데이트
                                e.target.dataset.originalTitle = newTitle;
                            }, 1000); // 1초 후 자동 저장
                        }
                    });
                    
                    // 포커스가 벗어날 때 즉시 저장 및 파일 목록 다시 로드
                    input.addEventListener('blur', async (e) => {
                        clearTimeout(saveTimeout);
                        clearTimeout(reloadTimeout);
                        const newTitle = e.target.value.trim();
                        const originalTitle = e.target.dataset.originalTitle;
                        
                        // 폴더 경로의 data-text 속성 업데이트 및 파일 목록 다시 로드
                        const folderPathEl = e.target.closest('.novel-card')?.querySelector('.novel-card-folder-path');
                        if (folderPathEl && newTitle) {
                            folderPathEl.dataset.text = newTitle;
                            
                            const topAttrBitMax = folderPathEl.dataset.attrBitMax;
                            const topAttrBitMin = folderPathEl.dataset.attrBitMin;
                            const attrPathBitMax = folderPathEl.dataset.attrPathBitMax;
                            const attrPathBitMin = folderPathEl.dataset.attrPathBitMin;
                            const dataBitMax = folderPathEl.dataset.bitMax;
                            const dataBitMin = folderPathEl.dataset.bitMin;
                            const filesContainer = folderPathEl.querySelector('.novel-card-folder-path-files');
                            
                            if (topAttrBitMax && topAttrBitMin && filesContainer && 
                                attrPathBitMax && attrPathBitMin && dataBitMax && dataBitMin) {
                                // 로딩 표시
                                filesContainer.innerHTML = '<div class="novel-card-folder-path-loading">파일 목록 로딩 중...</div>';
                                // 파일 목록 다시 로드
                                loadFolderFiles(topAttrBitMax, topAttrBitMin, attrPathBitMax, attrPathBitMin, dataBitMax, dataBitMin, newTitle, filesContainer);
                            }
                        }
                        
                        if (newTitle && newTitle !== originalTitle) {
                            await updateNovelTitle(originalTitle, newTitle, e.target.dataset.bitMax, e.target.dataset.bitMin);
                            e.target.dataset.originalTitle = newTitle;
                        }
                    });
                });
                
                // 삭제 버튼 이벤트 (alert 없이 바로 삭제)
                $novelListContainer.querySelectorAll('.delete-novel-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const novelTitle = btn.dataset.novel;
                        const bitMax = btn.dataset.bitMax;
                        const bitMin = btn.dataset.bitMin;
                        const attributePath = btn.closest('.field')?.dataset.attributePath || '';
                        
                        // alert 없이 바로 삭제
                        await deleteNovel(novelTitle, bitMax, bitMin, false, topPath, attributePath);
                    });
                });
                
            } catch (error) {
                const errorMsg = error.message || String(error);
                console.error('[소설 목록 관리] 전체 오류:', error);
                $novelListContainer.innerHTML = `<div class="alert alert-danger">소설 목록 로드 오류: ${errorMsg}</div>`;
                addLog('error', `[소설 목록 관리] 로드 오류: ${errorMsg}`);
            } finally {
                isLoadingNovelList = false; // 로딩 완료
            }
        }
        
        // 소설 제목 수정 - 간단한 버전: 데이터 텍스트만 수정
        window.updateNovelTitle = async function updateNovelTitle(oldTitle, newTitle, attributeBitMax, attributeBitMin) {
            if (!newTitle || newTitle.trim() === '' || newTitle === oldTitle) return;
            
            try {
                addLog('info', `[소설 수정] ${oldTitle} → ${newTitle}`);
                
                const baseUrl = getServerUrl('');
                
                // 속성 경로의 데이터 조회
                const dataResponse = await fetch(`${baseUrl}/api/attributes/data?bitMax=${attributeBitMax}&bitMin=${attributeBitMin}&limit=1000`);
                if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
                
                const dataResult = await dataResponse.json();
                if (!dataResult.ok || !dataResult.items) {
                    throw new Error('데이터를 가져올 수 없습니다.');
                }
                
                // 소설 제목과 일치하는 데이터 찾기
                const matchingItem = dataResult.items.find(item => {
                    const itemText = (item.data?.text || item.s || '').trim();
                    return itemText === oldTitle;
                });
                
                if (!matchingItem) {
                    addLog('error', '[소설 수정] 수정할 데이터를 찾을 수 없습니다.');
                    return;
                }
                
                // 데이터 BIT 값 확인
                const dataBitMax = matchingItem.data?.bitMax || matchingItem.max;
                const dataBitMin = matchingItem.data?.bitMin || matchingItem.min;
                
                if (!Number.isFinite(dataBitMax) || !Number.isFinite(dataBitMin)) {
                    throw new Error('유효하지 않은 데이터 BIT 값');
                }
                
                // 기존 데이터 삭제
                const deleteResponse = await fetch(`${baseUrl}/api/attributes/data/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        attributeBitMax: attributeBitMax,
                        attributeBitMin: attributeBitMin,
                        dataBitMax: dataBitMax,
                        dataBitMin: dataBitMin
                    })
                });
                
                if (!deleteResponse.ok) {
                    throw new Error('기존 데이터 삭제 실패');
                }
                
                // 새 제목으로 데이터 저장
                const Shared = window.NovelAIShared;
                if (Shared && Shared.saveRecord) {
                    await Shared.saveRecord(baseUrl, {
                        attributeText: matchingItem.attribute?.text || '',
                        attributeBitMax: attributeBitMax,
                        attributeBitMin: attributeBitMin,
                        text: newTitle,
                        dataBitMax: dataBitMax,
                        dataBitMin: dataBitMin
                    });
                    
                    addLog('success', `[소설 수정] 완료: ${oldTitle} → ${newTitle}`);
                    loadNovelListForManagement();
                } else {
                    throw new Error('저장 함수를 사용할 수 없습니다.');
                }
            } catch (error) {
                addLog('error', `[소설 수정] 오류: ${error.message}`);
            }
        }
        
        // 소설 삭제 - 간단한 버전: 속성 경로와 데이터 BIT 값으로 직접 삭제
        window.deleteNovel = async function deleteNovel(novelTitle, attributeBitMax, attributeBitMin, showConfirm = true, topPath = '', attributePath = '') {
            if (showConfirm) return; // confirm은 사용하지 않음
            
            try {
                addLog('info', `[소설 삭제] 시작: ${novelTitle}`);
                
                const baseUrl = getServerUrl('');
                
                // 속성 경로의 데이터 조회
                const dataResponse = await fetch(`${baseUrl}/api/attributes/data?bitMax=${attributeBitMax}&bitMin=${attributeBitMin}&limit=1000`);
                if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
                
                const dataResult = await dataResponse.json();
                if (!dataResult.ok || !dataResult.items) {
                    throw new Error('데이터를 가져올 수 없습니다.');
                }
                
                // 소설 제목과 일치하는 데이터 찾기
                const matchingItem = dataResult.items.find(item => {
                    const itemText = (item.data?.text || item.s || '').trim();
                    return itemText === novelTitle;
                });
                
                if (!matchingItem) {
                    addLog('error', '[소설 삭제] 삭제할 데이터를 찾을 수 없습니다.');
                    return;
                }
                
                // 데이터 BIT 값 확인
                const dataBitMax = matchingItem.data?.bitMax || matchingItem.max;
                const dataBitMin = matchingItem.data?.bitMin || matchingItem.min;
                
                if (!Number.isFinite(dataBitMax) || !Number.isFinite(dataBitMin)) {
                    throw new Error('유효하지 않은 데이터 BIT 값');
                }
                
                // 데이터 삭제 (dataText로 정확한 매칭)
                // 문자열로 전달된 BIT 값을 숫자로 변환
                const deletePayload = {
                    attributeBitMax: parseFloat(attributeBitMax) || attributeBitMax,
                    attributeBitMin: parseFloat(attributeBitMin) || attributeBitMin,
                    dataBitMax: parseFloat(dataBitMax) || dataBitMax,
                    dataBitMin: parseFloat(dataBitMin) || dataBitMin,
                    dataText: novelTitle // 소설 제목으로 정확한 매칭
                };
                
                console.log('[소설 삭제] 삭제 요청:', deletePayload);
                addLog('info', `[소설 삭제] 삭제 요청 전송: ${novelTitle}`);
                
                const deleteUrl = `${baseUrl}/api/attributes/data/delete`;
                console.log('[소설 삭제] 삭제 URL:', deleteUrl);
                
                const deleteResponse = await fetch(deleteUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deletePayload)
                });
                
                console.log('[소설 삭제] 삭제 응답 상태:', deleteResponse.status, deleteResponse.statusText);
                
                if (!deleteResponse.ok) {
                    const errorText = await deleteResponse.text().catch(() => '');
                    console.error('[소설 삭제] 삭제 실패:', deleteResponse.status, errorText);
                    throw new Error(`삭제 실패: ${deleteResponse.status} ${errorText}`);
                }
                
                const deleteResult = await deleteResponse.json();
                console.log('[소설 삭제] 삭제 결과:', deleteResult);
                
                if (deleteResult.ok) {
                    addLog('success', `[소설 삭제] 완료: ${novelTitle} (${deleteResult.deletedCount || 0}개 레코드 삭제됨)`);
                    loadNovelListForManagement();
                } else {
                    throw new Error(deleteResult.error || '삭제 실패');
                }
            } catch (error) {
                addLog('error', `[소설 삭제] 오류: ${error.message}`);
            }
        }
        
        // Doc 페이지 표시
        function showDocPane() {
            const docPane = document.getElementById('doc-pane');
            if (docPane) {
                docPane.style.display = 'block';
                docPane.classList.add('show', 'active');
            }
            if (newNovelPane) {
                newNovelPane.classList.remove('show', 'active');
            }
            if (infoPane) {
                infoPane.classList.remove('show', 'active');
            }
            if (attributesPane) {
                attributesPane.classList.remove('show', 'active');
            }
            const novelListPane = document.getElementById('novel-list-pane');
            if (novelListPane) {
                novelListPane.style.display = 'none';
                novelListPane.classList.remove('show', 'active');
            }
        }
        
        // Doc 페이지 닫기
        function hideDocPane() {
            const docPane = document.getElementById('doc-pane');
            if (docPane) {
                docPane.style.display = 'none';
                docPane.classList.remove('show', 'active');
            }
        }
        
        // 새 소설 만들기 화면 닫기
        function hideNewNovelPane() {
            if (newNovelPane) {
                newNovelPane.classList.remove('show', 'active');
            }
            if (infoPane) {
                infoPane.classList.add('show', 'active');
            }
            if (newNovelTitleInput) {
                newNovelTitleInput.value = '';
            }
            if (newNovelAttributePathInput) {
                newNovelAttributePathInput.value = '';
            }
            if (newNovelTopPathInput) {
                newNovelTopPathInput.value = '';
            }
            if (newNovelTopDataInput) {
                newNovelTopDataInput.value = '';
            }
            if (newNovelAttributePathDisplay) {
                newNovelAttributePathDisplay.value = '';
            }
            if (newNovelAttributeDataInput) {
                newNovelAttributeDataInput.value = '';
            }
        }
        
        // BIT 계산 함수 (클라이언트 측)
        async function calculateBitForAttributePath(attributePath) {
            if (!attributePath || !attributePath.trim()) {
                if (newNovelAttributeMaxOutput) newNovelAttributeMaxOutput.textContent = '-';
                if (newNovelAttributeMinOutput) newNovelAttributeMinOutput.textContent = '-';
                return null;
            }
            
            try {
                // novel_ai_shared.js의 calculateBitValues 함수 사용 (우선)
                const Shared = window.NovelAIShared;
                if (Shared && Shared.calculateBitValues) {
                    const bits = Shared.calculateBitValues(attributePath.trim());
                    if (bits && bits.max !== undefined && bits.min !== undefined) {
                        if (newNovelAttributeMaxOutput) {
                            // 소수점 제한 없이 전체 정밀도로 표시
                            newNovelAttributeMaxOutput.textContent = String(bits.max);
                        }
                        if (newNovelAttributeMinOutput) {
                            // 소수점 제한 없이 전체 정밀도로 표시
                            newNovelAttributeMinOutput.textContent = String(bits.min);
                        }
                        console.log('[BIT 계산] 완료:', { max: bits.max, min: bits.min, path: attributePath });
                        return { max: bits.max, min: bits.min };
                    }
                }
                
                // fallback: Web Worker 사용
                if (typeof Worker !== 'undefined' && window.BitWorker) {
                    return new Promise((resolve) => {
                        const worker = new window.BitWorker();
                        worker.postMessage({ text: attributePath.trim() });
                        worker.onmessage = (e) => {
                            const { max, min } = e.data;
                            if (newNovelAttributeMaxOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMaxOutput.textContent = String(max);
                            }
                            if (newNovelAttributeMinOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMinOutput.textContent = String(min);
                            }
                            resolve({ max, min });
                        };
                        worker.onerror = () => {
                            if (newNovelAttributeMaxOutput) newNovelAttributeMaxOutput.textContent = '-';
                            if (newNovelAttributeMinOutput) newNovelAttributeMinOutput.textContent = '-';
                            resolve(null);
                        };
                    });
                } else {
                    // fallback: 서버 API 사용
                    const baseUrl = getServerUrl('');
                    const response = await fetch(`${baseUrl}/api/attributes/data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            attributeText: attributePath.trim(),
                            text: '',
                            novelTitle: ''
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.ok && data.attributeBit) {
                            const max = data.attributeBit.max || 0;
                            const min = data.attributeBit.min || 0;
                            if (newNovelAttributeMaxOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMaxOutput.textContent = String(max);
                            }
                            if (newNovelAttributeMinOutput) {
                                // 소수점 제한 없이 전체 정밀도로 표시
                                newNovelAttributeMinOutput.textContent = String(min);
                            }
                            return { max, min };
                        }
                    }
                }
            } catch (e) {
                addLog('error', `BIT 계산 오류: ${e.message}`);
            }
            
            if (newNovelAttributeMaxOutput) newNovelAttributeMaxOutput.textContent = '-';
            if (newNovelAttributeMinOutput) newNovelAttributeMinOutput.textContent = '-';
            return null;
        }
        
        // 자동 저장 함수
        let autoSaveTimeout = null;
        let isSaving = false;
        let lastSavedData = null;
        
        // 간단한 저장 함수: 속성 경로 + 데이터만 저장
        async function autoSaveNovel() {
            if (isSaving) {
                console.log('[저장] 이미 저장 중입니다.');
                return;
            }
            
            const attributePath = newNovelAttributePathInput ? newNovelAttributePathInput.value.trim() : '';
            const attributeData = newNovelAttributeDataInput ? newNovelAttributeDataInput.value.trim() : '';
            
            console.log('[저장] 저장 시도:', { attributePath, attributeDataLength: attributeData.length });
            
            // 속성 경로와 데이터가 모두 있어야 저장
            if (!attributePath || !attributeData) {
                console.log('[저장] 속성 경로 또는 데이터가 없습니다.');
                return;
            }
            
            // 마지막 저장된 데이터와 동일하면 저장하지 않음
            const currentData = JSON.stringify({ attributePath, attributeData });
            if (lastSavedData === currentData) {
                return;
            }
            
            isSaving = true;
            
            try {
                const baseUrl = getServerUrl('');
                
                // 속성 경로 BIT 계산
                const attributeBit = await calculateBitForAttributePath(attributePath);
                if (!attributeBit) {
                    throw new Error('속성 경로 BIT 계산 실패');
                }
                
                // 데이터 BIT 계산
                        const Shared = window.NovelAIShared;
                if (!Shared || !Shared.calculateBitValues) {
                    throw new Error('BIT 계산 함수를 사용할 수 없습니다.');
                }
                
                const dataBits = Shared.calculateBitValues(attributeData);
                
                addLog('info', `[저장] 속성 경로: ${attributePath}`);
                addLog('info', `[저장] 속성 BIT: ${attributeBit.max} / ${attributeBit.min}`);
                addLog('info', `[저장] 데이터 BIT: ${dataBits.max} / ${dataBits.min}`);
                
                // 저장 API 호출
                            const response = await fetch(`${baseUrl}/api/attributes/data`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    attributeText: attributePath,
                                    attributeBitMax: attributeBit.max,
                                    attributeBitMin: attributeBit.min,
                                    text: attributeData,
                        dataBitMax: dataBits.max,
                        dataBitMin: dataBits.min
                                })
                            });
                            
                            const text = await response.text().catch(() => '');
                            let json = null;
                            try { json = text ? JSON.parse(text) : null; } catch { json = null; }
                            
                            if (json?.duplicate) {
                                addLog('warning', `중복 데이터: ${json.message || '이미 동일한 데이터가 저장되어 있습니다.'}`);
                    // 중복이어도 lastSavedData는 업데이트하지 않음 (다시 저장 시도 가능)
                            } else if (!response.ok || !json?.ok) {
                                const message = json?.error || text || `HTTP ${response.status}`;
                                throw new Error(message);
                            } else {
                        lastSavedData = currentData;
                    addLog('success', `[저장 완료] 속성 경로와 데이터가 저장되었습니다.`);
                    
                    // 입력 상태 업데이트
                    updateInputStatus();
                    
                    // 저장 후 데이터 로드
                            await loadAttributePathData();
                    
                    // 저장 성공 후 데이터 입력 필드 초기화 (다음 입력을 위해)
                    if (newNovelAttributeDataInput) {
                        newNovelAttributeDataInput.value = '';
                        updateInputStatus();
                    }
                }
            } catch (error) {
                console.error('[저장] 오류:', error);
                addLog('error', `[저장 실패] ${error.message}`);
            } finally {
                isSaving = false;
            }
        }
        
        // 소설 생성 (수동 저장 버튼용)
        async function createNovel() {
            await autoSaveNovel();
        }
        
        // 이벤트 리스너
        if ($newNovelBtn) {
            $newNovelBtn.addEventListener('click', () => {
                hideDocPane();
                showNewNovelPane();
            });
        }
        
        if ($novelListTitle) {
            $novelListTitle.addEventListener('click', () => {
                hideNewNovelPane();
                hideDocPane();
                showNovelListPane();
            });
        }
        
        if ($docMenuBtn) {
            $docMenuBtn.addEventListener('click', () => {
                hideNewNovelPane();
                showDocPane();
            });
        }
        
        // Doc 트리 토글
        const docTreeToggle = document.getElementById('docTreeToggle');
        const docTree = document.getElementById('docTree');
        const docTreeToggleIcon = document.getElementById('docTreeToggleIcon');
        if (docTreeToggle && docTree) {
            docTreeToggle.addEventListener('click', () => {
                const isVisible = docTree.style.display !== 'none';
                docTree.style.display = isVisible ? 'none' : 'block';
                if (docTreeToggleIcon) {
                    docTreeToggleIcon.textContent = isVisible ? '▼' : '▲';
                }
            });
        }
        
        // Doc 트리에서 "내 소설 목록" 클릭 이벤트
        const docNovelListLink = document.getElementById('docNovelListLink');
        if (docNovelListLink) {
            docNovelListLink.addEventListener('click', () => {
                showNovelListPane();
            });
        }
        
        if (cancelNewNovelBtn) {
            cancelNewNovelBtn.addEventListener('click', hideNewNovelPane);
        }
        
        if (createNovelBtn) {
            createNovelBtn.addEventListener('click', createNovel);
        }
        
        // 최상위 경로 데이터 삭제 버튼
        const deleteCurrentTopPathButton = document.getElementById('deleteCurrentTopPathButton');
        if (deleteCurrentTopPathButton) {
            deleteCurrentTopPathButton.addEventListener('click', async function() {
                const topPath = newNovelTopPathInput ? newNovelTopPathInput.value.trim() : '';
                if (!topPath) {
                    addTopPathLog('warning', '최상위 경로가 입력되지 않았습니다.');
                    return;
                }
                
                try {
                    const baseUrl = getServerUrl('');
                    const response = await fetch(`${baseUrl}/api/attributes/delete`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${sessionStorage.getItem('authToken') || ''}`
                        },
                        body: JSON.stringify({ attributeText: topPath })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.ok) {
                            addTopPathLog('success', `최상위 경로 데이터 삭제 완료: ${topPath}`);
                            // 데이터 목록 새로고침
                            loadTopPathData();
                        } else {
                            addTopPathLog('error', data.error || '삭제 실패');
                        }
                    } else {
                        addTopPathLog('error', `삭제 실패: HTTP ${response.status}`);
                    }
                } catch (error) {
                    addTopPathLog('error', `삭제 오류: ${error.message}`);
                }
            });
        }
        
        // 속성 경로 데이터 삭제 버튼
        const deleteCurrentAttributePathButton = document.getElementById('deleteCurrentAttributePathButton');
        if (deleteCurrentAttributePathButton) {
            deleteCurrentAttributePathButton.addEventListener('click', async function() {
                const attributePath = newNovelAttributePathInput ? newNovelAttributePathInput.value.trim() : '';
                if (!attributePath) {
                    addLog('warning', '속성 경로가 입력되지 않았습니다.');
                    return;
                }
                
                try {
                    const baseUrl = getServerUrl('');
                    const response = await fetch(`${baseUrl}/api/attributes/delete`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${sessionStorage.getItem('authToken') || ''}`
                        },
                        body: JSON.stringify({ attributeText: attributePath })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.ok) {
                            addLog('success', `속성 경로 데이터 삭제 완료: ${attributePath}`);
                            // 데이터 목록 새로고침
                            loadAttributePathData();
                        } else {
                            addLog('error', data.error || '삭제 실패');
                        }
                    } else {
                        addLog('error', `삭제 실패: HTTP ${response.status}`);
                    }
                } catch (error) {
                    addLog('error', `삭제 오류: ${error.message}`);
                }
            });
        }
        
        // 데이터 목록 렌더링 함수
        function renderDataList(items, container, logElement, focusAttribute = '') {
            if (!container) return;
            if (!items || items.length === 0) {
                container.innerHTML = '<span style="color:#9aa4d9;">저장된 데이터가 여기 표시됩니다.</span>';
                if (logElement) logElement.textContent = '─';
                return;
            }
            
            if (logElement) {
                logElement.textContent = `[${new Date().toLocaleTimeString('ko-KR')}] ${items.length}개 데이터 표시중`;
            }
            
            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const text = (item.data?.text || item.dataText || item.text || item.s || '').trim();
                if (!text) return;
                
                const card = document.createElement('div');
                card.className = 'data-item';
                card.textContent = text;
                fragment.appendChild(card);
            });
            
            container.innerHTML = '';
            container.appendChild(fragment);
        }
        
        // 폴더 목록 렌더링 함수
        function renderFolderList(container, folders) {
            if (!container) return;
            if (!folders || folders.length === 0) {
                container.innerHTML = '<span style="color:#7d88c7;">폴더가 없습니다.</span>';
                return;
            }
            
            // 최상위 경로가 먼저 나오도록 정렬 (깊이 기준, 그 다음 알파벳 순)
            const sortedFolders = [...folders].sort((a, b) => {
                const pathA = a.folder || '';
                const pathB = b.folder || '';
                // 경로 깊이 계산 (슬래시 개수)
                const depthA = (pathA.match(/\//g) || []).length;
                const depthB = (pathB.match(/\//g) || []).length;
                // 깊이가 다르면 깊이가 적은 것(최상위)이 먼저
                if (depthA !== depthB) {
                    return depthA - depthB;
                }
                // 깊이가 같으면 알파벳 순
                return pathA.localeCompare(pathB, 'ko', { numeric: true });
            });
            
            const fragment = document.createDocumentFragment();
            sortedFolders.forEach(folder => {
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
        
        // 폴더 목록 로드 함수 (최상위 경로와 독립적으로 실행)
        async function loadTopPathFolders() {
            try {
                const baseUrl = getServerUrl('');
                const folderResponse = await fetch(`${baseUrl}/api/tests/folders`);
                if (folderResponse.ok) {
                    const folderData = await folderResponse.json();
                    console.log('[최상위 경로 폴더] API 응답:', folderData);
                    
                    if (folderData.ok) {
                        renderFolderList(document.getElementById('newNovelTopFoldersMax'), folderData.max || []);
                        // MIN 폴더는 백업용이므로 표시하지 않음
                        renderFolderList(document.getElementById('newNovelTopFoldersMin'), []);
                        const maxFolders = (folderData.max || []).length;
                        addTopPathLog('success', `폴더 정보 로드 완료: MAX ${maxFolders}개`);
                    } else {
                        addTopPathLog('error', '폴더 정보 로드 실패');
                        renderFolderList(document.getElementById('newNovelTopFoldersMax'), []);
                        renderFolderList(document.getElementById('newNovelTopFoldersMin'), []);
                    }
                } else {
                    addTopPathLog('error', `폴더 정보 로드 실패: HTTP ${folderResponse.status}`);
                    renderFolderList(document.getElementById('newNovelTopFoldersMax'), []);
                    renderFolderList(document.getElementById('newNovelTopFoldersMin'), []);
                }
            } catch (error) {
                console.error('[폴더 목록 로드] 오류:', error);
                addTopPathLog('error', `폴더 목록 로드 실패: ${error.message}`);
                renderFolderList(document.getElementById('newNovelTopFoldersMax'), []);
                renderFolderList(document.getElementById('newNovelTopFoldersMin'), []);
            }
        }
        
        // 최상위 경로 데이터 로드 함수
        async function loadTopPathData() {
            const topPath = newNovelTopPathInput ? newNovelTopPathInput.value.trim() : '';
            if (!topPath) {
                // 최상위 경로가 없어도 폴더 목록은 먼저 로드
                await loadTopPathFolders();
                return;
            }
            
            try {
                addTopPathLog('info', `최상위 경로 데이터 로드 시작: ${topPath}`);
                
                // 폴더 정보 먼저 로드
                await loadTopPathFolders();
                
                // BIT 계산
                const topBit = await calculateBitForTopPath(topPath);
                if (!topBit) {
                    addTopPathLog('error', 'BIT 계산 실패');
                    return;
                }
                
                const baseUrl = getServerUrl('');
                
                // 데이터 로드
                const dataResponse = await fetch(`${baseUrl}/api/attributes/data?bitMax=${topBit.max}&bitMin=${topBit.min}&attributeText=${encodeURIComponent(topPath)}`);
                
                if (dataResponse.ok) {
                    const data = await dataResponse.json();
                    console.log('[최상위 경로 데이터] API 응답:', data);
                    
                    if (data.ok && data.items) {
                        const items = Array.isArray(data.items) ? data.items : [];
                        // MAX 폴더 데이터만 필터링 (MIN 폴더는 백업용이므로 표시하지 않음)
                        const maxItems = items.filter(item => {
                            const sourcePath = (item.source?.file || '').toLowerCase();
                            // MAX 폴더만 포함
                            if (sourcePath.includes('/max/') || sourcePath.includes('\\max\\') || sourcePath.includes('/max_bit/') || sourcePath.includes('\\max_bit\\')) {
                                return true;
                            }
                            // source 정보가 없으면 MAX로 간주 (기본값)
                            if (!sourcePath) {
                                return true;
                            }
                            return false;
                        });
                        
                        console.log('[최상위 경로 데이터] 필터링 결과:', { total: items.length, max: maxItems.length });
                        
                        renderDataList(maxItems, document.getElementById('newNovelTopDataListMax'), document.getElementById('newNovelTopLogMax'), topPath);
                        // MIN 폴더는 백업용이므로 표시하지 않음
                        renderDataList([], document.getElementById('newNovelTopDataListMin'), document.getElementById('newNovelTopLogMin'), topPath);
                        
                        addTopPathLog('success', `데이터 로드 완료: MAX ${maxItems.length}개`);
                    } else {
                        addTopPathLog('info', '저장된 데이터가 없습니다.');
                        // 빈 상태로 렌더링
                        renderDataList([], document.getElementById('newNovelTopDataListMax'), document.getElementById('newNovelTopLogMax'), topPath);
                        renderDataList([], document.getElementById('newNovelTopDataListMin'), document.getElementById('newNovelTopLogMin'), topPath);
                    }
                } else {
                    addTopPathLog('error', `데이터 로드 실패: HTTP ${dataResponse.status}`);
                }
            } catch (error) {
                console.error('[최상위 경로 데이터 로드] 오류:', error);
                addTopPathLog('error', `최상위 경로 데이터 로드 실패: ${error.message}`);
            }
        }
        
        // 입력 상태 업데이트 함수
        function updateInputStatus() {
            const titleStatus = document.getElementById('newNovelStatusTitle');
            const pathStatus = document.getElementById('newNovelStatusAttributePath');
            const dataStatus = document.getElementById('newNovelStatusData');
            
            if (titleStatus) {
                const title = newNovelTitleInput ? newNovelTitleInput.value.trim() : '';
                titleStatus.textContent = title || '-';
                titleStatus.style.color = title ? '#d3daff' : '#9aa4d9';
            }
            
            if (pathStatus) {
                const path = newNovelAttributePathInput ? newNovelAttributePathInput.value.trim() : '';
                pathStatus.textContent = path || '-';
                pathStatus.style.color = path ? '#d3daff' : '#9aa4d9';
            }
            
            if (dataStatus) {
                const data = newNovelAttributeDataInput ? newNovelAttributeDataInput.value.trim() : '';
                dataStatus.textContent = data || '-';
                dataStatus.style.color = data ? '#d3daff' : '#9aa4d9';
            }
        }
        
        // 저장된 데이터 목록 표시 함수
        async function updateSavedDataList() {
            const savedDataList = document.getElementById('newNovelSavedDataList');
            if (!savedDataList) return;
            
            const attributePath = newNovelAttributePathInput ? newNovelAttributePathInput.value.trim() : '';
            if (!attributePath) {
                savedDataList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #7d88c7;">속성 경로를 입력하면 저장된 데이터가 표시됩니다.</div>';
                return;
            }
            
            try {
                const attributeBit = await calculateBitForAttributePath(attributePath);
                if (!attributeBit) {
                    savedDataList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #7d88c7;">BIT 계산 중...</div>';
                    return;
                }
                
                const baseUrl = getServerUrl('');
                const dataResponse = await fetch(`${baseUrl}/api/attributes/data?bitMax=${attributeBit.max}&bitMin=${attributeBit.min}&limit=10`);
                
                if (dataResponse.ok) {
                    const data = await dataResponse.json();
                    if (data.ok && data.items && data.items.length > 0) {
                        const items = Array.isArray(data.items) ? data.items : [];
                        const maxItems = items.filter(item => {
                            const sourcePath = (item.source?.file || '').toLowerCase();
                            return sourcePath.includes('/max/') || sourcePath.includes('\\max\\') || sourcePath.includes('/max_bit/') || sourcePath.includes('\\max_bit\\') || !sourcePath;
                        });
                        
                        if (maxItems.length > 0) {
                            let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
                            maxItems.slice(0, 10).forEach((item, index) => {
                                const itemText = (item.data?.text || item.s || '').trim();
                                const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleString('ko-KR') : '';
                                html += `
                                    <div style="background: rgba(118, 138, 255, 0.1); border: 1px solid rgba(118, 138, 255, 0.2); border-radius: 6px; padding: 1rem;">
                                        <div style="color: #d3daff; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">#${index + 1}</div>
                                        <div style="color: #9aa4d9; font-size: 0.9rem; word-break: break-all; margin-bottom: 0.5rem;">${escapeHtml(itemText.substring(0, 100))}${itemText.length > 100 ? '...' : ''}</div>
                                        ${timestamp ? `<div style="color: #7d88c7; font-size: 0.75rem;">${timestamp}</div>` : ''}
                                    </div>
                                `;
                            });
                            html += '</div>';
                            savedDataList.innerHTML = html;
                        } else {
                            savedDataList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #7d88c7;">저장된 데이터가 없습니다.</div>';
                        }
                    } else {
                        savedDataList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #7d88c7;">저장된 데이터가 없습니다.</div>';
                    }
                } else {
                    savedDataList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #ff6b6b;">데이터를 불러올 수 없습니다.</div>';
                }
            } catch (error) {
                console.error('[저장된 데이터 목록] 오류:', error);
                savedDataList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #ff6b6b;">오류가 발생했습니다.</div>';
            }
        }
        
        // HTML 이스케이프 함수
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // 속성 경로 데이터 로드 함수
        async function loadAttributePathData() {
            const attributePath = newNovelAttributePathInput ? newNovelAttributePathInput.value.trim() : '';
            if (!attributePath) {
                return;
            }
            
            // 저장된 데이터 목록 업데이트
            await updateSavedDataList();
            
            try {
                // BIT 계산
                const attributeBit = await calculateBitForAttributePath(attributePath);
                if (!attributeBit) return;
                
                const baseUrl = getServerUrl('');
                
                // 데이터 로드
                const dataResponse = await fetch(`${baseUrl}/api/attributes/data?bitMax=${attributeBit.max}&bitMin=${attributeBit.min}&attributeText=${encodeURIComponent(attributePath)}`);
                
                if (dataResponse.ok) {
                    const data = await dataResponse.json();
                    console.log('[속성 경로 데이터] API 응답:', data);
                    
                    if (data.ok && data.items) {
                        const items = Array.isArray(data.items) ? data.items : [];
                        // MAX 폴더 데이터만 필터링 (MIN 폴더는 백업용이므로 표시하지 않음)
                        const maxItems = items.filter(item => {
                            const sourcePath = (item.source?.file || '').toLowerCase();
                            // MAX 폴더만 포함
                            if (sourcePath.includes('/max/') || sourcePath.includes('\\max\\') || sourcePath.includes('/max_bit/') || sourcePath.includes('\\max_bit\\')) {
                                return true;
                            }
                            // source 정보가 없으면 MAX로 간주 (기본값)
                            if (!sourcePath) {
                                return true;
                            }
                            return false;
                        });
                        
                        console.log('[속성 경로 데이터] 필터링 결과:', { total: items.length, max: maxItems.length });
                        
                        // 저장된 데이터 목록 다시 업데이트
                        await updateSavedDataList();
                    } else {
                        // 빈 상태로 렌더링
                        await updateSavedDataList();
                    }
                }
            } catch (error) {
                console.error('[속성 경로 데이터 로드] 오류:', error);
                addLog('error', `속성 경로 데이터 로드 실패: ${error.message}`);
            }
        }
        
        // 입력 필드 자동 저장 이벤트
        function setupAutoSave(inputElement) {
            if (!inputElement) return;
            
            inputElement.addEventListener('input', function() {
                clearTimeout(autoSaveTimeout);
                autoSaveTimeout = setTimeout(() => {
                    autoSaveNovel();
                }, 1000); // 1초 디바운스
            });
        }
        
        // 로그인 정보 가져오기 함수 (제공자와 닉네임)
        function getLoginInfo() {
            try {
                // 먼저 토큰에서 사용자 정보 확인
                const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
                if (token) {
                    try {
                        const parts = token.split('.');
                        if (parts.length === 3) {
                            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                            while (base64.length % 4) {
                                base64 += '=';
                            }
                            const binaryString = atob(base64);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            const decoder = new TextDecoder('utf-8');
                            const jsonString = decoder.decode(bytes);
                            const payload = JSON.parse(jsonString);
                            
                            const nickname = payload.nickname || payload.name || '';
                            if (nickname) {
                                const provider = sessionStorage.getItem('loginProvider') || 'naver';
                                const providerName = {
                                    'naver': '네이버',
                                    'google': '구글',
                                    'kakao': '카카오'
                                }[provider] || provider;
                                
                                console.log('[로그인 정보] 토큰에서 가져옴 - 제공자:', providerName, '닉네임:', nickname);
                                return {
                                    provider: providerName,
                                    nickname: nickname,
                                    fullName: `${providerName} 닉네임`
                                };
                            }
                        }
                    } catch (e) {
                        console.warn('[로그인 정보] 토큰 디코딩 실패:', e);
                    }
                }
                
                // 토큰이 없으면 sessionStorage에서 확인
                const provider = sessionStorage.getItem('loginProvider') || 'naver';
                const naverUserStr = sessionStorage.getItem('naverUser');
                
                if (naverUserStr) {
                    const user = JSON.parse(naverUserStr);
                    const nickname = user.nickname || user.name || '';
                    if (nickname) {
                        const providerName = {
                            'naver': '네이버',
                            'google': '구글',
                            'kakao': '카카오'
                        }[provider] || provider;
                        
                        console.log('[로그인 정보] sessionStorage에서 가져옴 - 제공자:', providerName, '닉네임:', nickname);
                        return {
                            provider: providerName,
                            nickname: nickname,
                            fullName: `${providerName} 닉네임`
                        };
                    }
                }
            } catch (e) {
                console.error('[로그인 정보] 사용자 정보 파싱 오류:', e);
            }
            // 로그인하지 않은 경우
            console.log('[로그인 정보] 로그인하지 않음, 기본값 사용');
            return null;
        }
        
        // 최상위 경로 데이터 삭제 함수
        async function deleteTopPathDataByPath(topPath) {
            if (!topPath) {
                return false;
            }
            
            try {
                const baseUrl = getServerUrl('');
                const response = await fetch(`${baseUrl}/api/attributes/delete`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionStorage.getItem('authToken') || ''}`
                    },
                    body: JSON.stringify({ attributeText: topPath })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.ok) {
                        addTopPathLog('success', `최상위 경로 데이터 삭제 완료: ${topPath}`);
                        return true;
                    } else {
                        addTopPathLog('error', data.error || '삭제 실패');
                        return false;
                    }
                } else {
                    addTopPathLog('error', `삭제 실패: HTTP ${response.status}`);
                    return false;
                }
            } catch (error) {
                addTopPathLog('error', `삭제 오류: ${error.message}`);
                return false;
            }
        }
        
        // 소설 제목 입력 시 데이터 입력 필드에 자동 입력 (엔터 또는 blur 시)
        if (newNovelTitleInput) {
            // 엔터 키 입력 시
            newNovelTitleInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const novelTitle = newNovelTitleInput.value.trim();
                    if (novelTitle && newNovelAttributeDataInput) {
                        newNovelAttributeDataInput.value = novelTitle;
                        // 포커스를 데이터 입력 필드로 이동
                        newNovelAttributeDataInput.focus();
                        // 입력 상태 업데이트
                        updateInputStatus();
                        // 속성 경로 업데이트 및 자동 저장
                        updateAttributePathAndSave(novelTitle);
                    }
                } else if (e.key === 'Escape') {
                    hideNewNovelPane();
                }
            });
            
            // 포커스 아웃(blur) 시
            newNovelTitleInput.addEventListener('blur', function() {
                const novelTitle = newNovelTitleInput.value.trim();
                if (novelTitle && newNovelAttributeDataInput) {
                    // 데이터 입력 필드가 비어있거나 소설 제목과 다를 때만 자동 입력
                    const currentData = newNovelAttributeDataInput.value.trim();
                    if (!currentData || currentData !== novelTitle) {
                        newNovelAttributeDataInput.value = novelTitle;
                        // 입력 상태 업데이트
                        updateInputStatus();
                        // 속성 경로 업데이트 및 자동 저장
                        updateAttributePathAndSave(novelTitle);
                    }
                }
            });
            
            // 데이터 입력 필드에 소설 제목 입력 및 자동 저장 함수
            async function updateAttributePathAndSave(novelTitle) {
                if (!novelTitle) return;
                
                // 속성 경로는 변경하지 않음 (고정값 유지)
                // 데이터 입력 필드에만 소설 제목 입력
                if (newNovelAttributeDataInput) {
                    newNovelAttributeDataInput.value = novelTitle;
                }
                
                // 입력 상태 업데이트
                updateInputStatus();
                
                // 약간의 지연 후 자동 저장
                setTimeout(async () => {
                    try {
                        // 속성 경로가 있으면 저장
                        const attributePath = newNovelAttributePathInput ? newNovelAttributePathInput.value.trim() : '';
                        if (attributePath && newNovelAttributeDataInput && newNovelAttributeDataInput.value.trim()) {
                            // 저장된 데이터 목록 업데이트
                            await updateSavedDataList();
                            // 자동 저장
                            await autoSaveNovel();
                                        }
                                    } catch (error) {
                        console.error('[소설 제목 저장] 오류:', error);
                    }
                }, 500);
            }
            
            // 속성 경로는 고정값 유지 (엔터/blur 시에만 updateAttributePathAndSave 함수에서 처리)
        }
        
        // 모든 입력 필드에 자동 저장 설정
        setupAutoSave(newNovelTitleInput);
        setupAutoSave(newNovelAttributePathInput);
        setupAutoSave(newNovelTopDataInput);
        setupAutoSave(newNovelAttributeDataInput);
        
        // 최상위 경로 데이터 입력 필드 변경 시 저장 후 데이터 로드
        if (newNovelTopDataInput) {
            let topDataInputTimeout;
            newNovelTopDataInput.addEventListener('input', function() {
                clearTimeout(topDataInputTimeout);
                topDataInputTimeout = setTimeout(async () => {
                    const topPath = newNovelTopPathInput ? newNovelTopPathInput.value.trim() : '';
                    const topData = newNovelTopDataInput.value.trim();
                    
                    // 최상위 경로와 데이터가 모두 있으면 저장 후 데이터 로드
                    if (topPath && topData) {
                        // 자동 저장이 실행되기를 기다린 후 데이터 로드
                        setTimeout(async () => {
                            try {
                                await loadTopPathData();
                            } catch (error) {
                                console.error('[최상위 경로 데이터] 로드 오류:', error);
                                addTopPathLog('error', `데이터 로드 오류: ${error.message}`);
                            }
                        }, 1500); // 자동 저장(1초) 후 추가 0.5초 대기
                    }
                }, 500);
            });
        }
        
        // 속성 경로는 읽기 전용이므로 입력 이벤트 없음 (소설 제목 입력 시 자동 업데이트)
        
        // 최상위 경로 입력 필드 변경 시 데이터 로드 (속성 경로에서 자동 추출되지만, 직접 변경될 수도 있음)
        if (newNovelTopPathInput) {
            let topPathLoadTimeout;
            newNovelTopPathInput.addEventListener('input', function() {
                clearTimeout(topPathLoadTimeout);
                topPathLoadTimeout = setTimeout(async () => {
                    const topPath = newNovelTopPathInput.value.trim();
                    if (topPath) {
                        try {
                            const topBit = await calculateBitForTopPath(topPath);
                            if (topBit) {
                                await loadTopPathData();
                            }
                        } catch (error) {
                            console.error('[최상위 경로] 데이터 로드 오류:', error);
                            addTopPathLog('error', `최상위 경로 데이터 로드 오류: ${error.message}`);
                        }
                    } else {
                        // 빈 값인 경우 빈 상태로 렌더링
                        renderDataList([], document.getElementById('newNovelTopDataListMax'), document.getElementById('newNovelTopLogMax'), '');
                        renderDataList([], document.getElementById('newNovelTopDataListMin'), document.getElementById('newNovelTopLogMin'), '');
                        renderFolderList(document.getElementById('newNovelTopFoldersMax'), []);
                        renderFolderList(document.getElementById('newNovelTopFoldersMin'), []);
                    }
                }, 500); // 500ms 디바운스
            });
        }
        
        // Enter 키로 생성 (기존 로직은 위에서 처리됨)
        
        // 입력 상태 실시간 업데이트 및 저장된 데이터 목록 업데이트
        let attributePathUpdateTimeout;
        
        if (newNovelTitleInput) {
            newNovelTitleInput.addEventListener('input', function() {
                updateInputStatus();
            });
        }
        
        // 속성 경로는 읽기 전용이므로 입력 이벤트 없음
        
        if (newNovelAttributeDataInput) {
            let attributeDataSaveTimeout;
            newNovelAttributeDataInput.addEventListener('input', function() {
                updateInputStatus();
                // 자동 저장 (디바운스)
                clearTimeout(attributeDataSaveTimeout);
                attributeDataSaveTimeout = setTimeout(() => {
                    autoSaveNovel();
                }, 1000); // 1초 디바운스
            });
            
            // Enter 키 입력 시 즉시 저장 (여러 줄 입력 지원)
            newNovelAttributeDataInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                    // Ctrl+Enter: 즉시 저장
                    e.preventDefault();
                    clearTimeout(attributeDataSaveTimeout);
                    autoSaveNovel();
                }
            });
        }
        
        // 속성 경로 입력 필드에도 자동 저장 이벤트 추가 (속성 경로가 변경되면 저장)
        if (newNovelAttributePathInput) {
            let attributePathSaveTimeout;
            // 기존 이벤트 리스너와 별도로 저장 이벤트 추가
            newNovelAttributePathInput.addEventListener('input', function() {
                clearTimeout(attributePathSaveTimeout);
                attributePathSaveTimeout = setTimeout(() => {
                    // 속성 경로와 데이터가 모두 있으면 저장
                    const attributePath = newNovelAttributePathInput.value.trim();
                    const attributeData = newNovelAttributeDataInput ? newNovelAttributeDataInput.value.trim() : '';
                    if (attributePath && attributeData) {
                        autoSaveNovel();
                    }
                }, 1000); // 1초 디바운스
            });
        }
        
        // 초기 입력 상태 업데이트
        updateInputStatus();
    })();

    /**
     * 속성 목록 렌더링 (우측 패널)
     */
    function renderAttributeList() {
        if (!$attributeList) return;
        
        const attributes = DEFAULT_ATTRIBUTES.map(name => {
            const div = document.createElement('div');
            div.className = 'attribute-list-item';
            div.textContent = name;
            div.addEventListener('click', () => {
                // 해당 속성으로 스크롤
                const inputGroup = document.getElementById(`attr-${name.replace(/\s+/g, '-')}`);
                if (inputGroup) {
                    inputGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    $attributeList.querySelectorAll('.attribute-list-item').forEach(i => i.classList.remove('active'));
                    div.classList.add('active');
                }
            });
            return div;
        });
        
        $attributeList.innerHTML = '';
        attributes.forEach(attr => $attributeList.appendChild(attr));
    }

    /**
     * 소설 정보 로드 및 표시
     */
    async function loadNovelInfo() {
        if (!currentNovel || !$novelInfoContainer) return;
        
        $novelInfoContainer.innerHTML = '<div class="text-center py-3"><div class="spinner-border" role="status"></div> <span class="ms-2">소설 정보 로드 중...</span></div>';
        
        try {
            novelInfoManager = new NovelInfoManager(currentNovel, addLog);
            await novelInfoManager.loadNovelInfo();
            
            const html = novelInfoManager.createInfoHTML();
            $novelInfoContainer.innerHTML = html;
            
            // 현재 소설 헤더 업데이트
            updateCurrentNovelHeader();
            
            addLog('success', `[소설 정보] 로드 완료: ${currentNovel}`);
        } catch (error) {
            addLog('error', `[소설 정보] 로드 오류: ${error.message}`);
            $novelInfoContainer.innerHTML = '<div class="alert alert-danger">소설 정보를 로드하는 중 오류가 발생했습니다.</div>';
        }
    }

    // 파일 경로를 URL로 새 창에서 열기 함수 (전역)
    window.openFolderInExplorer = function(filePath) {
        try {
            const baseUrl = getServerUrl('');
            // 파일 경로를 직접 URL로 변환 (예: data/max/.../log.ndjson -> /novel_ai/v1.0.7/data/max/.../log.ndjson)
            const url = `${baseUrl}/novel_ai/v1.0.7/${filePath}`;
            window.open(url, '_blank');
            addLog('success', `[파일 열기] 새 창에서 파일을 엽니다: ${filePath}`);
        } catch (error) {
            console.error('[파일 열기] 오류:', error);
            addLog('error', `[파일 열기] 오류: ${error.message}`);
        }
    };

    // 초기화
    loadNovels();
    renderAttributeList();
    updateCurrentPath();
    // 페이지 로드 시 폴더 목록은 최상위 경로 데이터 로드 시 자동으로 로드됨
    
    // 소설 목록 관리 - 최상위 경로 입력 필드 이벤트
    if ($novelListTopPathInput) {
        let novelListLoadTimeout;
        let conversionTimeout;
        
        // 자동 변환 함수
        function autoConvertPath(input) {
            let value = input.value.trim();
            let changed = false;
            
            // 끝에 화살표가 있으면 자동으로 제거 (속성 경로에서 최상위 경로 추출)
            if (value.endsWith(' → ') || value.endsWith('→')) {
                const extracted = extractTopPath(value);
                if (extracted && extracted !== value) {
                    input.value = extracted;
                    changed = true;
                }
            }
            
            // "→"가 없고 공백이 있으면 자동 변환
            if (!value.includes('→') && value.includes(' ')) {
                const parts = value.split(/\s+/).filter(p => p.trim());
                if (parts.length >= 2) {
                    // 마지막 부분을 제외한 나머지를 합치고, 마지막 부분 앞에 화살표 추가
                    const converted = parts.slice(0, -1).join(' ') + ' → ' + parts[parts.length - 1];
                    input.value = converted;
                    return true;
                }
            }
            
            return changed;
        }
        
        // 입력 시 자동 변환 및 로드
        $novelListTopPathInput.addEventListener('input', function(e) {
            clearTimeout(conversionTimeout);
            clearTimeout(novelListLoadTimeout);
            
            // 입력이 완료된 후 자동 변환 (0.3초 후)
            conversionTimeout = setTimeout(() => {
                const wasConverted = autoConvertPath(e.target);
                
                // 변환 후 자동 로드
                if (wasConverted) {
                    novelListLoadTimeout = setTimeout(() => {
                        loadNovelListForManagement();
                    }, 200);
                } else {
                    novelListLoadTimeout = setTimeout(() => {
                        loadNovelListForManagement();
                    }, 500);
                }
            }, 300);
        });
        
        // 포커스가 벗어날 때 자동 변환
        $novelListTopPathInput.addEventListener('blur', function(e) {
            clearTimeout(conversionTimeout);
            clearTimeout(novelListLoadTimeout);
            autoConvertPath(e.target);
            loadNovelListForManagement();
        });
        
        // Enter 키로 즉시 변환 및 로드
        $novelListTopPathInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(conversionTimeout);
                clearTimeout(novelListLoadTimeout);
                autoConvertPath(e.target);
                loadNovelListForManagement();
            }
        });
    }

    // GPT 모델 선택 모달
    const gptModal = new bootstrap.Modal(document.getElementById('gptModal'));
    const $gptModel = document.getElementById('gptModel');
    const $confirmGptBtn = document.getElementById('confirmGptBtn');
    
    if ($confirmGptBtn) {
        $confirmGptBtn.addEventListener('click', () => {
            const selectedModel = $gptModel.value;
            // 모든 에디터의 모델 업데이트
            attributeEditors.forEach(editor => {
                editor.gptModel = selectedModel;
            });
            addLog('info', `[GPT 모델] 변경: ${selectedModel}`);
            gptModal.hide();
        });
    }

    // 전역 함수로 export
    window.addLog = addLog;
    window.renderAttributeInputs = renderAttributeInputs;
});

