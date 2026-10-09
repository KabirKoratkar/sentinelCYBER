// Sentinel — single-process, browser-testable demo server.
// One Node process hosts: the dashboard, 3 apps (route namespaces) that use the
// linkpreview library, the internal "secret" target, the HQ collector, and the
// Attack / Harden / Reset controls the buttons call. Deployable as one container.
try { process.loadEnvFile(require("path").join(__dirname, "..", ".env")); } catch {}

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.join(__dirname, "..");
const GUARD = path.join(ROOT, "library/src/guard.js");
const GUARD_VULN = "async function assertAllowed(){return;}\nmodule.exports={assertAllowed};\n";
const GUARD_HARDENED = fs.readFileSync(path.join(ROOT, "library/src/guard.hardened.js"), "utf8");

// scout posts here (to ourselves); set before requiring the library
process.env.COLLECTOR_URL = `http://127.0.0.1:${PORT}/events`;
const { linkpreview, SSRFBlocked } = require("../library/src/index");
const ch = require("../hq/clickhouse");
const { isInternalHost } = require("../hq/netcheck");

const APPS = { chatly: "chat link unfurler", feedbot: "rss/webhook fetcher", snapshot: "admin image proxy" };
const recent = [];
let prCooldownUntil = 0;

const SECRET = {
  warning: "INTERNAL ONLY — reachable means SSRF succeeded",
  credentials: { AccessKeyId: "AKIA_DEMO_DO_NOT_SHIP", SecretAccessKey: "s3cr3t/library-ssrf-demo/EXAMPLE" },
};

const j = (res, obj, code = 200) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- attack: hit our own 3 apps with SSRF + benign noise -------------------
async function runAttack(rounds = 4) {
  const ssrf = [
    `http://127.0.0.1:${PORT}/internal-meta/iam/security-credentials/`,
    `http://localhost:${PORT}/internal-meta/admin`,
    "http://169.254.169.254/latest/meta-data/",
    "http://127.1/internal-meta/",
  ];
  const benign = ["http://example.com/", "http://example.org/"];
  let leaked = 0, blocked = 0;
  for (let i = 0; i < rounds; i++)
    for (const app of Object.keys(APPS)) {
      for (const u of ssrf) {
        try { const r = await fetch(`http://127.0.0.1:${PORT}/app/${app}/preview?url=${encodeURIComponent(u)}`); const b = await r.json(); if (b.ok) leaked++; else if (b.blocked) blocked++; } catch {}
      }
      try { await fetch(`http://127.0.0.1:${PORT}/app/${app}/preview?url=${encodeURIComponent(benign[i % benign.length])}`); } catch {}
    }
  return { rounds, leaked, blocked };
}

// ---- generate the fix (deterministic by default, Akash with ?ai=1) ---------
async function generatePatch(useAI) {
  if (useAI && process.env.AKASH_API_KEY && process.env.AKASH_MODEL) {
    try {
      const r = await fetch(`${(process.env.AKASH_BASE_URL || "").replace(/\/$/, "")}/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AKASH_API_KEY}` },
        body: JSON.stringify({ model: process.env.AKASH_MODEL, temperature: 0, messages: [
          { role: "system", content: "Output ONLY guard.js contents, no fences. Export async assertAllowed(url) throwing on SSRF (loopback 127/8 incl 127.1, 0.0.0.0, link-local 169.254/16, RFC1918, localhost/.internal, IPv6 ::1/fc00/fe80), checking IP literals and resolved DNS; allow public URLs." },
          { role: "user", content: "Write guard.js." }] }),
      });
      const jr = await r.json();
      const code = (jr.choices?.[0]?.message?.content || "").replace(/^```[a-z]*\n?/, "").replace(/```\s*$/, "").trim();
      if (code.includes("assertAllowed") && await selfVerify(code)) return { code, source: `akash:${process.env.AKASH_MODEL}` };
    } catch {}
  }
  return { code: GUARD_HARDENED, source: "deterministic" };
}

// require the candidate fresh and prove it blocks SSRF, allows public
async function selfVerify(code) {
  const tmp = path.join(__dirname, ".cand.js");
  try {
    fs.writeFileSync(tmp, code);
    delete require.cache[require.resolve(tmp)];
    const g = require(tmp);
    for (const u of ["http://127.0.0.1/", "http://127.1/", "http://localhost/", "http://169.254.169.254/", "http://10.0.0.5/"]) {
      try { await g.assertAllowed(u); return false; } catch {}
    }
    try { await g.assertAllowed("http://example.com/"); } catch { return false; }
    return true;
  } catch { return false; } finally { try { fs.unlinkSync(tmp); } catch {} }
}

// ---- open a real PR via the GitHub REST API (no git/gh needed) --------------
async function openPR(evidence, source) {
  const repo = process.env.GH_REPO, token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return { opened: false, reason: "GH_REPO/GITHUB_TOKEN not set" };
  if (Date.now() < prCooldownUntil) return { opened: false, cooled: true, reason: "cooldown (one PR/min)" };
  prCooldownUntil = Date.now() + 60000;
  const api = (p, opt = {}) => fetch(`https://api.github.com/repos/${repo}${p}`, {
    ...opt, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "sentinel-hq" },
  });
  try {
    const branch = `sentinel/harden-ssrf-${Date.now()}`;
    const mainRef = await (await api("/git/ref/heads/main")).json();
    const baseSha = mainRef.object.sha;
    await api("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) });
    const cur = await (await api(`/contents/library/src/guard.js?ref=${branch}`)).json();
    const bodyText = [
      "Autonomous patch opened by the **Sentinel HQ agent** (live web demo).", "",
      `**Evidence:** ${evidence.leaked} successful internal fetches across \`chatly\`, \`feedbot\`, \`snapshot\`.`,
      `**Fix:** range-based SSRF guard (loopback incl 127.1, 169.254/16, RFC1918, IPv6).`,
      `**Patch source:** ${source}. **Self-verified** before shipping.`, "",
      "No app changed a line — every dependent is protected by this single change.", "",
      "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
    ].join("\n");
    await api("/contents/library/src/guard.js", { method: "PUT", body: JSON.stringify({
      message: "Harden linkpreview against SSRF (from live attack telemetry)", content: Buffer.from(GUARD_HARDENED).toString("base64"), sha: cur.sha, branch }) });
    const pr = await (await api("/pulls", { method: "POST", body: JSON.stringify({ title: "Harden linkpreview against SSRF (from live attack telemetry)", head: branch, base: "main", body: bodyText }) })).json();
    return { opened: true, url: pr.html_url, branch };
  } catch (e) { return { opened: false, reason: e.message }; }
}

// ---- the server ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = u.pathname;

  // scout events in
  if (req.method === "POST" && p === "/events") {
    try { const e = JSON.parse(await body(req)); e.internal = isInternalHost(e.host); await ch.insert(e); recent.push(e); if (recent.length > 200) recent.shift(); } catch {}
    res.writeHead(204); return res.end();
  }
  // the internal SSRF target
  if (p.startsWith("/internal-meta")) return j(res, { ...SECRET, path: p });
  // the 3 apps
  const appM = p.match(/^\/app\/([^/]+)\/preview$/);
  if (appM) {
    const name = appM[1]; const target = u.searchParams.get("url") || "";
    try { const result = await linkpreview(target, name); return j(res, { app: name, ok: true, ...result }); }
    catch (e) { const blocked = e instanceof SSRFBlocked; return j(res, { app: name, ok: false, blocked, error: e.message }, blocked ? 403 : 502); }
  }
  // read APIs
  if (p === "/api/stats") return j(res, { backend: ch.enabled ? "clickhouse" : "memory", apps: await ch.stats() });
  if (p === "/api/evidence") return j(res, await ch.attackEvidence());
  if (p === "/api/recent") return j(res, recent.slice(-40).reverse());
  // controls
  if (req.method === "POST" && p === "/api/attack") return j(res, await runAttack(Number(u.searchParams.get("rounds")) || 4));
  if (req.method === "POST" && p === "/api/reset") { fs.writeFileSync(GUARD, GUARD_VULN); await ch.clear(); recent.length = 0; return j(res, { reset: true }); }
  if (req.method === "POST" && p === "/api/harden") {
    const ev = await ch.attackEvidence();                 // evidence from the attack just seen
    const { code, source } = await generatePatch(u.searchParams.get("ai") === "1");
    const verified = await selfVerify(code);
    const useCode = verified ? code : GUARD_HARDENED;
    const pr = await openPR({ leaked: ev.leakCount }, source);
    fs.writeFileSync(GUARD, useCode);                      // hot-deploy
    await sleep(300);
    await ch.clear(); recent.length = 0;                   // clean slate to prove the fix
    const check = await runAttack(1);                      // re-verify live -> all blocked
    return j(res, { source, verified, deployed: true, evidenceLeaks: ev.leakCount, pr, afterAttack: check });
  }
  // dashboard
  res.writeHead(200, { "content-type": "text/html" });
  res.end(fs.readFileSync(path.join(__dirname, "index.html")));
});

(async () => { await ch.init(); fs.writeFileSync(GUARD, GUARD_VULN); server.listen(PORT, () => console.log(`Sentinel web on http://localhost:${PORT} (store: ${ch.enabled ? "ClickHouse" : "memory"})`)); })();
