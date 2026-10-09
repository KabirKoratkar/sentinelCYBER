#!/bin/zsh
set -e
cd "$(dirname "$0")"
export PATH="$HOME/Library/Python/3.9/bin:$HOME/.npm-global/bin:$PATH"

echo "### 0. reset: vulnerable guard + clean main + empty ClickHouse"
node -e 'require("fs").writeFileSync("library/src/guard.js","async function assertAllowed(){return;}\nmodule.exports={assertAllowed};\n")'
git checkout -q main 2>/dev/null || true
source ./.env 2>/dev/null
curl -s --max-time 15 "$CLICKHOUSE_URL/?query=DROP%20TABLE%20IF%20EXISTS%20events" -H "X-ClickHouse-User: $CLICKHOUSE_USER" -H "X-ClickHouse-Key: $CLICKHOUSE_PASSWORD" >/dev/null && echo "  cleared events"

echo "### 1. start HQ + apps"
node hq/collector.js >/tmp/dr-hq.log 2>&1 &
HQ=$!
node apps/run-apps.js >/tmp/dr-apps.log 2>&1 &
AP=$!
sleep 2
head -1 /tmp/dr-hq.log

echo "### 2. attack (ROUNDS=10)"
ROUNDS=10 node attack/attack.js 2>/dev/null | tail -1

echo "### 3. BEFORE (ClickHouse stats)"
curl -s http://localhost:9000/api/stats; echo

echo "### 4. AGENT: detect -> Akash fix -> self-verify -> Semgrep -> PR -> deploy -> verify"
node hq/agent.js 2>&1 | grep -vE "Deprecation|trace-deprec|^\(Use"

echo "### 5. AFTER live re-probe (expect 403 on all, 200 benign)"
for p in 7001 7002 7003; do
  curl -s -o /dev/null -w "  app $p SSRF -> %{http_code}\n" "http://localhost:$p/preview?url=http://127.0.0.1:8169/latest/meta-data/"
done
curl -s -o /dev/null -w "  benign example.com -> %{http_code}\n" "http://localhost:7001/preview?url=http://example.com/"

echo "### 6. ClickHouse final tallies"
curl -s --max-time 15 "$CLICKHOUSE_URL/?query=SELECT%20outcome,count()%20FROM%20events%20GROUP%20BY%20outcome%20FORMAT%20TSV" -H "X-ClickHouse-User: $CLICKHOUSE_USER" -H "X-ClickHouse-Key: $CLICKHOUSE_PASSWORD"

kill $HQ $AP 2>/dev/null || true
pkill -f "apps/app.js" 2>/dev/null || true
pkill -f "internal-service.js" 2>/dev/null || true
git checkout -q main 2>/dev/null || true
node -e 'require("fs").writeFileSync("library/src/guard.js","async function assertAllowed(){return;}\nmodule.exports={assertAllowed};\n")'
echo "### DONE (guard reset to vulnerable, servers stopped)"
