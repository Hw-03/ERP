import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("번들 크기 게이트는 실제 바이트 수를 출력한다", () => {
  const scriptPath = fileURLToPath(new URL("./check-bundle-size.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath, "--max", "999"], { encoding: "utf8" });

  assert.match(output, /\d[\d,]* bytes/);
});

test("기본 번들 예산은 3.00 MB 한도를 적용한다", () => {
  const scriptPath = fileURLToPath(new URL("./check-bundle-size.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath], { encoding: "utf8" });

  assert.match(output, /limit 3\.000 MB/);
});

test("지정한 예산을 초과하면 실패한다", () => {
  const scriptPath = fileURLToPath(new URL("./check-bundle-size.mjs", import.meta.url));
  assert.throws(
    () => execFileSync(process.execPath, [scriptPath, "--max", "0"], { encoding: "utf8", stdio: "pipe" }),
    (error) => error.status === 1 && /exceeds limit 0\.000 MB/.test(error.stderr),
  );
});
