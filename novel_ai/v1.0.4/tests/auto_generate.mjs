/**
 * Novel AI v1.0.4 – Automated configuration list test
 *
 * This script programmatically generates a novel with up to 5 chapters
 * by calling the existing `/api/attributes/data` endpoint. It reproduces
 * the client-side BIT calculations so the payload matches what the UI sends.
 *
 * Usage:
 *   node novel_ai/v1.0.4/tests/auto_generate.mjs
 *
 * Optional arguments / env vars:
 *   --base=<url>              (NOVEL_AI_BASE_URL)  API base URL (default http://127.0.0.1:8123)
 *   --title="..."             (NOVEL_AI_TEST_TITLE) Novel title to use (default: generated)
 *   --chapters=<n>            (NOVEL_AI_TEST_CHAPTERS) Number of chapters to create (default 5)
 *
 * Prerequisite: Run the server first (npm start inside novel_ai/v1.0.4/server).
 */

const args = process.argv.slice(2);

function readArg(name, envName, fallback) {
  const cli = args.find(arg => arg.startsWith(`${name}=`));
  if (cli) return cli.slice(name.length + 1);
  if (process.env[envName]) return process.env[envName];
  return fallback;
}

const defaultTitle = `자동화 테스트 소설 ${new Date().toISOString().replace(/[:.]/g, '-')}`;
const BASE_URL = readArg('--base', 'NOVEL_AI_BASE_URL', 'http://127.0.0.1:8123');
const NOVEL_TITLE = readArg('--title', 'NOVEL_AI_TEST_TITLE', defaultTitle);
const CHAPTER_COUNT = Math.max(1, Math.min(10, parseInt(readArg('--chapters', 'NOVEL_AI_TEST_CHAPTERS', '5'), 10) || 5));

if (typeof fetch !== 'function') {
  console.error('❌  Node fetch API가 필요합니다. Node.js 18 이상에서 실행해주세요.');
  process.exit(1);
}

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

function wordNbUnicodeFormat(text = '') {
  const domain = text && text.length > 0 ? `${BIT_DEFAULT_PREFIX}:${text}` : BIT_DEFAULT_PREFIX;
  const chars = Array.from(domain);
  return chars.map(char => {
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

function buildChapter(number) {
  const chapterNumber = number.toString();
  const chapterTitle = `테스트 장면 ${chapterNumber}`;
  const chapterText = `챕터 ${chapterNumber}: ${chapterTitle}`;
  const chapterBits = calculateBitValues(chapterText);
  return {
    info: {
      number: chapterNumber,
      title: chapterTitle,
      description: `자동화 테스트로 생성된 ${chapterNumber}번째 장면 요약입니다.`
    },
    text: chapterText,
    bits: chapterBits
  };
}

function buildAttribute(novelTitle, chapterNumber, chapterTitle, sectionName) {
  return `${novelTitle} → 챕터 ${chapterNumber}: ${chapterTitle} → ${sectionName}`;
}

async function postJSON(url, body, { expectOk = true } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (expectOk && !response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST ${url} failed (${response.status}): ${text}`);
  }
  return response;
}

async function deleteExisting(attributeBits, dataBits) {
  try {
    const response = await postJSON(
      `${BASE_URL}/api/attributes/data/delete`,
      {
        attributeBitMax: attributeBits.max,
        attributeBitMin: attributeBits.min,
        dataBitMax: dataBits.max,
        dataBitMin: dataBits.min
      },
      { expectOk: false }
    );
    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      if (result.deletedCount) {
        console.log(` - 기존 데이터 ${result.deletedCount}개 삭제`);
      }
    }
  } catch (error) {
    // 삭제는 선행 데이터가 없으면 실패할 수 있으므로 무시
    console.log(' - 삭제 스킵 (기존 데이터 없음으로 추정)');
  }
}

async function saveChapter({ attributeText, attributeBits, dataText, dataBits, novelBits, chapter }) {
  const payload = {
    attributeText,
    attributeBitMax: attributeBits.max,
    attributeBitMin: attributeBits.min,
    text: dataText,
    dataBitMax: dataBits.max,
    dataBitMin: dataBits.min,
    novelTitle: NOVEL_TITLE,
    novelTitleBitMax: novelBits.max,
    novelTitleBitMin: novelBits.min,
    chapter: chapter.info,
    chapterBitMax: chapter.bits.max,
    chapterBitMin: chapter.bits.min
  };

  await deleteExisting(attributeBits, dataBits);

  const response = await postJSON(`${BASE_URL}/api/attributes/data`, payload);
  const result = await response.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(`저장 실패: ${JSON.stringify(result)}`);
  }

  const verifyUrl = `${BASE_URL}/api/attributes/data?bitMax=${attributeBits.max}&bitMin=${attributeBits.min}&limit=5`;
  const verifyResponse = await fetch(verifyUrl);
  if (!verifyResponse.ok) {
    throw new Error(`검증 API 실패: ${verifyResponse.status}`);
  }
  const verifyResult = await verifyResponse.json().catch(() => ({}));
  const matched = (verifyResult.items || []).some(item => {
    const attr = item.attribute || {};
    const text = item.data?.text || item.s || '';
    return numbersAlmostEqual(attr.bitMax, attributeBits.max) &&
      numbersAlmostEqual(attr.bitMin, attributeBits.min) &&
      text.trim() === dataText.trim();
  });
  if (!matched) {
    throw new Error('검증 결과에서 저장된 데이터를 찾지 못했습니다.');
  }
}

async function collectSummary() {
  const url = `${BASE_URL}/api/attributes/filtered?novelTitle=${encodeURIComponent(NOVEL_TITLE)}&limit=200`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`구성 요약 조회 실패: ${response.status}`);
  const result = await response.json().catch(() => ({}));
  const attributes = result.attributes || result.items || [];
  const chapterAttributes = attributes.filter(attr => (attr.text || '').includes('챕터'));
  return {
    totalAttributes: attributes.length,
    chapterAttributes: chapterAttributes.length,
    attributes
  };
}

async function run() {
  console.log('🚀 Novel AI 자동화 테스트 시작');
  console.log(` - 서버: ${BASE_URL}`);
  console.log(` - 소설 제목: ${NOVEL_TITLE}`);
  console.log(` - 생성할 챕터 수: ${CHAPTER_COUNT}`);

  const novelBits = calculateBitValues(NOVEL_TITLE);
  const sections = ['구성', '상세', '스토리', '에필로그', '주요 사건'];

  for (let i = 0; i < CHAPTER_COUNT; i++) {
    const chapterIdx = i + 1;
    const chapter = buildChapter(chapterIdx);
    const sectionName = sections[i % sections.length];
    const attributeText = buildAttribute(NOVEL_TITLE, chapterIdx, chapter.info.title, sectionName);
    const attributeBits = calculateBitValues(attributeText);
    const dataText = `자동화 테스트용 텍스트: ${NOVEL_TITLE} - ${chapter.info.title} (${sectionName})\n` +
      `이 텍스트는 구성 목록 검증을 위해 생성되었습니다.\n` +
      `타임스탬프: ${new Date().toISOString()}`;
    const dataBits = calculateBitValues(dataText);

    console.log(`\n[챕터 ${chapterIdx}] 저장 중...`);
    console.log(` - 속성: ${attributeText}`);
    await saveChapter({ attributeText, attributeBits, dataText, dataBits, novelBits, chapter });
    console.log(` ✓ 챕터 ${chapterIdx} 저장 및 검증 완료`);
  }

  const summary = await collectSummary();
  console.log('\n📊 구성 목록 요약');
  console.log(` - 총 속성 수: ${summary.totalAttributes}`);
  console.log(` - 챕터 관련 속성 수: ${summary.chapterAttributes}`);

  const chapterEntries = summary.attributes
    .filter(attr => (attr.text || '').includes(NOVEL_TITLE))
    .slice(0, CHAPTER_COUNT)
    .map(attr => `   • ${attr.text || attr.attributeText || '속성 이름 없음'}`);

  if (chapterEntries.length) {
    console.log(' - 확인된 속성 목록:');
    chapterEntries.forEach(line => console.log(line));
  } else {
    console.log(' - 관련 속성을 찾지 못했습니다. 데이터 디렉터리를 확인하세요.');
  }

  console.log('\n✅ 자동화 테스트가 완료되었습니다.');
}

run().catch(error => {
  console.error('\n❌ 자동화 테스트 실패:', error);
  process.exitCode = 1;
});


