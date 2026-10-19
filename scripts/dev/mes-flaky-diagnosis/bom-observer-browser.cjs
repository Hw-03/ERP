"use strict";

// Tool fidelity only: in-memory controlled React inputs, no MES server or database.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const [frontendArg, outputArg] = process.argv.slice(2);
const frontend = fs.realpathSync(frontendArg);
const output = path.resolve(outputArg);
if (fs.existsSync(output)) throw Error("refusing to replace a prior observer receipt");
const esbuild = require(path.join(frontend, "node_modules/esbuild"));
const { chromium } = require(path.join(frontend, "node_modules/playwright"));
const observer = fs.readFileSync(path.join(__dirname, "bom/bom-diag-native.js"), "utf8");
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
const observations = [];
function App() {
  const [quantity, setQuantity] = React.useState('1');
  const [note, setNote] = React.useState('');
  return React.createElement(React.Fragment, null,
    React.createElement('input', {type:'number', 'data-testid':'shipping-bom-line-controls', value:quantity,
      onChange:e=>{observations.push({field:'quantity',value:e.target.value});setQuantity(e.target.value);}}),
    React.createElement('textarea', {'aria-label':'요청 메모',value:note,
      onChange:e=>{observations.push({field:'note',length:e.target.value.length});setNote(e.target.value);}}),
    React.createElement('button',{onClick:()=>{setQuantity('1');setNote('');}},'Reset'));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
window.probe = {version:React.version, observations};
`;
let browser;
const rows = [];
(async () => {
  const built = await esbuild.build({ stdin: { contents: entry, resolveDir: frontend, loader: "js" },
    write: false, bundle: true, platform: "browser", format: "iife",
    alias: { react: path.join(frontend, "node_modules/next/dist/compiled/react"),
      "react-dom": path.join(frontend, "node_modules/next/dist/compiled/react-dom") },
    define: { "process.env.NODE_ENV": '"development"' } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.MES_OBSERVER_CHROMIUM ? { executablePath: process.env.MES_OBSERVER_CHROMIUM } : {}) });
  for (const enabled of [false, true]) {
    const page = await browser.newPage();
    await page.addInitScript({ content: `window.__MES_BOM_DIAG_ENABLED__=${enabled};window.__MES_BOM_VALUE_TRAP__=${enabled};\n${observer}` });
    await page.goto("data:text/html,<div id='root'></div>");
    await page.addScriptTag({ content: built.outputFiles[0].text + "\n//# sourceURL=http://localhost:3100/_next/static/chunks/observer-probe.js" });
    const input = page.getByTestId("shipping-bom-line-controls");
    await input.fill("2");
    assert.equal(await input.inputValue(), "2");
    await input.fill("3");
    assert.equal(await input.inputValue(), "3");
    await page.getByLabel("요청 메모").fill("SYNTHETIC-NOTE-SENTINEL");
    const before = await page.evaluate(() => ({ ...window.probe,
      ring: window.__mesBomDiag?.export() ?? null }));
    assert.deepEqual(before.observations, [{ field: "quantity", value: "2" }, { field: "quantity", value: "3" },
      { field: "note", length: "SYNTHETIC-NOTE-SENTINEL".length }]);
    await page.getByRole("button", { name: "Reset" }).click();
    const after = await page.evaluate(() => window.__mesBomDiag?.export() ?? null);
    assert.equal(await input.inputValue(), "1");
    assert.equal(await page.getByLabel("요청 메모").inputValue(), "");
    if (enabled) {
      assert.equal(before.ring.writerTrap.installed, true);
      assert.equal(before.ring.writerTrap.errors, 0);
      assert.equal(before.ring.incidents.length, 0);
      assert.equal(after.incidents.length, 2); // Intentional reset, not a product failure.
      assert.ok(after.incidents.every((incident) => incident.trigger.stack.frames.length > 0));
      assert.ok(!JSON.stringify(after).includes("SYNTHETIC-NOTE-SENTINEL"));
    }
    rows.push({ enabled, version: before.version, observations: before.observations, before: before.ring, after });
    await page.close();
  }
})().catch((error) => { rows.push({ failure: error.stack }); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ purpose: "observer contracts, not original MES failure reproduction",
    sha256: crypto.createHash("sha256").update(observer).digest("hex"), rows }, null, 2));
  console.log(JSON.stringify(rows.map((row) => ({ enabled: row.enabled, version: row.version, failure: row.failure }))));
});
