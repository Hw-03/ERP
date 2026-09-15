const test = require('node:test');
const assert = require('node:assert/strict');
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } = require('next/constants');
const config = require('../next.config');
const { blockCrossSiteDEV } = require('next/dist/server/lib/router-utils/block-cross-site-dev');

test('development permits existing loopback and LAN addresses but blocks unrelated origins', () => {
  const allowed = config(PHASE_DEVELOPMENT_SERVER).allowedDevOrigins;
  for (const [origin, blocked] of [
    ['http://127.0.0.1:3001', false],
    ['http://192.168.0.63:3001', false],
    ['http://localhost:3001', false],
    ['https://untrusted.example', true],
  ]) {
    const response = { statusCode: 200, end() {} };
    const result = blockCrossSiteDEV(
      { url: '/_next/hmr', headers: { origin } }, response, allowed, '0.0.0.0',
    );
    assert.equal(Boolean(result), blocked, origin);
  }
});

test('production configuration does not add development origins', () => {
  assert.equal(config(PHASE_PRODUCTION_BUILD).allowedDevOrigins, undefined);
});
