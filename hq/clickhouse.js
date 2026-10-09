// ClickHouse HTTP-interface client with an in-memory fallback.
// Blank CLICKHOUSE_URL => everything lives in a local array so the whole
// project runs before any sign-up. Same API either way.

const URL_BASE = process.env.CLICKHOUSE_URL || "";
const DB = process.env.CLICKHOUSE_DB || "default";
const headers = {
  "X-ClickHouse-User": process.env.CLICKHOUSE_USER || "default",
  "X-ClickHouse-Key": process.env.CLICKHOUSE_PASSWORD || "",
};

const mem = []; // fallback store
const enabled = !!URL_BASE;

async function exec(query, body) {
  const u = new URL(URL_BASE);
  u.searchParams.set("database", DB);
  u.searchParams.set("query", query);
  const res = await fetch(u, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${text}`);
  return text;
}

async function init() {
  if (!enabled) return;
  await exec(
    `CREATE TABLE IF NOT EXISTS events (
       ts DateTime64(3), app String, host String, url String,
       outcome String, reason String, internal UInt8, bytes UInt32
     ) ENGINE = MergeTree ORDER BY ts`
  );
}

async function insert(e) {
  if (!enabled) {
    mem.push(e);
    return;
  }
  const row = JSON.stringify({
    ts: new Date(e.ts).toISOString().replace("T", " ").replace("Z", ""),
    app: e.app || "",
    host: e.host || "",
    url: e.url || "",
    outcome: e.outcome || "",
    reason: e.reason || "",
    internal: e.internal ? 1 : 0,
    bytes: e.bytes || 0,
  });
  await exec("INSERT INTO events FORMAT JSONEachRow", row);
}

// Minimal queries the dashboard/agent need. In-memory mirrors them.
async function stats() {
  if (!enabled) {
    const byApp = {};
    for (const e of mem) {
      const a = (byApp[e.app] ||= { app: e.app, total: 0, attacks: 0, leaked: 0, blocked: 0 });
      a.total++;
      if (e.internal) a.attacks++;
      if (e.internal && e.outcome === "ok") a.leaked++;
      if (e.outcome === "blocked") a.blocked++;
    }
    return Object.values(byApp);
  }
  const text = await exec(
    `SELECT app,
            count() total,
            sum(internal) attacks,
            sum(internal AND outcome='ok') leaked,
            sum(outcome='blocked') blocked
     FROM events GROUP BY app FORMAT JSONEachRow`
  );
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// Evidence the agent cites: top internal hosts that leaked, with samples.
async function attackEvidence() {
  if (!enabled) {
    const leaked = mem.filter((e) => e.internal && e.outcome === "ok");
    const apps = [...new Set(leaked.map((e) => e.app))];
    return {
      leakCount: leaked.length,
      apps,
      samples: leaked.slice(-5).map((e) => e.url),
    };
  }
  const count = await exec(
    `SELECT count() FROM events WHERE internal AND outcome='ok'`
  );
  const apps = await exec(
    `SELECT DISTINCT app FROM events WHERE internal AND outcome='ok' FORMAT JSONEachRow`
  );
  const samples = await exec(
    `SELECT url FROM events WHERE internal AND outcome='ok' ORDER BY ts DESC LIMIT 5 FORMAT JSONEachRow`
  );
  return {
    leakCount: Number(count.trim()),
    apps: apps.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).app),
    samples: samples.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).url),
  };
}

module.exports = { init, insert, stats, attackEvidence, enabled };
