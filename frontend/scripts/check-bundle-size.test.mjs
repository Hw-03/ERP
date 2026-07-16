import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("번들 크기 게이트는 실제 바이트 수를 출력한다", () => {
  const scriptPath = fileURLToPath(new URL("./check-bundle-size.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath, "--max", "999"], { encoding: "utf8" });

  assert.match(output, /\d[\d,]* bytes/);
});
