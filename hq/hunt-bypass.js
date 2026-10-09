// Generate several AI guards and find one with a REAL, demonstrable SSRF bypass:
// assertAllowed(url) does NOT throw AND fetch(url) actually returns the internal
// secret. Saves the first exploitable one to ai-generated/guard.vulnerable.js.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
process.loadEnvFile(path.join(__dirname, "..", ".env"));
const { AKASH_BASE_URL, AKASH_API_KEY, AKASH_MODEL } = process.env;

const INTERNAL = "http://127.0.0.1:8169/latest/meta-data/iam/security-credentials/";
// candidate bypass URLs that still reach 127.0.0.1:8169
const BYPASS = [
  INTERNAL,                                   // bare loopback (some guards miss it)
  "http://127.0.0.1:8169/#.example.com",      // fragment trick
  "http://127.1:8169/latest/meta-data/",      // short-form loopback
];

async function gen(i) {
  const r = await fetch(`${AKASH_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AKASH_API_KEY}` },
    body: JSON.stringify({
      model: AKASH_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: "You harden a Node.js library. Output ONLY the full contents of guard.js, no fences. Export async assertAllowed(url) that throws on SSRF to loopback/link-local/private hosts." },
        { role: "user", content: "Write guard.js to stop SSRF. Attack samples: http://127.0.0.1:8169/, http://169.254.169.254/." },
      ],
    }),
  });
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || "").replace(/^```[a-z]*\n?|```$/g, "").trim();
}

async function testGuard(code) {
  const tmp = path.join(__dirname, ".hunt.js");
  fs.writeFileSync(tmp, code);
  delete require.cache[require.resolve(tmp)];
  let g;
  try { g = require(tmp); } catch { return null; }
  for (const u of BYPASS) {
    try {
      await g.assertAllowed(u);               // guard says OK...
      const res = await fetch(u, { signal: AbortSignal.timeout(2000) });
      const body = await res.text();
      if (body.includes("credentials")) return { url: u, body: body.slice(0, 120) };
    } catch {}
  }
  return null;
}

(async () => {
  // start the internal service for real fetch proof
  const svc = spawn("node", [path.join(__dirname, "..", "apps", "internal-service.js")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 0; i < 5; i++) {
    const code = await gen(i);
    const hit = await testGuard(code);
    console.log(`gen ${i}: ${hit ? "EXPLOITABLE via " + hit.url : "safe"}`);
    if (hit) {
      fs.writeFileSync(path.join(__dirname, "..", "ai-generated", "guard.vulnerable.js"), code + "\n");
      console.log("  -> saved ai-generated/guard.vulnerable.js");
      console.log("  -> leaked:", hit.body);
      break;
    }
  }
  svc.kill();
  try { fs.unlinkSync(path.join(__dirname, ".hunt.js")); } catch {}
})();
