"use strict";
// Text insertions selected by TypeScript AST preserve original expressions and fixture parameters.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function instrument(ts, text, filename, helper) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  let tests = 0;
  let boundaries = 0;
  function add(position, value) { edits.push({ position, value }); }
  function catching(block) {
    add(block.getStart(source) + 1, "\ntry {\n");
    add(block.end - 1, "\n} catch (__mesOriginalError) { try { await __mesPreserve(__mesOriginalError); } catch { console.error('diagnostic failure collection could not complete'); } throw __mesOriginalError; }\n");
  }
  function inside(node, protectedByCatch = false) {
    if (ts.isFunctionLike(node)) return; // Separate closures can handle their own errors.
    if (ts.isTryStatement(node)) {
      if (node.finallyBlock && !protectedByCatch) {
        if (node.catchClause) catching(node.catchClause.block);
        else add(node.tryBlock.end, " catch (__mesOriginalError) { try { await __mesPreserve(__mesOriginalError); } catch { console.error('diagnostic failure collection could not complete'); } throw __mesOriginalError; } ");
        add(node.finallyBlock.getStart(source) + 1, "\nif (__mesNeedsPreservation()) await __mesBeforeCleanup();\n");
        boundaries += 1;
      }
      inside(node.tryBlock, protectedByCatch || !!node.catchClause);
      if (node.catchClause) inside(node.catchClause.block, protectedByCatch);
      if (node.finallyBlock) inside(node.finallyBlock, protectedByCatch);
      return;
    }
    ts.forEachChild(node, child => inside(child, protectedByCatch));
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "test.afterEach") {
      const hook = node.arguments[node.arguments.length - 1];
      if (hook && (ts.isArrowFunction(hook) || ts.isFunctionExpression(hook)) && ts.isBlock(hook.body)) {
        if (!hook.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) add(hook.getStart(source), "async ");
        add(hook.body.getStart(source) + 1, "\nif (__mesNeedsPreservation()) await __mesBeforeCleanup();\n");
      }
    }
    if (ts.isCallExpression(node) && /^(test|test\.(only|skip|fixme|fail))$/.test(node.expression.getText(source))) {
      const fn = node.arguments[node.arguments.length - 1];
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isBlock(fn.body)) {
        if (!fn.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) add(fn.getStart(source), "async ");
        const first = fn.parameters[0]?.name;
        const element = first && ts.isObjectBindingPattern(first) ? first.elements.find(row => (row.propertyName || row.name).getText(source) === "page") : null;
        const page = element ? element.name.getText(source) : "undefined";
        add(fn.body.getStart(source) + 1, `\n__mesRegister(${page});\n`);
        catching(fn.body);
        inside(fn.body);
        tests += 1;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!tests) return { text, tests, boundaries };
  // Apply right-to-left; stable insertion order at one offset keeps register before try.
  const byPosition = new Map();
  for (const edit of edits) byPosition.set(edit.position, (byPosition.get(edit.position) || "") + edit.value);
  for (const [position, value] of [...byPosition.entries()].sort((a, b) => b[0] - a[0])) text = text.slice(0, position) + value + text.slice(position);
  const prefix = `import { registerBoundary as __mesRegister, preserveFailure as __mesPreserve, beforeCleanup as __mesBeforeCleanup, needsPreservation as __mesNeedsPreservation } from ${JSON.stringify(helper)};\n`;
  const fallback = "\ntest.afterEach(async () => { if (__mesNeedsPreservation()) await __mesBeforeCleanup(); });\n";
  return { text: prefix + text + fallback, tests, boundaries };
}

function apply(sourceRoot, output) {
  const source = fs.realpathSync(sourceRoot);
  const marker = JSON.parse(fs.readFileSync(path.join(source, ".mes-flaky-export.json"), "utf8"));
  if (marker.source !== source || fs.existsSync(path.join(source, ".git")) || fs.existsSync(output)) throw Error("failure observer export guard failed");
  const ts = require(path.join(source, "frontend/node_modules/typescript"));
  const root = path.join(source, "frontend/tests/e2e");
  const helperFile = path.join(root, "_failure-boundary.ts");
  if (fs.existsSync(helperFile)) throw Error("failure helper already exists");
  fs.copyFileSync(path.join(__dirname, "failure-boundary.ts"), helperFile);
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error("linked test source refused");
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.name.endsWith(".spec.ts") && !entry.name.startsWith("mes-flaky-") && !entry.name.startsWith("000-mes-flaky-")) files.push(name);
    }
  }
  visit(root);
  const rows = [];
  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    const helper = path.relative(path.dirname(file), helperFile.slice(0, -3)).split(path.sep).join("/");
    const result = instrument(ts, before, file, helper.startsWith(".") ? helper : "./" + helper);
    const checked = ts.transpileModule(result.text, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    if (checked.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error)) throw Error("failure observer introduced syntax error");
    fs.writeFileSync(file, result.text);
    rows.push({ file: path.relative(source, file), tests: result.tests, finally_boundaries: result.boundaries,
      before: crypto.createHash("sha256").update(before).digest("hex"), after: crypto.createHash("sha256").update(result.text).digest("hex") });
  }
  fs.writeFileSync(output, JSON.stringify({ schema: 1, scope: "disposable test bodies only", files: rows }, null, 2));
}
module.exports = { instrument, apply };
if (require.main === module) apply(...process.argv.slice(2));
