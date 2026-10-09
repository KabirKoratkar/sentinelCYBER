// Spawn the demo world: the internal secret service + 3 apps, each a separate
// process so each reports under its own APP_NAME.
const { spawn } = require("child_process");
const path = require("path");

const APPS = [
  { APP_NAME: "chatly", PORT: "7001", APP_ROLE: "chat link unfurler" },
  { APP_NAME: "feedbot", PORT: "7002", APP_ROLE: "rss/webhook fetcher" },
  { APP_NAME: "snapshot", PORT: "7003", APP_ROLE: "admin image proxy" },
];

const kids = [];
function run(file, env) {
  const p = spawn("node", [path.join(__dirname, file)], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  kids.push(p);
}

run("internal-service.js", {});
for (const a of APPS) run("app.js", a);

process.on("SIGINT", () => {
  kids.forEach((k) => k.kill());
  process.exit(0);
});
