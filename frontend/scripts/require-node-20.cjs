function assertSupportedNodeVersion(version) {
  const major = Number.parseInt(version.replace(/^v/, "").split(".", 1)[0], 10);
  if (major !== 20) {
    throw new Error(`DEXCOWIN MES frontend verification requires Node.js 20 (current: ${version}).`);
  }
}

module.exports = { assertSupportedNodeVersion };
