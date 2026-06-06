#!/usr/bin/env node
/**
 * 🪽 HERMES AGENT v2.0
 * Messenger & Orchestrator of the VibraHalo Ecosystem
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... node hermes.js
 *   npm start
 */

const https = require('https');
const http = require('http');

// ── CONFIG ────────────────────────────────────────────────────────
const CONFIG = {
  owner: process.env.OWNER || 'leoncanales23',
  token: process.env.GITHUB_TOKEN || '',
  nerhia: process.env.NERHIA_ENDPOINT || 'http://34.74.27.168:8000',
  email: process.env.NOTIFY_EMAIL || 'leoncanales7@gmail.com',
  heartbeatMs: parseInt(process.env.HEARTBEAT_MS || '3600000'),
};

// ── AURA NEURAL BUS (local) ───────────────────────────────────────
const AURABus = {
  _listeners: {},
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  emit(event, data) {
    console.log(`[AURA] 📡 ${event}`, JSON.stringify(data || {}).slice(0, 120));
    (this._listeners[event] || []).forEach(fn => fn(data));
    (this._listeners['*'] || []).forEach(fn => fn({ event, data }));
  }
};

// ── GITHUB API ────────────────────────────────────────────────────
function githubRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      headers: {
        'User-Agent': 'hermes-agent/2.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(CONFIG.token ? { Authorization: `token ${CONFIG.token}` } : {}),
      }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getAllRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await githubRequest(
      `/users/${CONFIG.owner}/repos?per_page=100&page=${page}&type=all`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return repos;
}

// ── CLASSIFIER ────────────────────────────────────────────────────
const LAYER_MAP = {
  'vibrahalo-mempalace': 'brain',
  'vibraalto-core': 'brain',
  'VBC-Compute-Layer': 'compute',
  'nerhia': 'intelligence',
  'nerhia-urban-sdk': 'intelligence',
  'vibraworld': 'world',
  '3d': 'world',
  'genesis-world': 'world',
  'SimWorld': 'world',
  'nexus': 'economy',
  'mining-cli': 'economy',
  'jarvis': 'agent',
  'hermes-agent': 'agent',
  'ECC': 'agent',
  'openclaw': 'agent',
};

function classifyRepo(repo) {
  if (repo.fork) return 'fork';
  if (repo.private) return 'core-private';
  return 'own-public';
}

function getLayer(repo) {
  return LAYER_MAP[repo.name] || (repo.fork ? 'reference' : 'unknown');
}

function isDormant(pushedAt) {
  if (!pushedAt) return true;
  const days = (Date.now() - new Date(pushedAt)) / (1000 * 60 * 60 * 24);
  return days > 30;
}

// ── SCANNER ───────────────────────────────────────────────────────
async function scan() {
  console.log('[HERMES] 🔭 Scanning ecosystem...');
  const repos = await getAllRepos();

  const classified = repos.map(r => ({
    name: r.name,
    type: classifyRepo(r),
    layer: getLayer(r),
    private: r.private,
    fork: r.fork,
    stars: r.stargazers_count,
    pushed: r.pushed_at,
    url: r.html_url,
    dormant: isDormant(r.pushed_at),
  }));

  const stats = {
    total: classified.length,
    corePrivate: classified.filter(r => r.type === 'core-private').length,
    ownPublic: classified.filter(r => r.type === 'own-public').length,
    forks: classified.filter(r => r.type === 'fork').length,
    dormant: classified.filter(r => r.dormant).length,
    active: classified.filter(r => !r.dormant && r.type !== 'fork').length,
  };

  AURABus.emit('hermes:scan', { stats, timestamp: new Date().toISOString() });
  return { repos: classified, stats };
}

// ── ACTION ENGINE ─────────────────────────────────────────────────
async function pushFile(repo, filePath, content, message) {
  if (!CONFIG.token) { console.warn('[HERMES] No token — skipping push'); return; }
  let sha;
  try {
    const existing = await githubRequest(
      `/repos/${CONFIG.owner}/${repo}/contents/${filePath}`
    );
    sha = existing.sha;
  } catch (_) {}

  const body = JSON.stringify({
    message,
    content: Buffer.from(content).toString('base64'),
    ...(sha ? { sha } : {}),
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${repo}/contents/${filePath}`,
      method: 'PUT',
      headers: {
        'User-Agent': 'hermes-agent/2.0',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${CONFIG.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        AURABus.emit('hermes:act', { action: 'push', repo, path: filePath });
        resolve(JSON.parse(d));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── HEARTBEAT ─────────────────────────────────────────────────────
async function heartbeat() {
  const { stats } = await scan();
  AURABus.emit('hermes:pulse', { stats, timestamp: new Date().toISOString() });

  // Ping VBC Compute Layer
  try {
    await new Promise((resolve, reject) => {
      http.get(`${CONFIG.nerhia}/health`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });
    console.log('[HERMES] ✅ VBC Compute Layer alive');
  } catch (_) {
    console.warn('[HERMES] ⚠️  VBC Compute Layer unreachable');
  }
}

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  AURABus.emit('hermes:online', { version: '2.0', owner: CONFIG.owner });
  await heartbeat();
  setInterval(heartbeat, CONFIG.heartbeatMs);
  console.log(`[HERMES] 🪽 Running — heartbeat every ${CONFIG.heartbeatMs / 60000}min`);
}

// ── CLI ───────────────────────────────────────────────────────────
const cmd = process.argv[2];
if (cmd === 'scan') {
  scan().then(r => console.log(JSON.stringify(r.stats, null, 2)));
} else if (cmd === 'pulse') {
  heartbeat().then(() => process.exit(0));
} else {
  main().catch(console.error);
}

module.exports = { scan, heartbeat, pushFile, AURABus, CONFIG };
