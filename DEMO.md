# Cascade — demo runbook

## 4 terminals
```bash
# 1) HQ + dashboard  (open http://localhost:9000)
node hq/collector.js

# 2) the 3 apps + the internal secret service
node apps/run-apps.js

# 3) attacker
node attack/attack.js

# 4) the autonomous agent
node hq/agent.js
```

## Demo order (matches the 3-min script)
1. Show the **dashboard** with the loop idea in one line.
2. Terminal 3: run the attack. Dashboard goes **red** — 48 leaks across 3 apps.
3. Terminal 4: start the agent. It **triggers itself**, prints evidence, opens the PR, hot-deploys.
4. Run the attack **again** (or the agent's own verify already did): dashboard goes **green** — all blocked. Say: *"none of the 3 apps changed a line."*
5. Benign `example.com` still returns 200 — the fix doesn't break real use.

Reset to vulnerable between takes: `node -e 'require("fs").writeFileSync("library/src/guard.js","async function assertAllowed(){return;}\nmodule.exports={assertAllowed};\n")'`

## Sponsor wiring (fill `.env`)
- **ClickHouse** — set `CLICKHOUSE_URL/USER/PASSWORD`. HQ then stores every event there and the dashboard/agent query it. Prize wants scale+latency: crank `ROUNDS` high.
- **Akash** — set `AKASH_BASE_URL/API_KEY/MODEL`. The agent writes the guard via that model; it still self-verifies before shipping, so a bad generation falls back safely.
- **Guild.ai** — host `hq/agent.js` as the running agent (read their docs for the deploy shape).
- **Semgrep** — `claude plugin install semgrep@claude-plugins-official`, or have `semgrep` on PATH; the agent scans the patched file before the PR. Side-quest: submit anything spicy it finds in AI-written code.
- **GitHub** — `git remote add origin …`, set `GH_REPO=owner/repo`; the agent opens a real PR. Use a repo you OWN.
- **Senso (optional)** — store the library's verified "legit usage" profile; have the agent check its fix against it.

## The 3 guiding questions, answered in the demo
- *Know before it writes?* → how the library is really used + attacked across every app (HQ telemetry).
- *Security boundaries affected?* → every dependent; that's why it re-verifies all 3 and keeps benign traffic working.
- *Left to guess?* → nothing on the fix (evidence-grounded + self-verified); the human merges the PR.
