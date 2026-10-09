// guard.js — hardened by the Sentinel HQ agent from live attack telemetry.
// Blocks SSRF: rejects loopback, link-local/metadata, and private-range hosts,
// by literal IP and by resolved DNS.
const dns = require("dns").promises;
const net = require("net");

function isPrivateIP(ip) {
  if (net.isIP(ip) === 6) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;          // cloud metadata
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
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
