"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type QueueBatch, type QueueBatchStatus } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, transactionLabel } from "../legacy/_components/legacyUi";
import { formatDateTime } from "@/lib/mes-format";

const STATUS_LABEL: Record<QueueBatchStatus, string> = {
  OPEN: "진행중",
  CONFIRMED: "확정",
  CANCELLED: "취소",
};

const BATCH_TYPE_LABEL: Record<string, string> = {
  PRODUCE: "생산",
  DISASSEMBLE: "분해",
  RETURN: "반품",
};

const DIRECTION_LABEL: Record<string, string> = {
  IN: "입고",
  OUT: "출고",
  SCRAP: "폐기",
};

const STATUS_COLOR: Record<QueueBatchStatus, string> = {
  OPEN: LEGACY_COLORS.blue,
  CONFIRMED: LEGACY_COLORS.green,
  CANCELLED: LEGACY_COLORS.red,
};

export default function QueuePage() {
  const [batches, setBatches] = useState<QueueBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<QueueBatchStatus | "ALL">("OPEN");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await api.listQueueBatches(
        status === "ALL" ? undefined : { status },
      );
      setBatches(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "배치를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const doConfirm = async (id: string) => {
    try {
      await api.confirmQueueBatch(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정 실패");
    }
  };

  const doCancel = async (id: string) => {
    if (!confirm("이 배치를 취소하시겠습니까? (예약 수량이 해제됩니다)")) return;
    try {
      await api.cancelQueueBatch(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "취소 실패");
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-6"
      style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}
    >
      <div className="mx-auto max-w-[700px]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black">작업 배치</h1>
          <Link href="/legacy" className="text-sm" style={{ color: LEGACY_COLORS.blue }}>
            ← 레거시
          </Link>
        </div>

        <div className="mb-4 flex gap-2">
          {(["OPEN", "CONFIRMED", "CANCELLED", "ALL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="rounded-xl px-3 py-2 text-base font-bold"
              style={{
                background: status === s ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
                color: status === s ? "#fff" : LEGACY_COLORS.muted2,
              }}
            >
              {s === "ALL" ? "전체" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {error && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ background: "rgba(242,95,92,.1)", borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            로딩 중...
          </div>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            조건에 맞는 배치가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((b) => (
              <div
                key={b.batch_id}
                className="overflow-hidden rounded-[14px] border"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="flex items-center justify-between gap-3 border-b px-3 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-[2px] text-sm font-bold"
                        style={{ background: "rgba(96,165,250,.15)", color: STATUS_COLOR[b.status] }}
                      >
                        {BATCH_TYPE_LABEL[b.batch_type] ?? b.batch_type}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: STATUS_COLOR[b.status] }}>
                        {STATUS_LABEL[b.status]}
                      </span>
                      {b.owner_name && (
                        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          🔒 {b.owner_name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-base font-semibold">
                      {b.parent_item_name ?? "-"}
                      {b.parent_quantity != null ? ` × ${formatNumber(b.parent_quantity)}` : ""}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                      {formatDateTime(b.created_at)}
                      {b.reference_no ? ` · ${b.reference_no}` : ""}
                    </div>
                  </div>
                  {b.status === "OPEN" && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => doConfirm(b.batch_id)}
                        className="rounded-lg px-3 py-1 text-sm font-bold"
                        style={{ background: LEGACY_COLORS.green, color: "#fff" }}
                      >
                        확정
                      </button>
                      <button
                        onClick={() => doCancel(b.batch_id)}
                        className="rounded-lg px-3 py-1 text-sm font-bold"
                        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
                <div className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
                  {b.lines.map((ln) => (
                    <div key={ln.line_id} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span
                        className="rounded-full px-2 py-[2px] text-sm font-bold"
                        style={{
                          background:
                            ln.direction === "OUT"
                              ? "rgba(242,95,92,.15)"
                              : ln.direction === "IN"
                                ? "rgba(31,209,122,.15)"
                                : ln.direction === "SCRAP"
                                  ? "rgba(244,185,66,.15)"
                                  : "rgba(161,161,161,.2)",
                          color:
                            ln.direction === "OUT"
                              ? LEGACY_COLORS.red
                              : ln.direction === "IN"
                                ? LEGACY_COLORS.green
                                : ln.direction === "SCRAP"
                                  ? LEGACY_COLORS.yellow
                                  : LEGACY_COLORS.muted2,
                        }}
                      >
                        {DIRECTION_LABEL[ln.direction] ?? ln.direction}
                      </span>
                      <span className="flex-1 truncate" style={{ opacity: ln.included ? 1 : 0.4 }}>
                        {ln.item_name ?? ln.item_id}
                      </span>
                      <span>{formatNumber(ln.quantity)}</span>
                      {ln.bom_expected != null && Number(ln.bom_expected) !== Number(ln.quantity) && (
                        <span className="text-xs" style={{ color: LEGACY_COLORS.yellow }}>
                          (BOM {formatNumber(ln.bom_expected)})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
