try { process.loadEnvFile(require("path").join(__dirname, "..", ".env")); } catch {}
// HQ agent — autonomous. Watches HQ for a cross-app attack pattern, then:
//   detect -> generate guard patch -> self-verify -> Semgrep scan ->
//   open PR (gh) -> hot-deploy to the library -> re-verify the attacks fail.
//
// Everything external (Akash LLM, Semgrep, gh) is best-effort and degrades
// so the loop always completes for the demo.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// HQ is the single source of truth. The agent reads aggregated evidence from
// the collector's API (works identically whether HQ stores in memory or CH).
const COLLECTOR = (process.env.COLLECTOR_URL || "http://localhost:9000/events").replace(/\/events$/, "");
const ROOT = path.join(__dirname, "..");
const GUARD = path.join(ROOT, "library/src/guard.js");
const APPS = ["http://localhost:7001", "http://localhost:7002", "http://localhost:7003"];
const THRESHOLD = Number(process.env.AGENT_THRESHOLD || 5); // leaks across >=2 apps
const POLL_MS = 1500;

const log = (...a) => console.log("[agent]", ...a);

// ---- the hardened guard the agent ships (deterministic, verified) ----------
const HARDENED_GUARD = `// guard.js — hardened by the Sentinel HQ agent from live attack telemetry.
// Blocks SSRF: rejects loopback, link-local/metadata, and private-range hosts,
// by literal IP and by resolved DNS.
const dns = require("dns").promises;
const net = require("net");

function isPrivateIP(ip) {
  if (net.isIP(ip) === 6) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  if (/^127\\./.test(ip)) return true;
  if (/^10\\./.test(ip)) return true;
  if (/^192\\.168\\./.test(ip)) return true;
  if (/^169\\.254\\./.test(ip)) return true;          // cloud metadata
  if (/^172\\.(1[6-9]|2\\d|3[01])\\./.test(ip)) return true;
  return false;
}

async function assertAllowed(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); }
  catch { throw new Error("invalid URL"); }

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    throw new Error("blocked: internal host " + host);

  if (net.isIP(host)) {
    if (isPrivateIP(host)) throw new Error("blocked: private address " + host);
    return;
  }
  // ponytail: resolve-then-check; DNS-rebinding (TOCTOU) left as known ceiling.
  const addrs = await dns.lookup(host, { all: true });
  for (const a of addrs)
    if (isPrivateIP(a.address))
      throw new Error("blocked: " + host + " resolves to private " + a.address);
}

module.exports = { assertAllowed };
`;

// ---- steps ------------------------------------------------------------------
async function waitForPattern() {
  log(`watching HQ for cross-app SSRF leaks (threshold ${THRESHOLD})...`);
  for (;;) {
    const ev = await fetch(`${COLLECTOR}/api/evidence`).then((r) => r.json()).catch(() => ({ leakCount: 0, apps: [], samples: [] }));
    if (ev.leakCount >= THRESHOLD && ev.apps.length >= 2) {
      log(`TRIGGER: ${ev.leakCount} leaks across apps [${ev.apps.join(", ")}]`);
      return ev;
    }
    await sleep(POLL_MS);
  }
}

async function generatePatch(evidence) {
  // Try Akash (OpenAI-compatible). On any issue, use the deterministic guard.
  const base = process.env.AKASH_BASE_URL, key = process.env.AKASH_API_KEY, model = process.env.AKASH_MODEL;
  if (base && key && model) {
    try {
      log(`asking model ${model} via Akash to write the guard...`);
      const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You harden a Node.js library. Output ONLY the full contents of guard.js, no markdown fences. It must export async assertAllowed(url) that throws on SSRF (loopback, link-local 169.254/metadata, RFC1918 private, localhost/.internal), checking IP literals and resolved DNS." },
            { role: "user", content: `Live telemetry: ${evidence.leakCount} successful internal fetches across apps ${JSON.stringify(evidence.apps)}. Sample attack URLs: ${JSON.stringify(evidence.samples)}. Write guard.js.` },
          ],
          temperature: 0,
        }),
      });
      const j = await r.json();
      const code = j.choices?.[0]?.message?.content?.replace(/^```[a-z]*\n?|```$/g, "").trim();
      if (code && code.includes("assertAllowed")) return { code, source: `akash:${model}` };
      log("model output unusable; using deterministic guard");
    } catch (e) {
      log("Akash call failed; using deterministic guard:", e.message);
    }
  }
  return { code: HARDENED_GUARD, source: "deterministic" };
}

// Self-verify the candidate in a child process BEFORE trusting it.
function selfVerify(code) {
  const tmp = path.join(ROOT, "hq", ".candidate-guard.js");
  fs.writeFileSync(tmp, code);
  const probe = `
    const g = require(${JSON.stringify(tmp)});
    (async () => {
      const block = ["http://127.0.0.1/","http://localhost/","http://169.254.169.254/latest/meta-data/","http://10.0.0.5/"];
      const allow = ["http://example.com/"];
      for (const u of block) { try { await g.assertAllowed(u); console.log("FAIL-allowed "+u); process.exit(1);} catch {} }
      for (const u of allow) { try { await g.assertAllowed(u);} catch(e){ console.log("FAIL-blocked "+u+" "+e.message); process.exit(1);} }
      console.log("OK"); process.exit(0);
    })();`;
  try {
    const out = execFileSync("node", ["-e", probe], { encoding: "utf8" }).trim();
    fs.unlinkSync(tmp);
    return out.endsWith("OK");
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    log("self-verify failed:", (e.stdout || e.message || "").toString().trim());
    return false;
  }
}

function semgrepBin() {
  const globby = require("fs");
  const guess = require("os").homedir() + "/Library/Python/3.9/bin/semgrep";
  return globby.existsSync(guess) ? guess : "semgrep";
}

function semgrepScan(file) {
  const rule = path.join(ROOT, ".semgrep", "ssrf-denylist-bypass.yaml");
  const env = { ...process.env, PATH: `${require("os").homedir()}/Library/Python/3.9/bin:${process.env.PATH}` };
  try {
    const out = execFileSync(
      semgrepBin(),
      ["scan", "--config", rule, "--config", "p/javascript", "--no-git-ignore", "--json", file],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env }
    );
    return { ran: true, findings: (JSON.parse(out).results || []).length };
  } catch (e) {
    if (e.stdout) { try { return { ran: true, findings: (JSON.parse(e.stdout).results || []).length }; } catch {} }
    return { ran: false, findings: 0 };
  }
}

function openPR(evidence, source, scan) {
  const repo = process.env.GH_REPO;
  const branch = `sentinel/harden-ssrf-${Date.now()}`;
  const title = "Harden linkpreview against SSRF (from live attack telemetry)";
  const bodyLines = [
    "Autonomous patch opened by the **Sentinel HQ agent**.",
    "",
    `**Evidence (grounded in HQ telemetry):** ${evidence.leakCount} successful internal fetches across \`${evidence.apps.join("`, `")}\`.`,
    "Sample attack URLs seen in the wild:",
    ...evidence.samples.map((s) => `- \`${s}\``),
    "",
    `**Fix:** rewrote \`library/src/guard.js\` to reject loopback, link-local/metadata (169.254/16), and RFC1918 hosts by IP literal and resolved DNS.`,
    `**Patch source:** ${source}`,
    `**Semgrep:** ${scan.ran ? scan.findings + " findings on the patched file" : "not run locally"}`,
    `**Self-verified:** blocks 127.0.0.1 / localhost / 169.254.169.254 / 10.x; allows example.com.`,
    "",
    "No app changed a line — every dependent is protected by this single change.",
    "",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ];
  if (!repo) {
    log(`GH_REPO unset — would open PR on branch ${branch}:`);
    console.log("----- PR BODY -----\n" + bodyLines.join("\n") + "\n-------------------");
    return { opened: false, branch };
  }
  try {
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
    git("checkout", "-b", branch);
    git("add", "library/src/guard.js");
    git("commit", "-m", title + "\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>");
    git("push", "-u", "origin", branch);
    const url = execFileSync("gh", ["pr", "create", "--repo", repo, "--title", title, "--body", bodyLines.join("\n")], { cwd: ROOT, encoding: "utf8" }).trim();
    log("PR opened:", url);
    return { opened: true, branch, url };
  } catch (e) {
    log("PR step failed (continuing to deploy):", e.message);
    return { opened: false, branch };
  }
}

async function verify() {
  log("re-running attacks to verify the fix is live everywhere...");
  const targets = ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8169/"];
  let blocked = 0, total = 0;
  for (const app of APPS)
    for (const t of targets) {
      total++;
      try {
        const r = await fetch(`${app}/preview?url=${encodeURIComponent(t)}`);
        const j = await r.json();
        if (j.blocked) blocked++;
      } catch {}
    }
  log(`verify: ${blocked}/${total} attacks now blocked`);
  return blocked === total;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const evidence = await waitForPattern();
  const { code, source } = await generatePatch(evidence);
  log(`patch generated (${source}); self-verifying...`);
  const ok = selfVerify(code) ? code : (log("candidate rejected, falling back to deterministic"), HARDENED_GUARD);
  if (!selfVerify(ok)) { log("FATAL: no valid patch"); process.exit(1); }

  fs.writeFileSync(GUARD, ok);
  const scan = semgrepScan(GUARD);
  log(`Semgrep: ${scan.ran ? scan.findings + " findings" : "not installed locally (skipped)"}`);
  const pr = openPR(evidence, source, scan);
  log(`deployed hot-patch to library/src/guard.js (branch ${pr.branch})`);
  await sleep(500);
  const good = await verify();
  log(good ? "DONE — fix once, protected everywhere." : "WARNING — some attacks still succeed");
})();
