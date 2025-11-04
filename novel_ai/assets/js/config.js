/**
 * API 설정 파일
 * 
 * 서버 URL과 API 엔드포인트를 여기서 설정합니다.
 */

// 서버 기본 URL 설정
// 로컬 개발: 'http://localhost:8123'
// 프로덕션: 실제 서버 URL로 변경
const API_CONFIG = {
    baseUrl: window.location.origin || 'http://localhost:8123',
    endpoints: {
        chat: '/api/gpt/chat',
        chapters: '/api/chapters',
        attributes: '/api/attributes',
        // 필요시 다른 엔드포인트 추가
    },
    // 기본 모델 설정
    defaultModel: 'gpt-4o',
    // 기본 파라미터
    defaultParams: {
        temperature: 0.7,
        maxTokens: 2000,
    }
};

/**
 * 서버 URL 생성 헬퍼 함수
 * @param {string} path - API 경로
 * @returns {string} 완전한 URL
 */
function getServerUrl(path) {
    const base = API_CONFIG.baseUrl;
    if (!path) return base;
    if (path.startsWith('/')) {
        return base + path;
    }
    return base + '/' + path;
}

// 전역에서 사용 가능하도록 export (CommonJS/ES6 모듈 환경이 아닐 경우)
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
    window.getServerUrl = getServerUrl;
}

