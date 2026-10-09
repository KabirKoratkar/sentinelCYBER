# Sentinel

Scouts inside every app that uses a library report real-world usage and
attacks back to HQ. An autonomous agent studies the aggregated signal and
hardens the **library itself**, so one fix protects every app at once.

```
attack script
   -> 3 apps (each uses linkpreview) + scout
        -> HQ collector -> ClickHouse
             -> HQ agent  (detects pattern, writes fix to guard.js,
                           Semgrep-scans it, opens PR, re-verifies)
```

## The money moment
Run the same attacks before and after the agent patches `library/src/guard.js`.
Before: all 3 apps leak. After: all 3 blocked — none of the apps changed a line.

## Run
```bash
npm install            # in sentinel/ (installs nothing external by default)
node hq/collector.js   # HQ + dashboard on :9000
node apps/run-apps.js  # 3 apps on :7001 :7002 :7003
node attack/attack.js  # blast SSRF payloads at all 3
node hq/agent.js       # autonomous: detect -> patch -> scan -> PR -> verify
```

## Env (fill after sign-ups)
Copy `.env.example` to `.env`. Everything degrades gracefully: with no
ClickHouse it keeps events in memory; with no Akash key the agent uses a
built-in deterministic fix so the demo never hard-fails.
