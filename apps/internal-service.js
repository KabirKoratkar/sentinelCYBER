// The thing SSRF is NOT supposed to reach: a fake cloud metadata / internal
// admin service bound to localhost. If linkpreview fetches this, creds leak.
const http = require("http");
const PORT = Number(process.env.INTERNAL_PORT || 8169);

const SECRET = {
  "AccessKeyId": "AKIA_DEMO_DO_NOT_SHIP",
  "SecretAccessKey": "s3cr3t/library-ssrf-demo/EXAMPLE",
  "Token": "FAKE_SESSION_TOKEN_for_demo_only",
};

http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        warning: "INTERNAL ONLY — reachable means SSRF succeeded",
        path: req.url,
        credentials: SECRET,
      })
    );
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`[internal-metadata] secrets on 127.0.0.1:${PORT}`)
  );
