/**
 * Module to prevent Server-Side Request Forgery (SSRF) attacks.
 * @module guard
 */

const url = require('url');

/**
 * Checks if a URL is allowed to be accessed.
 * Throws an error if the URL is a loopback, link-local, or private host.
 * @async
 * @param {string} url - The URL to check.
 * @throws {Error} If the URL is not allowed.
 */
async function assertAllowed(urlString) {
  const parsedUrl = url.parse(urlString);

  // Check for loopback addresses
  if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
    throw new Error(`Loopback address detected: ${urlString}`);
  }

  // Check for link-local addresses
  if (parsedUrl.hostname === '169.254.169.254') {
    throw new Error(`Link-local address detected: ${urlString}`);
  }

  // Check for private addresses
  const privateAddresses = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
  ];

  for (const privateAddress of privateAddresses) {
    const ipRange = privateAddress.split('/');
    const ip = ipRange[0].split('.');
    const bits = parseInt(ipRange[1]);

    const hostnameParts = parsedUrl.hostname.split('.');

    if (hostnameParts.length === 4) {
      let isPrivate = true;

      for (let i = 0; i < 4; i++) {
        if (i < (4 - (32 - bits) / 8)) {
          if (hostnameParts[i] !== ip[i]) {
            isPrivate = false;
            break;
          }
        } else {
          const shift = (32 - bits) % 8;
          const mask = (0xFF << (8 - shift)) & 0xFF;

          const hostPart = parseInt(hostnameParts[i]);
          const ipPart = parseInt(ip[i]);

          if ((hostPart & mask) !== (ipPart & mask)) {
            isPrivate = false;
            break;
          }
        }
      }

      if (isPrivate) {
        throw new Error(`Private address detected: ${urlString}`);
      }
    }
  }
}

module.exports = { assertAllowed };
