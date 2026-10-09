const dns = require('dns');
const url = require('url');

async function assertAllowed(urlString) {
  const parsedUrl = url.parse(urlString);
  const hostname = parsedUrl.hostname;

  // Check if hostname is a loopback address
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    throw new Error(`SSRF attempt: ${urlString}`);
  }

  // Check if hostname is a link-local address
  if (hostname === '169.254.169.254') {
    throw new Error(`SSRF attempt: ${urlString}`);
  }

  // Check if hostname is an RFC1918 private address
  if (isPrivateIp(hostname)) {
    throw new Error(`SSRF attempt: ${urlString}`);
  }

  // Check if hostname is a .internal domain
  if (hostname.endsWith('.internal')) {
    throw new Error(`SSRF attempt: ${urlString}`);
  }

  // Resolve DNS and check the IP address
  try {
    const ipAddresses = await dns.promises.resolve4(hostname);
    for (const ipAddress of ipAddresses) {
      if (isPrivateIp(ipAddress) || isLoopbackIp(ipAddress) || isLinkLocalIp(ipAddress)) {
        throw new Error(`SSRF attempt: ${urlString}`);
      }
    }
  } catch (error) {
    // If DNS resolution fails, assume it's not allowed
    throw new Error(`SSRF attempt: ${urlString}`);
  }
}

function isPrivateIp(ipAddress) {
  const ipParts = ipAddress.split('.');
  if (ipParts.length !== 4) {
    return false;
  }

  const ipPartsAsNumbers = ipParts.map(part => parseInt(part, 10));
  if (ipPartsAsNumbers.some(part => part < 0 || part > 255)) {
    return false;
  }

  // Check for RFC1918 private IP addresses
  if (ipPartsAsNumbers[0] === 10) {
    return true;
  }
  if (ipPartsAsNumbers[0] === 172 && ipPartsAsNumbers[1] >= 16 && ipPartsAsNumbers[1] <= 31) {
    return true;
  }
  if (ipPartsAsNumbers[0] === 192 && ipPartsAsNumbers[1] === 168) {
    return true;
  }

  return false;
}

function isLoopbackIp(ipAddress) {
  return ipAddress === '127.0.0.1' || ipAddress === '::1';
}

function isLinkLocalIp(ipAddress) {
  const ipParts = ipAddress.split('.');
  if (ipParts.length !== 4) {
    return false;
  }

  const ipPartsAsNumbers = ipParts.map(part => parseInt(part, 10));
  if (ipPartsAsNumbers.some(part => part < 0 || part > 255)) {
    return false;
  }

  // Check for link-local IP addresses
  return ipPartsAsNumbers[0] === 169 && ipPartsAsNumbers[1] === 254;
}

module.exports = { assertAllowed };
