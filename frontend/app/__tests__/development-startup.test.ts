import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname, "..", "..");
const NEXT_CONFIG_PATH = path.join(FRONTEND_ROOT, "next.config.js");
const START_FRONTEND_PATH = path.resolve(FRONTEND_ROOT, "..", "scripts", "dev", "start-frontend.ps1");
const RUNTIME_CONTROL_PATH = path.resolve(FRONTEND_ROOT, "..", "scripts", "dev", "runtime-control.ps1");

function packageScripts() {
  return JSON.parse(readFileSync(path.join(FRONTEND_ROOT, "package.json"), "utf8")).scripts as Record<
    string,
    string
  >;
}

function loadNextConfig() {
  delete require.cache[require.resolve(NEXT_CONFIG_PATH)];
  return require(NEXT_CONFIG_PATH) as (phase: string) => {
    rewrites: () => Promise<Array<{ destination: string }>>;
  };
}

async function rewriteDestination(phase: string, backendInternalUrl?: string) {
  const previous = process.env.BACKEND_INTERNAL_URL;
  if (backendInternalUrl === undefined) {
    delete process.env.BACKEND_INTERNAL_URL;
  } else {
    process.env.BACKEND_INTERNAL_URL = backendInternalUrl;
  }

  try {
    const config = loadNextConfig()(phase);
    return (await config.rewrites())[0].destination;
  } finally {
    if (previous === undefined) {
      delete process.env.BACKEND_INTERNAL_URL;
    } else {
      process.env.BACKEND_INTERNAL_URL = previous;
    }
  }
}

describe("개발 서버 실행 경로", () => {
  it("일반 dev 명령은 감독 실행기로 위임한다", () => {
    expect(packageScripts().dev).toMatch(/scripts[\\\\/]dev[\\\\/]start-frontend\.ps1/);
  });

  it("dev:raw는 내부와 E2E에서 쓰는 직접 Next 실행 명령을 유지한다", () => {
    expect(packageScripts()["dev:raw"]).toBe("next dev --hostname 0.0.0.0");
  });

  it("감독 실행기는 dev.js를 직접 호출해 npm dev 재귀를 만들지 않는다", () => {
    const launcher = readFileSync(START_FRONTEND_PATH, "utf8");
    const runtimeControl = readFileSync(RUNTIME_CONTROL_PATH, "utf8");

    expect(launcher).toMatch(/Invoke-ProfileFrontendStartup/);
    expect(runtimeControl).toMatch(
      /-ChildCommand\s+@\(\s*"node"\s*,\s*"scripts\/dev\.js"\s*\)/
    );
    expect(`${launcher}\n${runtimeControl}`).not.toMatch(/\bnpm(?:\.cmd)?\s+run\s+dev\b/i);
  });

  it("개발 phase에서 명시 URL이 없으면 감독 백엔드 포트로 프록시한다", async () => {
    const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

    await expect(rewriteDestination(PHASE_DEVELOPMENT_SERVER)).resolves.toBe(
      "http://localhost:8011/api/:path*"
    );
  });

  it("명시 BACKEND_INTERNAL_URL을 공백 제거 후 모든 phase에서 우선한다", async () => {
    const { PHASE_PRODUCTION_BUILD } = require("next/constants");

    await expect(
      rewriteDestination(PHASE_PRODUCTION_BUILD, "  http://127.0.0.1:8021/  ")
    ).resolves.toBe("http://127.0.0.1:8021//api/:path*");
  });

  it("개발 phase에서도 명시 BACKEND_INTERNAL_URL을 공백 제거 후 우선한다", async () => {
    const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

    await expect(
      rewriteDestination(PHASE_DEVELOPMENT_SERVER, "  http://127.0.0.1:8021  ")
    ).resolves.toBe("http://127.0.0.1:8021/api/:path*");
  });

  it("비개발 phase에서 명시 URL이 없으면 기본 백엔드 포트로 프록시한다", async () => {
    const { PHASE_PRODUCTION_BUILD } = require("next/constants");

    await expect(rewriteDestination(PHASE_PRODUCTION_BUILD)).resolves.toBe(
      "http://localhost:8010/api/:path*"
    );
  });

  it.each([
    ["MES_SUPERVISED_FRONTEND 누락", "MES_SUPERVISED_FRONTEND", undefined],
    ["MES_SUPERVISED_FRONTEND=0", "MES_SUPERVISED_FRONTEND", "0"],
    ["PORT 누락", "PORT", undefined],
    ["PORT 공백", "PORT", "   "],
    ["BACKEND_INTERNAL_URL 누락", "BACKEND_INTERNAL_URL", undefined],
    ["BACKEND_INTERNAL_URL 공백", "BACKEND_INTERNAL_URL", "   "],
  ])("%s이면 Next를 시작하지 않고 실패한다", (_caseName, invalidName, invalidValue) => {
    const result = spawnSync(process.execPath, ["scripts/dev.js", "--help"], {
      cwd: FRONTEND_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        MES_SUPERVISED_FRONTEND: "1",
        PORT: "3000",
        BACKEND_INTERNAL_URL: "http://localhost:8011",
        [invalidName]: invalidValue,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(invalidName);
    expect(result.stderr).toContain("npm run dev");
    expect(result.stderr).toContain("start-frontend.ps1");
  });
});
