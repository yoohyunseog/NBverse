import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8123', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Root to serve: project root one level up from server/
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = PROJECT_ROOT; // serve the whole current folder

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'log.ndjson');
const API_KEY_FILE = path.join(DATA_DIR, 'gpt_api_key.txt');
const CHARACTERS_DIR = path.join(DATA_DIR, 'characters');
const WORLD_DIR = path.join(DATA_DIR, 'world');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const HONEYCOMB_DIR = path.join(DATA_DIR, 'honeycomb');
const HIERARCHY_DIR = path.join(HONEYCOMB_DIR, 'hierarchy');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHARACTERS_DIR)) fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
if (!fs.existsSync(WORLD_DIR)) fs.mkdirSync(WORLD_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
if (!fs.existsSync(NOVELS_DIR)) fs.mkdirSync(NOVELS_DIR, { recursive: true });
if (!fs.existsSync(HONEYCOMB_DIR)) fs.mkdirSync(HONEYCOMB_DIR, { recursive: true });
if (!fs.existsSync(HIERARCHY_DIR)) fs.mkdirSync(HIERARCHY_DIR, { recursive: true });
// 중앙 로그 파일은 비활성화
// if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8');

// GPT API 키 로드 함수
function getApiKey() {
  try {
    if (fs.existsSync(API_KEY_FILE)) {
      return fs.readFileSync(API_KEY_FILE, 'utf8').trim();
    }
  } catch (e) {
    // 파일 읽기 실패 시 무시
  }
  return process.env.OPENAI_API_KEY || null;
}

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

// List novels
app.get('/api/novels', (req, res) => {
  try {
    const items = [];
    const dirs = fs.readdirSync(NOVELS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const id of dirs) {
      const meta = readNovelMeta(id);
      if (meta) items.push({ id, title: meta.title || '제목 미정', genre: meta.genre || '', chapters: meta.chapters || 0, updated_time: meta.updated_time || meta.created_time });
    }
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
  const str = Math.abs(num).toFixed(10).replace('.', '');
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
    return res.json({ ok: true, hasKey: !!apiKey });
  } catch (e) {
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
    const { attributeBitMax, attributeBitMin, attributeText, text, dataBitMax, dataBitMin, novelTitle, novelTitleBitMax, novelTitleBitMin, chapter, chapterBitMax, chapterBitMin } = req.body || {};
    
    if (attributeBitMax === undefined || attributeBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'attributeBitMax and attributeBitMin required' });
    }
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text required' });
    }
    
    // 중복 체크: 같은 속성+데이터 조합이 이미 존재하는지 확인
    const checkDuplicate = (nestedFile) => {
      if (!fs.existsSync(nestedFile)) return false;
      try {
        const content = fs.readFileSync(nestedFile, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            // 속성 BIT와 데이터 텍스트가 동일하고, 같은 소설/챕터면 중복
            if (parsed.attribute && 
                parsed.attribute.bitMax === attributeBitMax && 
                parsed.attribute.bitMin === attributeBitMin &&
                parsed.data && 
                parsed.data.text === text) {
              // 소설 제목과 챕터 정보가 있으면 비교
              if (novelTitle && chapter) {
                if (parsed.novel && parsed.novel.title === novelTitle &&
                    parsed.chapter && parsed.chapter.number === chapter.number) {
                  return true;
                }
              } else {
                // 기존 데이터에는 없을 수 있으므로 일단 중복으로 간주
                return true;
              }
            }
          } catch {}
        }
      } catch {}
      return false;
    };
    
    // 중복 체크 (속성 MAX 파일 기준)
    const { nestedFile: checkFile } = nestedPathFromNumber('max', attributeBitMax);
    if (checkDuplicate(checkFile)) {
      return res.json({ ok: true, duplicate: true, message: '이미 동일한 속성-데이터 조합이 저장되어 있습니다.' });
    }
    
    const record = {
      timestamp: new Date().toISOString(),
      t: Date.now(),
      s: text, // 데이터 텍스트
      max: dataBitMax || null, // 데이터 BIT MAX
      min: dataBitMin || null, // 데이터 BIT MIN
      attribute: {
        text: attributeText || null, // 속성 텍스트도 저장
        bitMax: attributeBitMax,
        bitMin: attributeBitMin
      },
      data: {
        text: text,
        bitMax: dataBitMax || null,
        bitMin: dataBitMin || null
      }
    };
    
    // 소설 제목과 챕터 정보 추가 (BIT 값 포함)
    if (novelTitle) {
      record.novel = {
        title: novelTitle,
        bitMax: novelTitleBitMax || null,
        bitMin: novelTitleBitMin || null
      };
    }
    if (chapter) {
      record.chapter = {
        number: chapter.number || null,
        title: chapter.title || null,
        description: chapter.description || null,
        bitMax: chapterBitMax || null,
        bitMin: chapterBitMin || null
      };
    }
    
    const line = JSON.stringify(record) + '\n';
    let written = { 
      novelTitleMax: null, novelTitleMin: null,
      chapterMax: null, chapterMin: null,
      attributeMax: null, attributeMin: null, 
      dataMax: null, dataMin: null 
    };
    
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
        console.warn('[Novel] 소설 제목 MAX 저장 실패:', nestedFile, e); 
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
        console.warn('[Novel] 소설 제목 MIN 저장 실패:', nestedFile, e); 
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
        console.warn('[Chapter] 챕터 MAX 저장 실패:', nestedFile, e); 
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
        console.warn('[Chapter] 챕터 MIN 저장 실패:', nestedFile, e); 
      }
    }
    
    // 5. 속성 BIT MAX로 MAX 폴더에 저장
    if (Number.isFinite(attributeBitMax)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('max', attributeBitMax);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Attribute] 속성 MAX 폴더에 저장:', nestedFile); 
        written.attributeMax = nestedFile; 
      } catch (e) { 
        console.warn('[Attribute] 속성 MAX 저장 실패:', nestedFile, e); 
      }
    }
    
    // 6. 속성 BIT MIN으로 MIN 폴더에 저장
    if (Number.isFinite(attributeBitMin)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('min', attributeBitMin);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Attribute] 속성 MIN 폴더에 저장:', nestedFile); 
        written.attributeMin = nestedFile; 
      } catch (e) { 
        console.warn('[Attribute] 속성 MIN 저장 실패:', nestedFile, e); 
      }
    }
    
    // 7. 데이터 BIT MAX로 MAX 폴더에 저장
    if (Number.isFinite(dataBitMax)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('max', dataBitMax);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Attribute] 데이터 MAX 폴더에 저장:', nestedFile); 
        written.dataMax = nestedFile; 
      } catch (e) { 
        console.warn('[Attribute] 데이터 MAX 저장 실패:', nestedFile, e); 
      }
    }
    
    // 8. 데이터 BIT MIN으로 MIN 폴더에 저장
    if (Number.isFinite(dataBitMin)) {
      const { targetDir, nestedFile } = nestedPathFromNumber('min', dataBitMin);
      try { 
        fs.mkdirSync(targetDir, { recursive: true }); 
      } catch (_) {}
      try { 
        fs.appendFileSync(nestedFile, line, 'utf8'); 
        console.log('[Attribute] 데이터 MIN 폴더에 저장:', nestedFile); 
        written.dataMin = nestedFile; 
      } catch (e) { 
        console.warn('[Attribute] 데이터 MIN 저장 실패:', nestedFile, e); 
      }
    }
    
    console.log('[Attribute] Data saved:', { attributeBitMax, attributeBitMin, textLength: text.length, files: written });
    
    return res.json({ ok: true, record, files: written });
  } catch (e) {
    console.error('[Attribute] Save error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
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
    
    // MAX 폴더에서 검색
    if (Number.isFinite(attributeBitMax)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', attributeBitMax);
      
      if (fs.existsSync(nestedFile)) {
        try {
          const text = fs.readFileSync(nestedFile, 'utf8');
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
                // 정확 일치만
                if (parsed.attribute.bitMax === attributeBitMax && parsed.attribute.bitMin === attributeBitMin) {
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
          console.warn('[Attribute] max read error:', nestedFile, e);
        }
      } else {
        // 하위 폴더 재귀 탐색
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
                  // 정확 일치만
                  if (parsed.attribute.bitMax === attributeBitMax && parsed.attribute.bitMin === attributeBitMin) {
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
  try {
    const { attributeBitMax, attributeBitMin, dataBitMax, dataBitMin } = req.body || {};
    
    if (attributeBitMax === undefined || attributeBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'attributeBitMax and attributeBitMin required' });
    }
    
    if (dataBitMax === undefined || dataBitMin === undefined) {
      return res.status(400).json({ ok: false, error: 'dataBitMax and dataBitMin required' });
    }
    
    let deletedCount = 0;
    const filesProcessed = [];
    
    // 삭제할 파일 목록: 속성 및 데이터 BIT 값으로 저장된 모든 파일
    const filesToCheck = [];
    
    // 1. 속성 MAX 폴더
    if (Number.isFinite(attributeBitMax)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', attributeBitMax);
      if (fs.existsSync(nestedFile)) {
        filesToCheck.push(nestedFile);
      } else {
        // 하위 폴더 재귀 탐색
        const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
        filesToCheck.push(...allLogFiles);
      }
    }
    
    // 2. 속성 MIN 폴더
    if (Number.isFinite(attributeBitMin)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('min', attributeBitMin);
      if (fs.existsSync(nestedFile)) {
        filesToCheck.push(nestedFile);
      } else {
        const allLogFiles = findAllLogFiles(baseDir, 'min', digits);
        filesToCheck.push(...allLogFiles);
      }
    }
    
    // 3. 데이터 MAX 폴더
    if (Number.isFinite(dataBitMax)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', dataBitMax);
      if (fs.existsSync(nestedFile)) {
        filesToCheck.push(nestedFile);
      } else {
        const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
        filesToCheck.push(...allLogFiles);
      }
    }
    
    // 4. 데이터 MIN 폴더
    if (Number.isFinite(dataBitMin)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('min', dataBitMin);
      if (fs.existsSync(nestedFile)) {
        filesToCheck.push(nestedFile);
      } else {
        const allLogFiles = findAllLogFiles(baseDir, 'min', digits);
        filesToCheck.push(...allLogFiles);
      }
    }
    
    // 중복 제거
    const uniqueFiles = [...new Set(filesToCheck)];
    
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
            
            // 삭제 조건: attribute BIT와 data BIT가 정확히 일치하는 경우
            const attributeMatch = parsed.attribute && 
              parsed.attribute.bitMax === attributeBitMax && 
              parsed.attribute.bitMin === attributeBitMin;
            
            const dataMatch = (parsed.data && 
              parsed.data.bitMax === dataBitMax && 
              parsed.data.bitMin === dataBitMin) ||
              (parsed.max === dataBitMax && parsed.min === dataBitMin);
            
            if (attributeMatch && dataMatch) {
              // 이 레코드는 삭제 (remainingLines에 추가하지 않음)
              fileDeletedCount++;
              deletedCount++;
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
    
    // 1. 속성 MAX 폴더
    if (Number.isFinite(attributeBitMax)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', attributeBitMax);
      if (fs.existsSync(nestedFile)) {
        filesToCheck.push(nestedFile);
      } else {
        const allLogFiles = findAllLogFiles(baseDir, 'max', digits);
        filesToCheck.push(...allLogFiles);
      }
    }
    
    // 2. 속성 MIN 폴더
    if (Number.isFinite(attributeBitMin)) {
      const { nestedFile, baseDir, digits } = nestedPathFromNumber('min', attributeBitMin);
      if (fs.existsSync(nestedFile)) {
        filesToCheck.push(nestedFile);
      } else {
        const allLogFiles = findAllLogFiles(baseDir, 'min', digits);
        filesToCheck.push(...allLogFiles);
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
            
            // 삭제 조건: attribute BIT가 일치하는 모든 레코드
            const attributeMatch = parsed.attribute && 
              parsed.attribute.bitMax === attributeBitMax && 
              parsed.attribute.bitMin === attributeBitMin;
            
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
        } else if (entry.isFile() && entry.name === 'log.ndjson') {
          files.push(fullPath);
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
        // 속성 데이터 조회
        const { nestedFile, baseDir, digits } = nestedPathFromNumber('max', attr.bitMax);
        let allItems = [];
        
        if (fs.existsSync(nestedFile)) {
          try {
            const text = fs.readFileSync(nestedFile, 'utf8');
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
            console.warn('[Attribute] max read error:', nestedFile, e);
          }
        } else {
          // 하위 폴더 재귀 탐색
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

// Serve current folder statically, defaulting to database/index.html
app.use('/', express.static(PUBLIC_ROOT, { index: 'database/index.html' }));

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Serving static from: ${PUBLIC_ROOT}`);
});
