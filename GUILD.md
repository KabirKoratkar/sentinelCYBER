# Guild integration — the HQ hardening brain runs on Guild

The decision-making agent at Sentinel HQ is **hosted and run on Guild.ai**, not
on our own box. It is an `@guildai/agents-sdk` LLM agent whose job is: take the
aggregated SSRF attack evidence from the fleet's scouts and return a hardened
`guard.js` the library ships to every dependent.

- Agent: `@guildai/kabirkoratkar~sentinel-hardener` (GUILD_TYPESCRIPT, LLM)
- Workspace: `sentinel-hq`
- Status: PUBLISHED (in the Guild catalog)
- Source: `../sentinel-hardener/agent.ts`

## Role in the loop
```
scouts -> HQ collector -> ClickHouse -> evidence JSON
   -> Guild-hosted sentinel-hardener agent  (THE BRAIN, on Guild runtime)
       -> returns hardened guard.js
   -> HQ self-verifies -> Semgrep -> PR -> hot-deploy -> re-verify
```
It runs where the Akash call sat in `hq/agent.js`; both are interchangeable
"patch sources." The key difference from a naive one-shot: the hosted agent's
system prompt forces **range-based** blocking, so its output passes verification
including the `127.1` short-form-loopback bypass that defeated the exact-match
attempt (see SEMGREP_FINDING.md).

## Run it (reproduce)
```bash
export PATH="$HOME/.npm-global/bin:$PATH"
cd ../sentinel-hardener
echo '{"prompt":"{\"leakCount\":48,\"apps\":[\"chatly\",\"feedbot\",\"snapshot\"],\"samples\":[\"http://127.0.0.1:8169/\",\"http://169.254.169.254/\"]}"}' \
  | guild agent test --mode jsonl --events all
```
The assistant message (`agent_notification_message.content.data`) is the
hardened `guard.js`. The copy it produced for the demo is saved at
`ai-generated/guard.guild.js` and self-verifies clean (blocks all SSRF incl
`127.1`, allows `example.com`).

## Faster path for production
Publish + a Guild **trigger** (webhook/schedule) so the collector POSTs evidence
and gets the patch back without an ephemeral rebuild. See
https://docs.guild.ai/platform/triggers.
