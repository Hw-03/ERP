import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import test from 'node:test';

const require = createRequire(import.meta.url);
const config = require('../next.config.js');
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } = require('next/constants');

test('LAN development resources allow exact local IPv4 addresses without wildcards', () => {
  const interfaces = os.networkInterfaces;
  os.networkInterfaces = () => ({
    ethernet: [{ family: 'IPv4', address: '192.168.0.63', internal: false }],
    loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  });
  try {
    assert.deepEqual(config(PHASE_DEVELOPMENT_SERVER).allowedDevOrigins, ['192.168.0.63', '127.0.0.1']);
    assert.equal(config(PHASE_PRODUCTION_BUILD).allowedDevOrigins, undefined);
  } finally {
    os.networkInterfaces = interfaces;
  }
});
