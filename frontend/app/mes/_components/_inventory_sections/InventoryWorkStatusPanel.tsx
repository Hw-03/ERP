"use client";

import { useId, useState, type JSX, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Item } from "@/lib/api";
import type { WorkStockLocation } from "@/lib/api/types/work-reservations";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { useInventoryWorkStatus } from "@/lib/queries/useInventoryWorkStatus";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { InventoryRelatedWorkList } from "./InventoryRelatedWorkList";

/** 담당자 부서와 구분하여 실제 재고 위치를 표시한다. */
function locationLabel(location: WorkStockLocation): string {
  if (location.bucket === "warehouse") return "창고";
  return `${location.department}${location.bucket === "defective" ? " 불량" : ""}`;
}

/** 선택 품목의 공개 작업 현황. */
export function InventoryWorkStatusPanel({ item, mobile = false, children }: { item: Item; mobile?: boolean; children?: ReactNode }): JSX.Element {
  const [reservationsOpen, setReservationsOpen] = useState(false);
  const reservationDetailId = useId();
  const query = useInventoryWorkStatus(item.item_id);
  const data = query.data?.item_id === item.item_id ? query.data : undefined;
  const summary = data?.summary;
  const reservedTotal = summary ? summary.work_reserved_quantity + summary.approval_reserved_quantity + summary.shipping_reserved_quantity : undefined;
  const incomingUnknown = summary && !summary.forecast_complete && summary.expected_in_quantity === 0;
  const moveForecasts = summary?.forecast_by_location.filter((row) => row.transfer_in_quantity > 0 || row.transfer_out_quantity > 0) ?? [];
  const availableState = getStockState(Number(item.available_quantity), item.min_stock);
  const cardClass = mobile ? "rounded-[20px] border p-3" : "rounded-[28px] border p-5";
  const metricClass = "flex min-h-[76px] min-w-0 flex-col rounded-[18px] border px-1.5 py-3 text-center";
  const metricStyle = { background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border };
  return <div className="space-y-4">
    <section data-panel-scroll-card={!mobile || undefined} aria-label={`${item.item_name} 작업 현황`} className={cardClass} style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
    <h3 className="mb-3 text-sm font-bold tracking-wide" style={{ color: LEGACY_COLORS.muted2 }}>수량 현황</h3>
    <div role="group" aria-label="수량 현황" className={`grid grid-cols-3 ${mobile ? "gap-2" : "gap-3"}`}>
      <div className={metricClass} style={metricStyle}>
        <p className="text-xs tracking-tight" style={{ color: LEGACY_COLORS.muted2 }}>사용 가능 재고</p>
        <p className="mt-1 break-all text-xl font-bold leading-7 tabular-nums" style={{ color: availableState.color }}>{formatQty(item.available_quantity)} <span className="inline-block text-xs font-normal" style={{ color: LEGACY_COLORS.muted2 }}>{item.unit}</span></p>
      </div>
      <button type="button" aria-label="예약 내역" aria-expanded={reservationsOpen} aria-controls={reservationDetailId} disabled={!summary} onClick={() => setReservationsOpen((value) => !value)}
          className={`${metricClass} w-full transition enabled:hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]`} style={metricStyle}>
          <span className="flex items-center justify-center gap-1 text-xs tracking-tight" style={{ color: LEGACY_COLORS.muted2 }}>
            예약 재고
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${reservationsOpen ? "rotate-180" : ""}`} />
          </span>
          <span className="mt-1 block break-all text-xl font-bold leading-7 tabular-nums" style={{ color: LEGACY_COLORS.text }}>{summary ? formatQty(reservedTotal) : "-"} <span className="inline-block text-xs font-normal" style={{ color: LEGACY_COLORS.muted2 }}>{item.unit}</span></span>
      </button>
      <div className={metricClass} style={metricStyle}>
        <p className="text-xs tracking-tight" style={{ color: LEGACY_COLORS.muted2 }}>입고 예정</p>
        <p className="mt-1 break-all text-xl font-bold leading-7 tabular-nums" style={{ color: LEGACY_COLORS.text }}>{incomingUnknown
          ? <span className="text-sm" style={{ color: LEGACY_COLORS.yellow }}>확인 필요</span>
          : <>{summary && !summary.forecast_complete && <span className="text-xs font-normal" style={{ color: LEGACY_COLORS.muted2 }}>확인된 </span>}{summary ? formatQty(summary.expected_in_quantity) : "-"} <span className="inline-block text-xs font-normal" style={{ color: LEGACY_COLORS.muted2 }}>{item.unit}</span></>}</p>
      </div>
    </div>
      {summary && reservationsOpen && <div id={reservationDetailId} className="mt-3 space-y-2 border-t pt-3 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        {([["작업 예약", summary.work_reserved_quantity], ["승인 예약", summary.approval_reserved_quantity], ["출하 예약", summary.shipping_reserved_quantity]] as const).map(([label, quantity]) => <p key={label} className="flex justify-between gap-2"><span>{label}</span><span className="whitespace-nowrap tabular-nums">{formatQty(quantity)} {item.unit}</span></p>)}
      </div>}
    {query.isPending && !data && <ReadLoading label="작업 예약 현황을 불러오는 중" />}
    {(query.isError || (!query.isPending && !summary)) && <ReadFailure message="예약·예정 정보를 확인할 수 없습니다. 아래 버튼으로 다시 불러와 주세요."
      refresh={!!summary} onRetry={() => void query.refetch()} />}
    {summary && <>
      {!summary.forecast_complete && <p role="status" className="mt-3 rounded-[12px] px-3 py-2 text-sm leading-6" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg }}>일부 작업의 예정 정보를 확인할 수 없어 확인 가능한 예정량만 표시합니다.</p>}
      {moveForecasts.length > 0 && <div role="group" aria-label="위치별 예정" className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <h4 className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>위치 이동 예정</h4>
        {moveForecasts.map((row) => <div key={`${row.location.bucket}:${row.location.department}`} className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{locationLabel(row.location)}</span>
          <div className="flex flex-wrap gap-x-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {row.transfer_in_quantity > 0 && <span>이동 도착 {formatQty(row.transfer_in_quantity)}</span>}
            {row.transfer_out_quantity > 0 && <span>이동 출발 {formatQty(row.transfer_out_quantity)}</span>}
          </div>
        </div>)}
        <p className="text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>위치 이동은 전체 재고 증가 없음.</p>
      </div>}
    </>}
    </section>
    {children}
    {data && summary && <section data-panel-scroll-card={!mobile || undefined} aria-label="관련 작업" className={`${mobile ? "rounded-[20px]" : "rounded-[28px]"} border p-4 space-y-3`} style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
        <h4 className="flex items-baseline gap-2 text-sm font-semibold">관련 작업 <span className="text-xs font-normal" style={{ color: LEGACY_COLORS.muted2 }}>{data.works.length ? `${data.works.length}건` : "— 없음"}</span></h4>
        <InventoryRelatedWorkList key={item.item_id} works={data.works} itemId={item.item_id} itemName={item.item_name} />
    </section>}
  </div>;
}
