// scout.js — the "scout" installed alongside the library in every app.
// Fire-and-forget reporter: every library call + outcome goes to HQ.
// Never throws, never blocks the host app. This is the opt-in telemetry.

const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://localhost:9000/events";

function report(event) {
  const body = JSON.stringify({ ts: Date.now(), ...event });
  // fire-and-forget; swallow everything so the host app is never affected
  fetch(COLLECTOR_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).catch(() => {});
}

module.exports = { report };
