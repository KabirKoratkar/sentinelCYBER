# Semgrep finding — SSRF bypass in AI-generated code

**Prize:** Best Vulnerability Detected by Semgrep (vuln in AI-generated code)
**Tool:** Semgrep CLI 1.136.0 + a custom rule
**Finder:** KabirKoratkar / deployment `kabirvideo-personal-org`

## Summary
We asked an AI model (Llama-3.3-70B-Instruct, via AkashML) to write an SSRF
guard for our `linkpreview` library. It produced a guard that defends with an
**exact-string IP denylist** — `hostname === '127.0.0.1'`,
`hostname === '169.254.169.254'`. That is bypassable, and we have a **working
exploit** that leaks internal cloud-metadata–style credentials through it.

## The vulnerability (CWE-918)
`ai-generated/guard.vulnerable.js`:
```js
if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') { throw ... }
if (parsedUrl.hostname === '169.254.169.254') { throw ... }
// private-range check only runs when the host splits into exactly 4 octets:
const hostnameParts = parsedUrl.hostname.split('.');
if (hostnameParts.length === 4) { /* ...RFC1918 check... */ }
```
Two compounding bugs:
1. **Exact-string denylist** misses every other loopback/link-local address.
2. The RFC1918 check only runs for 4-octet hosts, so **short-form loopback
   `127.1`** (2 octets) skips it entirely.

## Working proof-of-concept (real leak)
`http://127.1:8169/` — `127.1` is a valid shorthand the OS expands to
`127.0.0.1`. The guard allows it; the fetch reaches our internal service:
```
assertAllowed("http://127.1:8169/latest/meta-data/...") -> no throw (ALLOWED)
fetch(...) -> {"warning":"INTERNAL ONLY — reachable means SSRF succeeded",
               "credentials":{"AccessKeyId":"AK...","SecretAccessKey":"..."}}
```
Reproduce: `node hq/hunt-bypass.js` (generates guards, finds an exploitable one,
leaks the secret through it).

Other representations that defeat exact-string denylists: `127.0.0.2`,
`0.0.0.0`, `2130706433` (decimal), `0x7f000001` (hex), `[::ffff:127.0.0.1]`.

## How Semgrep detected it
Custom rule `.semgrep/ssrf-denylist-bypass.yaml` (id
`ssrf-incomplete-ip-denylist`) flags SSRF guards that compare a host with `===`
against a single loopback/link-local literal:
```
$ semgrep scan --config .semgrep/ssrf-denylist-bypass.yaml ai-generated/guard.vulnerable.js
  ❯❯❱ ssrf-incomplete-ip-denylist
     19┆ if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
     24┆ if (parsedUrl.hostname === '169.254.169.254') {
  2 Code Findings
```
The rule is **clean** on our hardened guard (which matches `/^127\./` and
`/^169\.254\./` ranges after normalizing), so it distinguishes the bypassable
pattern from the correct one — no false positive on the fix.

## The fix
Match the whole range (or use an allowlist), and normalize the host first:
`/^127\./`, `/^169\.254\./`, RFC1918 ranges, IPv6 `::1`/`fc00::/7`/`fe80::/10`,
and resolve DNS then re-check. See `library/src/guard.js` after the agent patch.
