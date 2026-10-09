// Run: node hq/netcheck.test.js  — fails loud if labeling logic breaks.
const assert = require("assert");
const { isInternalHost } = require("./netcheck");

for (const h of ["127.0.0.1", "localhost", "169.254.169.254", "10.0.0.5", "192.168.1.9", "172.16.0.1", "::1", "svc.internal"])
  assert.equal(isInternalHost(h), true, `${h} should be internal`);
for (const h of ["example.com", "8.8.8.8", "172.32.0.1", "1.2.3.4"])
  assert.equal(isInternalHost(h), false, `${h} should be public`);

console.log("netcheck OK");
