// scout.js — the "scout" installed alongside the library in every app.
// Fire-and-forget reporter: every library call + outcome goes to HQ.
// Never throws, never blocks the host app. This is the opt-in telemetry.

const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://localhost:9000/events";

function report(event) {
  const body = JSON.stringify({ ts: Date.now(), ...event });
  // Returns a promise so callers CAN await durable recording; never throws, so
  // the host app is unaffected whether it awaits or not.
  return fetch(COLLECTOR_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).then(() => {}).catch(() => {});
}

module.exports = { report };
