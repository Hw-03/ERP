"use client";
import { useEffect } from "react";

/** 운영자가 고른 앱 테마를 브라우저 바에도 반영한다. OS 테마로 덮어쓰지 않는다. */
export function ThemeColor() {
  useEffect(() => {
    const root = document.documentElement;
    function sync(): void {
      const color = getComputedStyle(root).getPropertyValue("--c-bg").trim();
      if (!color) return;
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", color));
    }
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
