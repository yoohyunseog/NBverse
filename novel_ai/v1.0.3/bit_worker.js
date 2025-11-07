// Web Worker for BIT calculations to reduce UI lag

const DECIMALS = 15;
const fmt = v => Number(v).toFixed(DECIMALS);

// COUNT override as requested
const COUNT = 200;

function wordNbUnicodeFormat(domain) {
  const defaultPrefix = '';
  if (!domain || domain.length === 0) {
    domain = defaultPrefix;
  } else {
    domain = defaultPrefix + domain;
  }
  const chars = Array.from(domain);
  const langRanges = [
    { range: [0xAC00, 0xD7AF], prefix: 1000000 },
    { range: [0x3040, 0x309F], prefix: 2000000 },
    { range: [0x30A0, 0x30FF], prefix: 3000000 },
    { range: [0x4E00, 0x9FFF], prefix: 4000000 },
    { range: [0x0410, 0x044F], prefix: 5000000 },
    { range: [0x0041, 0x007A], prefix: 6000000 },
    { range: [0x0590, 0x05FF], prefix: 7000000 },
    { range: [0x00C0, 0x00FD], prefix: 8000000 },
    { range: [0x0E00, 0x0E7F], prefix: 9000000 },
  ];
  return chars.map(char => {
    const unicodeValue = char.codePointAt(0);
    const lang = langRanges.find(lang =>
      unicodeValue >= lang.range[0] && unicodeValue <= lang.range[1]
    );
    const prefix = lang ? lang.prefix : 0;
    return prefix + unicodeValue;
  });
}

function initializeArrays(len){
  return {
    BIT_START_A50: new Array(len).fill(0),
    BIT_START_A100: new Array(len).fill(0),
    BIT_START_B50: new Array(len).fill(0),
    BIT_START_B100: new Array(len).fill(0),
    BIT_START_NBA100: new Array(len).fill(0),
  };
}

function calculateBitOverride(nb, bit = 5.5, reverse = false) {
  if (!nb || nb.length < 2) return bit / 100;
  const BIT_NB = bit;
  const max = Math.max(...nb);
  const min = Math.min(...nb);
  const negativeRange = min < 0 ? Math.abs(min) : 0;
  const positiveRange = max > 0 ? max : 0;
  const denom = (COUNT * nb.length - 1) || 1;
  const negativeIncrement = negativeRange / denom;
  const positiveIncrement = positiveRange / denom;
  const arrays = initializeArrays(COUNT * nb.length);
  let count = 0;
  for (let value of nb) {
    for (let i = 0; i < COUNT; i++) {
      const BIT_END = 1;
      const A50 = value < 0 ? min + negativeIncrement * (count + 1)
                            : min + positiveIncrement * (count + 1);
      const A100 = (count + 1) * BIT_NB / (COUNT * nb.length);
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
  for (let value of nb) {
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

function BIT_MAX_NB(nb, bit = 5.5) {
  const result = calculateBitOverride(nb, bit, false);
  if (!isFinite(result) || isNaN(result) || result > 100 || result < -100) {
    return 0;
  }
  return result;
}
function BIT_MIN_NB(nb, bit = 5.5) {
  const result = calculateBitOverride(nb, bit, true);
  if (!isFinite(result) || isNaN(result) || result > 100 || result < -100) {
    return 0;
  }
  return result;
}

function asciiCodesFromString(str) {
  if (!str) return [];
  const chars = Array.from(str);
  const codes = [];
  for (const ch of chars) codes.push(ch.codePointAt(0));
  return codes;
}

self.onmessage = (e) => {
  const { text } = e.data || {};
  try {
    const arr = wordNbUnicodeFormat(text || '');
    const maxVal = BIT_MAX_NB(arr);
    const minVal = BIT_MIN_NB(arr);
    const ascii = asciiCodesFromString(text || '');
    self.postMessage({ ok: true, max: maxVal, min: minVal, len: arr.length, ascii });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};


