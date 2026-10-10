<div align="center">

# 🛡️ sentinelCYBER

### One app surfaces the issue. Every app gets the fix.

When a library has a vulnerability, its maintainer is blind — they can't see how it's used in the wild, or that it's under attack, until it's a headline. **sentinelCYBER closes that loop:** the moment a *single* app that uses the library shows a potential issue, the fix is written into the library itself — protecting every other app that depends on it, including the ones never touched.

<br/>

![ClickHouse](https://img.shields.io/badge/ClickHouse-live%20signal-FFCC01?style=for-the-badge&logo=clickhouse&logoColor=black)
![Akash](https://img.shields.io/badge/Akash-fix%20on%20open%20model-FF414C?style=for-the-badge&logo=akamai&logoColor=white)
![Guild](https://img.shields.io/badge/Guild-hosted%20agent-6E56CF?style=for-the-badge)
![Semgrep](https://img.shields.io/badge/Semgrep-SSRF%20finding-1B87E0?style=for-the-badge&logo=semgrep&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-real%20PRs-181717?style=for-the-badge&logo=github&logoColor=white)

<br/>

<img src="docs/sentinelcyber.gif" alt="sentinelCYBER — one fix protects every app at once" width="900"/>

</div>

<br/>

## The idea

Many apps depend on the same `linkpreview` library. A **scout** inside each app reports every call and attack back to HQ. **The moment one app's traffic surfaces a potential issue** — an attack, a misuse, a dangerous input — an **autonomous agent** reads that signal, writes a hardened fix for the **library itself**, verifies it in a sandbox, opens a pull request, and hot-deploys it.

Because the fix lands in the shared library, **every dependent is protected at once** — not just the app that was attacked, but every other app that could have been hit by the same flaw. One app's signal becomes everyone's patch.

```
one app is attacked ──▶ its scout reports ──▶ ClickHouse      (live signal)
       ──▶ HQ agent: write fix (Akash) ──▶ self-verify ──▶ PR (GitHub) ──▶ deploy
       ──▶ the library is hardened ──▶ EVERY dependent is protected,
           including the apps that were never touched.
```

<br/>

## Watch it work

<table>
<tr>
<td width="50%" align="center"><b>1. Attack — the fleet leaks</b></td>
<td width="50%" align="center"><b>2. Harden — one fix, all protected</b></td>
</tr>
<tr>
<td><img src="docs/console-attack.png" alt="SSRF leaking across the fleet"/></td>
<td><img src="docs/console-hardened.png" alt="Hardened — all attacks blocked"/></td>
</tr>
<tr>
<td align="center"><sub>SSRF payloads exfiltrate internal credentials through the shared library. The board goes red.</sub></td>
<td align="center"><sub>The agent hardens the library once. The same attacks are now all blocked — <b>green</b>.</sub></td>
</tr>
</table>

> **The money moment:** none of the three apps changed a single line of their own code. One fix, at the library, protected the whole fleet.

<br/>

## The autonomous agent

Every harden runs a real pipeline, shown live in the console:

| Step | What happens |
|------|--------------|
| **Read the attack signal** | Pulls aggregated SSRF evidence from ClickHouse |
| **Write a hardened guard** | Generates the fix on an open model (Llama-3.3-70B) via **Akash** |
| **Self-verify** | Sandboxes the fix, proves it blocks the attacks *and* allows legit URLs |
| **Open a pull request** | A **real PR** on GitHub, citing the evidence |
| **Hot-deploy** | `guard.js` hot-reloads in all 3 apps — no restart |
| **Re-attack** | Confirms every attack is now blocked |

**It never ships a fix it hasn't tested.** In testing the model hallucinated a dependency and missed a `127.1` loopback bypass — the self-verify gate caught both and fell back to a verified template. A human still merges the PR.

<br/>

## Proof it's real

<table>
<tr>
<td align="center"><b>AkashML — the fix generator</b></td>
</tr>
<tr>
<td><img src="docs/proof-akash.webp" alt="Real Llama-3.3-70B inference calls on Akash"/></td>
</tr>
<tr>
<td align="center"><sub>Real Llama-3.3-70B inference calls generating the hardened guard — succeeded, with cost and tokens.</sub></td>
</tr>
</table>

<table>
<tr>
<td align="center"><b>GitHub — real pull requests the agent opened</b></td>
</tr>
<tr>
<td><img src="docs/proof-github.webp" alt="Agent-opened pull requests on GitHub"/></td>
</tr>
<tr>
<td align="center"><sub>Each PR was opened autonomously from live attack evidence, passing CI.</sub></td>
</tr>
</table>

<br/>

## Run it

```bash
GITHUB_TOKEN=$(gh auth token) GH_REPO=KabirKoratkar/sentinelCYBER \
  PORT=8080 node web/server.js      # open http://localhost:8080
```

Click **Run attack** → board red → **Harden the library** → agent pipeline runs → board green. One process, zero dependencies. See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) for the walkthrough and [`DEPLOY.md`](DEPLOY.md) to host it (Akash SDL included).

<br/>

## Sponsors

| | Role in sentinelCYBER |
|---|---|
| **ClickHouse** | The live, high-volume attack signal every scout reports into |
| **Akash** | Generates the fix on an open model via AkashML; deploys on Akash Network ([`deploy.yaml`](deploy.yaml)) |
| **Guild** | The hardening agent is hosted and runs on Guild ([`GUILD.md`](GUILD.md)) |
| **Semgrep** | Caught a real SSRF bypass in AI-generated code ([`SEMGREP_FINDING.md`](SEMGREP_FINDING.md)) |

<br/>

## Where it goes

Today it's 3 apps in a demo. In the real world it's the thousands of apps that depend on one library — and that live risk signal is something a cyber-insurer could price. sentinelCYBER turns a library's blind spot into a feedback loop.

<div align="center"><sub>ClickHouse for the signal · an agent for the fix · a real pull request for the record.</sub></div>
