import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { createServer } from "vite";

test("관리자 로딩 안내는 Chromium에서 인식되고 조회 완료 후 사라진다", async ({ page }) => {
  // Resolve the component's CSS modules without starting Next or accessing business data.
  const root = resolve(__dirname, "../..");
  const renderer = await createServer({
    root, configFile: false, server: { middlewareMode: true, watch: null },
    resolve: { alias: { "@": root } }, esbuild: { jsx: "automatic" },
  });
  try {
    const { AdminReadBoundary } = await renderer.ssrLoadModule("/app/mes/_components/_admin_sections/_admin_primitives/AdminReadState.tsx");
    const markup = (loading: boolean): string => renderToStaticMarkup(createElement(AdminReadBoundary, {
      read: { loading, retry: () => {} }, label: "직원 목록",
      skeleton: createElement("span", null, "로딩 자리"),
    }, createElement("button", null, "직원 저장")));
    await page.setContent(markup(true));
    const loading = page.getByRole("status", { name: "직원 목록 불러오는 중", exact: true });
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("button", { name: "직원 저장", exact: true })).toHaveCount(0);

    await page.setContent(markup(false));
    await expect(loading).toHaveCount(0);
    await expect(page.getByRole("button", { name: "직원 저장", exact: true })).toBeVisible();
  } finally {
    await renderer.close();
  }
});
