// Used by HQ ONLY to label incoming events for the dashboard/agent.
// (The library's own defense is whatever the agent writes into guard.js.)
const net = require("net");

const PRIVATE_V4 = [
  [/^127\./, "loopback"],
  [/^10\./, "private-10"],
  [/^192\.168\./, "private-192"],
  [/^169\.254\./, "link-local/metadata"],
];

function isInternalHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal"))
    return true;
  if (net.isIP(h) === 4) {
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; // 172.16-31
    return PRIVATE_V4.some(([re]) => re.test(h));
  }
  if (net.isIP(h) === 6) return h === "::1" || h.startsWith("fd") || h.startsWith("fe80");
  return false;
}

module.exports = { isInternalHost };
