const dns = require('dns').promises;
const net = require('net');

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;
  const [a, b, c, d] = parts;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function parseIPv6(ip) {
  let address = ip.toLowerCase();
  if (address.startsWith('[') && address.endsWith(']')) {
    address = address.slice(1, -1);
  }
  
  if (address.startsWith('::ffff:')) {
    const ipv4Part = address.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return { isMapped: true, ipv4: ipv4Part };
    }
  }

  const parts = address.split(':');
  if (parts.length < 8) {
    const emptyIndex = parts.indexOf('');
    if (emptyIndex !== -1) {
      const missingCount = 8 - parts.filter(p => p !== '').length;
      const inserted = Array(missingCount).fill('0');
      parts.splice(emptyIndex, 1, ...inserted);
    }
  }
  const words = parts.map(p => p === '' ? 0 : parseInt(p, 16));
  if (words.length !== 8 || words.some(isNaN)) return null;
  return { isMapped: false, words };
}

function isPrivateIPv6(ip) {
  const parsed = parseIPv6(ip);
  if (!parsed) return true;
  if (parsed.isMapped) {
    return isPrivateIPv4(parsed.ipv4);
  }
  const { words } = parsed;
  if (words.every(w => w === 0)) return true; // ::
  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0 && words[6] === 0 && words[7] === 1) {
    return true; // ::1
  }
  if ((words[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((words[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  return false;
}

function isIpBlocked(ip) {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return true;
}

async function assertAllowed(url) {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.internal')) {
    throw new Error('Access to internal hosts is blocked');
  }

  if (net.isIP(hostname)) {
    if (isIpBlocked(hostname)) {
      throw new Error('Access to private IP addresses is blocked');
    }
    return;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isIpBlocked(address)) {
        throw new Error('Access to private IP addresses is blocked');
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('blocked')) {
      throw err;
    }
    throw new Error('DNS resolution failed');
  }
}

module.exports = { assertAllowed };
