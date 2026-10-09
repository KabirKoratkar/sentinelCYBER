// A single demo app. Three of these run (different APP_NAME/PORT), each using
// the SAME linkpreview library in its own way. They never touch guard.js.
const http = require("http");
const { linkpreview, SSRFBlocked } = require("../library/src/index");

const APP = process.env.APP_NAME || "app";
const PORT = Number(process.env.PORT || 7001);
// Cosmetic: how this particular app frames its use of the shared library.
const ROLE = process.env.APP_ROLE || "link unfurler";

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== "/preview") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ app: APP, role: ROLE, use: "/preview?url=" }));
  }
  const target = u.searchParams.get("url") || "";
  try {
    const result = await linkpreview(target);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ app: APP, ok: true, ...result }));
  } catch (e) {
    const blocked = e instanceof SSRFBlocked;
    res.writeHead(blocked ? 403 : 502, { "content-type": "application/json" });
    res.end(JSON.stringify({ app: APP, ok: false, blocked, error: e.message }));
  }
});

server.listen(PORT, () => console.log(`[${APP}] ${ROLE} on :${PORT}`));
