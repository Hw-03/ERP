import type { IoBatch, IoLine, Item } from "@/lib/api";
import { ioLineAvailable } from "@/lib/mes/inventory";

/** 해당 작업의 저장된 위치 예약만 편집 한도에 돌려준다. */
export function ownerReservationAvailable(item: Item, line: IoLine, batch?: IoBatch | null): number | null {
  let available = ioLineAvailable(item, line);
  const reservation = item.work_reservations?.reservation_by_location.find((row) =>
    row.location.bucket === line.from_bucket && row.location.department === (line.from_department || null));
  if (reservation) {
    const physical = line.from_bucket === "warehouse" ? item.warehouse_qty
      : item.locations?.find((row) => row.department === line.from_department && row.status === "PRODUCTION")?.quantity ?? 0;
    available = Math.max(0, physical - reservation.work_reserved_quantity - reservation.approval_reserved_quantity - reservation.shipping_reserved_quantity);
  }
  if (available === null || batch?.status !== "draft" || batch.reservation_status !== "reserved") return available;
  const ownQuantity = (batch.effective_plan?.effects ?? []).reduce((total, effect) => {
    if (effect.kind === "in" || effect.item_id !== line.item_id) return total;
    const from = effect.from;
    return from.bucket === line.from_bucket && from.department === (line.from_department || null)
      ? total + effect.quantity : total;
  }, 0);
  const shortageQuantity = batch.reservation_issue?.code === "stock_shortage"
    ? batch.reservation_issue.shortages.reduce((total, shortage) =>
      shortage.item_id === line.item_id && shortage.location.bucket === line.from_bucket
        && shortage.location.department === (line.from_department || null)
        ? total + shortage.shortage_quantity : total, 0)
    : 0;
  return available + Math.max(0, ownQuantity - shortageQuantity);
}
