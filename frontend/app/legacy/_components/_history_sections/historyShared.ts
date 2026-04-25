import { LEGACY_COLORS } from "../legacyUi";

export const HISTORY_PAGE_SIZE = 100;

export const EXCEPTION_TYPES = new Set(["ADJUST", "SCRAP", "LOSS", "DISASSEMBLE", "MARK_DEFECTIVE"]);

export const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "생산", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
  { label: "조정·예외", value: "EXCEPTION" },
];

export const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

export const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  RM: { label: "원자재", color: LEGACY_COLORS.blue, bg: `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)` },
  TA: { label: "튜브조립", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TF: { label: "튜브완성", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  HA: { label: "고압조립", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HF: { label: "고압완성", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  VA: { label: "진공조립", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VF: { label: "진공완성", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  BA: { label: "본체조립", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  AF: { label: "조립완성", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  FG: { label: "완제품", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  UK: { label: "미분류", color: LEGACY_COLORS.muted2, bg: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 16%, transparent)` },
};

export function getPeriodStart(value: string): Date | null {
  const now = new Date();
  if (value === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "WEEK") {
    const copy = new Date(now);
    copy.setDate(copy.getDate() - copy.getDay());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (value === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export function rowTint(type: string) {
  switch (type) {
    case "RECEIVE":
    case "PRODUCE":
    case "RETURN":
      return "rgba(67,211,157,.05)";
    case "SHIP":
    case "BACKFLUSH":
    case "SCRAP":
    case "LOSS":
      return "rgba(255,123,123,.05)";
    case "ADJUST":
      return "rgba(101,169,255,.05)";
    default:
      return "transparent";
  }
}

export function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function formatHistoryDate(iso: string) {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

export function toDateKey(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
