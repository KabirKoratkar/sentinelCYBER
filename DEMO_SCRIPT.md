# Sentinel — demo script (~3 min)

A spoken script for the live demo / recorded video. Stage directions in
*(italics)*. Have the site open and freshly **Reset** before you start.

Live site: the trycloudflare URL (keep the tunnel terminal open).
Repo: https://github.com/KabirKoratkar/sentinel

---

## 0:00 — Hook (15s)
> "When a popular open-source library has a vulnerability, the maintainer is
> flying blind. They can't see how their code is used in the wild, or that it's
> being attacked, until it's already a headline. Think Log4Shell. Sentinel fixes
> that blind spot."

## 0:15 — The setup (20s)
*(Point at the Fleet panel — three apps.)*
> "Three different apps — a chat unfurler, a webhook fetcher, an admin image
> proxy — all depend on the same link-preview library. Each one has a scout
> inside it that reports every call back to HQ. Right now the library has an
> SSRF hole."

## 0:35 — Attack (30s)
*(Click **Run attack**.)*
> "I'll play the attacker. These are server-side request forgery payloads —
> I'm tricking the apps into fetching internal addresses they should never
> touch, like the cloud metadata endpoint that holds credentials."

*(Board turns red. Point at it.)*
> "Every scout reports in. The board goes red — ninety internal secrets just
> got exfiltrated across all three apps, through that one shared library. All of
> this is landing in ClickHouse live — that's our real-time signal."

## 1:05 — Harden (45s)
*(Click **Harden the library**. Point at the HQ agent panel as steps tick.)*
> "Now HQ. An autonomous agent reads the attack signal from ClickHouse, and
> writes a hardened version of the library — the fix generator runs on an open
> model through Akash."

*(Point at the self-verify step.)*
> "Here's the part I care about most: before it ships anything, the agent
> **self-verifies** the fix in a sandbox — it proves the new code actually
> blocks the attacks and still allows legitimate URLs. If the model hands back a
> bad patch, the agent rejects it. It never ships a fix it hasn't tested."

*(Point at the PR step with the link.)*
> "Then it opens a real pull request on GitHub, citing the evidence, and
> hot-deploys the fix to the library."

## 1:50 — The payoff (25s)
*(Board flips green.)*
> "Same attacks, re-run automatically. All blocked. The board is green."

*(Beat. Say this slowly.)*
> "And notice — none of the three apps changed a single line of their own code.
> One fix, at the library, protected the entire fleet at once. That's the whole
> idea: fix once, protect everyone."

## 2:15 — Sponsors + what's real (25s)
> "Everything here is real, not mocked. ClickHouse is the live attack signal.
> The fix is generated on Akash. The hardening agent is hosted and runs on
> Guild. The pull request is real, on GitHub. And we used Semgrep to catch a
> genuine SSRF bypass in AI-generated code — a short-form-loopback trick the
> model reached for — which is exactly the kind of bug the self-verify step
> stops from shipping."

## 2:40 — Close (20s)
> "Today it's three apps in a demo. In the real world it's the thousands of
> apps that depend on one library, and that live risk signal is something a
> cyber-insurer could price. Sentinel turns a library's blind spot into a
> feedback loop. Thanks."

---

## If asked in Q&A
- **"Isn't attacking apps illegal?"** Every target is a service we run on the
  same box. Nothing external is touched.
- **"What stops a bad AI fix?"** The self-verify gate — we demoed it catching a
  hallucinated dependency and a logic bypass in testing. Bad patch → fall back
  to the verified template. A human still merges the PR.
- **"DNS rebinding?"** Known ceiling, noted in the guard. Out of scope for a day.
- **"Why one fix for all apps?"** They share the dependency. Hardening upstream
  is the single highest-leverage place to fix SSRF.

## Backup
Record a clean screen-capture of this exact run as a fallback in case the live
demo or wifi fails. Keep it under 3 minutes.
