import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { exec } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8123', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Root to serve: project root one level up from server/
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = PROJECT_ROOT; // serve the whole current folder

// Data directory - v1.0.7 data folder (max/min only)
const DATA_DIR = path.join(PROJECT_ROOT, 'novel_ai', 'v1.0.7', 'data');
const LOG_FILE = path.join(DATA_DIR, 'log.ndjson');
const API_KEY_FILE = path.join(DATA_DIR, 'gpt_api_key.txt');
// max/min 폴더만 사용 - 다른 폴더는 제거됨
// 기존 폴더 변수들은 호환성을 위해 정의하지만 사용하지 않음
const CHARACTERS_DIR = path.join(DATA_DIR, 'characters');
const WORLD_DIR = path.join(DATA_DIR, 'world');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const HONEYCOMB_DIR = path.join(DATA_DIR, 'honeycomb');
const HIERARCHY_DIR = path.join(HONEYCOMB_DIR, 'hierarchy');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
// max/min 폴더는 nestedPathFromNumber 함수에서 자동 생성됨
// 다른 폴더는 생성하지 않음 (max/min만 허용)
// 중앙 로그 파일은 비활성화
// if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8');

// GPT API 키 로드 함수
function getApiKey() {
  try {
    if (fs.existsSync(API_KEY_FILE)) {
      const key = fs.readFileSync(API_KEY_FILE, 'utf8').trim();
      if (key && key.length > 0) {
        return key;
      } else {
        console.warn(`[API 키] 파일이 존재하지만 내용이 비어있습니다: ${API_KEY_FILE}`);
      }
    } else {
      console.warn(`[API 키] 파일이 존재하지 않습니다: ${API_KEY_FILE}`);
    }
  } catch (e) {
    console.error(`[API 키] 파일 읽기 오류: ${API_KEY_FILE}`, e);
  }
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    console.info('[API 키] 환경 변수에서 로드됨');
    return envKey;
  }
  return null;
}

// OAuth 설정 파일 경로
const OAUTH_CONFIG_FILE = path.join(DATA_DIR, 'oauth_config.json');

// OAuth 설정 로드 함수
function getOAuthConfig() {
  try {
    if (fs.existsSync(OAUTH_CONFIG_FILE)) {
      const content = fs.readFileSync(OAUTH_CONFIG_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('[OAuth] 설정 파일 읽기 실패:', e);
  }
  
  // 환경 변수에서 로드
  const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
  
  return {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`
    },
    naver: {
      clientId: process.env.NAVER_CLIENT_ID || '',
      clientSecret: process.env.NAVER_CLIENT_SECRET || '',
      redirectUri: process.env.NAVER_REDIRECT_URI || `${baseUrl}/api/auth/naver/callback`
    },
    kakao: {
      clientId: process.env.KAKAO_REST_API_KEY || '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
      redirectUri: process.env.KAKAO_REDIRECT_URI || `${baseUrl}/api/auth/kakao/callback`
    }
  };
}

// OAuth 설정 저장 함수
function saveOAuthConfig(config) {
  try {
    fs.writeFileSync(OAUTH_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[OAuth] 설정 파일 저장 실패:', e);
    return false;
  }
}

// ==================== BIT 계산 함수 ====================
const BIT_COUNT = 50;
const BIT_BASE_VALUE = 5.5;
const BIT_DEFAULT_PREFIX = '안 녕 한 국 인 터 넷 . 한 국';
let SUPER_BIT = 0;
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

function wordNbUnicodeFormat(text = '') {
  let domain = BIT_DEFAULT_PREFIX;
  if (text && text.length > 0) {
    domain = `${BIT_DEFAULT_PREFIX}:${text}`;
  }
  const chars = Array.from(domain);
  return chars.map(char => {
    const codePoint = char.codePointAt(0);
    const lang = LANGUAGE_RANGES.find(
      ({ range: [start, end] }) => codePoint >= start && codePoint <= end
    );
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

// ==================== 사용자 인증 및 BIT 계산 ====================
const JWT_SECRET = process.env.JWT_SECRET || 'novel_ai_secret_key_change_in_production';
const USERS_DIR = path.join(DATA_DIR, 'users');
const USERS_DB_FILE = path.join(USERS_DIR, 'users.json');

// 디렉토리 생성 함수
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 사용자 데이터베이스 초기화
function initializeUsersDatabase() {
  ensureDirectory(USERS_DIR);
  if (!fs.existsSync(USERS_DB_FILE)) {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

// 사용자 BIT 계산 함수 (ID 또는 닉네임 기반)
function calculateUserBit(userIdOrNickname) {
  const text = String(userIdOrNickname || '');
  const arr = wordNbUnicodeFormat(text);
  const max = BIT_MAX_NB(arr);
  const min = BIT_MIN_NB(arr);
  return { max, min };
}

// 사용자 데이터 저장 경로 생성
function getUserDataPath(userBitMax, userBitMin) {
  const userDir = path.join(USERS_DIR, String(userBitMax), String(userBitMin));
  ensureDirectory(userDir);
  return {
    base: userDir,
    novels: path.join(userDir, 'novels'),
    chapters: path.join(userDir, 'chapters'),
    characters: path.join(userDir, 'characters'),
    backgrounds: path.join(userDir, 'backgrounds'),
    stories: path.join(userDir, 'stories'),
    items: path.join(userDir, 'items')
  };
}

// 사용자 데이터베이스 읽기/쓰기
function readUsersDB() {
  try {
    const data = fs.readFileSync(USERS_DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: [] };
  }
}

function writeUsersDB(data) {
  // UTF-8 인코딩으로 저장 (한글 지원)
  fs.writeFileSync(USERS_DB_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8' });
}

// JWT 토큰 생성
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// JWT 토큰 검증 미들웨어
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  });
}

// 사용자 정보 가져오기 (토큰에서)
function getUserFromToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// 사용자 데이터베이스 초기화 실행
initializeUsersDatabase();

// ==================== OAuth 설정 API ====================

// OAuth 설정 조회
app.get('/api/auth/config', (req, res) => {
  try {
    const config = getOAuthConfig();
    // 시크릿 키는 제외하고 반환
    const safeConfig = {
      google: {
        clientId: config.google?.clientId || '',
        redirectUri: config.google?.redirectUri || ''
      },
      naver: {
        clientId: config.naver?.clientId || '',
        redirectUri: config.naver?.redirectUri || ''
      },
      kakao: {
        clientId: config.kakao?.clientId || '',
        redirectUri: config.kakao?.redirectUri || ''
      }
    };
    return res.json({ ok: true, config: safeConfig });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// OAuth 설정 저장
app.post('/api/auth/config', (req, res) => {
  try {
    const { google, naver, kakao } = req.body || {};
    const config = getOAuthConfig();
    
    if (google) {
      if (google.clientId) config.google.clientId = google.clientId;
      if (google.clientSecret) config.google.clientSecret = google.clientSecret;
      if (google.redirectUri) config.google.redirectUri = google.redirectUri;
    }
    if (naver) {
      if (naver.clientId) config.naver.clientId = naver.clientId;
      if (naver.clientSecret) config.naver.clientSecret = naver.clientSecret;
      if (naver.redirectUri) config.naver.redirectUri = naver.redirectUri;
    }
    if (kakao) {
      if (kakao.clientId) config.kakao.clientId = kakao.clientId;
      if (kakao.clientSecret) config.kakao.clientSecret = kakao.clientSecret;
      if (kakao.redirectUri) config.kakao.redirectUri = kakao.redirectUri;
    }
    
    if (saveOAuthConfig(config)) {
      return res.json({ ok: true });
    } else {
      return res.status(500).json({ ok: false, error: '설정 저장 실패' });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// ===== Novels Storage =====
function getNovelDir(novelId) {
  return path.join(NOVELS_DIR, novelId);
}
function readNovelMeta(novelId) {
  const dir = getNovelDir(novelId);
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return null; }
}
function writeNovelMeta(novelId, meta) {
  const dir = getNovelDir(novelId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

// List novels - max/min 폴더에서 속성 데이터로부터 소설 목록 추출
app.get('/api/novels', async (req, res) => {
  try {
    // max/min 폴더에서 모든 속성을 수집하여 소설 목록 생성
    const attributes = await collectAllAttributes();
    const novelMap = new Map();
    
    for (const attr of attributes) {
      const attrText = (attr.text || '').trim();
      if (!attrText || !attrText.includes(' → ')) continue;
      
      const parts = attrText.split(' → ').map(p => p.trim()).filter(Boolean);
      if (parts.length < 1) continue;
      
      const novelTitle = parts[0];
      if (!novelMap.has(novelTitle)) {
        // 챕터 수 계산
        let chapterCount = 0;
        const chapterSet = new Set();
        for (const a of attributes) {
          if (a.text && a.text.startsWith(novelTitle + ' → ')) {
            const chapterMatch = a.text.match(/챕터\s*(\d+)/i);
            if (chapterMatch) {
              chapterSet.add(chapterMatch[1]);
            }
          }
        }
        chapterCount = chapterSet.size;
        
        novelMap.set(novelTitle, {
          id: novelTitle.replace(/\s+/g, '_'),
          title: novelTitle,
          genre: '',
          chapters: chapterCount,
          updated_time: new Date().toISOString()
        });
      }
    }
    
    const items = Array.from(novelMap.values());
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Create or update novel
app.post('/api/novels', (req, res) => {
  try {
    let { id, title, genre } = req.body || {};
    title = title || '제목 미정';
    genre = genre || '';
    if (!id) id = 'novel_' + Date.now();
    const now = new Date().toISOString();
    const prev = readNovelMeta(id) || {};
    const meta = {
      id,
      title,
      genre,
      created_time: prev.created_time || now,
      updated_time: now,
      chapters: prev.chapters || 0
    };
    writeNovelMeta(id, meta);
    res.json({ ok: true, novel: meta });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Create or update novel (my novels endpoint - 속성 기반)
app.post('/api/my/novels', (req, res) => {
  try {
    const { title, attributePath, topPath, topData, attributeData } = req.body || {};
    
    // 속성 기반 시스템에서는 실제로 별도의 소설 메타데이터를 저장하지 않음
    // 대신 속성 데이터가 이미 /api/attributes/data로 저장되어 있으므로, 성공 응답만 반환
    // 클라이언트에서 이미 BIT 값을 계산하여 저장했으므로, 여기서는 단순히 확인만 함
    
    console.log('[My Novels] 소설 정보 저장 확인:', {
      title: title || '(없음)',
      attributePath: attributePath ? attributePath.substring(0, 50) : '(없음)',
      topPath: topPath ? topPath.substring(0, 50) : '(없음)',
      hasTopData: !!topData,
      hasAttributeData: !!attributeData
    });
    
    res.json({ 
      ok: true, 
      title: title || null,
      attributePath: attributePath || null,
      topPath: topPath || null,
      topData: topData || null,
      attributeData: attributeData || null,
      message: '소설 정보가 속성 데이터로 저장되었습니다.'
    });
  } catch (e) {
    console.error('[My Novels] 오류:', e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Get novel
app.get('/api/novels/:id', (req, res) => {
  try {
    const meta = readNovelMeta(req.params.id);
    if (!meta) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, novel: meta });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// List chapters (with previews or full text)
app.get('/api/novels/:id/chapters', (req, res) => {
  try {
    const id = req.params.id;
    const { full } = req.query || {};
    const dir = getNovelDir(id);
    if (!fs.existsSync(dir)) return res.status(404).json({ ok: false, error: 'Not found' });
    const chaptersDir = path.join(dir, 'chapters');
    const out = [];
    if (fs.existsSync(chaptersDir)) {
      const files = fs.readdirSync(chaptersDir).filter(f => /^(\d+)\.txt$/.test(f));
      files.sort((a,b)=>Number(a.replace(/\.txt$/,'')) - Number(b.replace(/\.txt$/,'')));
      for (const f of files) {
        const num = Number(f.replace(/\.txt$/,''));
        const text = fs.readFileSync(path.join(chaptersDir, f), 'utf8');
        out.push({ num, text: full ? text : (text.substring(0, 120) + (text.length>120?'...':'')) });
      }
    }
    // outline (0) if exists
    const outlinePath = path.join(dir, 'outline.txt');
    const outline = fs.existsSync(outlinePath) ? fs.readFileSync(outlinePath, 'utf8') : null;
    res.json({ ok: true, outline: outline ? (full ? outline : (outline.substring(0, 120) + '...')) : null, chapters: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Get single chapter full text
app.get('/api/novels/:id/chapters/:num', (req, res) => {
  try {
    const id = req.params.id;
    const num = req.params.num;
    const dir = getNovelDir(id);
    if (!fs.existsSync(dir)) return res.status(404).json({ ok: false, error: 'Not found' });
    let text = null;
    if (num === '0' || num === 'outline') {
      const outlinePath = path.join(dir, 'outline.txt');
      if (fs.existsSync(outlinePath)) text = fs.readFileSync(outlinePath, 'utf8');
    } else {
      const chaptersDir = path.join(dir, 'chapters');
      const filePath = path.join(chaptersDir, `${num}.txt`);
      if (fs.existsSync(filePath)) text = fs.readFileSync(filePath, 'utf8');
    }
    if (text === null) return res.status(404).json({ ok: false, error: 'Chapter not found' });
    res.json({ ok: true, num: Number(num) || 0, text });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Append/save chapter
app.post('/api/novels/:id/chapters', (req, res) => {
  try {
    const id = req.params.id;
    let { num, text, isOutline } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ ok: false, error: 'text required' });
    const dir = getNovelDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date().toISOString();
    const meta = readNovelMeta(id) || { id, title: '제목 미정', genre: '', created_time: now, chapters: 0 };
    if (isOutline) {
      fs.writeFileSync(path.join(dir, 'outline.txt'), text, 'utf8');
      meta.updated_time = now;
      writeNovelMeta(id, meta);
      return res.json({ ok: true, saved: 'outline' });
    }
    const chaptersDir = path.join(dir, 'chapters');
    fs.mkdirSync(chaptersDir, { recursive: true });
    if (!Number.isFinite(Number(num))) {
      // auto-append
      const files = fs.existsSync(chaptersDir) ? fs.readdirSync(chaptersDir).filter(f => /^(\d+)\.txt$/.test(f)) : [];
      const nextNum = files.length ? Math.max(...files.map(f => Number(f.replace(/\.txt$/,'')))) + 1 : 1;
      num = nextNum;
    }
    fs.writeFileSync(path.join(chaptersDir, `${num}.txt`), text, 'utf8');
    meta.chapters = Math.max(meta.chapters || 0, Number(num));
    meta.updated_time = now;
    writeNovelMeta(id, meta);
    res.json({ ok: true, saved: Number(num) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Notes read/write for a novel
app.get('/api/novels/:id/notes', (req, res) => {
  try {
    const id = req.params.id;
    const dir = getNovelDir(id);
    if (!fs.existsSync(dir)) return res.status(404).json({ ok: false, error: 'Not found' });
    const notesPath = path.join(dir, 'notes.txt');
    const text = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '';
    return res.json({ ok: true, text });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/novels/:id/notes', (req, res) => {
  try {
    const id = req.params.id;
    const { text } = req.body || {};
    const dir = getNovelDir(id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const notesPath = path.join(dir, 'notes.txt');
    fs.writeFileSync(notesPath, String(text || ''), 'utf8');
    const meta = readNovelMeta(id) || { id, title: '제목 미정', genre: '', created_time: new Date().toISOString(), chapters: 0 };
    meta.updated_time = new Date().toISOString();
    writeNovelMeta(id, meta);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// If /database/index.html is requested with nb_max/nb_min query, return JSON (deprecated here)
app.get('/database/index.html', (req, res, next) => {
  const { nb_max, nb_min, n } = req.query || {};
  const hasParams = typeof nb_max !== 'undefined' || typeof nb_min !== 'undefined';
  if (!hasParams) return next();
  try {
    res.status(400).json({ ok: false, error: 'Use /api/log/by-max or /api/log/by-min' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

function nestedPathFromNumber(label, num) {
  // 전체 정밀도 유지를 위해 더 많은 소수점 자릿수 사용 (최대 20자리)
  // JavaScript Number의 전체 정밀도는 약 15-17자리이므로 충분히 포함
  const str = Math.abs(num).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
  const digits = (str.match(/\d/g) || []);
  const baseDir = path.join(DATA_DIR, label, ...digits);
  const leaf = label === 'max' ? 'max_bit' : 'min_bit';
  const targetDir = path.join(baseDir, leaf);
  return { targetDir, nestedFile: path.join(targetDir, 'log.ndjson'), baseDir, digits };
}

// 재귀적으로 하위 폴더의 모든 log.ndjson 파일 찾기
function findAllLogFiles(baseDir, label, digits) {
  const leaf = label === 'max' ? 'max_bit' : 'min_bit';
  const results = [];
  const seen = new Set(); // 중복 방지
  
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === leaf) {
            const logFile = path.join(fullPath, 'log.ndjson');
            if (fs.existsSync(logFile) && !seen.has(logFile)) {
              seen.add(logFile);
              results.push(logFile);
            }
          } else {
            walkDir(fullPath);
          }
        }
      }
    } catch (e) {
      // 디렉토리 읽기 실패 시 무시
    }
  }
  
  // 시작 디렉토리: 주어진 숫자 접두사에서 뒤쪽 0을 제거한 최상위 접두 경로
  const rootLabelDir = path.join(DATA_DIR, label);
  let startDigits = Array.isArray(digits) ? digits.slice() : [];
  let lastNonZero = -1;
  for (let i = startDigits.length - 1; i >= 0; i--) {
    if (startDigits[i] !== '0') { lastNonZero = i; break; }
  }
  if (lastNonZero >= 0) startDigits = startDigits.slice(0, lastNonZero + 1);
  // 최소 한 자리(정수부)라도 남기기
  if (startDigits.length === 0 && Array.isArray(digits) && digits.length > 0) startDigits = [digits[0]];

  let startDir = path.join(rootLabelDir, ...startDigits);
  // 존재하지 않으면 위로 줄이며 존재하는 첫 경로를 선택
  while (!fs.existsSync(startDir) && startDigits.length > 0) {
    startDigits.pop();
    startDir = path.join(rootLabelDir, ...startDigits);
  }
  if (!fs.existsSync(startDir)) startDir = rootLabelDir;

  // 선택된 시작 경로 하위 전체 탐색
  walkDir(startDir);
  
  return results;
}

// Append a record to NDJSON
app.post('/api/log', (req, res) => {
  const record = req.body || {};
  try {
    if (!record.t) record.t = Date.now();
    const maxNum = Number(record.max);
    const minNum = Number(record.min);
    // 중복 체크: 타임스탬프 제외하고 s, max, min만으로 체크
    const dedupKey = `${record.s ?? ''}|${maxNum}|${minNum}`;
    if (!app.__recentKeys) app.__recentKeys = new Set();
    if (app.__recentKeys.has(dedupKey)) return res.json({ ok: true, deduped: true });
    
    // 저장 전 파일에서도 중복 확인
    let isDuplicate = false;
    if (Number.isFinite(maxNum)) {
      const { nestedFile } = nestedPathFromNumber('max', maxNum);
      if (fs.existsSync(nestedFile)) {
        try {
          const text = fs.readFileSync(nestedFile, 'utf8');
          const lines = text.split(/\r?\n/).filter(Boolean);
          for (const l of lines) {
            try {
              const existing = JSON.parse(l);
              if ((existing.s ?? '') === (record.s ?? '') && 
                  Math.abs(Number(existing.max || 0) - maxNum) < 1e-10 &&
                  Math.abs(Number(existing.min || 0) - minNum) < 1e-10) {
                isDuplicate = true;
                break;
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
    }
    if (isDuplicate) {
      app.__recentKeys.add(dedupKey);
      console.log('[LOG] duplicate detected:', dedupKey);
      return res.json({ ok: true, deduped: true });
    }
    
    const line = JSON.stringify(record) + '\n';
    app.__recentKeys.add(dedupKey);
    if (app.__recentKeys.size > 2000) { app.__recentKeys.clear(); app.__recentKeys.add(dedupKey); }

    let written = { max: null, min: null };
    if (Number.isFinite(maxNum)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('max', maxNum);
      try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
      try { fs.appendFileSync(nestedFile, line); console.log('[LOG] max write:', nestedFile); written.max = nestedFile; } catch (e) { console.warn('[LOG] max write failed:', nestedFile, e); }
    }
    if (Number.isFinite(minNum)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('min', minNum);
      try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
      try { fs.appendFileSync(nestedFile, line); console.log('[LOG] min write:', nestedFile); written.min = nestedFile; } catch (e) { console.warn('[LOG] min write failed:', nestedFile, e); }
    }

    return res.json({ ok: true, files: written });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Read nested log by max value
app.get('/api/log/by-max', (req, res) => {
  try {
    const maxNum = Number(req.query.nb_max);
    if (!Number.isFinite(maxNum)) return res.status(400).json({ ok: false, error: 'nb_max must be number' });
    const limit = Math.min(parseInt(req.query.n || '200', 10) || 200, 5000);
    const { targetDir, nestedFile, baseDir, digits } = nestedPathFromNumber('max', maxNum);
    
    // 정확한 경로에 파일이 있으면 그대로 사용
    if (fs.existsSync(nestedFile)) {
      const text = fs.readFileSync(nestedFile, 'utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      const slice = lines.slice(-limit).map(l=>{ try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return res.json({ ok: true, params: { nb_max: maxNum }, file: nestedFile, count: slice.length, items: slice });
    }
    
    // 정확한 경로에 없으면 하위 폴더 재귀 탐색
    const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
    if (allLogFiles.length === 0) {
      return res.json({ ok: true, params: { nb_max: maxNum }, dir: baseDir, count: 0, items: [] });
    }
    
    // 모든 파일을 읽어서 합치기
    let allItems = [];
    for (const logFile of allLogFiles) {
      try {
        const text = fs.readFileSync(logFile, 'utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        const items = lines.map(l=>{ try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        allItems.push(...items);
      } catch (e) {
        // 파일 읽기 실패 시 무시
      }
    }
    
    // 시간순 정렬 (최신순)
    allItems.sort((a, b) => (b.t || 0) - (a.t || 0));
    const slice = allItems.slice(0, limit);
    return res.json({ ok: true, params: { nb_max: maxNum }, files: allLogFiles.length, dir: baseDir, count: slice.length, items: slice });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Read nested log by min value
app.get('/api/log/by-min', (req, res) => {
  try {
    const minNum = Number(req.query.nb_min);
    if (!Number.isFinite(minNum)) return res.status(400).json({ ok: false, error: 'nb_min must be number' });
    const limit = Math.min(parseInt(req.query.n || '200', 10) || 200, 5000);
    const { targetDir, nestedFile, baseDir, digits } = nestedPathFromNumber('min', minNum);
    
    // 정확한 경로에 파일이 있으면 그대로 사용
    if (fs.existsSync(nestedFile)) {
      const text = fs.readFileSync(nestedFile, 'utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      const slice = lines.slice(-limit).map(l=>{ try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return res.json({ ok: true, params: { nb_min: minNum }, file: nestedFile, count: slice.length, items: slice });
    }
    
    // 정확한 경로에 없으면 하위 폴더 재귀 탐색
    const allLogFiles = findAllLogFiles(baseDir, 'min', digits);
    if (allLogFiles.length === 0) {
      return res.json({ ok: true, params: { nb_min: minNum }, dir: baseDir, count: 0, items: [] });
    }
    
    // 모든 파일을 읽어서 합치기
    let allItems = [];
    for (const logFile of allLogFiles) {
      try {
        const text = fs.readFileSync(logFile, 'utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        const items = lines.map(l=>{ try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        allItems.push(...items);
      } catch (e) {
        // 파일 읽기 실패 시 무시
      }
    }
    
    // 시간순 정렬 (최신순)
    allItems.sort((a, b) => (b.t || 0) - (a.t || 0));
    const slice = allItems.slice(0, limit);
    return res.json({ ok: true, params: { nb_min: minNum }, files: allLogFiles.length, dir: baseDir, count: slice.length, items: slice });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// GPT API 키 저장
app.post('/api/gpt/key', (req, res) => {
  try {
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ ok: false, error: 'apiKey required' });
    }
    try {
      fs.writeFileSync(API_KEY_FILE, apiKey.trim(), 'utf8');
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// GPT API 키 확인
app.get('/api/gpt/key', (req, res) => {
  try {
    const apiKey = getApiKey();
    const hasKey = !!apiKey && apiKey.length > 0;
    console.log(`[API 키 확인] hasKey: ${hasKey}, 파일 경로: ${API_KEY_FILE}, 파일 존재: ${fs.existsSync(API_KEY_FILE)}`);
    return res.json({ ok: true, hasKey, filePath: API_KEY_FILE, fileExists: fs.existsSync(API_KEY_FILE) });
  } catch (e) {
    console.error('[API 키 확인] 오류:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// GPT API 호출 (GPT-4o mini)
app.post('/api/gpt/chat', async (req, res) => {
  try {
    const { prompt, systemMessage, model = 'gpt-4o-mini', temperature = 0.7, maxTokens = 2000, context } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'prompt required' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: 'OpenAI API key not configured. Please set it via /api/gpt/key' });
    }

    const openai = new OpenAI({ apiKey });

    const messages = [];
    if (systemMessage && typeof systemMessage === 'string') {
      messages.push({ role: 'system', content: systemMessage });
    }
    
    // 컨텍스트가 있으면 추가 (캐릭터, 세계관 정보)
    if (context && typeof context === 'string') {
      messages.push({ role: 'system', content: `[세계관 컨텍스트]\n${context}` });
    }
    
    messages.push({ role: 'user', content: prompt });

    // 새로운 모델(gpt-5-*)은 max_completion_tokens 사용, temperature는 기본값(1)만 지원
    const isNewModel = model && model.startsWith('gpt-5');
    const requestOptions = {
      model,
      messages,
    };
    
    if (isNewModel) {
      // gpt-5-* 모델은 temperature를 지원하지 않거나 기본값(1)만 지원
      // temperature 파라미터를 설정하지 않음 (기본값 사용)
      requestOptions.max_completion_tokens = Number(maxTokens) || 2000;
    } else {
      requestOptions.temperature = Number(temperature) || 0.7;
      requestOptions.max_tokens = Number(maxTokens) || 2000;
    }

    let completion;
    try {
      completion = await openai.chat.completions.create(requestOptions);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes('not in v1/chat/completions') || msg.includes('not supported')) {
        const fb = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: Number(temperature) || 0.7,
          max_tokens: Number(maxTokens) || 2000,
        });
        const fbResponse = fb.choices[0]?.message?.content || '';
        return res.json({ ok: true, response: fbResponse, model: fb.model, usage: fb.usage, fallback: true });
      }
      throw err;
    }

    let response = completion.choices[0]?.message?.content || '';
    if (!response || !String(response).trim()) {
      try {
        const fb = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: Number(temperature) || 0.7,
          max_tokens: Number(maxTokens) || 2000,
        });
        response = fb.choices[0]?.message?.content || '';
        return res.json({ ok: true, response, model: fb.model, usage: fb.usage, fallback: true });
      } catch (_) {
        // 폴백 실패 시 그대로 진행 (빈 응답 처리)
      }
    }
    
    return res.json({ 
      ok: true, 
      response,
      model: completion.model,
      usage: completion.usage
    });
  } catch (e) {
    console.error('[GPT] error:', e);
    console.error('[GPT] error details:', {
      message: e.message,
      name: e.name,
      stack: e.stack,
      model: req.body?.model,
      promptLength: req.body?.prompt?.length
    });
    return res.status(500).json({ 
      ok: false, 
      error: String(e.message || e),
      details: process.env.NODE_ENV === 'development' ? {
        name: e.name,
        stack: e.stack
      } : undefined
    });
  }
});

// GPT Responses API (for models that require v1/responses, e.g., gpt-5-*, gpt-4.1-mini)
app.post('/api/gpt/responses', async (req, res) => {
  try {
    const { input, systemMessage, model = 'gpt-4.1-mini', temperature = 1, maxTokens = 1500, context, truncate = true } = req.body || {};

    if (!input || typeof input !== 'string') {
      return res.status(400).json({ ok: false, error: 'input required' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: 'OpenAI API key not configured. Please set it via /api/gpt/key' });
    }

    const openai = new OpenAI({ apiKey });

    // Optional truncation to stabilize long prompts
    let finalInput = input;
    if (truncate && finalInput.length > 20000) {
      // Prefer keeping header and last 6000 chars of the story section
      const marker = '[이전 이야기]';
      const idx = finalInput.indexOf(marker);
      if (idx !== -1) {
        const head = finalInput.slice(0, idx + marker.length);
        const tail = finalInput.slice(-6000);
        finalInput = `${head}\n${tail}`;
      } else {
        finalInput = finalInput.slice(-8000);
      }
    }

    // Build Responses API request
    const request = {
      model,
      // For Responses API, use input instead of messages
      input: finalInput,
    };

    // Attach system/context via prefix when available
    if (systemMessage || context) {
      const headerParts = [];
      if (systemMessage) headerParts.push(`[시스템]\n${systemMessage}`);
      if (context) headerParts.push(`[세계관 컨텍스트]\n${context}`);
      const headerText = headerParts.join('\n\n');
      request.input = headerText ? `${headerText}\n\n${finalInput}` : finalInput;
    }

    // Parameter compatibility for Responses API
    // Newer models expect max_output_tokens (not max_tokens/max_completion_tokens)
    request.max_output_tokens = Number(maxTokens) || 1500;
    // Some 5-series models only accept default temperature; omit when model startsWith gpt-5
    if (!(model && String(model).startsWith('gpt-5'))) {
      request.temperature = Number(temperature) || 1;
    }

    const response = await openai.responses.create(request);

    // Extract text safely from Responses API
    let text = '';
    if (response.output_text) {
      text = response.output_text;
    } else if (Array.isArray(response.output)) {
      // Aggregate text from content blocks
      try {
        const parts = [];
        for (const item of response.output) {
          if (Array.isArray(item.content)) {
            for (const c of item.content) if (c.type === 'output_text' && c.text) parts.push(c.text);
          }
        }
        text = parts.join('\n');
      } catch {
        text = '';
      }
    } else if (response.content && Array.isArray(response.content)) {
      // Legacy shape
      text = response.content.map(c => (c.text?.value || c.text || '')).join('\n');
    }

    if (!text || !String(text).trim()) {
      return res.status(200).json({ ok: true, response: '', model: response.model || model, usage: response.usage || null });
    }

    return res.json({ ok: true, response: text, model: response.model || model, usage: response.usage || null });
  } catch (e) {
    console.error('[GPT][responses] error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GPT 분석기 - 화자(대화 주체) 및 사용자 정보 추출
app.post('/api/gpt/analyze', async (req, res) => {
  try {
    const { input, bitMax, bitMin, userId = 'user_default' } = req.body || {};
    
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ ok: false, error: 'input required' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: 'OpenAI API key not configured' });
    }

    const openai = new OpenAI({ apiKey });

    // 기존 사용자 정보 로드 (있는 경우)
    let existingUserData = null;
    try {
      const userCharPath = getCharacterPath(userId);
      if (fs.existsSync(userCharPath)) {
        existingUserData = JSON.parse(fs.readFileSync(userCharPath, 'utf8'));
      }
    } catch (e) {
      // 기존 정보가 없어도 계속 진행
    }

    const existingInfo = existingUserData ? `\n\n[기존 사용자 정보]\n- 이름: ${existingUserData.name || '알 수 없음'}\n- 경험치: ${existingUserData.experience || 0}\n- 스킬: ${existingUserData.skills?.join(', ') || '없음'}\n- 현재 장소: ${existingUserData.currentPlace || '알 수 없음'}\n- 과거: ${existingUserData.past || '없음'}` : '';

    const analyzePrompt = `다음 문장을 분석하여 화자(누가 말했는가)와 장소, 감정, 톤을 추출하고, **사용자 캐릭터 정보**도 분석해주세요. 판타지 소설의 한 부분으로 분석하세요. JSON 형식으로 응답해주세요.

입력 문장: "${input}"
BIT 상태: MAX=${bitMax || 'N/A'}, MIN=${bitMin || 'N/A'}${existingInfo}

응답 형식 (JSON만 반환):
{
  "who": "화자 이름 또는 역할 (판타지 캐릭터, 마법사, 전사, 드래곤 등 가능)",
  "role": "역할 (화자/관찰자/나레이터/주인공/조연 등)",
  "place": "장소 이름 (판타지 장소: 마법의 숲, 고대 성, 드래곤의 둥지 등)",
  "emotion": "감정 (기다림/슬픔/기쁨/무관심/긴장/두려움 등)",
  "tone": "톤 (쓸쓸함/차분함/급함/따뜻함/장엄함/신비로움 등)",
  "hasCharacter": true/false,
  "hasPlace": true/false,
  "user": {
    "name": "사용자 캐릭터 이름 (없으면 '모험가' 또는 '주인공')",
    "experience": 숫자값 (경험치, 기본값: 0),
    "level": 숫자값 (레벨, 경험치에 따라 계산),
    "skills": ["스킬1", "스킬2", ...] (배열, 없으면 []),
    "currentPlace": "현재 장소 이름",
    "past": "과거 경험이나 배경 이야기 (간단히)",
    "future": "미래 예측 (다음에 일어날 일이나 목표)"
  }
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: analyzePrompt }],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    }).catch(e => {
      console.error('[GPT] analyze API error:', e);
      throw e;
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (e) {
      // JSON 파싱 실패 시 기본값
      analysis = {
        who: '작가',
        role: '나레이터',
        place: null,
        emotion: '중립',
        tone: '차분함',
        hasCharacter: false,
        hasPlace: false,
        user: {
          name: '모험가',
          experience: 0,
          level: 1,
          skills: [],
          currentPlace: null,
          past: '',
          future: ''
        }
      };
    }

    // 사용자 정보가 있으면 자동으로 캐릭터로 저장
    if (analysis.user) {
      try {
        const userCharPath = getCharacterPath(userId);
        let userChar = existingUserData || {};
        
        const now = new Date().toISOString();
        if (!userChar.created_time) userChar.created_time = now;
        userChar.last_active_time = now;
        
        // 사용자 정보 업데이트 (기존 값 유지하되 새 값으로 덮어쓰기)
        if (analysis.user.name) userChar.name = analysis.user.name;
        if (analysis.user.experience !== undefined) {
          userChar.experience = Math.max(userChar.experience || 0, analysis.user.experience || 0);
        }
        if (analysis.user.level !== undefined) {
          userChar.level = analysis.user.level || Math.floor((userChar.experience || 0) / 100) + 1;
        }
        if (analysis.user.skills && Array.isArray(analysis.user.skills)) {
          if (!userChar.skills) userChar.skills = [];
          analysis.user.skills.forEach(skill => {
            if (skill && !userChar.skills.includes(skill)) {
              userChar.skills.push(skill);
            }
          });
        }
        if (analysis.user.currentPlace) userChar.currentPlace = analysis.user.currentPlace;
        if (analysis.user.past) userChar.past = analysis.user.past;
        if (analysis.user.future) userChar.future = analysis.user.future;
        
        // BIT 상태 저장
        if (bitMax && bitMin) {
          userChar.bit_state = { max: bitMax, min: bitMin };
        }
        
        // 대화 기록 추가
        if (!userChar.speaks) userChar.speaks = [];
        userChar.speaks.push({
          scene_id: `scene_${Date.now()}`,
          input: input,
          timestamp: now,
          bit: { max: bitMax || null, min: bitMin || null }
        });
        
        fs.writeFileSync(userCharPath, JSON.stringify(userChar, null, 2), 'utf8');
        console.log('[User] Character saved:', userId, { experience: userChar.experience, level: userChar.level, skills: userChar.skills });
      } catch (e) {
        console.error('[User] Save error:', e);
      }
    }
    
    return res.json({ 
      ok: true, 
      analysis,
      usage: completion.usage
    });
  } catch (e) {
    console.error('[GPT] analyze error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Character Manager - NPC 생성/조회/갱신
function getCharacterPath(npcId) {
  return path.join(CHARACTERS_DIR, `${npcId}.json`);
}

app.post('/api/characters', (req, res) => {
  try {
    const { npcId, name, firstScene, emotion, tone, bitState, speaks } = req.body || {};
    
    if (!npcId || typeof npcId !== 'string') {
      return res.status(400).json({ ok: false, error: 'npcId required' });
    }

    const charPath = getCharacterPath(npcId);
    let character = {};
    
    // 기존 캐릭터가 있으면 로드
    if (fs.existsSync(charPath)) {
      try {
        character = JSON.parse(fs.readFileSync(charPath, 'utf8'));
      } catch (e) {
        // 파일 읽기 실패 시 새로 시작
      }
    }

    // 캐릭터 정보 업데이트
    const now = new Date().toISOString();
    if (!character.created_time) character.created_time = now;
    character.last_active_time = now;
    
    if (name) character.name = name;
    if (firstScene) character.first_scene = firstScene;
    if (emotion) character.emotion = emotion;
    if (tone) character.tone = tone;
    if (bitState) character.bit_state = bitState;
    
    if (!character.speaks) character.speaks = [];
    if (speaks && typeof speaks === 'object') {
      character.speaks.push({
        scene_id: `scene_${Date.now()}`,
        input: speaks.input || '',
        timestamp: now,
        bit: speaks.bit || {}
      });
    }

    // 저장
    fs.writeFileSync(charPath, JSON.stringify(character, null, 2), 'utf8');
    
    return res.json({ ok: true, character });
  } catch (e) {
    console.error('[Character] error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/characters/:npcId', (req, res) => {
  try {
    const { npcId } = req.params;
    const charPath = getCharacterPath(npcId);
    
    if (!fs.existsSync(charPath)) {
      return res.status(404).json({ ok: false, error: 'Character not found' });
    }
    
    const character = JSON.parse(fs.readFileSync(charPath, 'utf8'));
    return res.json({ ok: true, character });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/characters', (req, res) => {
  try {
    const characters = [];
    if (fs.existsSync(CHARACTERS_DIR)) {
      const files = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const char = JSON.parse(fs.readFileSync(path.join(CHARACTERS_DIR, file), 'utf8'));
          // ID를 파일명에서 추출 (확장자 제거)
          char.id = file.replace(/\.json$/, '');
          characters.push(char);
        } catch (e) {
          // 파일 읽기 실패 시 무시
        }
      }
    }
    return res.json({ ok: true, characters });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// World Layer - 장소 좌표 관리
function getWorldPath(placeName) {
  const safeName = (placeName || 'unknown').replace(/[^a-zA-Z0-9가-힣]/g, '_');
  return path.join(WORLD_DIR, `${safeName}.json`);
}

app.post('/api/world', (req, res) => {
  try {
    const { place, coords, npcIds } = req.body || {};
    
    if (!place || typeof place !== 'string') {
      return res.status(400).json({ ok: false, error: 'place required' });
    }

    const worldPath = getWorldPath(place);
    let worldData = {};
    
    if (fs.existsSync(worldPath)) {
      try {
        worldData = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
      } catch (e) {
        // 파일 읽기 실패 시 새로 시작
      }
    }

    worldData.place = place;
    if (coords) worldData.coords = coords;
    if (npcIds && Array.isArray(npcIds)) {
      if (!worldData.npc_ids) worldData.npc_ids = [];
      npcIds.forEach(id => {
        if (!worldData.npc_ids.includes(id)) worldData.npc_ids.push(id);
      });
    }

    fs.writeFileSync(worldPath, JSON.stringify(worldData, null, 2), 'utf8');
    
    return res.json({ ok: true, world: worldData });
  } catch (e) {
    console.error('[World] error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 전체 세계관 컨텍스트 조회 (라우트 충돌 방지를 위해 :place 보다 먼저 정의)
app.get('/api/world_context', async (req, res) => {
  try {
    let context = '';
    if (fs.existsSync(CHARACTERS_DIR)) {
      const files = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json')).slice(0, 10);
      const characters = [];
      for (const file of files) {
        try {
          const char = JSON.parse(fs.readFileSync(path.join(CHARACTERS_DIR, file), 'utf8'));
          if (char.last_active_time) characters.push(char);
        } catch (e) {}
      }
      characters.sort((a, b) => new Date(b.last_active_time) - new Date(a.last_active_time));
      if (characters.length > 0) {
        context += '[등장인물]\n';
        characters.forEach(char => {
          context += `- ${char.name || '이름없음'} (${char.first_scene || '알 수 없음'})`;
          if (char.emotion) context += ` [${char.emotion}]`;
          if (char.tone) context += ` (톤: ${char.tone})`;
          context += '\n';
        });
        context += '\n';
      }
    }
    if (fs.existsSync(WORLD_DIR)) {
      const files = fs.readdirSync(WORLD_DIR).filter(f => f.endsWith('.json')).slice(0, 10);
      const places = [];
      for (const file of files) {
        try {
          const world = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, file), 'utf8'));
          if (world.place) places.push(world);
        } catch (e) {}
      }
      if (places.length > 0) {
        context += '[장소]\n';
        places.forEach(w => {
          context += `- ${w.place}`;
          if (w.coords) context += ` (좌표: ${JSON.stringify(w.coords)})`;
          if (w.npc_ids && w.npc_ids.length > 0) context += ` [NPC: ${w.npc_ids.join(', ')}]`;
          context += '\n';
        });
        context += '\n';
      }
    }
    if (fs.existsSync(TRAINING_FILE)) {
      try {
        const text = fs.readFileSync(TRAINING_FILE, 'utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        const recentResponses = lines.slice(-10).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        if (recentResponses.length > 0) {
          context += '[최근 스토리 흐름 및 세계관 발전]\n';
          recentResponses.reverse().forEach((r, idx) => {
            if (r.response && r.response.length > 0) {
              const preview = r.response.substring(0, 100);
              context += `${idx + 1}. ${preview}${r.response.length > 100 ? '...' : ''}`;
              if (r.bit && r.bit.max && r.bit.min) context += ` [BIT: MAX=${r.bit.max.toFixed(5)}, MIN=${r.bit.min.toFixed(5)}]`;
              context += '\n';
            }
          });
          context += '\n';
        }
      } catch (e) {}
    }
    return res.json({ ok: true, context });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/world/:place', (req, res) => {
  try {
    const { place } = req.params;
    const worldPath = getWorldPath(place);
    
    if (!fs.existsSync(worldPath)) {
      return res.status(404).json({ ok: false, error: 'Place not found' });
    }
    
    const worldData = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
    return res.json({ ok: true, world: worldData });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Memory DB - 대화 기록 + 화자 참조
const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.ndjson');

app.post('/api/memory', (req, res) => {
  try {
    const { sceneId, timestamp, input, npcSpeaker, place, bit } = req.body || {};
    
    const record = {
      scene_id: sceneId || `scene_${Date.now()}`,
      timestamp: timestamp || new Date().toISOString(),
      t: Date.now(),
      input: input || '',
      npc_speaker: npcSpeaker || null,
      place: place || null,
      bit: bit || {}
    };

    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(MEMORY_FILE, line, 'utf8');
    
    return res.json({ ok: true, record });
  } catch (e) {
    console.error('[Memory] error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/memory', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.n || '100', 10) || 100, 1000);
    let items = [];
    
    if (fs.existsSync(MEMORY_FILE)) {
      try {
        const text = fs.readFileSync(MEMORY_FILE, 'utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        items = lines.slice(-limit).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        items.reverse(); // 최신순
      } catch (e) {
        // 파일 읽기 실패 시 빈 배열
      }
    }
    
    return res.json({ ok: true, count: items.length, items });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 학습 데이터 저장 디렉토리
const TRAINING_DIR = path.join(DATA_DIR, 'training');
if (!fs.existsSync(TRAINING_DIR)) fs.mkdirSync(TRAINING_DIR, { recursive: true });

// GPT 응답 학습 데이터 저장 (BIT 계산 포함)
const TRAINING_FILE = path.join(TRAINING_DIR, 'gpt_responses.ndjson');

app.post('/api/training/gpt-response', async (req, res) => {
  try {
    const { input, response, bitMax, bitMin, context, model } = req.body || {};
    
    if (!response || typeof response !== 'string') {
      return res.status(400).json({ ok: false, error: 'response required' });
    }

    // 폐허가 된 마을 상태 정보 가져오기 (자동 발전 AI 학습용)
    let villageState = null;
    let npcDetails = [];
    try {
      const villageName = '폐허가 된 마을';
      const villagePath = getWorldPath(villageName);
      if (fs.existsSync(villagePath)) {
        const villageData = JSON.parse(fs.readFileSync(villagePath, 'utf8'));
        const npcIds = villageData.npc_ids && Array.isArray(villageData.npc_ids) ? villageData.npc_ids : [];
        
        // NPC 상세 정보 가져오기
        npcDetails = [];
        for (const npcId of npcIds) {
          try {
            const charPath = getCharacterPath(npcId);
            if (fs.existsSync(charPath)) {
              const charData = JSON.parse(fs.readFileSync(charPath, 'utf8'));
              npcDetails.push({
                id: npcId,
                name: charData.name || null,
                emotion: charData.emotion || null,
                tone: charData.tone || null,
                first_scene: charData.first_scene || null,
                bit_state: charData.bit_state || null
              });
            }
          } catch (e) {
            // 개별 NPC 정보 읽기 실패 시 무시
          }
        }
        
        villageState = {
          place: villageData.place || villageName,
          coords: villageData.coords || null,
          npc_count: npcIds.length,
          npc_ids: npcIds,
          npc_details: npcDetails  // NPC 상세 정보 추가
        };
      }
    } catch (e) {
      // 마을 정보 가져오기 실패 시 무시
    }

    const record = {
      timestamp: new Date().toISOString(),
      t: Date.now(),
      input: input || '',
      response: response,
      bit: {
        max: bitMax || null,
        min: bitMin || null
      },
      context: context || null,
      model: model || 'gpt-4o-mini',
      village_state: villageState  // 마을 상태 정보 추가 (자동 발전 AI 학습용)
    };

    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(TRAINING_FILE, line, 'utf8');
    
    console.log('[Training] GPT response saved:', { 
      bitMax, 
      bitMin, 
      length: response.length,
      village_npcs: villageState ? villageState.npc_count : 0
    });
    
    return res.json({ ok: true, record });
  } catch (e) {
    console.error('[Training] error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/training/gpt-responses', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.n || '100', 10) || 100, 1000);
    let items = [];
    
    if (fs.existsSync(TRAINING_FILE)) {
      try {
        const text = fs.readFileSync(TRAINING_FILE, 'utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        items = lines.slice(-limit).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        items.reverse(); // 최신순
      } catch (e) {
        // 파일 읽기 실패 시 빈 배열
      }
    }
    
    return res.json({ ok: true, count: items.length, items });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 유사도 기반 예시 검색 (RAG/Few-shot Learning용)
app.post('/api/training/similar', async (req, res) => {
  try {
    const { query, queryBitMax, queryBitMin, limit = 5 } = req.body || {};
    
    if (!fs.existsSync(TRAINING_FILE)) {
      return res.json({ ok: true, count: 0, items: [] });
    }
    
    const text = fs.readFileSync(TRAINING_FILE, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    let allItems = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    
    // 유사도 계산 및 정렬
    const scored = allItems.map(item => {
      let score = 0;
      
      // 1. BIT 값 유사도 (가중치: 0.6)
      if (queryBitMax !== undefined && queryBitMin !== undefined && item.bit) {
        const bitMaxDiff = Math.abs((queryBitMax || 0) - (item.bit.max || 0));
        const bitMinDiff = Math.abs((queryBitMin || 0) - (item.bit.min || 0));
        const bitScore = 1 / (1 + bitMaxDiff + bitMinDiff); // 차이가 작을수록 높은 점수
        score += bitScore * 0.6;
      }
      
      // 2. 텍스트 유사도 (간단한 키워드 매칭, 가중치: 0.3)
      if (query && typeof query === 'string' && item.input) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
        const inputWords = (item.input || '').toLowerCase().split(/\s+/).filter(Boolean);
        const commonWords = queryWords.filter(w => inputWords.includes(w));
        const textScore = commonWords.length / Math.max(queryWords.length, 1);
        score += textScore * 0.3;
      }
      
      // 3. 최신성 (가중치: 0.1) - 최근 데이터에 약간 더 높은 점수
      if (item.t) {
        const age = Date.now() - item.t;
        const daysAgo = age / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, 1 - daysAgo / 30); // 30일 기준
        score += recencyScore * 0.1;
      }
      
      return { ...item, similarity_score: score };
    });
    
    // 점수순으로 정렬하고 상위 N개 반환
    scored.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
    const topItems = scored.slice(0, Math.min(limit, scored.length));
    
    return res.json({ ok: true, count: topItems.length, items: topItems });
  } catch (e) {
    console.error('[Training] similar search error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 전체 세계관 컨텍스트 조회 (GPT 호출 시 사용)
// (이전 위치의 중복 라우트 제거됨)

// 속성별 데이터 저장/조회 - 기존 MAX/MIN 폴더 구조 사용
function getAttributeFilePath(bitMax, bitMin, type = 'max') {
  // 기존 nestedPathFromNumber 함수를 사용하여 MAX/MIN 폴더 구조 활용
  if (type === 'max') {
    const { nestedFile } = nestedPathFromNumber('max', bitMax);
    return nestedFile;
  } else {
    const { nestedFile } = nestedPathFromNumber('min', bitMin);
    return nestedFile;
  }
}

// 속성에 데이터 저장 - 기존 MAX/MIN 폴더 구조 사용
app.post('/api/attributes/data', (req, res) => {
  try {
    let { attributeBitMax, attributeBitMin, attributeText, text, dataBitMax, dataBitMin, novelTitle, novelTitleBitMax, novelTitleBitMin, chapter, chapterBitMax, chapterBitMin } = req.body || {};
    
    if (attributeBitMax === undefined || attributeBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'attributeBitMax and attributeBitMin required' });
    }
    
    // text는 null, 빈 문자열 모두 허용 (데이터 없이 속성만 저장 가능)
    // 'text' 필드가 req.body에 존재하지 않으면 오류 (undefined만 체크)
    if (!('text' in (req.body || {}))) {
      return res.status(400).json({ ok: false, error: 'text required' });
    }
    
    // text가 null이면 빈 문자열로 변환 (속성만 저장)
    if (text === null) {
      text = '';
    }
    
    // text는 문자열이어야 함
    if (typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text must be a string' });
    }
    
    // 중복 체크: 같은 속성 경로 + 데이터 텍스트 조합이 이미 존재하는지 확인 (속성 경로 BIT 값 기준)
    const checkDuplicate = () => {
      // 속성 경로 BIT 값이 없으면 중복 체크 불가
      if (!Number.isFinite(attributeBitMax) || !Number.isFinite(attributeBitMin)) {
        return false;
      }
      
      // 속성 경로 BIT MAX 폴더 기준으로 중복 체크 (log_*.ndjson 파일들 모두 확인)
      const { targetDir: checkDir } = nestedPathFromNumber('max', attributeBitMax);
      if (!fs.existsSync(checkDir)) return false;
      
      try {
        // log_*.ndjson 파일들 모두 확인
        const files = fs.readdirSync(checkDir);
        const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
        
        for (const logFile of logFiles) {
          const logFilePath = path.join(checkDir, logFile);
          try {
            const content = fs.readFileSync(logFilePath, 'utf8');
            const lines = content.split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                
                // 부동소수점 오차 허용
                const epsilon = 1e-10;
                
                // 속성 경로 BIT 값 일치 확인
                const attributeBitMaxMatch = parsed.attribute && 
                  Math.abs((parsed.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon;
                const attributeBitMinMatch = parsed.attribute && 
                  Math.abs((parsed.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
                
                // 데이터 BIT 값 일치 확인
                const existingDataBitMax = parsed.data?.bitMax || parsed.max || 0;
                const existingDataBitMin = parsed.data?.bitMin || parsed.min || 0;
                const dataBitMaxMatch = Math.abs(existingDataBitMax - (dataBitMax || 0)) < epsilon;
                const dataBitMinMatch = Math.abs(existingDataBitMin - (dataBitMin || 0)) < epsilon;
                
                // 속성 경로와 데이터 텍스트 일치 확인
                const existingAttributeText = (parsed.attribute?.text || '').trim();
                const newAttributeText = (attributeText || '').trim();
                const existingDataText = (parsed.data?.text || parsed.s || '').trim();
                const newDataText = (text || '').trim();
                
                // 속성 경로 BIT, 데이터 BIT, 속성 텍스트, 데이터 텍스트가 모두 일치하면 중복
                if (attributeBitMaxMatch && attributeBitMinMatch && 
                    dataBitMaxMatch && dataBitMinMatch &&
                    existingAttributeText === newAttributeText &&
                    existingDataText === newDataText && 
                    existingDataText !== '') {
                  return true;
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      } catch {}
      return false;
    };
    
    // 중복 체크
    if (checkDuplicate()) {
      return res.json({ ok: true, duplicate: true, message: '이미 동일한 속성 경로-데이터 조합이 저장되어 있습니다.' });
    }
    
    // BIT 값이 숫자인지 확인하고 전체 정밀도 유지
    const ensureNumber = (val) => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return Number.isFinite(num) ? num : null;
    };
    
    const record = {
      timestamp: new Date().toISOString(),
      t: Date.now(),
      s: text, // 데이터 텍스트
      max: ensureNumber(dataBitMax), // 데이터 BIT MAX (전체 정밀도 유지)
      min: ensureNumber(dataBitMin), // 데이터 BIT MIN (전체 정밀도 유지)
      attribute: {
        text: attributeText || null, // 속성 텍스트도 저장
        bitMax: ensureNumber(attributeBitMax), // 전체 정밀도 유지
        bitMin: ensureNumber(attributeBitMin) // 전체 정밀도 유지
      },
      data: {
        text: text,
        bitMax: ensureNumber(dataBitMax), // 전체 정밀도 유지
        bitMin: ensureNumber(dataBitMin) // 전체 정밀도 유지
      }
    };
    
    // 소설 제목과 챕터 정보 추가 (BIT 값 포함, 전체 정밀도 유지)
    if (novelTitle) {
      record.novel = {
        title: novelTitle,
        bitMax: ensureNumber(novelTitleBitMax), // 전체 정밀도 유지
        bitMin: ensureNumber(novelTitleBitMin) // 전체 정밀도 유지
      };
    }
    if (chapter) {
      record.chapter = {
        number: chapter.number || null,
        title: chapter.title || null,
        description: chapter.description || null,
        bitMax: ensureNumber(chapterBitMax), // 전체 정밀도 유지
        bitMin: ensureNumber(chapterBitMin) // 전체 정밀도 유지
      };
    }
    
    // JSON.stringify는 기본적으로 전체 정밀도를 유지하지만, 명시적으로 확인
    const line = JSON.stringify(record) + '\n';
    let written = { 
      novelTitleMax: null, novelTitleMin: null,
      chapterMax: null, chapterMin: null,
      attributeMax: null, attributeMin: null
    };
    const errors = []; // 저장 실패 에러 추적
    
    // 속성 텍스트를 데이터로 저장하는 로직 제거 - 데이터 BIT 값 기준으로만 저장
    
    // 1. 소설 제목 BIT MAX로 MAX 폴더에 저장
    if (novelTitleBitMax !== undefined && novelTitleBitMax !== null && Number.isFinite(novelTitleBitMax)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('max', novelTitleBitMax);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Novel] 소설 제목 MAX 폴더에 저장:', nestedFile); 
        written.novelTitleMax = nestedFile; 
      } catch (e) { 
        const errorMsg = `소설 제목 MAX 저장 실패: ${nestedFile}`;
        console.error(`[Novel] ${errorMsg}`, { error: e.message, stack: e.stack, novelTitleBitMax, novelTitle });
        errors.push({ type: 'novelTitleMax', file: nestedFile, error: e.message });
      }
    }
    
    // 2. 소설 제목 BIT MIN으로 MIN 폴더에 저장
    if (novelTitleBitMin !== undefined && novelTitleBitMin !== null && Number.isFinite(novelTitleBitMin)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('min', novelTitleBitMin);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Novel] 소설 제목 MIN 폴더에 저장:', nestedFile); 
        written.novelTitleMin = nestedFile; 
      } catch (e) { 
        const errorMsg = `소설 제목 MIN 저장 실패: ${nestedFile}`;
        console.error(`[Novel] ${errorMsg}`, { error: e.message, stack: e.stack, novelTitleBitMin, novelTitle });
        errors.push({ type: 'novelTitleMin', file: nestedFile, error: e.message });
      }
    }
    
    // 3. 챕터 BIT MAX로 MAX 폴더에 저장
    if (chapterBitMax !== undefined && chapterBitMax !== null && Number.isFinite(chapterBitMax)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('max', chapterBitMax);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Chapter] 챕터 MAX 폴더에 저장:', nestedFile); 
        written.chapterMax = nestedFile; 
      } catch (e) { 
        const errorMsg = `챕터 MAX 저장 실패: ${nestedFile}`;
        console.error(`[Chapter] ${errorMsg}`, { error: e.message, stack: e.stack, chapterBitMax, chapter });
        errors.push({ type: 'chapterMax', file: nestedFile, error: e.message });
      }
    }
    
    // 4. 챕터 BIT MIN으로 MIN 폴더에 저장
    if (chapterBitMin !== undefined && chapterBitMin !== null && Number.isFinite(chapterBitMin)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('min', chapterBitMin);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Chapter] 챕터 MIN 폴더에 저장:', nestedFile); 
        written.chapterMin = nestedFile; 
      } catch (e) { 
        const errorMsg = `챕터 MIN 저장 실패: ${nestedFile}`;
        console.error(`[Chapter] ${errorMsg}`, { error: e.message, stack: e.stack, chapterBitMin, chapter });
        errors.push({ type: 'chapterMin', file: nestedFile, error: e.message });
      }
    }
    
    // 속성 경로 BIT 값으로 경로 생성, 데이터는 그 경로에 저장
    // 각 데이터마다 별도의 log.ndjson 파일 생성 (log_1.ndjson, log_2.ndjson 형식)
    // 1. 속성 경로 BIT MAX로 MAX 폴더에 저장
    if (Number.isFinite(attributeBitMax)) {
      const { targetDir } = nestedPathFromNumber('max', attributeBitMax);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      
      // 기존 log_*.ndjson 파일들 확인하여 다음 번호 찾기
      let fileNumber = 1;
      let newFile = path.join(targetDir, `log_${fileNumber}.ndjson`);
      
      // 중복 체크: 기존 파일들에서 동일한 데이터가 있는지 확인
      let isDuplicate = false;
      if (fs.existsSync(targetDir)) {
        try {
          const files = fs.readdirSync(targetDir);
          const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
          
          // 기존 파일들에서 중복 확인
          for (const logFile of logFiles) {
            const logFilePath = path.join(targetDir, logFile);
            try {
              const content = fs.readFileSync(logFilePath, 'utf8');
              const lines = content.split(/\r?\n/).filter(Boolean);
              for (const existingLine of lines) {
                try {
                  const existing = JSON.parse(existingLine);
                  const epsilon = 1e-10;
                  
                  // 속성 경로 BIT, 데이터 BIT, 텍스트가 모두 일치하면 중복
                  const attributeBitMaxMatch = existing.attribute && 
                    Math.abs((existing.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon;
                  const attributeBitMinMatch = existing.attribute && 
                    Math.abs((existing.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
                  const dataBitMaxMatch = existing.data && 
                    Math.abs((existing.data.bitMax || 0) - (dataBitMax || 0)) < epsilon;
                  const dataBitMinMatch = existing.data && 
                    Math.abs((existing.data.bitMin || 0) - (dataBitMin || 0)) < epsilon;
                  const textMatch = (existing.data?.text || '') === (text || '');
                  
                  if (attributeBitMaxMatch && attributeBitMinMatch && 
                      dataBitMaxMatch && dataBitMinMatch && textMatch) {
                    isDuplicate = true;
                    break;
                  }
                } catch { /* skip */ }
              }
              if (isDuplicate) break;
            } catch { /* skip */ }
          }
          
          // 중복이 아니면 다음 번호 찾기
          if (!isDuplicate) {
            const numbers = logFiles
              .map(f => {
                const match = f.match(/^log_(\d+)\.ndjson$/);
                return match ? parseInt(match[1], 10) : 0;
              })
              .filter(n => n > 0)
              .sort((a, b) => b - a);
            
            if (numbers.length > 0) {
              fileNumber = numbers[0] + 1;
            }
            newFile = path.join(targetDir, `log_${fileNumber}.ndjson`);
          }
        } catch (e) {
          console.warn('[Attribute] 파일 번호 찾기 실패:', e.message);
        }
      }
      
      // 중복이 아니면 새 파일 생성
      if (!isDuplicate) {
        try { 
          fs.writeFileSync(newFile, line, 'utf8'); 
          console.log('[Attribute] 속성 경로 MAX 폴더에 새 파일 생성:', newFile); 
          written.attributeMax = newFile; 
        } catch (e) { 
          const errorMsg = `속성 경로 MAX 저장 실패: ${newFile}`;
          console.error(`[Attribute] ${errorMsg}`, { error: e.message, stack: e.stack, attributeBitMax, text });
          errors.push({ type: 'attributeMax', file: newFile, error: e.message });
        }
      } else {
        console.log('[Attribute] 중복 데이터 감지, 파일 생성 건너뜀:', { attributeBitMax, text: text?.substring(0, 50) });
      }
    }
    
    // 2. 속성 경로 BIT MIN으로 MIN 폴더에 저장
    if (Number.isFinite(attributeBitMin)) {
      const { targetDir } = nestedPathFromNumber('min', attributeBitMin);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      
      // 기존 log_*.ndjson 파일들 확인하여 다음 번호 찾기
      let fileNumber = 1;
      let newFile = path.join(targetDir, `log_${fileNumber}.ndjson`);
      
      // 중복 체크: 기존 파일들에서 동일한 데이터가 있는지 확인
      let isDuplicate = false;
      if (fs.existsSync(targetDir)) {
        try {
          const files = fs.readdirSync(targetDir);
          const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
          
          // 기존 파일들에서 중복 확인
          for (const logFile of logFiles) {
            const logFilePath = path.join(targetDir, logFile);
            try {
              const content = fs.readFileSync(logFilePath, 'utf8');
              const lines = content.split(/\r?\n/).filter(Boolean);
              for (const existingLine of lines) {
                try {
                  const existing = JSON.parse(existingLine);
                  const epsilon = 1e-10;
                  
                  // 속성 경로 BIT, 데이터 BIT, 텍스트가 모두 일치하면 중복
                  const attributeBitMaxMatch = existing.attribute && 
                    Math.abs((existing.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon;
                  const attributeBitMinMatch = existing.attribute && 
                    Math.abs((existing.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
                  const dataBitMaxMatch = existing.data && 
                    Math.abs((existing.data.bitMax || 0) - (dataBitMax || 0)) < epsilon;
                  const dataBitMinMatch = existing.data && 
                    Math.abs((existing.data.bitMin || 0) - (dataBitMin || 0)) < epsilon;
                  const textMatch = (existing.data?.text || '') === (text || '');
                  
                  if (attributeBitMaxMatch && attributeBitMinMatch && 
                      dataBitMaxMatch && dataBitMinMatch && textMatch) {
                    isDuplicate = true;
                    break;
                  }
                } catch { /* skip */ }
              }
              if (isDuplicate) break;
            } catch { /* skip */ }
          }
          
          // 중복이 아니면 다음 번호 찾기
          if (!isDuplicate) {
            const numbers = logFiles
              .map(f => {
                const match = f.match(/^log_(\d+)\.ndjson$/);
                return match ? parseInt(match[1], 10) : 0;
              })
              .filter(n => n > 0)
              .sort((a, b) => b - a);
            
            if (numbers.length > 0) {
              fileNumber = numbers[0] + 1;
            }
            newFile = path.join(targetDir, `log_${fileNumber}.ndjson`);
          }
        } catch (e) {
          console.warn('[Attribute] 파일 번호 찾기 실패:', e.message);
        }
      }
      
      // 중복이 아니면 새 파일 생성
      if (!isDuplicate) {
        try { 
          fs.writeFileSync(newFile, line, 'utf8'); 
          console.log('[Attribute] 속성 경로 MIN 폴더에 새 파일 생성:', newFile); 
          written.attributeMin = newFile; 
        } catch (e) { 
          const errorMsg = `속성 경로 MIN 저장 실패: ${newFile}`;
          console.error(`[Attribute] ${errorMsg}`, { error: e.message, stack: e.stack, attributeBitMin, text });
          errors.push({ type: 'attributeMin', file: newFile, error: e.message });
        }
      } else {
        console.log('[Attribute] 중복 데이터 감지, 파일 생성 건너뜀:', { attributeBitMin, text: text?.substring(0, 50) });
      }
    }
    
    // 저장 결과 로깅
    if (errors.length > 0) {
      console.error('[Attribute] Data saved with errors:', { 
        attributeBitMax, 
        attributeBitMin, 
        textLength: text.length, 
        files: written,
        errorCount: errors.length,
        errors: errors.map(e => ({ type: e.type, file: e.file, error: e.error }))
      });
      return res.status(500).json({ 
        ok: false, 
        error: `일부 파일 저장 실패 (${errors.length}개 실패)`,
        errors: errors,
        record,
        files: written
      });
    } else {
      console.log('[Attribute] Data saved successfully:', { attributeBitMax, attributeBitMin, textLength: text.length, files: written });
      return res.json({ ok: true, record, files: written });
    }
  } catch (e) {
    console.error('[Attribute] Save error:', {
      message: e.message,
      stack: e.stack,
      name: e.name,
      requestBody: {
        attributeBitMax: req.body?.attributeBitMax,
        attributeBitMin: req.body?.attributeBitMin,
        attributeText: req.body?.attributeText,
        text: req.body?.text ? `${req.body.text.substring(0, 50)}...` : null,
        dataBitMax: req.body?.dataBitMax,
        dataBitMin: req.body?.dataBitMin
      }
    });
    return res.status(500).json({ 
      ok: false, 
      error: String(e.message || e),
      details: process.env.NODE_ENV === 'development' ? {
        name: e.name,
        stack: e.stack
      } : undefined
    });
  }
});

// 속성별 데이터 조회 - 기존 MAX/MIN 폴더 구조에서 검색
app.get('/api/attributes/data', (req, res) => {
  try {
    const attributeBitMax = req.query.bitMax !== undefined ? Number(req.query.bitMax) : undefined;
    const attributeBitMin = req.query.bitMin !== undefined ? Number(req.query.bitMin) : undefined;
    const useSimilarity = req.query.similarity === 'true' || req.query.similarity === '1';
    const threshold = req.query.threshold !== undefined ? Number(req.query.threshold) : 0.1; // 기본 임계값 0.1
    
    if (attributeBitMax === undefined || attributeBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'bitMax and bitMin query parameters required' });
    }
    
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 1000);
    let allItems = [];
    const scoredItems = [];
    
    // MAX 폴더에서 검색 (log.ndjson 및 log_*.ndjson 파일들 모두 확인)
    if (Number.isFinite(attributeBitMax)) {
      const { targetDir, nestedFile, baseDir, digits } = nestedPathFromNumber('max', attributeBitMax);
      
      // log.ndjson 파일 확인 (기존 호환성)
      const filesToRead = [];
      if (fs.existsSync(nestedFile)) {
        filesToRead.push(nestedFile);
      }
      
      // log_*.ndjson 파일들도 확인
      if (fs.existsSync(targetDir)) {
        try {
          const files = fs.readdirSync(targetDir);
          const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
          for (const logFile of logFiles) {
            filesToRead.push(path.join(targetDir, logFile));
          }
        } catch (e) {
          console.warn('[Attribute] log_*.ndjson 파일 읽기 실패:', e.message);
        }
      }
      
      // 모든 파일에서 데이터 읽기
      for (const fileToRead of filesToRead) {
        try {
          const text = fs.readFileSync(fileToRead, 'utf8');
          const lines = text.split(/\r?\n/).filter(Boolean);
          const items = lines.map(l => {
            try { 
              const parsed = JSON.parse(l);
              if (!parsed.attribute) return null;
              
              if (useSimilarity) {
                // 유사도 계산
                const bitMaxDiff = Math.abs((attributeBitMax || 0) - (parsed.attribute.bitMax || 0));
                const bitMinDiff = Math.abs((attributeBitMin || 0) - (parsed.attribute.bitMin || 0));
                const distance = Math.sqrt(bitMaxDiff * bitMaxDiff + bitMinDiff * bitMinDiff);
                
                if (distance <= threshold) {
                  const similarity = Math.max(0, 1 / (1 + distance));
                  return { ...parsed, _similarity: similarity, _distance: distance };
                }
                return null;
              } else {
                // 정확 일치 (부동소수점 오차 허용)
                const epsilon = 1e-10; // 매우 작은 오차 허용
                const bitMaxMatch = Math.abs((parsed.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon;
                const bitMinMatch = Math.abs((parsed.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
                if (bitMaxMatch && bitMinMatch) {
                  return parsed;
                }
                return null;
              }
            } catch { return null; }
          }).filter(Boolean);
          
          if (useSimilarity) {
            scoredItems.push(...items);
          } else {
            allItems.push(...items);
          }
        } catch (e) {
          console.warn('[Attribute] max read error:', fileToRead, e);
        }
      }
      
      // 파일이 없으면 하위 폴더 재귀 탐색
      if (filesToRead.length === 0) {
        const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
        for (const logFile of allLogFiles) {
          try {
            const text = fs.readFileSync(logFile, 'utf8');
            const lines = text.split(/\r?\n/).filter(Boolean);
            const items = lines.map(l => {
              try { 
                const parsed = JSON.parse(l);
                if (!parsed.attribute) return null;
                
                if (useSimilarity) {
                  // 유사도 계산
                  const bitMaxDiff = Math.abs((attributeBitMax || 0) - (parsed.attribute.bitMax || 0));
                  const bitMinDiff = Math.abs((attributeBitMin || 0) - (parsed.attribute.bitMin || 0));
                  const distance = Math.sqrt(bitMaxDiff * bitMaxDiff + bitMinDiff * bitMinDiff);
                  
                  if (distance <= threshold) {
                    const similarity = Math.max(0, 1 / (1 + distance));
                    return { ...parsed, _similarity: similarity, _distance: distance };
                  }
                  return null;
                } else {
                  // 정확 일치 (부동소수점 오차 허용)
                  const epsilon = 1e-10; // 매우 작은 오차 허용
                  const bitMaxMatch = Math.abs((parsed.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon;
                  const bitMinMatch = Math.abs((parsed.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
                  if (bitMaxMatch && bitMinMatch) {
                    return parsed;
                  }
                  return null;
                }
              } catch { return null; }
            }).filter(Boolean);
            
            if (useSimilarity) {
              scoredItems.push(...items);
            } else {
              allItems.push(...items);
            }
          } catch (e) {
            // 파일 읽기 실패 시 무시
          }
        }
      }
    }
    
    // 유사도 검색인 경우 점수순 정렬
    if (useSimilarity && scoredItems.length > 0) {
      scoredItems.sort((a, b) => (b._similarity || 0) - (a._similarity || 0));
      // _similarity와 _distance 필드 제거하고 반환
      allItems = scoredItems.map(({ _similarity, _distance, ...item }) => ({
        ...item,
        similarity: _similarity
      }));
    }
    
    // 중복 제거 (동일한 t, s, max, min 조합)
    const seen = new Set();
    const uniqueItems = [];
    allItems.forEach(item => {
      const key = `${item.t || ''}_${item.s || ''}_${item.max || ''}_${item.min || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    });
    
    // 정렬: 유사도 검색이면 유사도순, 아니면 최신순
    if (useSimilarity) {
      uniqueItems.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    } else {
      uniqueItems.sort((a, b) => (b.t || 0) - (a.t || 0));
    }
    
    const slice = uniqueItems.slice(0, limit);
    
    return res.json({ ok: true, count: slice.length, items: slice });
  } catch (e) {
    console.error('[Attribute] Get error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 속성 데이터 삭제
app.post('/api/attributes/data/delete', (req, res) => {
  console.log('[Delete] ===== 삭제 요청 수신 =====');
  console.log('[Delete] 요청 본문:', JSON.stringify(req.body, null, 2));
  console.log('[Delete] 요청 헤더:', req.headers);
  
  try {
    let { attributeBitMax, attributeBitMin, dataBitMax, dataBitMin, dataText } = req.body || {};
    
    // 문자열로 전달된 경우 숫자로 변환
    attributeBitMax = parseFloat(attributeBitMax);
    attributeBitMin = parseFloat(attributeBitMin);
    dataBitMax = parseFloat(dataBitMax);
    dataBitMin = parseFloat(dataBitMin);
    
    console.log('[Delete] 파라미터 추출 (숫자 변환 후):', { attributeBitMax, attributeBitMin, dataBitMax, dataBitMin, dataText });
    
    if (!Number.isFinite(attributeBitMax) || !Number.isFinite(attributeBitMin)) {
      return res.status(400).json({ ok: false, error: 'attributeBitMax and attributeBitMin must be valid numbers' });
    }
    
    if (!Number.isFinite(dataBitMax) || !Number.isFinite(dataBitMin)) {
      return res.status(400).json({ ok: false, error: 'dataBitMax and dataBitMin must be valid numbers' });
    }
    
    // dataText가 제공되면 디코딩
    const decodedDataText = dataText ? decodeURIComponent(dataText) : null;
    console.log('[Delete] 디코딩된 dataText:', decodedDataText);
    
    let deletedCount = 0;
    const filesProcessed = [];
    
    // 삭제할 파일 목록: 속성 경로 BIT와 데이터 BIT 경로 모두 확인 (log.ndjson 및 log_*.ndjson)
    const filesToCheck = [];
    
    // 두 경로 모두 확인: novel_ai/v1.0.7/data와 server/data
    const dataDirs = [
      DATA_DIR, // novel_ai/v1.0.7/data
      path.join(__dirname, 'data') // server/data
    ];
    
    // 파일을 찾는 헬퍼 함수
    const findFilesInPath = (bitValue, label, dataDir) => {
      const str = Math.abs(bitValue).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
      const digits = (str.match(/\d/g) || []);
      const baseDir = path.join(dataDir, label, ...digits);
      const leaf = label === 'max' ? 'max_bit' : 'min_bit';
      const targetDir = path.join(baseDir, leaf);
      const foundFiles = [];
      
      // targetDir이 존재하면 그 안의 모든 로그 파일 확인
      if (fs.existsSync(targetDir)) {
        try {
          const files = fs.readdirSync(targetDir);
          // log.ndjson 파일 확인 (기존 호환성)
          if (files.includes('log.ndjson')) {
            foundFiles.push(path.join(targetDir, 'log.ndjson'));
          }
          // log_*.ndjson 파일들 확인
          const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
          for (const logFile of logFiles) {
            foundFiles.push(path.join(targetDir, logFile));
          }
        } catch (e) {
          console.warn('[Delete] 로그 파일 읽기 실패:', e.message);
        }
      }
      
      // 파일이 없으면 하위 폴더 재귀 탐색
      if (foundFiles.length === 0) {
        const allLogFiles = findAllLogFiles(baseDir, label, digits);
        foundFiles.push(...allLogFiles);
      }
      
      return foundFiles;
    };
    
    // MAX 폴더만 처리 (MIN 폴더는 백업으로 유지)
    // 1. 속성 경로 BIT로 저장된 MAX 폴더 파일 찾기
    if (Number.isFinite(attributeBitMax)) {
      for (const dataDir of dataDirs) {
        const found = findFilesInPath(attributeBitMax, 'max', dataDir);
        filesToCheck.push(...found);
      }
    }
    
    // 2. 데이터 BIT로 저장된 MAX 폴더 파일 찾기 (실제 데이터가 저장된 경로)
    if (Number.isFinite(dataBitMax)) {
      for (const dataDir of dataDirs) {
        const found = findFilesInPath(dataBitMax, 'max', dataDir);
        filesToCheck.push(...found);
      }
    }
    
    // MIN 폴더는 백업으로 유지하므로 처리하지 않음
    
    // 중복 제거
    const uniqueFiles = [...new Set(filesToCheck)];
    
    console.log(`[Delete] 검색할 파일 개수: ${uniqueFiles.length}`, uniqueFiles.map(f => path.basename(f)));
    
    // 각 파일에서 매칭되는 레코드 삭제
    for (const filePath of uniqueFiles) {
      if (!fs.existsSync(filePath)) continue;
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        const remainingLines = [];
        let fileDeletedCount = 0;
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            // dataText가 제공되면 data.text로 직접 비교 (가장 정확한 방법)
            let shouldDelete = false;
            
            if (decodedDataText && parsed.data?.text) {
              // data.text로 직접 비교
              const textMatch = parsed.data.text === decodedDataText;
              console.log(`[Delete] 텍스트 비교: 파일="${path.basename(filePath)}", 파일데이터="${parsed.data.text}", 요청데이터="${decodedDataText}", 일치=${textMatch}`);
              
              if (textMatch) {
                // attribute BIT도 확인 (추가 검증)
                const epsilon = 1e-6;
                const attributeMatch = parsed.attribute && 
                  Math.abs((parsed.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon &&
                  Math.abs((parsed.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
                
                console.log(`[Delete] 속성 BIT 비교: 일치=${attributeMatch}, 파일속성=${parsed.attribute?.bitMax}/${parsed.attribute?.bitMin}, 요청속성=${attributeBitMax}/${attributeBitMin}`);
                
                if (attributeMatch) {
                  shouldDelete = true;
                }
              }
            } else {
              // dataText가 없으면 기존 방식 (BIT 값으로 비교)
              const epsilon = 1e-6;
              const attributeMatch = parsed.attribute && 
                Math.abs((parsed.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon &&
                Math.abs((parsed.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
              
              const dataMatch = (parsed.data && 
                Math.abs((parsed.data.bitMax || 0) - (dataBitMax || 0)) < epsilon &&
                Math.abs((parsed.data.bitMin || 0) - (dataBitMin || 0)) < epsilon) ||
                (Math.abs((parsed.max || 0) - (dataBitMax || 0)) < epsilon &&
                 Math.abs((parsed.min || 0) - (dataBitMin || 0)) < epsilon);
              
              if (attributeMatch && dataMatch) {
                shouldDelete = true;
              }
            }
            
            if (shouldDelete) {
              // 이 레코드는 삭제 (remainingLines에 추가하지 않음)
              fileDeletedCount++;
              deletedCount++;
              console.log(`[Delete] 레코드 삭제: 파일=${path.basename(filePath)}, 데이터="${parsed.data?.text || parsed.s || ''}"`);
            } else {
              // 나머지는 유지
              remainingLines.push(line);
            }
          } catch (e) {
            // JSON 파싱 실패 시 원본 유지
            remainingLines.push(line);
          }
        }
        
        // 파일이 변경된 경우에만 쓰기
        if (fileDeletedCount > 0) {
          if (remainingLines.length > 0) {
            // 남은 레코드가 있으면 업데이트
            const newContent = remainingLines.join('\n') + '\n';
            fs.writeFileSync(filePath, newContent, 'utf8');
          } else {
            // 남은 레코드가 없으면 파일 삭제
            try {
              fs.unlinkSync(filePath);
              console.log(`[Delete] 파일 삭제: ${filePath}`);
              
              // 빈 폴더도 삭제
              const dirPath = path.dirname(filePath);
              try {
                // max_bit 또는 min_bit 폴더 삭제
                if (fs.existsSync(dirPath)) {
                  const dirContents = fs.readdirSync(dirPath);
                  if (dirContents.length === 0) {
                    fs.rmdirSync(dirPath);
                    console.log(`[Delete] 빈 폴더 삭제: ${dirPath}`);
                    
                    // 상위 폴더들도 재귀적으로 삭제
                    let currentDir = path.dirname(dirPath);
                    while (currentDir && currentDir !== DATA_DIR && currentDir.startsWith(DATA_DIR)) {
                      try {
                        const contents = fs.readdirSync(currentDir);
                        if (contents.length === 0) {
                          fs.rmdirSync(currentDir);
                          console.log(`[Delete] 빈 상위 폴더 삭제: ${currentDir}`);
                          currentDir = path.dirname(currentDir);
                        } else {
                          break;
                        }
                      } catch (e) {
                        break;
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn(`[Delete] 폴더 삭제 오류: ${dirPath}`, e);
              }
            } catch (e) {
              console.warn(`[Delete] 파일 삭제 오류: ${filePath}`, e);
            }
          }
          filesProcessed.push({ file: filePath, deleted: fileDeletedCount });
          console.log(`[Delete] ${filePath}: ${fileDeletedCount} record(s) deleted`);
        }
      } catch (e) {
        console.warn(`[Delete] Error processing ${filePath}:`, e);
        // 파일 처리 실패해도 계속 진행
      }
    }
    
    console.log(`[Delete] Total ${deletedCount} record(s) deleted from ${filesProcessed.length} file(s)`);
    
    return res.json({ 
      ok: true, 
      deletedCount, 
      filesProcessed: filesProcessed.length,
      details: filesProcessed 
    });
  } catch (e) {
    console.error('[Attribute] Delete error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 속성 경로의 파일 목록 조회
app.get('/api/attributes/files', (req, res) => {
  try {
    const { attributeBitMax, attributeBitMin, dataBitMax, dataBitMin, requestedAttrBitMax, requestedAttrBitMin } = req.query || {};
    
    if (attributeBitMax === undefined || attributeBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'attributeBitMax and attributeBitMin required' });
    }
    
    // 최상위 경로 BIT (폴더 찾기용)
    const topAttrMax = parseFloat(attributeBitMax);
    const topAttrMin = parseFloat(attributeBitMin);
    
    if (!Number.isFinite(topAttrMax) || !Number.isFinite(topAttrMin)) {
      return res.status(400).json({ ok: false, error: 'Invalid top attribute BIT values' });
    }
    
    // 각 소설의 속성 경로 BIT (필터링용) - 없으면 필터링하지 않음
    const filterByAttribute = requestedAttrBitMax !== undefined && requestedAttrBitMin !== undefined;
    const requestedAttrMax = filterByAttribute ? parseFloat(requestedAttrBitMax) : null;
    const requestedAttrMin = filterByAttribute ? parseFloat(requestedAttrBitMin) : null;
    
    if (filterByAttribute && (!Number.isFinite(requestedAttrMax) || !Number.isFinite(requestedAttrMin))) {
      return res.status(400).json({ ok: false, error: 'Invalid requested attribute BIT values' });
    }
    
    // dataBitMax와 dataBitMin이 제공되면 필터링, 없으면 모든 파일 반환
    const filterByData = dataBitMax !== undefined && dataBitMin !== undefined;
    const dataMax = filterByData ? parseFloat(dataBitMax) : null;
    const dataMin = filterByData ? parseFloat(dataBitMin) : null;
    
    if (filterByData && (!Number.isFinite(dataMax) || !Number.isFinite(dataMin))) {
      return res.status(400).json({ ok: false, error: 'Invalid data BIT values' });
    }
    
    const files = { max: [], min: [] };
    const dataDirs = [
      DATA_DIR, // novel_ai/v1.0.7/data
      path.join(__dirname, 'data') // server/data
    ];
    
    const epsilon = 1e-10;
    
    // 파일 내용을 읽어서 매칭되는 레코드가 있는지 확인하는 함수
    // 필터링이 요청된 경우에만 사용 (filterByAttribute 또는 filterByData가 true일 때)
    const fileHasMatchingRecord = (filePath) => {
      if (!fs.existsSync(filePath)) return false;
      
      // 필터링이 요청되지 않았으면 모든 파일 반환
      if (!filterByAttribute && !filterByData) return true;
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            // 속성 경로 BIT 필터링이 요청된 경우에만 확인
            if (filterByAttribute) {
              const attributeMatch = parsed.attribute && 
                Math.abs((parsed.attribute.bitMax || 0) - requestedAttrMax) < epsilon &&
                Math.abs((parsed.attribute.bitMin || 0) - requestedAttrMin) < epsilon;
              
              if (!attributeMatch) continue;
            }
            
            // 데이터 BIT 필터링이 요청된 경우에만 확인
            if (filterByData) {
              const existingDataBitMax = parsed.data?.bitMax || parsed.max || 0;
              const existingDataBitMin = parsed.data?.bitMin || parsed.min || 0;
              const dataMatch = 
                Math.abs(existingDataBitMax - dataMax) < epsilon &&
                Math.abs(existingDataBitMin - dataMin) < epsilon;
              
              if (!dataMatch) continue;
            }
            
            // 매칭되는 레코드 발견
            return true;
          } catch (e) {
            // JSON 파싱 실패 시 무시
            continue;
          }
        }
      } catch (e) {
        console.warn('[Files] 파일 읽기 실패:', filePath, e.message);
        return false;
      }
      
      return false;
    };
    
    // 최상위 경로 BIT로 폴더 찾기 (실제 파일이 저장된 경로)
    const foldersToCheck = [];
    
    // 최상위 경로 BIT로 폴더 찾기
    if (Number.isFinite(topAttrMax)) {
      for (const dataDir of dataDirs) {
        const str = Math.abs(topAttrMax).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'max', ...digits);
        const targetDir = path.join(baseDir, 'max_bit');
        if (fs.existsSync(targetDir)) {
          foldersToCheck.push({ dir: targetDir, dataDir: dataDir, type: 'max' });
        }
      }
    }
    
    // MAX 폴더의 파일 목록
    for (const folderInfo of foldersToCheck) {
      try {
        const dirFiles = fs.readdirSync(folderInfo.dir);
        const logFiles = dirFiles.filter(f => 
          f === 'log.ndjson' || (f.startsWith('log_') && f.endsWith('.ndjson'))
        );
        for (const logFile of logFiles) {
          const filePath = path.join(folderInfo.dir, logFile);
          
          // 필터링이 요청된 경우 파일 내용 확인
          if ((filterByAttribute || filterByData) && !fileHasMatchingRecord(filePath)) {
            continue;
          }
          
          const relativePath = path.relative(folderInfo.dataDir, filePath).replace(/\\/g, '/');
          const baseUrl = req.protocol + '://' + req.get('host');
          const url = `${baseUrl}/novel_ai/v1.0.7/data/${relativePath}`;
          
          if (!files.max.find(f => f.name === logFile && f.path === relativePath)) {
            files.max.push({
              name: logFile,
              path: relativePath,
              url: url
            });
          }
        }
      } catch (e) {
        console.warn('[Files] MAX 폴더 읽기 실패:', folderInfo.dir, e.message);
      }
    }
    
    // MIN 폴더도 동일하게 처리 - 최상위 경로 BIT로 폴더 찾기
    const minFoldersToCheck = [];
    
    // 최상위 경로 BIT로 폴더 찾기
    if (Number.isFinite(topAttrMin)) {
      for (const dataDir of dataDirs) {
        const str = Math.abs(topAttrMin).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'min', ...digits);
        const targetDir = path.join(baseDir, 'min_bit');
        if (fs.existsSync(targetDir)) {
          minFoldersToCheck.push({ dir: targetDir, dataDir: dataDir, type: 'min' });
        }
      }
    }
    
    // MIN 폴더의 파일 목록
    for (const folderInfo of minFoldersToCheck) {
      try {
        const dirFiles = fs.readdirSync(folderInfo.dir);
        const logFiles = dirFiles.filter(f => 
          f === 'log.ndjson' || (f.startsWith('log_') && f.endsWith('.ndjson'))
        );
        for (const logFile of logFiles) {
          const filePath = path.join(folderInfo.dir, logFile);
          
          // 필터링이 요청된 경우 파일 내용 확인
          if ((filterByAttribute || filterByData) && !fileHasMatchingRecord(filePath)) {
            continue;
          }
          
          const relativePath = path.relative(folderInfo.dataDir, filePath).replace(/\\/g, '/');
          const baseUrl = req.protocol + '://' + req.get('host');
          const url = `${baseUrl}/novel_ai/v1.0.7/data/${relativePath}`;
          
          if (!files.min.find(f => f.name === logFile && f.path === relativePath)) {
            files.min.push({
              name: logFile,
              path: relativePath,
              url: url
            });
          }
        }
      } catch (e) {
        console.warn('[Files] MIN 폴더 읽기 실패:', folderInfo.dir, e.message);
      }
    }
    
    return res.json({ ok: true, files });
  } catch (e) {
    console.error('[Files] 오류:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 속성 경로 BIT와 데이터 BIT로 파일 조회 (개별 소설용)
app.get('/api/attributes/files/by-novel', (req, res) => {
  console.log('[Files/ByNovel] 요청 받음:', req.query);
  try {
    const { attributePathBitMax, attributePathBitMin, dataBitMax, dataBitMin, topAttributeBitMax, topAttributeBitMin, dataText } = req.query || {};
    
    if (attributePathBitMax === undefined || attributePathBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'attributePathBitMax and attributePathBitMin required' });
    }
    
    if (dataBitMax === undefined || dataBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'dataBitMax and dataBitMin required' });
    }
    
    // dataText가 제공되면 디코딩
    const decodedDataText = dataText ? decodeURIComponent(dataText) : null;
    
    const attrPathMax = parseFloat(attributePathBitMax);
    const attrPathMin = parseFloat(attributePathBitMin);
    const dataMax = parseFloat(dataBitMax);
    const dataMin = parseFloat(dataBitMin);
    
    if (!Number.isFinite(attrPathMax) || !Number.isFinite(attrPathMin) || 
        !Number.isFinite(dataMax) || !Number.isFinite(dataMin)) {
      return res.status(400).json({ ok: false, error: 'Invalid BIT values' });
    }
    
    // 최상위 속성 BIT가 제공되면 해당 폴더만 검색, 없으면 모든 폴더 검색
    const topAttrMax = topAttributeBitMax !== undefined ? parseFloat(topAttributeBitMax) : null;
    const topAttrMin = topAttributeBitMin !== undefined ? parseFloat(topAttributeBitMin) : null;
    
    const files = { max: [], min: [] };
    const dataDirs = [
      DATA_DIR, // novel_ai/v1.0.7/data
      path.join(__dirname, 'data') // server/data
    ];
    
    // 부동소수점 비교를 위한 epsilon (1e-6 정도면 충분, 너무 작으면 부동소수점 오차로 매칭 실패)
    const epsilon = 1e-6;
    
    // 속성 경로 BIT 계산 함수
    function calculateAttributePathBit(attributeText, dataText) {
      // attribute.text가 이미 화살표로 끝나 있으면 추가하지 않음
      const trimmedAttr = attributeText?.trim() || '';
      const separator = trimmedAttr.endsWith('→') ? ' ' : ' → ';
      const fullPath = `${trimmedAttr}${separator}${dataText}`;
      const arr = wordNbUnicodeFormat(fullPath);
      return {
        max: BIT_MAX_NB(arr),
        min: BIT_MIN_NB(arr)
      };
    }
    
    // 파일 내용을 읽어서 매칭되는 레코드가 있는지 확인하는 함수
    const fileHasMatchingRecord = (filePath) => {
      if (!fs.existsSync(filePath)) return false;
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            // 데이터 BIT 일치 확인
            const existingDataBitMax = parsed.data?.bitMax || parsed.max || 0;
            const existingDataBitMin = parsed.data?.bitMin || parsed.min || 0;
            const dataMaxDiff = Math.abs(existingDataBitMax - dataMax);
            const dataMinDiff = Math.abs(existingDataBitMin - dataMin);
            const dataMatch = 
              dataMaxDiff < epsilon &&
              dataMinDiff < epsilon;
            
            if (!dataMatch) {
              // 데이터 BIT 불일치 시 로그 출력하지 않음 (너무 많음)
              continue;
            }
            
            // dataText가 제공되면 data.text와 직접 비교 (가장 정확한 방법)
            if (decodedDataText && parsed.data?.text) {
              if (parsed.data.text === decodedDataText) {
                console.log(`[Files/ByNovel] ✓ 매칭 (dataText): 파일=${path.basename(filePath)}, 데이터="${parsed.data.text}"`);
                return true;
              } else {
                // dataText 불일치
                continue;
              }
            }
            
            // dataText가 없으면 속성 경로 BIT로 확인 (하위 호환성)
            if (parsed.attribute?.text && parsed.data?.text) {
              const calculatedBits = calculateAttributePathBit(parsed.attribute.text, parsed.data.text);
              const attrMaxDiff = Math.abs(calculatedBits.max - attrPathMax);
              const attrMinDiff = Math.abs(calculatedBits.min - attrPathMin);
              const attributePathMatch = 
                attrMaxDiff < epsilon &&
                attrMinDiff < epsilon;
              
              // 매칭 결과만 로그 출력
              if (attributePathMatch) {
                console.log(`[Files/ByNovel] ✓ 매칭 (속성경로BIT): 파일=${path.basename(filePath)}, 데이터="${parsed.data.text}", 속성경로BIT=${calculatedBits.max.toFixed(6)}/${calculatedBits.min.toFixed(6)}`);
                return true;
              }
            }
          } catch (e) {
            // JSON 파싱 실패 시 무시
            console.warn(`[Files/ByNovel] JSON 파싱 실패: ${filePath}`, e.message);
            continue;
          }
        }
      } catch (e) {
        console.warn('[Files/ByNovel] 파일 읽기 실패:', filePath, e.message);
        return false;
      }
      
      return false;
    };
    
    // 검색할 폴더 목록 생성
    const foldersToCheck = [];
    
    // 최상위 속성 BIT가 제공되면 해당 폴더만 검색
    if (topAttrMax !== null && Number.isFinite(topAttrMax)) {
      for (const dataDir of dataDirs) {
        const str = Math.abs(topAttrMax).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'max', ...digits);
        const targetDir = path.join(baseDir, 'max_bit');
        if (fs.existsSync(targetDir)) {
          foldersToCheck.push({ dir: targetDir, dataDir: dataDir, type: 'max' });
        }
      }
    } else {
      // 최상위 속성 BIT가 없으면 데이터 BIT로 폴더 찾기
      for (const dataDir of dataDirs) {
        const str = Math.abs(dataMax).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'max', ...digits);
        const targetDir = path.join(baseDir, 'max_bit');
        if (fs.existsSync(targetDir)) {
          foldersToCheck.push({ dir: targetDir, dataDir: dataDir, type: 'max' });
        }
      }
    }
    
    // MAX 폴더의 파일 목록
    for (const folderInfo of foldersToCheck) {
      try {
        const dirFiles = fs.readdirSync(folderInfo.dir);
        const logFiles = dirFiles.filter(f => 
          f === 'log.ndjson' || (f.startsWith('log_') && f.endsWith('.ndjson'))
        );
        for (const logFile of logFiles) {
          const filePath = path.join(folderInfo.dir, logFile);
          
          // 파일 내용을 직접 확인하여 정확히 매칭되는 레코드가 있는지 확인
          if (!fileHasMatchingRecord(filePath)) {
            continue;
          }
          
          const relativePath = path.relative(folderInfo.dataDir, filePath).replace(/\\/g, '/');
          const baseUrl = req.protocol + '://' + req.get('host');
          const url = `${baseUrl}/novel_ai/v1.0.7/data/${relativePath}`;
          
          // 중복 체크: 같은 파일명과 경로가 이미 있는지 확인
          const existingFile = files.max.find(f => f.name === logFile && f.path === relativePath);
          if (!existingFile) {
            files.max.push({
              name: logFile,
              path: relativePath,
              url: url
            });
          }
        }
      } catch (e) {
        console.warn('[Files/ByNovel] MAX 폴더 읽기 실패:', folderInfo.dir, e.message);
      }
    }
    
    // MIN 폴더도 동일하게 처리
    const minFoldersToCheck = [];
    
    if (topAttrMin !== null && Number.isFinite(topAttrMin)) {
      for (const dataDir of dataDirs) {
        const str = Math.abs(topAttrMin).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'min', ...digits);
        const targetDir = path.join(baseDir, 'min_bit');
        if (fs.existsSync(targetDir)) {
          minFoldersToCheck.push({ dir: targetDir, dataDir: dataDir, type: 'min' });
        }
      }
    } else {
      for (const dataDir of dataDirs) {
        const str = Math.abs(dataMin).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'min', ...digits);
        const targetDir = path.join(baseDir, 'min_bit');
        if (fs.existsSync(targetDir)) {
          minFoldersToCheck.push({ dir: targetDir, dataDir: dataDir, type: 'min' });
        }
      }
    }
    
    // MIN 폴더의 파일 목록
    for (const folderInfo of minFoldersToCheck) {
      try {
        const dirFiles = fs.readdirSync(folderInfo.dir);
        const logFiles = dirFiles.filter(f => 
          f === 'log.ndjson' || (f.startsWith('log_') && f.endsWith('.ndjson'))
        );
        for (const logFile of logFiles) {
          const filePath = path.join(folderInfo.dir, logFile);
          
          if (!fileHasMatchingRecord(filePath)) {
            continue;
          }
          
          const relativePath = path.relative(folderInfo.dataDir, filePath).replace(/\\/g, '/');
          const baseUrl = req.protocol + '://' + req.get('host');
          const url = `${baseUrl}/novel_ai/v1.0.7/data/${relativePath}`;
          
          if (!files.min.find(f => f.name === logFile && f.path === relativePath)) {
            files.min.push({
              name: logFile,
              path: relativePath,
              url: url
            });
          }
        }
      } catch (e) {
        console.warn('[Files/ByNovel] MIN 폴더 읽기 실패:', folderInfo.dir, e.message);
      }
    }
    
    return res.json({ ok: true, files });
  } catch (e) {
    console.error('[Files/ByNovel] 오류:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 속성 전체 삭제 (속성의 모든 데이터와 관련 폴더 삭제)
app.post('/api/attributes/delete', (req, res) => {
  try {
    const { attributeBitMax, attributeBitMin } = req.body || {};
    
    if (attributeBitMax === undefined || attributeBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'attributeBitMax and attributeBitMin required' });
    }
    
    let deletedCount = 0;
    const filesProcessed = [];
    const foldersDeleted = [];
    
    // 삭제할 파일 목록: 속성 BIT 값으로 저장된 모든 파일
    const filesToCheck = [];
    
    // 두 경로 모두 확인: novel_ai/v1.0.7/data와 server/data
    const dataDirs = [
      DATA_DIR, // novel_ai/v1.0.7/data
      path.join(__dirname, 'data') // server/data
    ];
    
    // 1. 속성 MAX 폴더
    if (Number.isFinite(attributeBitMax)) {
      for (const dataDir of dataDirs) {
        const str = Math.abs(attributeBitMax).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'max', ...digits);
        const targetDir = path.join(baseDir, 'max_bit');
        const nestedFile = path.join(targetDir, 'log.ndjson');
        
        // targetDir이 존재하면 그 안의 모든 로그 파일 확인
        if (fs.existsSync(targetDir)) {
          try {
            const files = fs.readdirSync(targetDir);
            // log.ndjson 파일 확인 (기존 호환성)
            if (files.includes('log.ndjson')) {
              filesToCheck.push(path.join(targetDir, 'log.ndjson'));
            }
            // log_*.ndjson 파일들 확인
            const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
            for (const logFile of logFiles) {
              filesToCheck.push(path.join(targetDir, logFile));
            }
          } catch (e) {
            console.warn('[Delete Attribute] 로그 파일 읽기 실패:', e.message);
          }
        }
        
        // 파일이 없으면 하위 폴더 재귀 탐색
        if (filesToCheck.length === 0) {
          const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
          filesToCheck.push(...allLogFiles);
        }
      }
    }
    
    // 2. 속성 MIN 폴더
    if (Number.isFinite(attributeBitMin)) {
      for (const dataDir of dataDirs) {
        const str = Math.abs(attributeBitMin).toFixed(20).replace(/\.?0+$/, '').replace('.', '');
        const digits = (str.match(/\d/g) || []);
        const baseDir = path.join(dataDir, 'min', ...digits);
        const targetDir = path.join(baseDir, 'min_bit');
        
        // targetDir이 존재하면 그 안의 모든 로그 파일 확인
        if (fs.existsSync(targetDir)) {
          try {
            const files = fs.readdirSync(targetDir);
            // log.ndjson 파일 확인 (기존 호환성)
            if (files.includes('log.ndjson')) {
              filesToCheck.push(path.join(targetDir, 'log.ndjson'));
            }
            // log_*.ndjson 파일들 확인
            const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
            for (const logFile of logFiles) {
              filesToCheck.push(path.join(targetDir, logFile));
            }
          } catch (e) {
            console.warn('[Delete Attribute] 로그 파일 읽기 실패:', e.message);
          }
        }
        
        // 파일이 없으면 하위 폴더 재귀 탐색
        if (filesToCheck.length === 0) {
          const allLogFiles = findAllLogFiles(baseDir, 'min', digits);
          filesToCheck.push(...allLogFiles);
        }
      }
    }
    
    // 중복 제거
    let uniqueFiles = [...new Set(filesToCheck)];
    
    // 파일이 없거나 비어있어도 속성 삭제를 위해 더 광범위하게 검색
    // max/min 폴더 전체에서 해당 속성을 가진 모든 파일 찾기
    if (uniqueFiles.length === 0) {
      console.log(`[Delete Attribute] 직접 파일을 찾지 못함, 전체 검색 시도...`);
      // max 폴더 전체 탐색
      const maxDir = path.join(DATA_DIR, 'max');
      if (fs.existsSync(maxDir)) {
        const allMaxFiles = findAllLogFilesInDir(maxDir);
        uniqueFiles.push(...allMaxFiles);
      }
      // min 폴더 전체 탐색
      const minDir = path.join(DATA_DIR, 'min');
      if (fs.existsSync(minDir)) {
        const allMinFiles = findAllLogFilesInDir(minDir);
        uniqueFiles.push(...allMinFiles);
      }
      uniqueFiles = [...new Set(uniqueFiles)];
      console.log(`[Delete Attribute] 전체 검색 결과: ${uniqueFiles.length}개 파일 발견`);
    }
    
    // 각 파일에서 해당 속성의 모든 레코드 삭제
    for (const filePath of uniqueFiles) {
      if (!fs.existsSync(filePath)) continue;
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        const remainingLines = [];
        let fileDeletedCount = 0;
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            // 삭제 조건: attribute BIT가 일치하는 모든 레코드 (부동소수점 오차 허용)
            const epsilon = 1e-10;
            const attributeMatch = parsed.attribute && 
              Math.abs((parsed.attribute.bitMax || 0) - (attributeBitMax || 0)) < epsilon &&
              Math.abs((parsed.attribute.bitMin || 0) - (attributeBitMin || 0)) < epsilon;
            
            if (attributeMatch) {
              fileDeletedCount++;
              deletedCount++;
            } else {
              remainingLines.push(line);
            }
          } catch (e) {
            remainingLines.push(line);
          }
        }
        
        // 파일이 변경된 경우에만 쓰기
        if (fileDeletedCount > 0) {
          if (remainingLines.length > 0) {
            const newContent = remainingLines.join('\n') + '\n';
            fs.writeFileSync(filePath, newContent, 'utf8');
          } else {
            // 파일 삭제
            try {
              fs.unlinkSync(filePath);
              console.log(`[Delete Attribute] 파일 삭제: ${filePath}`);
              
              // 빈 폴더 삭제
              const dirPath = path.dirname(filePath);
              if (fs.existsSync(dirPath)) {
                const dirContents = fs.readdirSync(dirPath);
                if (dirContents.length === 0) {
                  fs.rmdirSync(dirPath);
                  foldersDeleted.push(dirPath);
                  console.log(`[Delete Attribute] 빈 폴더 삭제: ${dirPath}`);
                  
                  // 상위 폴더들도 재귀적으로 삭제
                  let currentDir = path.dirname(dirPath);
                  while (currentDir && currentDir !== DATA_DIR && currentDir.startsWith(DATA_DIR)) {
                    try {
                      const contents = fs.readdirSync(currentDir);
                      if (contents.length === 0) {
                        fs.rmdirSync(currentDir);
                        foldersDeleted.push(currentDir);
                        console.log(`[Delete Attribute] 빈 상위 폴더 삭제: ${currentDir}`);
                        currentDir = path.dirname(currentDir);
                      } else {
                        break;
                      }
                    } catch (e) {
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`[Delete Attribute] 파일 삭제 오류: ${filePath}`, e);
            }
          }
          filesProcessed.push({ file: filePath, deleted: fileDeletedCount });
        }
      } catch (e) {
        console.warn(`[Delete Attribute] Error processing ${filePath}:`, e);
      }
    }
    
    console.log(`[Delete Attribute] Total ${deletedCount} record(s) deleted, ${foldersDeleted.length} folder(s) deleted`);
    
    return res.json({ 
      ok: true, 
      deletedCount, 
      filesProcessed: filesProcessed.length,
      foldersDeleted: foldersDeleted.length,
      details: { filesProcessed, foldersDeleted }
    });
  } catch (e) {
    console.error('[Attribute] Delete attribute error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ==================== 상위 속성 계층 구조 API ====================

// 모든 속성 수집 (클러스터 감지용)
async function collectAllAttributes() {
  const attributes = new Map(); // cellId -> attribute info
  const seen = new Set();
  
  // MAX 폴더 전체 탐색
  const maxDir = path.join(DATA_DIR, 'max');
  if (fs.existsSync(maxDir)) {
    const allLogFiles = findAllLogFilesInDir(maxDir);
    console.log(`[collectAllAttributes] MAX 폴더에서 ${allLogFiles.length}개 파일 탐색 중...`);
    for (const logFile of allLogFiles) {
      try {
        const text = fs.readFileSync(logFile, 'utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.attribute && parsed.attribute.text && parsed.attribute.bitMax !== undefined && parsed.attribute.bitMin !== undefined) {
              const attr = parsed.attribute;
              const key = `${attr.bitMax}_${attr.bitMin}`;
              if (!seen.has(key)) {
                seen.add(key);
                const cellId = `attr_${attr.text.replace(/\s+/g, '_')}_${attr.bitMax}_${attr.bitMin}`;
                attributes.set(cellId, {
                  cellId,
                  text: attr.text,
                  bitMax: attr.bitMax,
                  bitMin: attr.bitMin,
                  dataCount: 0
                });
              }
            }
          } catch {}
        }
      } catch {}
    }
  }
  
  // MIN 폴더는 백업용이므로 조회하지 않음 (MAX 폴더만 사용)
  
  console.log(`[collectAllAttributes] 총 ${attributes.size}개 속성 발견 (MAX 폴더만)`);
  
  // 각 속성의 데이터 수 계산 (간단히 파일 읽기로)
  for (const [cellId, attr] of attributes) {
    try {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', attr.bitMax);
      let logFiles = [];
      if (fs.existsSync(nestedFile)) {
        logFiles.push(nestedFile);
      } else {
        logFiles = findAllLogFiles(baseDir, 'max', digits);
      }
      
      let count = 0;
      for (const logFile of logFiles) {
        try {
          const text = fs.readFileSync(logFile, 'utf8');
          const lines = text.split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.attribute && parsed.attribute.bitMax === attr.bitMax && parsed.attribute.bitMin === attr.bitMin) {
                count++;
              }
            } catch {}
          }
        } catch {}
      }
      attr.dataCount = count;
    } catch {}
  }
  
  return Array.from(attributes.values());
}

// 디렉토리 전체에서 log.ndjson 파일 재귀 탐색
function findAllLogFilesInDir(dir) {
  const files = [];
  function walk(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          // log.ndjson 및 log_*.ndjson 파일 모두 포함
          if (entry.name === 'log.ndjson' || (entry.name.startsWith('log_') && entry.name.endsWith('.ndjson'))) {
            files.push(fullPath);
          }
        }
      }
    } catch {}
  }
  walk(dir);
  return files;
}

// 모든 속성 목록 조회
app.get('/api/attributes/all', async (req, res) => {
  try {
    const attributes = await collectAllAttributes();
    return res.json({ ok: true, count: attributes.length, attributes });
      } catch (e) {
    console.error('[Attributes] Get all error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 필터링된 속성 목록 조회 (API에서 필터링)
app.get('/api/attributes/filtered', async (req, res) => {
  try {
    const novelTitle = req.query.novelTitle || '';
    const chapterNumber = req.query.chapterNumber || '';
    const attributeFilterBitMax = req.query.attributeFilterBitMax !== undefined ? Number(req.query.attributeFilterBitMax) : undefined;
    const attributeFilterBitMin = req.query.attributeFilterBitMin !== undefined ? Number(req.query.attributeFilterBitMin) : undefined;
    const searchKeyword = req.query.searchKeyword || '';
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 1000);
    const similarityThreshold = Number(req.query.similarityThreshold || '0.1');
    
    // 모든 속성 조회
    let attributes = await collectAllAttributes();
    
    // 속성 필터링 (BIT 값 유사도 검색)
    if (attributeFilterBitMax !== undefined && attributeFilterBitMin !== undefined && 
        Number.isFinite(attributeFilterBitMax) && Number.isFinite(attributeFilterBitMin)) {
      // 유사도 기반 필터링
      const filteredAttrs = [];
      for (const attr of attributes) {
        const bitMaxDiff = Math.abs((attributeFilterBitMax || 0) - (attr.bitMax || 0));
        const bitMinDiff = Math.abs((attributeFilterBitMin || 0) - (attr.bitMin || 0));
        const distance = Math.sqrt(bitMaxDiff * bitMaxDiff + bitMinDiff * bitMinDiff);
        
        if (distance <= similarityThreshold) {
          const similarity = Math.max(0, 1 / (1 + distance));
          filteredAttrs.push({ ...attr, similarity });
        }
      }
      filteredAttrs.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      attributes = filteredAttrs;
    }
    
    // 각 속성의 데이터 조회 및 필터링
    const attributesWithData = [];
    for (const attr of attributes.slice(0, limit)) {
      try {
        // 속성 데이터 조회 (log.ndjson 및 log_*.ndjson 파일 모두 확인)
        const { targetDir, nestedFile, baseDir, digits } = nestedPathFromNumber('max', attr.bitMax);
        let allItems = [];
        
        // log.ndjson 파일 확인 (기존 호환성)
        const filesToRead = [];
        if (fs.existsSync(nestedFile)) {
          filesToRead.push(nestedFile);
        }
        
        // log_*.ndjson 파일들도 확인
        if (fs.existsSync(targetDir)) {
          try {
            const files = fs.readdirSync(targetDir);
            const logFiles = files.filter(f => f.startsWith('log_') && f.endsWith('.ndjson'));
            for (const logFile of logFiles) {
              filesToRead.push(path.join(targetDir, logFile));
            }
          } catch (e) {
            console.warn('[Attribute] log_*.ndjson 파일 읽기 실패:', e.message);
          }
        }
        
        // 모든 파일에서 데이터 읽기
        for (const fileToRead of filesToRead) {
          try {
            const text = fs.readFileSync(fileToRead, 'utf8');
            const lines = text.split(/\r?\n/).filter(Boolean);
            const items = lines.map(l => {
              try {
                const parsed = JSON.parse(l);
                if (!parsed.attribute) return null;
                // 속성 일치 확인
                if (parsed.attribute.bitMax === attr.bitMax && parsed.attribute.bitMin === attr.bitMin) {
                  return parsed;
                }
                return null;
              } catch { return null; }
            }).filter(Boolean);
            allItems.push(...items);
          } catch (e) {
            console.warn('[Attribute] 파일 읽기 오류:', fileToRead, e);
          }
        }
        
        // 파일이 없으면 하위 폴더 재귀 탐색
        if (filesToRead.length === 0) {
          const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
          for (const logFile of allLogFiles) {
            try {
              const text = fs.readFileSync(logFile, 'utf8');
              const lines = text.split(/\r?\n/).filter(Boolean);
              const items = lines.map(l => {
                try {
                  const parsed = JSON.parse(l);
                  if (!parsed.attribute) return null;
                  if (parsed.attribute.bitMax === attr.bitMax && parsed.attribute.bitMin === attr.bitMin) {
                    return parsed;
                  }
                  return null;
                } catch { return null; }
              }).filter(Boolean);
              allItems.push(...items);
            } catch (e) {
              // 파일 읽기 실패 시 무시
            }
          }
        }
        
        // 속성 자체를 데이터로 저장한 경우 제외
        let dataList = allItems.filter(item => {
          if (!item.data || !item.data.text) return false;
          if (item.data.text === attr.text) return false;
          return true;
        });
        
        // 소설 제목과 챕터로 필터링
        if (novelTitle) {
          if (chapterNumber) {
            // 소설 제목과 챕터 번호 모두 일치
            dataList = dataList.filter(item => {
              const itemNovel = item.novel?.title || '';
              const itemChapter = item.chapter?.number || '';
              return itemNovel === novelTitle && itemChapter === chapterNumber;
            });
          } else {
            // 소설 제목만 일치
            dataList = dataList.filter(item => {
              const itemNovel = item.novel?.title || '';
              return itemNovel === novelTitle;
            });
          }
        }
        
        // 검색 키워드로 필터링
        if (searchKeyword && searchKeyword.trim()) {
          const keywordLower = searchKeyword.toLowerCase().trim();
          dataList = dataList.filter(item => {
            const dataText = (item.data?.text || '').toLowerCase();
            const attributeText = (item.attribute?.text || '').toLowerCase();
            return dataText.includes(keywordLower) || attributeText.includes(keywordLower);
          });
        }
        
        // 데이터 포맷팅
        const filteredDataList = dataList.map(item => ({
          ...item.data,
          attribute: item.attribute || item.data?.attribute || null,
          novel: item.novel || null,
          chapter: item.chapter || null
        }));
        
        if (filteredDataList.length > 0 || !novelTitle) {
          // 데이터가 있거나 필터 조건이 없으면 속성 포함
          attributesWithData.push({
            ...attr,
            dataList: filteredDataList,
            dataCount: filteredDataList.length
          });
        }
      } catch (e) {
        console.warn(`속성 "${attr.text}" 데이터 로드 실패:`, e);
      }
    }
    
    return res.json({ 
      ok: true, 
      count: attributesWithData.length, 
      attributes: attributesWithData 
    });
  } catch (e) {
    console.error('[Attributes] Filtered error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 클러스터 감지 (밀도 기반)
function detectClusters(attributes, threshold = 0.5, minPts = 2) {
  if (attributes.length === 0) return [];
  
  const clusters = [];
  const visited = new Set();
  
  function calculateDistance(a, b) {
    const dx = a.bitMax - b.bitMax;
    const dy = a.bitMin - b.bitMin;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  function getNeighbors(center, points) {
    return points.filter(p => {
      if (visited.has(p.cellId)) return false;
      const dist = calculateDistance(center, p);
      return dist < threshold;
    });
  }
  
  function expandCluster(seed, cluster, points) {
    cluster.push(seed);
    visited.add(seed.cellId);
    
    const neighbors = getNeighbors(seed, points);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.cellId)) {
        visited.add(neighbor.cellId);
        cluster.push(neighbor);
        const neighborNeighbors = getNeighbors(neighbor, points);
        neighbors.push(...neighborNeighbors);
      }
    }
  }
  
  for (const attr of attributes) {
    if (visited.has(attr.cellId)) continue;
    
    const neighbors = getNeighbors(attr, attributes);
    if (neighbors.length >= minPts - 1) { // seed 포함
      const cluster = [];
      expandCluster(attr, cluster, attributes);
      if (cluster.length >= minPts) {
        // 클러스터 중심 계산
        const centerBitMax = cluster.reduce((sum, a) => sum + a.bitMax, 0) / cluster.length;
        const centerBitMin = cluster.reduce((sum, a) => sum + a.bitMin, 0) / cluster.length;
        
        clusters.push({
          clusterId: `cluster_${clusters.length + 1}`,
          center: { bitMax: centerBitMax, bitMin: centerBitMin },
          cellIds: cluster.map(c => c.cellId),
          attributes: cluster,
          size: cluster.length
        });
      }
    }
  }
  
  // 클러스터에 속하지 않은 속성들을 개별 클러스터로 (선택적)
  for (const attr of attributes) {
    if (!visited.has(attr.cellId)) {
      clusters.push({
        clusterId: `isolated_${attr.cellId}`,
        center: { bitMax: attr.bitMax, bitMin: attr.bitMin },
        cellIds: [attr.cellId],
        attributes: [attr],
        size: 1,
        isolated: true
      });
    }
  }
  
  return clusters;
}

// 클러스터 감지 API
app.post('/api/attributes/clusters/detect', async (req, res) => {
  try {
    const { threshold = 0.5, minPts = 2 } = req.body || {};
    const attributes = await collectAllAttributes();
    const clusters = detectClusters(attributes, threshold, minPts);
    
    return res.json({ ok: true, clusters, totalAttributes: attributes.length });
  } catch (e) {
    console.error('[Clusters] Detect error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 상위 속성 메타데이터 파일 경로
function getHierarchyFilePath(filename) {
  return path.join(HIERARCHY_DIR, filename);
}

// 상위 속성 생성/저장
app.post('/api/hierarchy/parent', (req, res) => {
  try {
    const { parentText, parentBitMax, parentBitMin, childCellIds, autoGenerated = false } = req.body || {};
    
    if (!parentText || typeof parentText !== 'string') {
      return res.status(400).json({ ok: false, error: 'parentText required' });
    }
    
    if (parentBitMax === undefined || parentBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'parentBitMax and parentBitMin required' });
    }
    
    if (!Array.isArray(childCellIds) || childCellIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'childCellIds array required' });
    }
    
    const parentsFile = getHierarchyFilePath('parents.json');
    let parents = {};
    if (fs.existsSync(parentsFile)) {
      try {
        parents = JSON.parse(fs.readFileSync(parentsFile, 'utf8'));
      } catch {}
    }
    
    // 중복 체크: 같은 텍스트와 BIT 값을 가진 상위 속성이 이미 존재하는지 확인
    const existingParent = Object.values(parents).find(p => 
      p.text === parentText && 
      Math.abs(p.bitMax - parentBitMax) < 0.001 && 
      Math.abs(p.bitMin - parentBitMin) < 0.001
    );
    
    if (existingParent) {
      // 기존 상위 속성에 중복되지 않는 하위 속성만 추가
      const childrenFile = getHierarchyFilePath('children_map.json');
      let childrenMap = {};
      if (fs.existsSync(childrenFile)) {
        try {
          childrenMap = JSON.parse(fs.readFileSync(childrenFile, 'utf8'));
        } catch {}
      }
      
      const existingChildren = new Set(existingParent.childCellIds);
      const newChildren = childCellIds.filter(childId => !existingChildren.has(childId));
      
      if (newChildren.length === 0) {
        return res.json({ ok: true, duplicate: true, message: '이미 동일한 상위 속성이 존재하며, 모든 하위 속성이 포함되어 있습니다.', parent: existingParent });
      }
      
      // 새로운 하위 속성 추가
      existingParent.childCellIds.push(...newChildren);
      existingParent.updatedAt = new Date().toISOString();
      existingParent.t = Date.now();
      
      for (const childId of newChildren) {
        // 이미 다른 상위 속성에 속해있으면 경고
        if (childrenMap[childId] && childrenMap[childId] !== existingParent.parentId) {
          console.warn(`[Hierarchy] Child ${childId} is already in another parent ${childrenMap[childId]}`);
        }
        childrenMap[childId] = existingParent.parentId;
      }
      
      parents[existingParent.parentId] = existingParent;
      fs.writeFileSync(parentsFile, JSON.stringify(parents, null, 2), 'utf8');
      fs.writeFileSync(childrenFile, JSON.stringify(childrenMap, null, 2), 'utf8');
      
      console.log('[Hierarchy] Parent updated:', existingParent.parentId, 'added', newChildren.length, 'new children');
      return res.json({ ok: true, parent: existingParent, updated: true, newChildren });
    }
    
    const parentId = `parent_${parentText.replace(/\s+/g, '_')}_${Date.now()}`;
    const parentRecord = {
      parentId,
      text: parentText,
      bitMax: parentBitMax,
      bitMin: parentBitMin,
      childCellIds: [...childCellIds], // 복사본 사용
      autoGenerated,
      createdAt: new Date().toISOString(),
      t: Date.now()
    };
    
    // children_map.json 업데이트
    const childrenFile = getHierarchyFilePath('children_map.json');
    let childrenMap = {};
    if (fs.existsSync(childrenFile)) {
      try {
        childrenMap = JSON.parse(fs.readFileSync(childrenFile, 'utf8'));
      } catch {}
    }
    
    // 중복 체크: 같은 하위 속성이 이미 다른 상위 속성에 속해있는지 확인
    const conflicts = [];
    for (const childId of childCellIds) {
      if (childrenMap[childId] && childrenMap[childId] !== parentId) {
        conflicts.push({ childId, existingParent: childrenMap[childId] });
        console.warn(`[Hierarchy] Child ${childId} is already in parent ${childrenMap[childId]}, will be moved to new parent`);
      }
      childrenMap[childId] = parentId;
    }
    
    if (conflicts.length > 0) {
      console.warn(`[Hierarchy] ${conflicts.length} children moved from other parents`);
    }
    
    parents[parentId] = parentRecord;
    fs.writeFileSync(parentsFile, JSON.stringify(parents, null, 2), 'utf8');
    fs.writeFileSync(childrenFile, JSON.stringify(childrenMap, null, 2), 'utf8');
    
    console.log('[Hierarchy] Parent created:', parentId, 'with', childCellIds.length, 'children');
    
    return res.json({ ok: true, parent: parentRecord, conflicts: conflicts.length > 0 ? conflicts : undefined });
  } catch (e) {
    console.error('[Hierarchy] Create parent error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 상위 속성 목록 조회
app.get('/api/hierarchy/parents', (req, res) => {
  try {
    const parentsFile = getHierarchyFilePath('parents.json');
    let parents = {};
    if (fs.existsSync(parentsFile)) {
      try {
        parents = JSON.parse(fs.readFileSync(parentsFile, 'utf8'));
      } catch {}
    }
    return res.json({ ok: true, parents: Object.values(parents) });
  } catch (e) {
    console.error('[Hierarchy] Get parents error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 하위 속성의 상위 속성 조회
app.get('/api/hierarchy/parent/:cellId', (req, res) => {
  try {
    const { cellId } = req.params;
    const childrenFile = getHierarchyFilePath('children_map.json');
    let childrenMap = {};
    if (fs.existsSync(childrenFile)) {
      try {
        childrenMap = JSON.parse(fs.readFileSync(childrenFile, 'utf8'));
      } catch {}
    }
    
    const parentId = childrenMap[cellId];
    if (!parentId) {
      return res.json({ ok: true, parent: null });
    }
    
    const parentsFile = getHierarchyFilePath('parents.json');
    let parents = {};
    if (fs.existsSync(parentsFile)) {
      try {
        parents = JSON.parse(fs.readFileSync(parentsFile, 'utf8'));
      } catch {}
    }
    
    return res.json({ ok: true, parent: parents[parentId] || null });
  } catch (e) {
    console.error('[Hierarchy] Get parent error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 재귀적으로 속성의 모든 하위 데이터 수집 (속성이 데이터로 저장된 경우도 처리)
async function collectAttributeDataRecursive(attrBitMax, attrBitMin, visited = new Set(), depth = 0, maxDepth = 10) {
  // 무한 재귀 방지
  if (depth > maxDepth) return [];
  
  const key = `${attrBitMax}_${attrBitMin}`;
  if (visited.has(key)) return [];
  visited.add(key);
  
  let allItems = [];
  
  // 해당 속성에 직접 저장된 데이터 수집
  const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', attrBitMax);
  let logFiles = [];
  if (fs.existsSync(nestedFile)) {
    logFiles.push(nestedFile);
  } else {
    logFiles = findAllLogFiles(baseDir, 'max', digits);
  }
  
  for (const logFile of logFiles) {
    try {
      const text = fs.readFileSync(logFile, 'utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.attribute && parsed.attribute.bitMax === attrBitMax && parsed.attribute.bitMin === attrBitMin) {
            allItems.push(parsed);
            
            // 이 데이터가 또 다른 속성인지 확인 (데이터 텍스트의 BIT 값이 다른 속성의 BIT 값과 일치하는지)
            if (parsed.data && parsed.data.bitMax !== undefined && parsed.data.bitMin !== undefined) {
              const dataBitMax = parsed.data.bitMax;
              const dataBitMin = parsed.data.bitMin;
              
              // 이 데이터 텍스트가 실제로 다른 속성으로 존재하는지 확인
              const allAttributes = await collectAllAttributes();
              const matchingAttr = allAttributes.find(a => 
                Math.abs(a.bitMax - dataBitMax) < 0.001 && Math.abs(a.bitMin - dataBitMin) < 0.001
              );
              
              // 데이터 텍스트가 다른 속성으로 존재하면, 그 속성의 데이터도 재귀적으로 수집
              if (matchingAttr) {
                const nestedItems = await collectAttributeDataRecursive(
                  matchingAttr.bitMax, 
                  matchingAttr.bitMin, 
                  visited, 
                  depth + 1, 
                  maxDepth
                );
                allItems.push(...nestedItems);
              }
            }
          }
        } catch {}
      }
    } catch {}
  }
  
  return allItems;
}

// 상위 속성으로 검색 (하위 속성들 포함 + 재귀적으로 하위 데이터도 포함)
app.get('/api/attributes/data/by-parent', async (req, res) => {
  try {
    const { parentId } = req.query;
    if (!parentId) {
      return res.status(400).json({ ok: false, error: 'parentId required' });
    }
    
    const parentsFile = getHierarchyFilePath('parents.json');
    let parents = {};
    if (fs.existsSync(parentsFile)) {
      try {
        parents = JSON.parse(fs.readFileSync(parentsFile, 'utf8'));
      } catch {}
    }
    
    const parent = parents[parentId];
    if (!parent) {
      return res.status(404).json({ ok: false, error: 'Parent not found' });
    }
    
    // 모든 하위 속성의 데이터 수집 (재귀적으로)
    let allItems = [];
    const attributes = await collectAllAttributes();
    const childAttributes = attributes.filter(a => parent.childCellIds.includes(a.cellId));
    
    // 재귀적으로 모든 하위 데이터 수집
    const visited = new Set();
    for (const attr of childAttributes) {
      const items = await collectAttributeDataRecursive(attr.bitMax, attr.bitMin, visited, 0, 10);
      allItems.push(...items);
    }
    
    // 중복 제거
    const seen = new Set();
    const uniqueItems = [];
    allItems.forEach(item => {
      const key = `${item.t || ''}_${item.s || ''}_${item.max || ''}_${item.min || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    });
    
    uniqueItems.sort((a, b) => (b.t || 0) - (a.t || 0));
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 1000);
    
    return res.json({ ok: true, parent, childAttributes, count: uniqueItems.length, items: uniqueItems.slice(0, limit) });
  } catch (e) {
    console.error('[Attributes] Get by parent error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ==================== 폴더 탐색기 열기 ====================

// 파일 크기 포맷팅 함수
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 폴더 경로를 URL로 변환하여 새 창에서 열기
app.get('/api/folder/view', (req, res) => {
  try {
    const { folderPath } = req.query || {};
    
    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'folderPath required' });
    }
    
    // 상대 경로를 절대 경로로 변환
    let absolutePath;
    if (path.isAbsolute(folderPath)) {
      absolutePath = folderPath;
    } else {
      // data/max/... 형태의 상대 경로인 경우
      if (folderPath.startsWith('data/')) {
        absolutePath = path.join(PROJECT_ROOT, 'novel_ai', 'v1.0.7', folderPath.replace(/^data\//, 'data/'));
      } else {
        absolutePath = path.join(PROJECT_ROOT, folderPath);
      }
    }
    
    // 파일 경로인 경우 부모 폴더 열기
    if (fs.existsSync(absolutePath)) {
      const stats = fs.statSync(absolutePath);
      if (stats.isFile()) {
        absolutePath = path.dirname(absolutePath);
      }
    } else {
      // 폴더가 없으면 부모 폴더 열기
      absolutePath = path.dirname(absolutePath);
    }
    
    // 폴더 내용 읽기
    let files = [];
    let directories = [];
    
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
      const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(absolutePath, entry.name);
        const relativePath = path.relative(DATA_DIR, entryPath);
        const urlPath = relativePath.replace(/\\/g, '/');
        
        if (entry.isDirectory()) {
          directories.push({ name: entry.name, path: urlPath });
        } else {
          const stats = fs.statSync(entryPath);
          files.push({ 
            name: entry.name, 
            path: urlPath,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
    }
    
    // HTML 페이지 생성
    const currentPath = path.relative(DATA_DIR, absolutePath).replace(/\\/g, '/');
    const parentPath = path.dirname(currentPath).replace(/\\/g, '/');
    
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>폴더: ${currentPath}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #444;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 1.5rem;
      color: #fff;
    }
    .path {
      color: #888;
      font-size: 0.9rem;
      word-break: break-all;
    }
    .nav {
      margin-bottom: 20px;
    }
    .nav a {
      color: #4a9eff;
      text-decoration: none;
      padding: 5px 10px;
      background: rgba(74, 158, 255, 0.1);
      border-radius: 4px;
      display: inline-block;
      margin-right: 10px;
    }
    .nav a:hover {
      background: rgba(74, 158, 255, 0.2);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #252525;
      border-radius: 8px;
      overflow: hidden;
    }
    th {
      background: #333;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #fff;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #333;
    }
    tr:hover {
      background: #2a2a2a;
    }
    .folder {
      color: #4a9eff;
    }
    .file {
      color: #e0e0e0;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .size {
      color: #888;
      font-size: 0.9rem;
    }
    .date {
      color: #888;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📁 폴더 내용</h1>
    <div class="path">${currentPath || '/'}</div>
  </div>
  <div class="nav">
    ${parentPath && parentPath !== '.' ? `<a href="/api/folder/view?folderPath=${encodeURIComponent(parentPath)}">← 상위 폴더</a>` : ''}
    <a href="javascript:location.reload()">🔄 새로고침</a>
  </div>
  <table>
    <thead>
      <tr>
        <th>이름</th>
        <th>크기</th>
        <th>수정일</th>
      </tr>
    </thead>
    <tbody>
      ${directories.map(dir => `
        <tr>
          <td class="folder">📁 <a href="/api/folder/view?folderPath=${encodeURIComponent(dir.path)}">${dir.name}</a></td>
          <td class="size">-</td>
          <td class="date">-</td>
        </tr>
      `).join('')}
      ${files.map(file => `
        <tr>
          <td class="file">📄 <a href="/novel_ai/v1.0.7/data/${file.path}" target="_blank">${file.name}</a></td>
          <td class="size">${formatFileSize(file.size)}</td>
          <td class="date">${file.modified.toLocaleString('ko-KR')}</td>
        </tr>
      `).join('')}
      ${directories.length === 0 && files.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: #888;">폴더가 비어있습니다.</td></tr>' : ''}
    </tbody>
  </table>
  <script>
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
  </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[폴더 보기] 오류:', e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ==================== OAuth 인증 ====================

// OAuth 인증 시작
app.get('/api/auth/:provider', (req, res) => {
  const { provider } = req.params;
  const config = getOAuthConfig();
  const pageState = req.query.state || 'index'; // 프론트엔드에서 전달한 state
  const version = req.query.version || 'v1.0.7'; // 프론트엔드에서 전달한 version
  
  let authUrl = '';
  
  // state에 버전과 페이지 정보 포함
  const state = `${version}_${pageState}_${Math.random().toString(36).substring(7)}`;
  
  if (provider === 'google') {
    const { clientId, redirectUri } = config.google || {};
    if (!clientId) {
      return res.status(400).json({ ok: false, error: 'Google OAuth Client ID가 설정되지 않았습니다.' });
    }
    const scope = 'openid email profile';
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
  } else if (provider === 'naver') {
    const { clientId, redirectUri } = config.naver || {};
    if (!clientId) {
      return res.status(400).json({ ok: false, error: 'Naver OAuth Client ID가 설정되지 않았습니다.' });
    }
    // 네이버는 scope 파라미터로 이메일, 닉네임 등 정보 요청
    const scope = 'name,email,nickname';
    authUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}`;
  } else if (provider === 'kakao') {
    const { clientId, redirectUri } = config.kakao || {};
    if (!clientId) {
      return res.status(400).json({ ok: false, error: 'Kakao REST API Key가 설정되지 않았습니다.' });
    }
    authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  } else {
    return res.status(400).json({ ok: false, error: '지원하지 않는 OAuth 제공자입니다.' });
  }
  
  res.redirect(authUrl);
});

// OAuth 콜백 처리
app.get('/api/auth/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, error } = req.query;
  const config = getOAuthConfig();
  
  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    return res.redirect(`/?error=${encodeURIComponent('인증 코드가 없습니다.')}`);
  }
  
  try {
    let userInfo = null;
    
    if (provider === 'google') {
      // Google OAuth 토큰 교환 및 사용자 정보 가져오기
      const { clientId, clientSecret, redirectUri } = config.google || {};
      if (!clientId || !clientSecret) {
        return res.redirect(`/?error=${encodeURIComponent('Google OAuth 설정이 완료되지 않았습니다.')}`);
      }
      
      // 토큰 교환
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error('토큰 교환 실패');
      }
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      
      // 사용자 정보 가져오기
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        userInfo = {
          provider: 'google',
          id: userData.id,
          name: userData.name,
          email: userData.email,
          picture: userData.picture
        };
      }
    } else if (provider === 'naver') {
      // Naver OAuth 토큰 교환 및 사용자 정보 가져오기
      const { clientId, clientSecret, redirectUri } = config.naver || {};
      if (!clientId || !clientSecret) {
        return res.redirect(`/?error=${encodeURIComponent('Naver OAuth 설정이 완료되지 않았습니다.')}`);
      }
      
      const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          state: req.query.state || ''
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error('토큰 교환 실패');
      }
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      
      const userResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        console.log('[OAuth] 네이버 API 응답:', JSON.stringify(userData, null, 2));
        if (userData.response) {
          userInfo = {
            provider: 'naver',
            id: userData.response.id,
            name: userData.response.name || '',
            email: userData.response.email || '',
            nickname: userData.response.nickname || userData.response.name || '',
            profile_image: userData.response.profile_image || ''
          };
          console.log('[OAuth] 처리된 사용자 정보:', JSON.stringify(userInfo, null, 2));
        }
      }
    } else if (provider === 'kakao') {
      // Kakao OAuth 토큰 교환 및 사용자 정보 가져오기
      const { clientId, clientSecret, redirectUri } = config.kakao || {};
      if (!clientId || !clientSecret) {
        return res.redirect(`/?error=${encodeURIComponent('Kakao OAuth 설정이 완료되지 않았습니다.')}`);
      }
      
      const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error('토큰 교환 실패');
      }
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      
      const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        userInfo = {
          provider: 'kakao',
          id: userData.id.toString(),
          name: userData.kakao_account?.profile?.nickname || '',
          email: userData.kakao_account?.email || '',
          nickname: userData.kakao_account?.profile?.nickname || '',
          profile_image: userData.kakao_account?.profile?.profile_image_url || ''
        };
      }
    }
    
    if (userInfo) {
      // OAuth 사용자를 시스템에 등록/조회하고 JWT 토큰 발급
      const db = readUsersDB();
      const oauthId = `${provider}_${userInfo.id}`;
      // 실제 이메일이 있으면 사용, 없으면 기본값
      const email = (userInfo.email && userInfo.email.trim() && !userInfo.email.includes('@oauth.local')) 
        ? userInfo.email 
        : `${oauthId}@oauth.local`;
      // 닉네임 우선순위: nickname > name > 기본값
      const nickname = (userInfo.nickname && userInfo.nickname.trim()) 
        ? userInfo.nickname 
        : ((userInfo.name && userInfo.name.trim()) 
          ? userInfo.name 
          : `User_${userInfo.id.substring(0, 8)}`);
      
      console.log('[OAuth] 최종 사용자 정보:', { email, nickname, oauthId });
      
      // 기존 사용자 찾기 (OAuth ID 또는 이메일로)
      let user = db.users.find(u => 
        u.oauthId === oauthId || 
        (u.email === email && u.provider === provider)
      );
      
      if (!user) {
        // 새 사용자 생성
        const userBit = calculateUserBit(nickname || email);
        const userPaths = getUserDataPath(userBit.max, userBit.min);
        
        user = {
          id: Date.now().toString(),
          email,
          nickname,
          oauthId,
          provider,
          userBitMax: userBit.max,
          userBitMin: userBit.min,
          profileLv: 1,
          createdAt: new Date().toISOString()
        };
        
        console.log('[OAuth] 새 사용자 생성:', JSON.stringify(user, null, 2));
        db.users.push(user);
        writeUsersDB(db);
      } else {
        // 기존 사용자 정보 업데이트 (닉네임, 이메일 등)
        let updated = false;
        if (nickname && nickname !== user.nickname) {
          user.nickname = nickname;
          updated = true;
        }
        if (email && email !== user.email && !email.includes('@oauth.local')) {
          user.email = email;
          updated = true;
        }
        if (updated) {
          console.log('[OAuth] 사용자 정보 업데이트:', JSON.stringify(user, null, 2));
          writeUsersDB(db);
        }
      }
      
      // JWT 토큰 생성
      console.log('[OAuth] JWT 토큰 생성 전 사용자 정보:', JSON.stringify(user, null, 2));
      const token = generateToken(user);
      
      // state 파라미터에서 원래 페이지 확인 (형식: "novel_manager_랜덤" 또는 "structure_랜덤" 또는 "v1.0.7_novel_manager")
      const state = req.query.state || '';
      const stateParts = state.split('_');
      let pageState = stateParts[0] || 'index';
      let version = 'v1.0.7'; // 기본값
      
      // state에서 버전 정보 추출 (v1.0.7 형식)
      const versionMatch = state.match(/v\d+\.\d+\.\d+/);
      if (versionMatch) {
        version = versionMatch[0];
        // 버전 이후의 페이지 정보 추출
        const versionIndex = state.indexOf(version);
        if (versionIndex !== -1) {
          const afterVersion = state.substring(versionIndex + version.length + 1);
          if (afterVersion) {
            pageState = afterVersion.split('_')[0] || 'index';
          }
        }
      }
      
      // 리다이렉트 페이지 결정
      let redirectPage = 'index.html';
      if (pageState === 'structure') {
        redirectPage = 'structure.html';
      } else if (pageState === 'novel_manager') {
        redirectPage = 'novel_manager.html';
      }
      
      // 토큰을 쿼리 파라미터로 전달하여 리다이렉트
      return res.redirect(`/novel_ai/${version}/${redirectPage}?token=${token}`);
    } else {
      const state = req.query.state || '';
      const stateParts = state.split('_');
      let pageState = stateParts[0] || 'index';
      let version = 'v1.0.7';
      const versionMatch = state.match(/v\d+\.\d+\.\d+/);
      if (versionMatch) {
        version = versionMatch[0];
      }
      const redirectPage = pageState === 'structure' ? 'structure.html' : 'index.html';
      return res.redirect(`/novel_ai/${version}/${redirectPage}?error=${encodeURIComponent('사용자 정보를 가져올 수 없습니다.')}`);
    }
  } catch (error) {
    console.error(`[OAuth] ${provider} 콜백 처리 오류:`, error);
    const state = req.query.state || '';
    let version = 'v1.0.7';
    const versionMatch = state.match(/v\d+\.\d+\.\d+/);
    if (versionMatch) {
      version = versionMatch[0];
    }
    return res.redirect(`/novel_ai/${version}/index.html?error=${encodeURIComponent(error.message || 'OAuth 처리 중 오류가 발생했습니다.')}`);
  }
});

// NDJSON 파일을 JSON으로 변환하여 제공 (브라우저에서 읽을 수 있도록)
// 정적 파일 서빙보다 먼저 처리되어야 함
app.get(/^\/novel_ai\/v1\.0\.7\/data\/.*\.ndjson$/, (req, res) => {
  try {
    const filePath = path.join(PROJECT_ROOT, req.path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }
    
    // NDJSON 파일 읽기
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    
    // 각 라인을 JSON 객체로 파싱하여 배열로 변환
    const jsonArray = [];
    for (const line of lines) {
      try {
        jsonArray.push(JSON.parse(line));
      } catch (e) {
        // 파싱 실패한 라인은 무시
        console.warn(`[NDJSON] 파싱 실패한 라인 무시: ${line.substring(0, 50)}...`);
      }
    }
    
    // HTML 페이지로 JSON을 보기 좋게 표시
    const jsonString = JSON.stringify(jsonArray, null, 2);
    const escapedJsonString = jsonString.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const escapedPath = req.path.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedBasename = path.basename(filePath).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Viewer - ${escapedBasename}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #444;
    }
    .header h1 {
      font-size: 1.5rem;
      color: #fff;
      margin-bottom: 10px;
    }
    .header .path {
      color: #888;
      font-size: 0.9rem;
      word-break: break-all;
    }
    .json-container {
      background: #252526;
      border: 1px solid #3e3e42;
      border-radius: 8px;
      padding: 20px;
      overflow-x: auto;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .json-key {
      color: #9cdcfe;
    }
    .json-string {
      color: #ce9178;
    }
    .json-number {
      color: #b5cea8;
    }
    .json-boolean {
      color: #569cd6;
    }
    .json-null {
      color: #569cd6;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📄 JSON Viewer</h1>
    <div class="path">${escapedPath}</div>
  </div>
  <div class="json-container">
    <pre id="json-content"></pre>
  </div>
  <script>
    // JSON 데이터를 안전하게 로드 (문자열로 이스케이프)
    const jsonString = ${JSON.stringify(jsonString)};
    const jsonData = JSON.parse(jsonString);
    const formatted = JSON.stringify(jsonData, null, 2);
    
    // HTML 이스케이프 후 구문 강조
    const escaped = formatted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let highlighted = escaped
      .replace(/("(?:[^"\\\\]|\\\\.)*")\\s*:/g, '<span class="json-key">$1</span>:')
      .replace(/:\\s*("(?:[^"\\\\]|\\\\.)*")/g, ': <span class="json-string">$1</span>')
      .replace(/:\\s*(\\d+\\.?\\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\\s*(null)/g, ': <span class="json-null">$1</span>');
    
    document.getElementById('json-content').innerHTML = highlighted;
  </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[NDJSON] 오류:', e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Serve current folder statically, defaulting to database/index.html
app.use('/', express.static(PUBLIC_ROOT, { index: 'database/index.html' }));

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Serving static from: ${PUBLIC_ROOT}`);
  console.log('[Routes] /api/attributes/files/by-novel 등록됨');
});
