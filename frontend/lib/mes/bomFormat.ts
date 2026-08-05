import { formatQty } from "./format";

export function formatBomQuantity(quantity: number, unit?: string | null): string {
  return `${formatQty(quantity, { maximumFractionDigits: 2, trimTrailingZeros: true })}${unit?.trim() || "EA"}`;
}
