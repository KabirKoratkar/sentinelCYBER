// One-off: ask Akash to write guard.js and save it as an AI-generated artifact
// to scan with Semgrep (the "vuln in AI-generated code" prize target).
const fs = require("fs");
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env"));
const { AKASH_BASE_URL, AKASH_API_KEY, AKASH_MODEL } = process.env;

(async () => {
  const r = await fetch(`${AKASH_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AKASH_API_KEY}` },
    body: JSON.stringify({
      model: AKASH_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "You harden a Node.js library. Output ONLY the full contents of guard.js, no markdown fences. Export async assertAllowed(url) that throws on SSRF (loopback, link-local 169.254/metadata, RFC1918 private, localhost/.internal), checking IP literals and resolved DNS." },
        { role: "user", content: "Telemetry shows internal fetches across 3 apps. Sample attack URLs: http://127.0.0.1:8169/, http://169.254.169.254/latest/meta-data/, http://localhost:8169/admin. Write guard.js." },
      ],
    }),
  });
  const j = await r.json();
  const code = (j.choices?.[0]?.message?.content || "").replace(/^```[a-z]*\n?|```$/g, "").trim();
  const out = path.join(__dirname, "..", "ai-generated", "guard.akash.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code + "\n");
  console.log(`wrote ${out} (${code.length} chars), model=${AKASH_MODEL}`);
})();
