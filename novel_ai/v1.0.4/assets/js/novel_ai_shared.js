(() => {
  'use strict';

  const BIT_COUNT = 50;
  const BIT_BASE_VALUE = 5.5;
  const BIT_DEFAULT_PREFIX = '안 녕 한 국 인 터 넷 . 한 국';
  const LANGUAGE_RANGES = [
    { range: [0xAC00, 0xD7AF], prefix: 1000000 },
    { range: [0x3040, 0x309F], prefix: 2000000 },
    { range: [0x30A0, 0x30FF], prefix: 3000000 },
    { range: [0x4E00, 0x9FFF], prefix: 4000000 },
    { range: [0x0410, 0x044F], prefix: 5000000 },
    { range: [0x0041, 0x007A], prefix: 6000000 },
    { range: [0x0590, 0x05FF], prefix: 7000000 },
    { range: [0x00C0, 0x00FD], prefix: 8000000 },
    { range: [0x0E00, 0x0E7F], prefix: 9000000 }
  ];

  let SUPER_BIT = 0;

  const SECTION_ORDER = ['구성', '상세', '스토리', '에필로그', '주요 사건'];

  function wordNbUnicodeFormat(text = '') {
    const domain = text && text.length > 0 ? `${BIT_DEFAULT_PREFIX}:${text}` : BIT_DEFAULT_PREFIX;
    return Array.from(domain).map(char => {
      const codePoint = char.codePointAt(0);
      const lang = LANGUAGE_RANGES.find(({ range: [start, end] }) => codePoint >= start && codePoint <= end);
      const prefix = lang ? lang.prefix : 0;
      return prefix + codePoint;
    });
  }

  function initializeBitArrays(len) {
    return {
      BIT_START_A50: new Array(len).fill(0),
      BIT_START_A100: new Array(len).fill(0),
      BIT_START_B50: new Array(len).fill(0),
      BIT_START_B100: new Array(len).fill(0),
      BIT_START_NBA100: new Array(len).fill(0)
    };
  }

  function calculateBit(nb, bit = BIT_BASE_VALUE, reverse = false) {
    if (!nb || nb.length < 2) return bit / 100;
    const BIT_NB = bit;
    const max = Math.max(...nb);
    const min = Math.min(...nb);
    const negativeRange = min < 0 ? Math.abs(min) : 0;
    const positiveRange = max > 0 ? max : 0;
    const denom = (BIT_COUNT * nb.length - 1) || 1;
    const negativeIncrement = negativeRange / denom;
    const positiveIncrement = positiveRange / denom;
    const arrays = initializeBitArrays(BIT_COUNT * nb.length);
    let count = 0;
    for (const value of nb) {
      for (let i = 0; i < BIT_COUNT; i++) {
        const BIT_END = 1;
        const A50 = value < 0
          ? min + negativeIncrement * (count + 1)
          : min + positiveIncrement * (count + 1);
        const A100 = (count + 1) * BIT_NB / (BIT_COUNT * nb.length);
        const B50 = value < 0 ? A50 - negativeIncrement * 2 : A50 - positiveIncrement * 2;
        const B100 = value < 0 ? A50 + negativeIncrement : A50 + positiveIncrement;
        const NBA100 = A100 / (nb.length - BIT_END);
        arrays.BIT_START_A50[count] = A50;
        arrays.BIT_START_A100[count] = A100;
        arrays.BIT_START_B50[count] = B50;
        arrays.BIT_START_B100[count] = B100;
        arrays.BIT_START_NBA100[count] = NBA100;
        count++;
      }
    }
    if (reverse) arrays.BIT_START_NBA100.reverse();
    let NB50 = 0;
    for (const value of nb) {
      for (let a = 0; a < arrays.BIT_START_NBA100.length; a++) {
        if (arrays.BIT_START_B50[a] <= value && arrays.BIT_START_B100[a] >= value) {
          NB50 += arrays.BIT_START_NBA100[Math.min(a, arrays.BIT_START_NBA100.length - 1)];
          break;
        }
      }
    }
    if (nb.length === 2) return bit - NB50;
    return NB50;
  }

  function updateSuperBit(value) {
    SUPER_BIT = value;
  }

  function BIT_MAX_NB(nb, bit = BIT_BASE_VALUE) {
    const result = calculateBit(nb, bit, false);
    if (!Number.isFinite(result) || Number.isNaN(result) || result > 100 || result < -100) {
      return SUPER_BIT;
    }
    updateSuperBit(result);
    return result;
  }

  function BIT_MIN_NB(nb, bit = BIT_BASE_VALUE) {
    const result = calculateBit(nb, bit, true);
    if (!Number.isFinite(result) || Number.isNaN(result) || result > 100 || result < -100) {
      return SUPER_BIT;
    }
    updateSuperBit(result);
    return result;
  }

  function calculateBitValues(text = '') {
    const arr = wordNbUnicodeFormat(text || '');
    return { max: BIT_MAX_NB(arr), min: BIT_MIN_NB(arr), length: arr.length };
  }

  function numbersAlmostEqual(a, b, tolerance = 1e-6) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= tolerance;
  }

  async function deleteExistingRecord(baseUrl, attributeBits, dataOptions) {
    if (!baseUrl || !attributeBits) return null;
    try {
      const payload = {
        attributeBitMax: attributeBits.max,
        attributeBitMin: attributeBits.min,
      };
      if (dataOptions && typeof dataOptions === 'object') {
        if (dataOptions.max !== undefined) payload.dataBitMax = dataOptions.max;
        if (dataOptions.min !== undefined) payload.dataBitMin = dataOptions.min;
        if (dataOptions.text !== undefined) payload.text = dataOptions.text;
      }
      const response = await fetch(`${baseUrl}/api/attributes/data/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch {
      return null;
    }
  }

  async function saveRecord(baseUrl, payload) {
    if (!baseUrl) throw new Error('baseUrl required');
    const response = await fetch(`${baseUrl}/api/attributes/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await response.text().catch(() => '');
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!response.ok || !json?.ok) {
      const message = json?.error || text || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return json;
  }

  async function verifyRecord(baseUrl, attributeBits, dataText) {
    if (!baseUrl || !attributeBits) return false;
    const params = new URLSearchParams({
      bitMax: String(attributeBits.max ?? ''),
      bitMin: String(attributeBits.min ?? ''),
      limit: '10'
    });
    const response = await fetch(`${baseUrl}/api/attributes/data?${params.toString()}`);
    if (!response.ok) return false;
    const result = await response.json().catch(() => ({}));
    const items = Array.isArray(result.items) ? result.items : [];
    return items.some(item => {
      const attr = item.attribute || {};
      const text = item.data?.text || item.s || '';
      return numbersAlmostEqual(attr.bitMax, attributeBits.max) &&
        numbersAlmostEqual(attr.bitMin, attributeBits.min) &&
        text.trim() === (dataText || '').trim();
    });
  }

  async function resetTestData(baseUrl, confirmToken = 'RESET') {
    if (!baseUrl) throw new Error('baseUrl required');
    const response = await fetch(`${baseUrl}/api/tests/reset-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmToken })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
    return json;
  }

  async function fetchRecords(baseUrl, { novelTitle = '', limit = 200 } = {}) {
    if (!baseUrl) throw new Error('baseUrl required');
    const params = new URLSearchParams();
    if (novelTitle) params.set('novelTitle', novelTitle);
    params.set('limit', String(Math.min(Math.max(limit, 1), 500)));
    const response = await fetch(`${baseUrl}/api/tests/records?${params.toString()}`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
    return json;
  }

  function formatTemplate(template, ctx) {
    if (!template || !template.trim()) return '';
    return template
      .replace(/{{\s*title\s*}}/gi, ctx.title ?? '')
      .replace(/{{\s*chapter\s*}}/gi, ctx.chapter ?? '')
      .replace(/{{\s*section\s*}}/gi, ctx.section ?? '')
      .replace(/{{\s*timestamp\s*}}/gi, new Date().toISOString());
  }

  function applyTemplate(text, ctx) {
    if (!text) return '';
    return text.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
      const value = ctx[key];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  const DEFAULT_NOVEL_TITLES = [
    '다크 판타지 실전편',
    '미드 라이너는 황무지에 있다',
    '그림자 도시의 연대기',
    '잿빛 왕좌와 은빛 칼날',
    '침묵의 할로우',
    '심연에서 온 기억'
  ];

  const DEFAULT_CHAPTER_BLUEPRINTS = [
    {
      title: '제1장',
      scene: '회의실의 긴장',
      synopsis: '{{novelTitle}} 팀이 호준의 이탈 소식을 듣고 균열이 드러난다.',
      sections: {
        구성: '{{novelTitle}} 팀은 폭우가 쏟아지는 본부 회의실에 모여 긴급 전략을 재정비한다. 리사는 호준의 이탈을 보고하며 균열의 실체를 드러낸다.',
        상세: '회의실 창밖의 번개와 빗줄기가 {{scene}}의 긴장감을 더한다. 리사의 손끝은 미세하게 떨리고, 팀원들은 서로 다른 감정을 숨긴 채 눈빛을 나눈다.',
        스토리: '제1장 - 회의실의 긴장\n\n리사는 조용히 회의실 문을 열었다. 무겁게 내려앉은 공기 속에서 팀원들의 시선이 일제히 그녀를 향했다. 그들의 눈빛에는 피로와 불신, 그리고 말로 표현할 수 없는 긴장이 엉켜 있었다.\n\n“호준이… 전장을 이탈했어.”\n\n리사의 목소리는 낮고 단단했지만, 그 손끝은 미세하게 떨렸다. 잠시, 정적이 흘렀다. 제임스가 입을 열었다.\n\n“리사, 지금… 뭐라고 했어? 호준이 도망쳤다고? 우리를 버렸다는 거야?”\n\n그의 말에는 분노와 믿기지 않는 절망이 뒤섞여 있었다. 리사는 시선을 피하지 않았다.\n\n“내가 직접 봤어. 그는 우리를 위험에 빠뜨렸어.”\n\n그녀의 말투는 냉정했지만, 그 안에는 설명할 수 없는 흔들림이 스며 있었다. 미나와 제이슨은 서로를 바라보았다. 둘의 눈빛은 확신보다 혼란에 가까웠다. 회의실 안의 공기는 점점 무겁게 응결되었고, 리사는 자신이 짊어진 비밀의 무게를 느꼈다.\n\n그때, 조용히 침묵하던 엘프 가드가 입을 열었다.\n\n“리사의 말을 믿어. 그녀는 우리를 위해 싸우고 있어.”\n\n짧은 한마디였지만, 냉기로 얼어붙은 공기가 조금 녹아내렸다. 리사는 그를 바라보며 미소를 지으려 했지만, 눈빛은 흔들리고 있었다. 복수, 의심, 죄책감이 뒤엉킨 소용돌이가 그녀의 내면을 휘감았다.',
        에필로그: '회의실은 잠시 잠잠해지지만, 리사는 호준의 뜻을 추적하기 위한 암호 메시지를 엘프 가드에게 남긴다.',
        '주요 사건': '- 리사가 호준의 이탈 사실을 보고한다.\n- 제임스가 분노하며 리사에게 진실을 추궁한다.\n- 엘프 가드가 리사를 신뢰하라고 발언한다.\n- 팀원들 사이에 미묘한 균열이 생긴다.'
      }
    },
    {
      title: '제2장',
      scene: '그림자가 드리운 복도',
      synopsis: '리사는 호준의 흔적을 쫓으며 보이지 않는 적의 기척을 감지한다.',
      sections: {
        구성: '회의가 끝난 뒤 리사는 복도를 순찰하며 남겨진 흔적을 수집한다. 그림자 같은 기척이 계속 따라붙고, 팀은 두 갈래로 움직인다.',
        상세: '{{scene}}은 어둡고 길다. 장식장에 걸린 전투 기록과 깃발이 지나간 영광과 상처를 동시에 상기시킨다. 엘프 가드는 감각을 곤두세우며 뒤를 따른다.',
        스토리: '챕터 2: 제2장 - 그림자가 드리운 복도\n\n리사는 회의실을 나와 복도를 걸었다. 그녀의 발걸음은 무거웠고, 머릿속은 혼란스러웠다. 호준의 이탈은 팀의 결속을 위협하고 있었다. 그녀는 자신이 팀을 지켜야 한다는 책임감을 느끼면서도, 호준이 왜 그런 결정을 했는지 이해하고 싶었다.\n\n복도를 지나치던 중, 그녀는 낯선 그림자가 벽을 스쳐 지나가는 것을 보았다. 순간적으로 멈춰서서 그림자를 따라가 보았지만, 아무것도 발견할 수 없었다. 그 순간, 그녀의 마음속에 불길한 예감이 스며들었다.\n\n회의실로 돌아가던 길에, 그녀는 엘프 가드에게 다가갔다. “혹시 방금 무슨 소리 들었어?”\n\n엘프 가드는 잠시 침묵하더니, 고개를 끄덕였다. “이곳에 이상한 기운이 감돌고 있어. 주의하는 게 좋을 거야.”\n\n리사는 팀원들이 있는 방으로 발걸음을 옮겼다. 미나와 제이슨은 호준의 마지막 기록을 분석하고 있었다.\n\n“우리가 모르는 비밀이 있을지도 몰라.” 제이슨의 목소리는 낮았지만 단호했다.\n\n리사는 결심한 듯 말했다. “우리는 이 상황을 함께 해결해야 해. 지금은 서로를 믿고 협력할 때야.”\n\n그녀의 말은 방 안의 긴장을 약간 완화했지만, 균열은 여전히 존재했다. 그래도 팀은 다시 한번 정보를 공유하며 다음 행동을 준비했다.',
        에필로그: '복도 끝에서 발견된 차가운 금속 조각이 호준의 장비와 일치한다는 사실이 드러나며 다음 장면을 예고한다.',
        '주요 사건': '- 리사가 복도에서 낯선 그림자를 목격한다.\n- 엘프 가드가 이상한 기운을 감지했다며 경고한다.\n- 미나와 제이슨이 호준의 마지막 기록을 분석한다.\n- 누군가가 남긴 암호 메시지가 발견된다.'
      }
    },
    {
      title: '제3장',
      scene: '옥상 위의 결의',
      synopsis: '어둠 속 옥상에서 리사는 팀의 운명을 결정할 새로운 계획을 다짐한다.',
      sections: {
        구성: '폭우가 멈춘 밤, 옥상에서 리사와 팀원들은 도시의 불빛을 내려다보며 다음 작전을 조율한다.',
        상세: '{{scene}}은 차가운 공기와 젖은 바닥, 멀리 울리는 사이렌으로 채워진다. 리사는 통신기를 쥔 채 팀별 임무를 재정리한다.',
        스토리: '챕터 3: 제3장 - 옥상 위의 결의\n\n빗물이 고인 옥상에서 리사는 깊게 숨을 내쉬었다. 아래로 내려다본 도시는 예전과 다르지 않게 빛나고 있었지만, 그녀에게는 모든 것이 변한 것처럼 느껴졌다. 호준의 빈자리가 남긴 파문은 아직 채 가라앉지 않았다.\n\n“우리는 멈출 수 없어.” 리사가 조용히 말했다. 그녀의 목소리에는 피곤함이 묻어 있었지만, 단단한 결의가 배어 있었다. 곧이어 엘프 가드가 다가와 고개를 끄덕였다.\n\n“내가 본부의 방어막을 다시 점검할게. 외부에서 들어오는 기척은 모두 차단하겠다.”\n\n미나와 제이슨도 옥상에 올랐다. 미나는 도시를 바라보며 속삭였다. “우리가 해야 할 일은 분명해. 호준이 왜 떠났는지 밝혀내고, 이 도시를 지키는 거야.”\n\n제이슨은 듀얼 단말을 확인하며 답했다. “외부 정보망을 활용하면 그의 행방을 좁힐 수 있을 거야. 시간이 걸리겠지만.”\n\n리사는 동료들을 둘러보며 말했다. “고마워. 우리는 다시 한 번 서로의 등을 지켜야 해. 이번에는 어떤 그림자도 우리를 갈라놓지 못하게 하자.”\n\n솟아오르는 새벽빛 속에서, 팀은 다시 한번 손을 맞잡았다.',
        에필로그: '리사는 옥상에서 내려오기 전, 호준에게 보내는 암호화된 메시지를 남기며 다음 추적을 예고한다.',
        '주요 사건': '- 리사가 세 갈래 작전을 제시한다.\n- 엘프 가드가 방어선을 강화하겠다고 다짐한다.\n- 미나와 제이슨이 외부 정보망을 정비한다.\n- 팀이 다시 원형을 이루어 결의를 다진다.'
      }
    }
  ];

  function createFallbackChapterBlueprint(chapterNumber) {
    return {
      title: `제${chapterNumber}장`,
      scene: `임시 장면 ${chapterNumber}`,
      synopsis: '{{novelTitle}} 팀이 예상치 못한 위협을 추적한다.',
      sections: SECTION_ORDER.reduce((acc, name) => {
        acc[name] = `${name} 자동 생성 메모\n- 제${chapterNumber}장에서 ${name}을(를) 확인합니다.`;
        return acc;
      }, {})
    };
  }

  function pickDefaultNovelTitle() {
    const base = DEFAULT_NOVEL_TITLES[Math.floor(Math.random() * DEFAULT_NOVEL_TITLES.length)];
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    return `${base} - ${time}`;
  }

  function buildSampleChapters(novelTitle, count, extraSectionNames = [], customTemplate = '') {
    const normalizedExtras = Array.from(new Set(extraSectionNames.filter(Boolean)));
    const chapters = [];
    for (let i = 0; i < count; i++) {
      const chapterNumber = i + 1;
      const base = DEFAULT_CHAPTER_BLUEPRINTS[i] || createFallbackChapterBlueprint(chapterNumber);
      const context = {
        novelTitle,
        chapterNumber,
        chapterTitle: base.title || `제${chapterNumber}장`,
        scene: base.scene || `Chapter ${chapterNumber}`,
        synopsis: base.synopsis || ''
      };

      const sections = [];
      if (Array.isArray(base.sections)) {
        base.sections.forEach(section => {
          sections.push({
            name: section.name,
            text: applyTemplate(section.text, context)
          });
        });
      } else if (base.sections && typeof base.sections === 'object') {
        SECTION_ORDER.forEach(name => {
          const text = base.sections[name];
          if (typeof text === 'string') {
            sections.push({ name, text: applyTemplate(text, context) });
          }
        });
        Object.keys(base.sections).forEach(name => {
          if (SECTION_ORDER.includes(name)) return;
          const text = base.sections[name];
          if (typeof text === 'string') {
            sections.push({ name, text: applyTemplate(text, context) });
          }
        });
      }

      normalizedExtras.forEach(name => {
        if (sections.some(section => section.name === name)) return;
        sections.push({
          name,
          text: `${name} 자동 생성 메모\n- ${context.chapterTitle} 단계에서 ${name}을(를) 점검합니다.\n- ${novelTitle} 팀은 ${context.scene}을 토대로 대응 전략을 정합니다.`
        });
      });
      if (customTemplate && customTemplate.trim().length > 0) {
        sections.push({
          name: '사용자 텍스트',
          text: formatTemplate(customTemplate, {
            title: novelTitle,
            chapter: `${context.chapterTitle} - ${context.scene}`,
            section: '사용자 텍스트'
          })
        });
      }
      chapters.push({
        number: chapterNumber,
        title: context.chapterTitle,
        scene: context.scene,
        synopsis: applyTemplate(base.synopsis || '', context),
        sections
      });
    }
    return chapters;
  }

  function buildChapterStructureText(novelTitle, chapters) {
    const lines = [];
    lines.push(`${novelTitle} - 챕터 구성 목록`);
    lines.push(`총 ${chapters.length}개 챕터`);
    lines.push('');
    chapters.forEach(chapter => {
      lines.push(`${chapter.number}. ${chapter.title} (${chapter.scene})`);
      if (chapter.synopsis) {
        lines.push(`   • 핵심: ${chapter.synopsis}`);
      }
      const sectionNames = chapter.sections.map(section => section.name).join(', ');
      lines.push(`   • 항목: ${sectionNames}`);
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  window.NovelAIShared = {
    constants: { BIT_COUNT, BIT_BASE_VALUE, BIT_DEFAULT_PREFIX },
    sectionOrder: SECTION_ORDER,
    calculateBitValues,
    numbersAlmostEqual,
    deleteExistingRecord,
    saveRecord,
    verifyRecord,
    resetTestData,
    fetchRecords,
    formatTemplate,
    applyTemplate,
    createFallbackChapterBlueprint,
    buildSampleChapters,
    buildChapterStructureText,
    pickDefaultNovelTitle
  };
})();


