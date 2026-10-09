# Sentinel

**Fleet telemetry hardens a shared library for every app at once.**

When an open-source library has a vulnerability, the maintainer is blind: they
can't see how it's used in the wild, or that it's under attack, until it's a
headline (think Log4Shell). Sentinel closes that loop. Scouts inside every app
report real usage and attacks back to HQ; an autonomous agent studies the
aggregated signal, writes a hardened fix for the **library itself**, verifies
it, opens a pull request, and hot-deploys — so one fix protects the whole fleet.

```
attack -> 3 apps (share one linkpreview library) + scouts
       -> HQ collector -> ClickHouse (live attack signal)
       -> HQ agent: write fix (Akash) -> self-verify -> PR (GitHub) -> deploy
       -> re-attack: all blocked. No app changed a line of its own code.
```

## The money moment
The 3 apps leak internal credentials via SSRF. The agent hardens the library
once. The same attacks, re-run, are all blocked — **no app changed a line**.

## Try it (web console)
```bash
GITHUB_TOKEN=$(gh auth token) GH_REPO=KabirKoratkar/sentinel \
  PORT=8080 node web/server.js      # open http://localhost:8080
```
Click **Run attack** (board goes red) -> **Harden the library** (agent pipeline
runs, board goes green). One process, no dependencies. See `DEMO_SCRIPT.md` for
the walkthrough and `DEPLOY.md` to host it (Akash SDL included).

## Sponsors used
- **ClickHouse** — the live, high-volume attack signal every scout reports into.
- **Akash** — the fix is generated on an open model (Llama-3.3-70B) via AkashML;
  the demo also deploys on Akash Network (`deploy.yaml`).
- **Guild** — the hardening agent is hosted and runs on Guild (`GUILD.md`).
- **Semgrep** — caught a real SSRF bypass in AI-generated code (`SEMGREP_FINDING.md`).

## Proof of integration

**AkashML** — real inference calls generating the fix:

![Akash inference usage](docs/proof-akash.webp)

**GitHub** — real pull requests the agent opened, each from live attack evidence:

![Agent-opened pull requests](docs/proof-github.webp)

## The guarantee that matters
The agent **self-verifies** every fix in a sandbox before shipping it: it proves
the new guard blocks the attacks and still allows legitimate URLs. If the model
returns a bad patch (we've seen it hallucinate a dependency and miss a
`127.1` loopback bypass), the agent rejects it and falls back to a verified
template. It never ships a fix it hasn't tested. A human still merges the PR.

## CLI version (the original multi-process loop)
```bash
node hq/collector.js   # HQ + dashboard on :9000
node apps/run-apps.js  # 3 apps on :7001 :7002 :7003
node attack/attack.js  # blast SSRF payloads
node hq/agent.js       # detect -> patch -> Semgrep -> PR -> verify
```

## Env
Copy `.env.example` to `.env`. Degrades gracefully: no ClickHouse -> in-memory;
no Akash key -> verified deterministic fix.
