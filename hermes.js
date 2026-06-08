#!/usr/bin/env node
/**
 * 🪽 HERMES AGENT v3.0
 * Messenger, DNA Writer & Ecosystem Orchestrator — VibraAlto
 *
 * NEW in v3.0:
 *  - DNA Reader:  fetches agent.json from each core/public repo
 *  - DNA Writer:  auto-generates & pushes agent.json to repos that lack it
 *  - EcoMap:      builds ecosystem-map.json (nodes + edges) and publishes to hermes-agent
 *  - MemPalace:   ecosystem-map.json is readable at raw.githubusercontent.com
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... node hermes.js          # run as service
 *   GITHUB_TOKEN=ghp_... node hermes.js scan      # one-shot scan
 *   GITHUB_TOKEN=ghp_... node hermes.js dna       # one-shot DNA phase
 *   GITHUB_TOKEN=ghp_... node hermes.js map        # one-shot build & publish map
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── CONFIG ────────────────────────────────────────────────────────
const CONFIG = {
  owner:       process.env.OWNER        || 'leoncanales23',
  token:       process.env.GITHUB_TOKEN || '',
  nerhia:      process.env.VBC_URL      || 'http://34.74.27.168:8000',
  email:       process.env.NOTIFY_EMAIL || 'leoncanales7@gmail.com',
  heartbeatMs: parseInt(process.env.HEARTBEAT_MS || '3600000'),
  mapRepo:     'hermes-agent',       // where ecosystem-map.json is published
  mapFile:     'ecosystem-map.json',
  dnaFile:     'agent.json',
  logFile:     path.join(__dirname, 'hermes.log'),
};

if (!CONFIG.token) {
  console.error('[HERMES] ❌  GITHUB_TOKEN no configurado — set env var y reinicia el servicio');
  console.error('[HERMES]     sudo nano /etc/systemd/system/hermes.service');
  console.error('[HERMES]     sudo systemctl daemon-reload && sudo systemctl restart hermes');
}

// ── LOGGER ────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(CONFIG.logFile, line + '\n'); } catch (_) {}
}

// ── AURA NEURAL BUS (local) ───────────────────────────────────────
const AURABus = {
  _listeners: {},
  on(event, fn)  {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  emit(event, data) {
    const preview = JSON.stringify(data || {}).slice(0, 200);
    log(`[AURA] 📡 ${event} ${preview}`);
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
        'User-Agent':  'hermes-agent/3.0',
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
          if (parsed && parsed.message && !Array.isArray(parsed)) {
            if (parsed.message.includes('rate limit')) {
              reject(new Error('Rate limited'));
            } else {
              resolve(parsed);
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
  while (true) {
    const path = CONFIG.token
      ? `/user/repos?per_page=100&page=${page}&type=all`
      : `/users/${CONFIG.owner}/repos?per_page=100&page=${page}`;
    const batch = await githubRequest(path);
    if (!Array.isArray(batch)) {
      log(`[HERMES] ⚠️  GitHub API non-array: ${JSON.stringify(batch).slice(0, 200)}`);
      break;
    }
    if (batch.length === 0) break;
    repos.push(...batch);
    log(`[HERMES] 📦 Page ${page}: +${batch.length} repos (total: ${repos.length})`);
    if (batch.length < 100) break;
    page++;
  }
  return repos;
}

// ── LAYER & CLASSIFIER MAP ────────────────────────────────────────
const LAYER_MAP = {
  'vibrahalo-mempalace': 'brain',
  'vibraalto-core':      'brain',
  'VBC-Compute-Layer':   'compute',
  'nerhia':              'intelligence',
  'nerhia-urban-sdk':    'intelligence',
  'nerhia-mining-cli':   'intelligence',
  'vibraworld':          'world',
  '3d':                  'world',
  'genesis-world':       'world',
  'SimWorld':            'world',
  'nexus':               'economy',
  'ECC':                 'economy',
  'jarvis':              'agent',
  'hermes-agent':        'agent',
  'openclaw':            'agent',
  'vibraalto-satellite': 'satellite',
};

const LAYER_ROLES = {
  'brain':        'Core orchestration and mission control',
  'compute':      'Backend computation and API layer',
  'intelligence': 'AI and neural processing',
  'world':        '3D simulation and world building',
  'economy':      'Economic and resource management',
  'agent':        'Autonomous agent and integration',
  'satellite':    'Ecosystem satellite node',
  'reference':    'External reference and dependency',
  'unknown':      'Ecosystem participant',
};

// Layer connectivity graph (which layers connect to which)
const LAYER_EDGES = {
  'brain':        ['compute', 'intelligence', 'agent', 'world', 'economy', 'satellite'],
  'compute':      ['brain', 'intelligence', 'agent'],
  'intelligence': ['brain', 'compute', 'agent'],
  'agent':        ['brain', 'intelligence', 'compute'],
  'world':        ['brain', 'compute'],
  'economy':      ['brain', 'agent'],
  'satellite':    ['brain'],
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
  return (Date.now() - new Date(pushedAt)) / (1000 * 60 * 60 * 24) > 30;
}

// ── DNA READER ────────────────────────────────────────────────────
async function fetchDNA(repoName) {
  try {
    const file = await githubRequest(`/repos/${CONFIG.owner}/${repoName}/contents/${CONFIG.dnaFile}`);
    if (file && file.content) {
      return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    }
  } catch (_) {}
  return null;
}

// ── DNA GENERATOR ─────────────────────────────────────────────────
function generateDNA(repo) {
  return {
    name:    repo.name,
    version: '1.0.0',
    layer:   repo.layer,
    role:    LAYER_ROLES[repo.layer] || LAYER_ROLES.unknown,
    owner:   CONFIG.owner,
    private: repo.private,
    fork:    repo.fork,
    status:  repo.dormant ? 'dormant' : 'active',
    url:     repo.url,
    hermes: {
      registeredAt: new Date().toISOString(),
      registeredBy: 'hermes-agent/3.0',
      autoGenerated: true,
    }
  };
}

// ── DNA WRITER (push to repo) ─────────────────────────────────────
async function pushFile(repoName, filePath, content, message) {
  if (!CONFIG.token) { log('[HERMES] No token — skipping push'); return null; }
  let sha;
  try {
    const existing = await githubRequest(`/repos/${CONFIG.owner}/${repoName}/contents/${filePath}`);
    sha = existing.sha;
  } catch (_) {}

  const result = await githubRequest(
    `/repos/${CONFIG.owner}/${repoName}/contents/${filePath}`,
    'PUT',
    {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    }
  );

  if (result && result.content) {
    AURABus.emit('hermes:act', { action: 'push', repo: repoName, path: filePath });
    log(`[HERMES] ✍️  Pushed ${filePath} → ${repoName}`);
    return result;
  } else {
    log(`[HERMES] ⚠️  Push failed for ${repoName}/${filePath}: ${JSON.stringify(result).slice(0, 200)}`);
    return null;
  }
}

// ── DNA PHASE ─────────────────────────────────────────────────────
// Read DNA from all core/public repos; write agent.json where missing
async function dnaPhase(classifiedRepos) {
  const dnaMap = {};
  const targetRepos = classifiedRepos.filter(r => r.type !== 'fork');

  log(`[HERMES] 🧬 DNA phase — reading ${targetRepos.length} repos...`);

  for (const repo of targetRepos) {
    let dna = await fetchDNA(repo.name);

    if (dna) {
      log(`[HERMES] 🧬 DNA found: ${repo.name} (layer: ${dna.layer})`);
      dnaMap[repo.name] = dna;
    } else {
      // Generate and push DNA
      const newDNA = generateDNA(repo);
      log(`[HERMES] 🧬 Writing DNA → ${repo.name} (layer: ${repo.layer})`);
      try {
        await pushFile(
          repo.name,
          CONFIG.dnaFile,
          JSON.stringify(newDNA, null, 2),
          `🧬 hermes: register node DNA (layer: ${repo.layer})`
        );
        dnaMap[repo.name] = newDNA;
      } catch (e) {
        log(`[HERMES] ⚠️  Could not write DNA to ${repo.name}: ${e.message}`);
        dnaMap[repo.name] = newDNA; // still include in map
      }
    }

    // Small delay to avoid rate limits
    await sleep(300);
  }

  log(`[HERMES] 🧬 DNA phase complete — ${Object.keys(dnaMap).length} nodes registered`);
  AURABus.emit('hermes:dna', { count: Object.keys(dnaMap).length, nodes: Object.keys(dnaMap) });
  return dnaMap;
}

// ── ECOSYSTEM MAP BUILDER ─────────────────────────────────────────
function buildEcosystemMap(classifiedRepos, dnaMap, stats) {
  // Build nodes (all non-fork repos + known forks if they have DNA)
  const nodes = classifiedRepos
    .filter(r => r.type !== 'fork' || dnaMap[r.name])
    .map(r => ({
      id:      r.name,
      name:    r.name,
      layer:   r.layer,
      type:    r.type,
      status:  r.dormant ? 'dormant' : 'active',
      private: r.private,
      stars:   r.stars,
      pushed:  r.pushed,
      url:     r.url,
      dna:     dnaMap[r.name] || null,
    }));

  // Build edges from layer connectivity
  const edges = [];
  const nodesByLayer = {};
  nodes.forEach(n => {
    if (!nodesByLayer[n.layer]) nodesByLayer[n.layer] = [];
    nodesByLayer[n.layer].push(n.id);
  });

  Object.entries(LAYER_EDGES).forEach(([fromLayer, toLayerList]) => {
    const fromNodes = nodesByLayer[fromLayer] || [];
    toLayerList.forEach(toLayer => {
      const toNodes = nodesByLayer[toLayer] || [];
      fromNodes.forEach(from => {
        toNodes.forEach(to => {
          edges.push({ from, to, type: `${fromLayer}→${toLayer}` });
        });
      });
    });
  });

  // Deduplicate edges
  const seen = new Set();
  const uniqueEdges = edges.filter(e => {
    const key = [e.from, e.to].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    version:      '3.0',
    generatedAt:  new Date().toISOString(),
    generatedBy:  'hermes-agent/3.0',
    owner:        CONFIG.owner,
    stats,
    nodes,
    edges:        uniqueEdges,
    layerCount:   Object.fromEntries(
      Object.entries(nodesByLayer).map(([k, v]) => [k, v.length])
    ),
  };
}

// ── PUBLISH MAP ───────────────────────────────────────────────────
async function publishEcosystemMap(map) {
  const content = JSON.stringify(map, null, 2);

  // Save locally
  try {
    fs.writeFileSync(path.join(__dirname, CONFIG.mapFile), content);
    log(`[HERMES] 💾 Map saved locally (${map.nodes.length} nodes, ${map.edges.length} edges)`);
  } catch (e) {
    log(`[HERMES] ⚠️  Local save failed: ${e.message}`);
  }

  // Push to hermes-agent repo (public — readable by MemPalace)
  try {
    await pushFile(CONFIG.mapRepo, CONFIG.mapFile, content,
      `🗺️ hermes: ecosystem map update — ${map.nodes.length} nodes, ${map.stats.total} repos`);
    log(`[HERMES] 🌐 Ecosystem map published to ${CONFIG.mapRepo}/${CONFIG.mapFile}`);
    AURABus.emit('hermes:map', {
      nodes: map.nodes.length,
      edges: map.edges.length,
      stats: map.stats,
      url: `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.mapRepo}/main/${CONFIG.mapFile}`
    });
  } catch (e) {
    log(`[HERMES] ⚠️  Map publish failed: ${e.message}`);
  }
}

// ── SCANNER ───────────────────────────────────────────────────────
async function scan() {
  log('[HERMES] 🔭 Scanning ecosystem...');
  let repos = [];
  try {
    repos = await getAllRepos();
  } catch (e) {
    log(`[HERMES] ❌ Scan failed: ${e.message}`);
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

  log('[HERMES] ✅ Scan complete: ' + JSON.stringify(stats));

  const dormantList = classified.filter(r => r.dormant && r.type !== 'fork');
  if (dormantList.length > 0) {
    log('[HERMES] 😴 Dormant repos: ' + dormantList.map(r => r.name).join(', '));
    AURABus.emit('hermes:dormant', { repos: dormantList.map(r => r.name), count: dormantList.length });
  }

  AURABus.emit('hermes:scan', { stats, timestamp: new Date().toISOString() });
  return { repos: classified, stats };
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
          log('[HERMES] ✅ VBC alive: ' + JSON.stringify(health).slice(0, 100));
          AURABus.emit('hermes:vbc', { status: 'alive', ...health });
          resolve(true);
        } catch (_) { resolve(false); }
      });
    });
    req.on('error', (e) => {
      log(`[HERMES] ⚠️  VBC unreachable: ${e.message}`);
      AURABus.emit('hermes:vbc', { status: 'unreachable', error: e.message });
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── UTILS ─────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── FULL HEARTBEAT (scan + DNA + map + VBC) ───────────────────────
async function heartbeat() {
  const { repos, stats } = await scan();

  if (repos.length > 0 && CONFIG.token) {
    const dnaMap = await dnaPhase(repos);
    const ecoMap = buildEcosystemMap(repos, dnaMap, stats);
    await publishEcosystemMap(ecoMap);
  }

  AURABus.emit('hermes:pulse', { stats, timestamp: new Date().toISOString() });
  await pingVBC();
}

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  AURABus.emit('hermes:online', { version: '3.0', owner: CONFIG.owner, hasToken: !!CONFIG.token });
  await heartbeat();
  setInterval(heartbeat, CONFIG.heartbeatMs);
  log(`[HERMES] 🪽 Running — heartbeat every ${CONFIG.heartbeatMs / 60000}min`);
}

// ── CLI ───────────────────────────────────────────────────────────
const cmd = process.argv[2];
if (cmd === 'scan') {
  scan().then(r => { console.log(JSON.stringify(r.stats, null, 2)); process.exit(0); });
} else if (cmd === 'dna') {
  scan().then(async ({ repos }) => {
    const dna = await dnaPhase(repos);
    console.log(JSON.stringify(Object.keys(dna), null, 2));
    process.exit(0);
  });
} else if (cmd === 'map') {
  scan().then(async ({ repos, stats }) => {
    const dna = await dnaPhase(repos);
    const map = buildEcosystemMap(repos, dna, stats);
    await publishEcosystemMap(map);
    console.log(`✅ Map published: ${map.nodes.length} nodes, ${map.edges.length} edges`);
    process.exit(0);
  });
} else if (cmd === 'pulse') {
  heartbeat().then(() => process.exit(0));
} else {
  main().catch(console.error);
}

module.exports = { scan, heartbeat, pushFile, pingVBC, dnaPhase, buildEcosystemMap, AURABus, CONFIG };
