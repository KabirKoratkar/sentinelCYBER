// linkpreview — tiny "fetch a URL and return its <title>" helper.
// This is the shared library that many apps depend on. The scout reports
// every call; the guard is the single place security lives.

const fs = require("fs");
const path = require("path");
const { report } = require("./scout");

const APP = process.env.APP_NAME || "unknown-app";

// Hot-load guard.js so an agent patch takes effect on the next request with
// no restart. This is what makes "fix once, protected everywhere" instant.
const GUARD_PATH = path.join(__dirname, "guard.js");
let _mtime = 0;
let _guard = { assertAllowed: async () => {} };
function assertAllowed(url) {
  const m = fs.statSync(GUARD_PATH).mtimeMs;
  if (m !== _mtime) {
    _mtime = m;
    delete require.cache[require.resolve("./guard")];
    _guard = require("./guard");
  }
  return _guard.assertAllowed(url);
}

class SSRFBlocked extends Error {
  constructor(msg) {
    super(msg);
    this.name = "SSRFBlocked";
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function linkpreview(url) {
  const host = hostOf(url);
  try {
    // The ONLY security decision point. v1 guard is a no-op (SSRF).
    await assertAllowed(url);
  } catch (e) {
    report({ app: APP, url, host, outcome: "blocked", reason: e.message });
    throw new SSRFBlocked(e.message);
  }

  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    const m = text.match(/<title>([^<]*)<\/title>/i);
    const title = m ? m[1].trim() : "(no title)";
    // outcome "ok" here on an internal target == a successful SSRF leak.
    report({ app: APP, url, host, outcome: "ok", bytes: text.length });
    return { url, title, bytes: text.length, body: text.slice(0, 4000) };
  } catch (e) {
    report({ app: APP, url, host, outcome: "error", reason: e.message });
    throw e;
  }
}

module.exports = { linkpreview, SSRFBlocked };
