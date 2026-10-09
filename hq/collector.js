// HQ collector: receives scout reports, labels attacks, stores to ClickHouse,
// serves the live dashboard + a tiny API the agent reads.
const http = require("http");
const fs = require("fs");
const path = require("path");
const ch = require("./clickhouse");
const { isInternalHost } = require("./netcheck");

const PORT = Number(process.env.COLLECTOR_PORT || 9000);
const recent = []; // last N events for the live feed

function body(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "POST" && u.pathname === "/events") {
    try {
      const e = JSON.parse(await body(req));
      e.internal = isInternalHost(e.host);
      await ch.insert(e);
      recent.push(e);
      if (recent.length > 200) recent.shift();
    } catch {}
    res.writeHead(204);
    return res.end();
  }

  if (u.pathname === "/api/stats") {
    const s = await ch.stats();
    return json(res, { backend: ch.enabled ? "clickhouse" : "memory", apps: s });
  }
  if (u.pathname === "/api/evidence") return json(res, await ch.attackEvidence());
  if (u.pathname === "/api/recent") return json(res, recent.slice(-40).reverse());

  // dashboard
  const html = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"));
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
});

function json(res, obj) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

(async () => {
  await ch.init();
  server.listen(PORT, () =>
    console.log(`HQ collector + dashboard on http://localhost:${PORT}  (store: ${ch.enabled ? "ClickHouse" : "memory"})`)
  );
})();
