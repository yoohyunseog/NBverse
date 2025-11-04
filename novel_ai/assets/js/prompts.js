/**
 * GPT 프롬프트 관리
 * Novel AI에서 사용하는 모든 GPT 프롬프트를 관리합니다.
 */

// 시스템 메시지 (기본)
const SYSTEM_MESSAGE = `당신은 소설 작성을 돕는 AI 어시스턴트입니다. 현재 작업 중인 소설의 챕터와 장면에 대한 질문에 답변하고, 소설 구성에 도움이 되는 정보를 제공합니다.

**응답 원칙:**
1. 사용자의 질문에 직접적으로 답변하세요.
2. 현재 작업 중인 소설의 챕터와 장면 컨텍스트를 고려하여 답변하세요.
3. 소설 구성에 도움이 되는 구체적이고 실용적인 정보를 제공하세요.
4. 답변은 간결하고 명확하게 작성하세요.`;

/**
 * 사용자 프롬프트 생성
 * @param {string} userMessage - 사용자 메시지
 * @param {string} previousContext - 이전 대화 히스토리 (선택)
 * @param {string} referenceData - 참조 가능한 속성 및 데이터 (선택)
 * @param {object} novelAIStatus - Novel AI 상태 정보 (선택) {novelTitle, chapter, attributeText}
 * @returns {string} 완성된 사용자 프롬프트
 */
function buildUserPrompt(userMessage, previousContext = '', referenceData = '', novelAIStatus = null) {
    let prompt = '';
    
    // Novel AI 상태 정보 추가
    if (novelAIStatus) {
        prompt += '**현재 작업 중인 소설 정보:**\n';
        if (novelAIStatus.novelTitle) {
            prompt += `- 소설: ${novelAIStatus.novelTitle}\n`;
        }
        if (novelAIStatus.chapter) {
            prompt += `- 챕터: ${novelAIStatus.chapter}\n`;
        }
        if (novelAIStatus.attributeText) {
            prompt += `- 속성: ${novelAIStatus.attributeText}\n`;
        }
        prompt += '\n';
    }
    
    // 이전 대화 히스토리 추가
    if (previousContext) {
        prompt += `**이전 대화:**\n${previousContext}\n\n`;
    }
    
    // 참조 데이터 추가
    if (referenceData) {
        prompt += referenceData + '\n\n';
    }
    
    // 사용자 질문
    prompt += `**사용자 질문:**\n${userMessage}`;
    
    return prompt;
}

/**
 * 이전 대화 히스토리를 텍스트로 변환
 * @param {Array} messages - 메시지 배열 [{role: 'user'|'assistant', text: string}, ...]
 * @param {number} maxMessages - 최대 메시지 개수 (기본: 10)
 * @returns {string} 변환된 대화 히스토리
 */
function formatPreviousContext(messages, maxMessages = 10) {
    if (!messages || messages.length === 0) {
        return '';
    }
    
    return messages.slice(-maxMessages).map(m => {
        const role = m.role === 'user' ? '사용자' : 'AI';
        return `${role}: ${m.text}`;
    }).join('\n');
}

/**
 * 참조 데이터를 포맷팅
 * @param {Array} referenceItems - 참조 항목 배열
 * @param {number} maxItems - 최대 표시 항목 수 (기본: 20)
 * @returns {string} 포맷팅된 참조 데이터
 */
function formatReferenceData(referenceItems, maxItems = 20) {
    if (!referenceItems || referenceItems.length === 0) {
        return '';
    }
    
    const displayItems = referenceItems.slice(0, maxItems);
    const remaining = referenceItems.length - maxItems;
    
    let result = `\n\n**참조 가능한 속성 및 데이터 (좌측 Novel AI):**\n${displayItems.join('\n')}`;
    
    if (remaining > 0) {
        result += `\n... 외 ${remaining}개 더`;
    }
    
    return result;
}

// 전역으로 노출
if (typeof window !== 'undefined') {
    window.PROMPTS = {
        SYSTEM_MESSAGE,
        buildUserPrompt,
        formatPreviousContext,
        formatReferenceData
    };
}

