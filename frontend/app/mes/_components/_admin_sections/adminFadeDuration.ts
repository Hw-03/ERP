/** CSS 최적화가 ms를 s로 바꿔도 Web Animations에는 밀리초를 전달한다. */
export function adminFadeDuration(element: HTMLElement, kind: "selection" | "read" = "selection"): number {
  const style = getComputedStyle(element);
  const fallback = kind === "selection" ? 180 : 220;
  const value = (kind === "selection" ? style.getPropertyValue("--admin-selection-duration").trim() : "")
    || style.getPropertyValue("--admin-fade-duration").trim();
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  return value.endsWith("ms") ? amount : value.endsWith("s") ? amount * 1000 : fallback;
}
