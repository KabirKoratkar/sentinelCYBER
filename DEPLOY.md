# Deploy the testable site on Akash

Cascade uses Akash **twice** — AkashML for inference (the fix generator) and
Akash Network for hosting this container. That's a strong "best use of Akash".

The site is one process (`web/server.js`), pure Node built-ins, **no build and
no image push**: a stock `node:22` image clones the public repo at startup.

## Easiest path — Akash Console (no CLI)
1. Open **https://console.akash.network** and connect a wallet funded with AKT
   (use your sponsor credits). The console has a trial option if you have no
   wallet yet.
2. **Create Deployment → Upload SDL**, and paste `deploy.yaml` from this repo.
3. In the env editor, fill the three secrets (so they never touch git):
   - `CLICKHOUSE_PASSWORD`
   - `AKASH_API_KEY`  (your AkashML key)
   - `GITHUB_TOKEN`   (a token with `repo` scope — powers the real PR button)
4. **Create** → accept a provider **bid** → open the **lease**.
5. The lease shows a URI like `http://<hash>.provider.akash.network` — that's
   your public, testable site. Open it and click **Attack → Harden → Reset**.

## What visitors do
- **⚔ Attack the apps** — fires SSRF payloads at all 3 apps; board goes red,
  internal creds leak (ClickHouse fills live).
- **🛠 Harden the library** — the agent writes a verified `guard.js`, opens a
  **real PR**, hot-deploys; a re-test shows all attacks blocked (board green).
  `?ai=1` uses the AkashML model for the fix; default is the verified template.
- **↺ Reset** — back to vulnerable for the next visitor.

## Guardrails already in place
- **PR cooldown:** one real PR per minute (visitors can't spam the repo).
- **Self-verify:** a generated fix is tested before it ships; bad output falls
  back to the verified template.
- **Secrets** come only from env (the cloned repo has no `.env`). Rotate the
  GitHub token and ClickHouse password after the event.

## Local / other hosts
```bash
GITHUB_TOKEN=$(gh auth token) GH_REPO=KabirKoratkar/cascade \
  PORT=8080 node web/server.js         # then open http://localhost:8080
```
Any container host works too: `docker build -t cascade . && docker run -p 8080:8080 --env-file .env cascade`.
