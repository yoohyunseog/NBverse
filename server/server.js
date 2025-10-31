import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Root to serve: project root one level up from server/
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = PROJECT_ROOT; // serve the whole current folder

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'log.ndjson');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
// 중앙 로그 파일은 비활성화
// if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
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

// Serve current folder statically, defaulting to database/index.html
app.use('/', express.static(PUBLIC_ROOT, { index: 'database/index.html' }));

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Serving static from: ${PUBLIC_ROOT}`);
});
