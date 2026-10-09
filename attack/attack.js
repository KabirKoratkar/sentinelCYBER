// Attacker: blasts SSRF payloads (plus benign noise) at all 3 apps.
// Legal: every target is a service WE run on localhost for this demo.
const APPS = ["http://localhost:7001", "http://localhost:7002", "http://localhost:7003"];
const ROUNDS = Number(process.env.ROUNDS || 40);

const SSRF = [
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
  "http://127.0.0.1:8169/latest/meta-data/",
  "http://localhost:8169/admin",
  "http://10.0.0.5/internal",
];
const BENIGN = ["http://example.com/", "http://example.org/"];

async function hit(app, url) {
  try {
    const r = await fetch(`${app}/preview?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    return j.blocked ? "blocked" : j.ok ? "LEAKED" : "err";
  } catch {
    return "down";
  }
}

(async () => {
  let leaked = 0, blocked = 0;
  for (let i = 0; i < ROUNDS; i++) {
    for (const app of APPS) {
      for (const url of SSRF) {
        const o = await hit(app, url);
        if (o === "LEAKED") leaked++;
        if (o === "blocked") blocked++;
      }
      await hit(app, BENIGN[i % BENIGN.length]); // noise
    }
    if (i % 10 === 0) process.stdout.write(`round ${i}: leaked=${leaked} blocked=${blocked}\r`);
  }
  console.log(`\ndone. leaked=${leaked} blocked=${blocked} over ${ROUNDS} rounds x ${APPS.length} apps`);
})();
