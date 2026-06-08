#!/usr/bin/env node
/**
 * 🪽 HERMES AGENT v2.2
 * Messenger & Orchestrator of the VibraHalo Ecosystem
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... node hermes.js
 *   GITHUB_TOKEN=ghp_... node hermes.js scan
 */

const https = require('https');
const http  = require('http');

// ── CONFIG ────────────────────────────────────────────────────────
const CONFIG = {
  owner:       process.env.OWNER        || 'leoncanales23',
  token:       process.env.GITHUB_TOKEN || '',
  nerhia:      process.env.VBC_URL      || 'http://34.74.27.168:8000',
  email:       process.env.NOTIFY_EMAIL || 'leoncanales7@gmail.com',
  heartbeatMs: parseInt(process.env.HEARTBEAT_MS || '3600000'),
};

if (!CONFIG.token) {
  console.error('[HERMES] ❌  GITHUB_TOKEN no configurado — set env var y reinicia el servicio');
  console.error('[HERMES]     sudo systemctl stop hermes');
  console.error('[HERMES]     sudo nano /etc/systemd/system/hermes.service  # edita GITHUB_TOKEN=');
  console.error('[HERMES]     sudo systemctl daemon-reload && sudo systemctl start hermes');
  // No salir — seguir con repos públicos solamente
}

// ── AURA NEURAL BUS (local) ───────────────────────────────────────
const AURABus = {
  _listeners: {},
  on(event, fn)  {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  emit(event, data) {
    const preview = JSON.stringify(data || {}).slice(0, 160);
    console.log(`[AURA] 📡 ${event} ${preview}`);
    (this._listeners[event] || []).forEach(fn => fn(data));
    (this._listeners['*']   || []).forEach(fn => fn({ event, data }));
  }
};

// ── GITHUB API ────────────────────────────────────────────────────
function githubRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent':  'hermes-agent/2.2',
        'Accept':      'application/vnd.github.v3+json',
        ...(CONFIG.token ? { Authorization: `token ${CONFIG.token}` } : {}),
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // GitHub API returns {message: "..."} on errors
          if (parsed && parsed.message && !Array.isArray(parsed)) {
            console.warn(`[HERMES] GitHub API warning (${path}): ${parsed.message}`);
            if (parsed.message.includes('rate limit')) {
              reject(new Error('Rate limited'));
            } else {
              resolve(parsed); // return as-is
            }
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getAllRepos() {
  const repos = [];
  let page = 1;

  // Use /user/repos (authenticated, includes private) or /users/owner/repos (public only)
  const endpoint = CONFIG.token
    ? `/user/repos?per_page=100&page=${page}&type=all`
    : `/users/${CONFIG.owner}/repos?per_page=100&page=${page}`;

  while (true) {
    const path = CONFIG.token
      ? `/user/repos?per_page=100&page=${page}&type=all`
      : `/users/${CONFIG.owner}/repos?per_page=100&page=${page}`;

    const batch = await githubRequest(path);

    if (!Array.isArray(batch)) {
      console.warn('[HERMES] ⚠️  GitHub API returned non-array:', JSON.stringify(batch).slice(0, 200));
      break;
    }
    if (batch.length === 0) break;

    repos.push(...batch);
    console.log(`[HERMES] 📦 Page ${page}: +${batch.length} repos (total: ${repos.length})`);

    if (batch.length < 100) break;
    page++;
  }

  return repos;
}

// ── CLASSIFIER ────────────────────────────────────────────────────
const LAYER_MAP = {
  'vibrahalo-mempalace': 'brain',
  'vibraalto-core':      'brain',
  'VBC-Compute-Layer':   'compute',
  'nerhia':              'intelligence',
  'nerhia-urban-sdk':    'intelligence',
  'vibraworld':          'world',
  '3d':                  'world',
  'genesis-world':       'world',
  'SimWorld':            'world',
  'nexus':               'economy',
  'mining-cli':          'economy',
  'jarvis':              'agent',
  'hermes-agent':        'agent',
  'ECC':                 'agent',
  'openclaw':            'agent',
};

function classifyRepo(repo) {
  if (repo.fork)    return 'fork';
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

  let repos = [];
  try {
    repos = await getAllRepos();
  } catch (e) {
    console.error('[HERMES] ❌ Scan failed:', e.message);
    return { repos: [], stats: { total: 0, error: e.message } };
  }

  const classified = repos.map(r => ({
    name:    r.name,
    type:    classifyRepo(r),
    layer:   getLayer(r),
    private: r.private,
    fork:    r.fork,
    stars:   r.stargazers_count,
    pushed:  r.pushed_at,
    url:     r.html_url,
    dormant: isDormant(r.pushed_at),
  }));

  const stats = {
    total:       classified.length,
    corePrivate: classified.filter(r => r.type === 'core-private').length,
    ownPublic:   classified.filter(r => r.type === 'own-public').length,
    forks:       classified.filter(r => r.type === 'fork').length,
    dormant:     classified.filter(r => r.dormant).length,
    active:      classified.filter(r => !r.dormant && r.type !== 'fork').length,
  };

  console.log('[HERMES] ✅ Scan complete:', JSON.stringify(stats));

  // Report dormant repos
  const dormantList = classified.filter(r => r.dormant && r.type !== 'fork');
  if (dormantList.length > 0) {
    console.log('[HERMES] 😴 Dormant repos:', dormantList.map(r => r.name).join(', '));
    AURABus.emit('hermes:dormant', { repos: dormantList.map(r => r.name), count: dormantList.length });
  }

  AURABus.emit('hermes:scan', { stats, timestamp: new Date().toISOString() });
  return { repos: classified, stats };
}

// ── ACTION ENGINE ─────────────────────────────────────────────────
async function pushFile(repo, filePath, content, message) {
  if (!CONFIG.token) { console.warn('[HERMES] No token — skipping push'); return null; }

  let sha;
  try {
    const existing = await githubRequest(`/repos/${CONFIG.owner}/${repo}/contents/${filePath}`);
    sha = existing.sha;
  } catch (_) { /* new file */ }

  const result = await githubRequest(
    `/repos/${CONFIG.owner}/${repo}/contents/${filePath}`,
    'PUT',
    {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    }
  );

  AURABus.emit('hermes:act', { action: 'push', repo, path: filePath });
  console.log(`[HERMES] ✍️  Pushed ${filePath} → ${repo}`);
  return result;
}

// ── VBC PING ──────────────────────────────────────────────────────
async function pingVBC() {
  return new Promise((resolve) => {
    const url = new URL(CONFIG.nerhia + '/health');
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname,
      timeout:  5000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const health = JSON.parse(d);
          console.log('[HERMES] ✅ VBC alive:', JSON.stringify(health).slice(0, 100));
          AURABus.emit('hermes:vbc', { status: 'alive', ...health });
          resolve(true);
        } catch (_) { resolve(false); }
      });
    });
    req.on('error', (e) => {
      console.warn(`[HERMES] ⚠️  VBC unreachable: ${e.message}`);
      AURABus.emit('hermes:vbc', { status: 'unreachable', error: e.message });
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── HEARTBEAT ─────────────────────────────────────────────────────
async function heartbeat() {
  const { stats } = await scan();
  AURABus.emit('hermes:pulse', { stats, timestamp: new Date().toISOString() });
  await pingVBC();
}

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  AURABus.emit('hermes:online', { version: '2.2', owner: CONFIG.owner, hasToken: !!CONFIG.token });
  await heartbeat();
  setInterval(heartbeat, CONFIG.heartbeatMs);
  console.log(`[HERMES] 🪽 Running — heartbeat every ${CONFIG.heartbeatMs / 60000}min`);
}

// ── CLI ───────────────────────────────────────────────────────────
const cmd = process.argv[2];
if      (cmd === 'scan')  { scan().then(r => { console.log(JSON.stringify(r.stats, null, 2)); process.exit(0); }); }
else if (cmd === 'pulse') { heartbeat().then(() => process.exit(0)); }
else                      { main().catch(console.error); }

module.exports = { scan, heartbeat, pushFile, pingVBC, AURABus, CONFIG };
