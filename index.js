#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK) {
  console.error('ERROR: DISCORD_WEBHOOK_URL not set. Añádelo como Secret en GitHub o expórtalo localmente para pruebas.');
  console.error('Ejemplo PowerShell (local):');
  console.error("$env:DISCORD_WEBHOOK_URL = \"https://discord.com/api/webhooks/...\"; $env:GITHUB_EVENT_PATH = (Resolve-Path .\\event.sample.json).Path; node .\\index.js");
  console.error('Ejemplo GitHub CLI (establece el secret en el repo remoto):');
  console.error('echo -n "YOUR_WEBHOOK" | gh secret set DISCORD_WEBHOOK_URL -b -R jgr-ry/ZeroRP');
  process.exit(1);
}
console.log('DISCORD_WEBHOOK_URL encontrado (no se muestra por seguridad).');

const eventPath = process.env.GITHUB_EVENT_PATH || path.join(process.cwd(), 'event.json');
if (!fs.existsSync(eventPath)) {
  console.error(`ERROR: payload de evento no encontrado en ${eventPath}`);
  console.error('Para pruebas locales, copia/usa `event.sample.json` y exporta GITHUB_EVENT_PATH apuntando a él.');
  process.exit(1);
}
let event = {};
try {
  event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
} catch (e) {
  console.error('ERROR leyendo el payload del evento:', e.message);
  process.exit(1);
}

const repo = event.repository?.full_name || process.env.GITHUB_REPOSITORY || 'unknown';
const ref = event.ref || process.env.GITHUB_REF || '';
const branch = ref.replace('refs/heads/', '') || '(unknown)';
const pusher = event.pusher?.name || process.env.GITHUB_ACTOR || 'unknown';
const commits = event.commits || [];
const compare = event.compare || '';

// Branch filtering (comma-separated branches in env). Default: main
const allowedBranches = (process.env.NOTIFY_BRANCHES || 'main').split(',').map(b => b.trim());
if (!(allowedBranches.includes('*') || allowedBranches.includes(branch))) {
  console.log(`Branch '${branch}' no está en NOTIFY_BRANCHES (${allowedBranches.join(',')}). Saltando notificación.`);
  process.exit(0);
}

// Collect modified files (de todos los commits)
const filesSet = new Set();
commits.forEach(c => {
  (c.added || []).forEach(f => filesSet.add(f));
  (c.modified || []).forEach(f => filesSet.add(f));
  (c.removed || []).forEach(f => filesSet.add(f));
});
const files = Array.from(filesSet).slice(0, 200); // cap para evitar mensajes gigantes

// Build commit messages list (limit to 10)
const repoUrlBase = `https://github.com/${repo}`;
const commitLines = commits.slice(0, 10).map(c => {
  const fullId = c.id || '';
  const id = fullId.slice(0, 7);
  const msg = (c.message || '').split('\n')[0];
  const author = c.author?.name || c.author?.username || '';
  const commitUrl = fullId ? `${repoUrlBase}/commit/${fullId}` : '';
  return commitUrl ? `• [${msg}](${commitUrl}) (${id}) — ${author}` : `• ${msg} (${id}) — ${author}`;
});

// Prepare brief file diffs (use GitHub Compare API if available)
const filesText = files.length ? files.map(f => `${f}`).join('\n') : 'Ningún archivo modificado listado.';

async function getFilesDetailedText() {
  let filesDetailedTextLocal = filesText;
  if (compare) {
    try {
      // Normalize compare to API URL if necessary
      let compareApi = compare;
      if (compareApi.startsWith('https://github.com/')) {
        compareApi = compareApi.replace('https://github.com/', 'https://api.github.com/repos/');
      }

      const fetchOpts = {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      };
      if (process.env.GITHUB_TOKEN) {
        fetchOpts.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      }

      const cmpRes = await fetch(compareApi, fetchOpts);
      if (cmpRes.ok) {
        const cmpJson = await cmpRes.json();
        if (Array.isArray(cmpJson.files) && cmpJson.files.length) {
          const maxFilesToShow = 150;
          const lines = cmpJson.files.slice(0, maxFilesToShow).map(f => {
            const name = f.filename;
            if (f.status === 'added') return `${name} — added`;
            if (f.status === 'removed') return `${name} — removed`;
            // modified
            return `${name} — +${f.additions} / -${f.deletions}`;
          });
          if (cmpJson.files.length > maxFilesToShow) lines.push(`...and ${cmpJson.files.length - maxFilesToShow} more files`);
          filesDetailedTextLocal = lines.join('\n');
        }
      } else {
        console.warn('No se pudo obtener compare API:', cmpRes.status);
      }
    } catch (e) {
      console.warn('Error al obtener diff detallado:', e.message);
    }
  }
  return filesDetailedTextLocal;
}

const commitsPageUrl = `${repoUrlBase}/commits/${branch}`;

(async () => {
  try {
    // If this is a release event, send a release-specific embed
    if (event.release) {
      const rel = event.release;
      if (event.action && event.action !== 'published') {
        console.log(`Release action '${event.action}' no es 'published'; no se notificará.`);
        process.exit(0);
      }

      const relTitle = rel.name || rel.tag_name || `Release ${rel.tag_name}`;
      const relBody = rel.body ? (rel.body.length > 500 ? rel.body.slice(0, 500) + '…' : rel.body) : '';
      const embed = {
        title: `Release publicado: ${relTitle}`,
        description: `**Repositorio:** [${repo}](${repoUrlBase})\n**Tag:** ${rel.tag_name}\n**Autor:** ${rel.author?.login || rel.author?.name || 'unknown'}` + (relBody ? `\n\n${relBody}` : ''),
        color: 0x8e44ad,
        author: {
          name: repo,
          url: repoUrlBase,
          icon_url: `https://github.com/${(repo.split('/')[0])}.png`
        },
        fields: [
          { name: 'Release', value: rel.html_url || rel.url || '—' }
        ],
        footer: { text: `Release published — ${rel.tag_name}` },
        timestamp: new Date().toISOString()
      };

      const payload = {
        username: 'JGR Deploys',
        embeds: [embed]
      };

      if (process.env.VERBOSE_LOGS === '1' || process.env.VERBOSE_LOGS === 'true') {
        console.log('Payload que se enviará (release):', JSON.stringify(payload, null, 2));
      }

      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Error sending release webhook:', res.status, text);
        process.exit(2);
      }

      console.log('Webhook de release enviado correctamente.');
      process.exit(0);
    }

    // Otherwise, handle push events — send single balanced embed (wait up to DETAIL_TIMEOUT_MS for compare)

    // Utility: fetch with timeout
    function fetchWithTimeout(url, opts = {}, timeoutMs = 3000) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
    }

    // Helper to send webhook and log timing
    async function sendWebhook(payload) {
      const start = Date.now();
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const duration = Date.now() - start;
      console.log(`Webhook POST ${res.status} (${duration}ms)`);
      if (!res.ok) {
        const text = await res.text();
        console.error('Error sending webhook:', res.status, text);
        return { ok: false, status: res.status, text };
      }
      return { ok: true, status: res.status };
    }

    // Aggregate change counts across commits (quick summary)
    let totalAdded = 0, totalModified = 0, totalRemoved = 0;
    commits.forEach(c => {
      totalAdded += (c.added || []).length;
      totalModified += (c.modified || []).length;
      totalRemoved += (c.removed || []).length;
    });

    const embedColor = process.env.EMBED_COLOR ? Number(process.env.EMBED_COLOR) : 0x2ecc71; // default green
    const pusherLogin = event.sender?.login || process.env.GITHUB_ACTOR || pusher;
    const thumbnailUrl = `https://github.com/${pusherLogin}.png`;

    // Limit commits shown
    const maxCommitsShown = 5;
    const shownCommits = commits.slice(0, maxCommitsShown).map(c => {
      const fullId = c.id || '';
      const id = fullId.slice(0,7);
      const msg = (c.message || '').split('\n')[0];
      const author = c.author?.name || c.author?.username || '';
      const commitUrl = fullId ? `${repoUrlBase}/commit/${fullId}` : '';
      return commitUrl ? `• [${msg}](${commitUrl}) (${id}) — ${author}` : `• ${msg} (${id}) — ${author}`;
    });
    const moreCommits = commits.length - shownCommits.length;

    const summary = `➕ ${totalAdded} · ✳️ ${totalModified} · ➖ ${totalRemoved}`;

    // Try to fetch compare details (but only up to DETAIL_TIMEOUT_MS)
    const detailTimeout = Number(process.env.DETAIL_TIMEOUT_MS || 3000);
    let filesDetailedTextLocal = filesText;
    if (compare) {
      try {
        let compareApi = compare;
        if (compareApi.startsWith('https://github.com/')) {
          compareApi = compareApi.replace('https://github.com/', 'https://api.github.com/repos/');
        }
        const fetchOpts = { headers: { 'Accept': 'application/vnd.github.v3+json' } };
        if (process.env.GITHUB_TOKEN) fetchOpts.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

        const cmpRes = await fetchWithTimeout(compareApi, fetchOpts, detailTimeout);
        if (cmpRes && cmpRes.ok) {
          const cmpJson = await cmpRes.json();
          if (Array.isArray(cmpJson.files) && cmpJson.files.length) {
            const maxFilesToShow = 150;
            const lines = cmpJson.files.slice(0, maxFilesToShow).map(f => {
              const name = f.filename;
              if (f.status === 'added') return `${name} — added`;
              if (f.status === 'removed') return `${name} — removed`;
              return `${name} — +${f.additions} / -${f.deletions}`;
            });
            if (cmpJson.files.length > maxFilesToShow) lines.push(`...and ${cmpJson.files.length - maxFilesToShow} more files`);
            filesDetailedTextLocal = lines.join('\n');
          }
        } else {
          console.warn('Compare API no disponible o tardó demasiado');
        }
      } catch (e) {
        console.warn('Error al obtener diff detallado (timeout o error):', e.message);
      }
    }

    // Build payload dynamically after possibly fetching compare details
    const filesDetailedText = await getFilesDetailedText();

    const embed = {
      title: "What's Changed",
      description: `**Repositorio:** [${repo}](${repoUrlBase}) | **Branch:** ${branch} | **Pushed por:** ${pusher}`,
      color: 0x2b90d9,
      author: {
        name: repo,
        url: repoUrlBase,
        icon_url: `https://github.com/${(repo.split('/')[0])}.png`
      },
      fields: [
        { name: '¿Qué cambió? ✅', value: commitLines.length ? commitLines.join('\n') : 'No hay commits' },
        { name: 'Files (brief)', value: filesDetailedText.length ? `\`\`\`\n${filesDetailedText}\n\`\`\`` : '—' },
        { name: 'Commits', value: `[Ver commits](${commitsPageUrl})` },
        ...(compare ? [{ name: 'Compare', value: compare }] : [])
      ],
      footer: { text: `${commits.length} commit(s) — pushed by ${pusher}` },
      timestamp: new Date().toISOString()
    };

    const payload = {
      username: 'JGR Deploys',
      embeds: [embed]
    };

    if (process.env.VERBOSE_LOGS === '1' || process.env.VERBOSE_LOGS === 'true') {
      console.log('Payload que se enviará:', JSON.stringify(payload, null, 2));
    }

    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Error sending webhook:', res.status, text);
      process.exit(2);
    }
    console.log('Webhook enviado correctamente.');
  } catch (err) {
    console.error('Error al enviar webhook:', err.message);
    process.exit(2);
  }
})();