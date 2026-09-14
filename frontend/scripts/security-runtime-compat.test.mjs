import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(FRONTEND_ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(join(FRONTEND_ROOT, relativePath), "utf8");
}

test("pins the approved patched Next 16 and React 19 runtime", () => {
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");

  assert.equal(packageJson.engines.node, ">=20.9 <21");
  assert.equal(packageLock.packages[""].engines.node, ">=20.9 <21");
  assert.equal(packageJson.dependencies.next, "16.3.4");
  assert.equal(packageJson.dependencies.react, "19.2.8");
  assert.equal(packageJson.dependencies["react-dom"], "19.2.8");
  assert.equal(packageJson.dependencies["lucide-react"], "^0.469.0");
  assert.equal(packageJson.dependencies.swr, "^2.3.0");
  assert.equal(packageJson.devDependencies["@types/react"], "19.2.18");
  assert.equal(packageJson.devDependencies["@types/react-dom"], "19.2.7");
  assert.equal(packageJson.devDependencies.eslint, "^9.39.5");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.3.4");
  assert.equal(packageJson.devDependencies.postcss, "^8.5.28");
});

test("uses the Next 16 lint and configuration contracts", () => {
  const packageJson = readJson("package.json");
  const nextConfig = readText("next.config.js");

  assert.equal(packageJson.scripts.lint, "eslint app lib --ext .js,.jsx,.ts,.tsx");
  assert.equal(
    packageJson.scripts["lint:strict"],
    "eslint app lib --ext .js,.jsx,.ts,.tsx --max-warnings=0",
  );
  assert.equal(existsSync(join(FRONTEND_ROOT, ".eslintrc.json")), false);
  assert.equal(existsSync(join(FRONTEND_ROOT, "eslint.config.mjs")), true);
  const eslintConfig = readText("eslint.config.mjs");
  assert.ok(eslintConfig.includes("dexcowin/react-hooks-legacy-equivalence"));
  for (const rule of [
    "@next/next/no-location-assign-relative-destination",
    "react-hooks/immutability",
    "react-hooks/preserve-manual-memoization",
    "react-hooks/purity",
    "react-hooks/refs",
    "react-hooks/set-state-in-effect",
  ]) {
    assert.ok(eslintConfig.includes(`\"${rule}\": \"off\"`));
  }
  assert.match(nextConfig, /devIndicators:\s*false/);
  assert.doesNotMatch(nextConfig, /\beslint\s*:/);
  assert.doesNotMatch(nextConfig, /\bbuildActivity\s*:/);
  assert.equal(packageJson.scripts["typecheck:app"], "next typegen && tsc --noEmit");
});

test("uses React 19 compatible JSX and ref types", () => {
  const tsconfig = readJson("tsconfig.json");
  const expectedFragments = new Map([
    ["app/mes/_components/_admin_sections/_bom_workbench/BomTablePrimitives.tsx", "RefObject<HTMLSpanElement | null>"],
    ["app/mes/_components/_defect_hub/AddQuarantineModal.tsx", "ReactElement | null"],
    ["app/mes/_components/_defect_hub/AddRDirectModal.tsx", "ReactElement | null"],
    ["app/mes/_components/_defect_hub/RDefectActionModal.tsx", "ReactElement | null"],
    ["app/mes/_components/_defect_hub/RDefectActionPanel.tsx", "ReactElement"],
    ["app/mes/_components/_defect_hub/ReasonFormFields.tsx", "ReactElement"],
    ["app/mes/_components/_hooks/useBarcodeScanner.ts", "RefObject<HTMLVideoElement | null>"],
    ["app/mes/_components/_warehouse_hooks/useWarehouseScroll.ts", "RefObject<HTMLDivElement | null>"],
    ["lib/mes/useFocusTrap.ts", "RefObject<HTMLElement | null>"],
  ]);

  assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
  assert.equal(tsconfig.compilerOptions.target, "ES2017");
  assert.ok(tsconfig.include.includes(".next/dev/types/**/*.ts"));
  assert.ok(tsconfig.include.includes(".next-prod/dev/types/**/*.ts"));
  for (const [relativePath, fragment] of expectedFragments) {
    assert.match(readText(relativePath), new RegExp(fragment.replaceAll("|", "\\|")));
  }
});
