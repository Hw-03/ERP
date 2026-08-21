import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DARK_FOREGROUND = {
  "--c-blue": "#6f96bd",
  "--c-green": "#69ac8b",
  "--c-red": "#c98588",
  "--c-yellow": "#c4a466",
  "--c-purple": "#a18dbd",
  "--c-cyan": "#68a7b4",
};

const DARK_SOLID = {
  "--c-blue-solid": "#335d7f",
  "--c-green-solid": "#2e6d58",
  "--c-red-solid": "#7f4248",
  "--c-yellow-solid": "#756038",
  "--c-purple-solid": "#5d4c78",
  "--c-cyan-solid": "#326776",
};

const DARK_PROCESS = {
  "--c-process-tr": "#6f96bd", "--c-process-ta": "#69a2bc", "--c-process-tf": "#63a99e",
  "--c-process-hr": "#a38bc0", "--c-process-ha": "#c4a466", "--c-process-hf": "#c78b64",
  "--c-process-vr": "#a6b1c6", "--c-process-va": "#68a7b4", "--c-process-vf": "#69ac8b",
  "--c-process-nr": "#91ad6b", "--c-process-na": "#829b5b", "--c-process-nf": "#69ac8b",
  "--c-process-ar": "#c98588", "--c-process-aa": "#b18fb8", "--c-process-af": "#8fbea1",
  "--c-process-pr": "#b1aac2", "--c-process-pa": "#c89b78", "--c-process-pf": "#9dabca",
};

const DARK_DEPARTMENTS = {
  "--c-department-tube": "#75b58a",
  "--c-department-high-pressure": "#cfb36a",
  "--c-department-vacuum": "#aa98c8",
  "--c-department-tuning": "#b5b5b5",
  "--c-department-assembly": "#78a7d8",
  "--c-department-shipping": "#b68e6c",
};

function hexToLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [hexToLuminance(first), hexToLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function darkTokens(): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
  const darkBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n  \}/)?.[1];
  if (!darkBlock) throw new Error("다크 테마 토큰 블록을 찾지 못했습니다.");
  return Object.fromEntries(
    [...darkBlock.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(([, key, value]) => [key, value.trim()]),
  );
}

function globalStyles(): string {
  return readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
}

describe("다크 테마 색상 계약", () => {
  it("중성 차콜 surface와 저채도 의미색을 사용한다", () => {
    const tokens = darkTokens();
    expect(tokens["--c-bg"]).toBe("#151a21");
    expect(tokens["--c-s1"]).toBe("rgba(27, 34, 42, 0.96)");
    expect(tokens["--c-s2"]).toBe("rgba(35, 44, 54, 0.96)");
    expect(tokens["--c-s3"]).toBe("rgba(44, 55, 67, 0.96)");
    expect(tokens["--c-s4"]).toBe("rgba(56, 69, 83, 0.98)");
    expect(tokens["--c-popup-bg"]).toBe("#1b222a");
    expect(tokens["--c-text"]).toBe("#e6edf3");
    expect(tokens["--c-muted"]).toBe("#8b949e");
    expect(tokens["--c-muted2"]).toBe("#adb7c3");
    expect(tokens).toMatchObject(DARK_FOREGROUND);
    expect(tokens).toMatchObject(DARK_SOLID);
    expect(tokens).toMatchObject(DARK_PROCESS);
    expect(tokens).toMatchObject(DARK_DEPARTMENTS);
  });

  it("전경·공정색과 채움색이 각각 필요한 대비를 충족한다", () => {
    for (const color of [...Object.values(DARK_FOREGROUND), ...Object.values(DARK_PROCESS)]) {
      expect(contrast(color, "#151a21")).toBeGreaterThanOrEqual(4.5);
    }
    for (const color of Object.values(DARK_SOLID)) {
      expect(contrast(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("글로우를 제거하고 부서 표시색을 테마로 전환한다", () => {
    const tokens = darkTokens();
    expect(tokens["--pill-glow-strength"]).toBe("0%");
    expect(tokens["--kpi-glow-strength"]).toBe("0%");
    expect(tokens["--sidebar-glow-strength"]).toBe("0%");
    expect(tokens["--c-department-color-source-weight"]).toBe("55%");
    expect(tokens["--c-department-color-neutral"]).toBe("#adb7c3");
  });

  it("BOM 깊이 행은 테마 반응형 ink 톤으로 깊어질수록 진해진다", () => {
    const styles = globalStyles();
    const tokens = darkTokens();
    const lightMixes = ["2", "4.57", "7.14", "9.71", "12.29", "14.86", "17.43", "20"];
    const darkMixes = ["10", "20", "30", "40", "50", "60", "70", "80"];

    expect(tokens["--c-bom-tree-depth-tone"]).toBe("var(--c-blue-solid)");
    expect(styles).toMatch(/\.bom-tree-depth\s*\{[\s\S]*?background:\s*color-mix\(in oklab, var\(--c-bom-tree-depth-tone\) var\(--bom-tree-depth-mix\), var\(--c-s1\)\);/);

    lightMixes.forEach((mix, index) => {
      expect(styles).toMatch(new RegExp(`\\.bom-tree-depth-${index + 1}\\s*\\{\\s*--bom-tree-depth-mix:\\s*${mix}%;`));
    });
    darkMixes.forEach((mix, index) => {
      expect(styles).toMatch(new RegExp(`:root\\[data-theme="dark"\\] \\.bom-tree-depth-${index + 1}\\s*\\{\\s*--bom-tree-depth-mix:\\s*${mix}%;`));
    });
  });

  it("공용 primary 버튼은 채움 전용 파랑 토큰을 사용한다", () => {
    expect(globalStyles()).toMatch(/\.btn-primary\s*\{[\s\S]*?background:\s*var\(--c-blue-solid\);/);
  });

  it("데스크톱 고정 업무 표면과 버튼에는 inset 음영을 사용하지 않는다", () => {
    const styles = globalStyles();

    expect(styles).toMatch(/\.desktop-flat-surface\s*\{[\s\S]*?box-shadow:\s*none;[\s\S]*?background-image:\s*none;/);
    expect(styles).toMatch(/@media \(min-width: 1024px\)\s*\{[\s\S]*?button[\s\S]*?box-shadow:\s*none;/);
  });

  it("업무 허브 카드의 호버 대비를 라이트와 다크에서 강하게 구분한다", () => {
    const styles = globalStyles();

    expect(styles).toMatch(/\.desktop-work-hub-card:hover\s*\{\s*filter:\s*brightness\(0\.94\);\s*\}/);
    expect(styles).toMatch(/:root\[data-theme="dark"\] \.desktop-work-hub-card:hover\s*\{\s*filter:\s*brightness\(1\.15\);\s*\}/);
  });

  it("사이드바 탭 버튼은 데스크톱 평면화 규칙에서 제외한다", () => {
    expect(globalStyles()).toMatch(/button:not\(\[data-sidebar-tab\]\)/);
  });
});
