"use client";

import { useEffect, useState } from "react";
import { api, type Item, type QueueBatch, type QueueBatchStatus, type QueueBatchType } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, processStageLabel } from "./legacyUi";

const BATCH_TYPE_LABEL: Record<QueueBatchType, string> = {
  PRODUCE: "생산입고",
  DISASSEMBLE: "분해",
  RETURN: "반품",
};

const BATCH_TYPE_COLOR: Record<QueueBatchType, string> = {
  PRODUCE: LEGACY_COLORS.green,
  DISASSEMBLE: LEGACY_COLORS.yellow,
  RETURN: LEGACY_COLORS.cyan,
};

const STATUS_LABEL: Record<QueueBatchStatus, string> = {
  OPEN: "진행중",
  CONFIRMED: "확정",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<QueueBatchStatus, string> = {
  OPEN: LEGACY_COLORS.blue,
  CONFIRMED: LEGACY_COLORS.green,
  CANCELLED: LEGACY_COLORS.red,
};

const DIR_LABEL = { IN: "입고", OUT: "출고", SCRAP: "폐기", LOSS: "분실" } as const;
const DIR_BG = {
  IN: "rgba(31,209,122,.15)",
  OUT: "rgba(242,95,92,.15)",
  SCRAP: "rgba(244,185,66,.15)",
  LOSS: "rgba(161,161,161,.2)",
} as const;
const DIR_COLOR = {
  IN: LEGACY_COLORS.green,
  OUT: LEGACY_COLORS.red,
  SCRAP: LEGACY_COLORS.yellow,
  LOSS: LEGACY_COLORS.muted2,
} as const;

export function QueueTab() {
  const [batches, setBatches] = useState<QueueBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<QueueBatchStatus | "ALL">("OPEN");
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [batchType, setBatchType] = useState<QueueBatchType>("PRODUCE");
  const [batchItems, setBatchItems] = useState<Item[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchItemId, setBatchItemId] = useState("");
  const [batchQty, setBatchQty] = useState("1");
  const [batchOwner, setBatchOwner] = useState("");
  const [batchRef, setBatchRef] = useState("");
  const [loadBom, setLoadBom] = useState(true);
  const [batchCreating, setBatchCreating] = useState(false);

  const [lineQtyEdit, setLineQtyEdit] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await api.listQueueBatches(status === "ALL" ? undefined : { status });
      setBatches(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "배치를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (showCreate && !itemsLoaded) {
      api.getItems({ limit: 2000 }).then((data) => { setBatchItems(data); setItemsLoaded(true); }).catch(() => {});
    }
  }, [showCreate, itemsLoaded]);

  const filteredBatchItems = batchItems
    .filter((i) => {
      const kw = batchSearch.trim().toLowerCase();
      if (!kw) return false;
      return `${i.item_name} ${i.item_code}`.toLowerCase().includes(kw);
    })
    .slice(0, 30);

  const selectedBatchItem = batchItems.find((i) => i.item_id === batchItemId) ?? null;

  const doCreate = async () => {
    if (!batchItemId) { setError("품목을 선택하세요."); return; }
    const qty = Number(batchQty);
    if (!qty || qty <= 0) { setError("수량을 확인하세요."); return; }
    try {
      setBatchCreating(true);
      setError(null);
      await api.createQueueBatch({
        batch_type: batchType,
        parent_item_id: batchItemId,
        parent_quantity: qty,
        owner_name: batchOwner || undefined,
        reference_no: batchRef || undefined,
        load_bom: loadBom,
      });
      setShowCreate(false);
      setBatchSearch("");
      setBatchItemId("");
      setBatchQty("1");
      setBatchOwner("");
      setBatchRef("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "배치 생성 실패");
    } finally {
      setBatchCreating(false);
    }
  };

  const doConfirm = async (id: string) => {
    try {
      setError(null);
      await api.confirmQueueBatch(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정 실패");
    }
  };

  const doCancel = async (id: string) => {
    if (!confirm("이 배치를 취소하시겠습니까? 예약 수량이 해제됩니다.")) return;
    try {
      setError(null);
      await api.cancelQueueBatch(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "취소 실패");
    }
  };

  const doToggleLine = async (batchId: string, lineId: string, included: boolean) => {
    try {
      setError(null);
      const updated = await api.toggleQueueLine(batchId, lineId, { included });
      setBatches((prev) => prev.map((b) => (b.batch_id === updated.batch_id ? updated : b)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "라인 토글 실패");
    }
  };

  const doOverrideLine = async (batchId: string, lineId: string, qtyStr: string) => {
    const n = Number(qtyStr);
    if (!n || n <= 0) return;
    try {
      setError(null);
      const updated = await api.overrideQueueLine(batchId, lineId, n);
      setBatches((prev) => prev.map((b) => (b.batch_id === updated.batch_id ? updated : b)));
      setLineQtyEdit((prev) => { const next = { ...prev }; delete next[lineId]; return next; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "수량 변경 실패");
    }
  };

  return (
    <div>
      {/* 상단 액션 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {(["OPEN", "CONFIRMED", "CANCELLED", "ALL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="rounded-xl px-3 py-2 text-xs font-bold"
              style={{
                background: status === s ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
                color: status === s ? "#fff" : LEGACY_COLORS.muted2,
              }}
            >
              {s === "ALL" ? "전체" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setError(null); }}
          className="rounded-xl px-3 py-2 text-xs font-bold"
          style={{
            background: showCreate ? LEGACY_COLORS.s3 : LEGACY_COLORS.blue,
            color: showCreate ? LEGACY_COLORS.text : "#fff",
          }}
        >
          {showCreate ? "닫기" : "+ 새 배치"}
        </button>
      </div>

      {/* 배치 생성 폼 */}
      {showCreate && (
        <div
          className="mb-4 overflow-hidden rounded-[14px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.blue }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
              배치 유형
            </div>
            <div className="flex gap-2">
              {(["PRODUCE", "DISASSEMBLE", "RETURN"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBatchType(t)}
                  className="flex-1 rounded-xl py-2 text-xs font-bold"
                  style={{
                    background: batchType === t ? BATCH_TYPE_COLOR[t] : LEGACY_COLORS.s3,
                    color: batchType === t ? "#fff" : LEGACY_COLORS.muted2,
                  }}
                >
                  {BATCH_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pt-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
              대상 품목
            </div>
            <div
              className="mb-2 flex items-center gap-2 rounded-[11px] border px-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <span>🔍</span>
              <input
                value={batchSearch}
                onChange={(e) => { setBatchSearch(e.target.value); setBatchItemId(""); }}
                placeholder="품명 또는 코드 검색..."
                className="w-full bg-transparent py-[9px] text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>

            {selectedBatchItem ? (
              <div
                className="mb-2 flex items-center justify-between rounded-[11px] border px-3 py-2"
                style={{ background: "rgba(79,142,247,.08)", borderColor: LEGACY_COLORS.blue }}
              >
                <div>
                  <div className="text-sm font-semibold">{selectedBatchItem.item_name}</div>
                  <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {selectedBatchItem.item_code} · 가용{" "}
                    {formatNumber(selectedBatchItem.available_quantity ?? selectedBatchItem.quantity)}{" "}
                    {selectedBatchItem.unit}
                  </div>
                </div>
                <button onClick={() => { setBatchItemId(""); setBatchSearch(""); }} className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>✕</button>
              </div>
            ) : filteredBatchItems.length > 0 ? (
              <div
                className="mb-2 max-h-[160px] overflow-y-auto rounded-[11px] border"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                {filteredBatchItems.map((item, i) => (
                  <button
                    key={item.item_id}
                    onClick={() => { setBatchItemId(item.item_id); setBatchSearch(item.item_name); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                    style={{ borderBottom: i < filteredBatchItems.length - 1 ? `1px solid ${LEGACY_COLORS.border}` : "none" }}
                  >
                    <div>
                      <div className="text-sm font-semibold">{item.item_name}</div>
                      <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{item.item_code}</div>
                    </div>
                    <div className="text-right text-[11px] font-mono" style={{ color: LEGACY_COLORS.cyan }}>
                      {formatNumber(item.available_quantity ?? item.quantity)} {item.unit}
                    </div>
                  </button>
                ))}
              </div>
            ) : batchSearch.trim() ? (
              <div
                className="mb-2 rounded-[11px] border px-3 py-2 text-sm"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              >
                {itemsLoaded ? "검색 결과 없음" : "로딩 중..."}
              </div>
            ) : null}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>수량</div>
                <input
                  value={batchQty}
                  onChange={(e) => setBatchQty(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-[11px] border px-3 py-2 text-center text-lg font-bold outline-none"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                    fontFamily: 'Menlo, "Courier New", monospace',
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>담당자</div>
                <input
                  value={batchOwner}
                  onChange={(e) => setBatchOwner(e.target.value)}
                  placeholder="이름 (선택)"
                  className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </div>
            </div>

            <div className="mb-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>참조번호</div>
              <input
                value={batchRef}
                onChange={(e) => setBatchRef(e.target.value)}
                placeholder="예: WO-240412 (선택)"
                className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </div>

            <label className="mb-3 flex items-center gap-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              <input type="checkbox" checked={loadBom} onChange={(e) => setLoadBom(e.target.checked)} />
              BOM 자동 로드 (자재 소요 자동 계산)
            </label>

            <button
              onClick={() => void doCreate()}
              disabled={batchCreating || !batchItemId}
              className="mb-3 w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
              style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
            >
              {batchCreating ? "생성 중..." : "배치 생성"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="mb-3 rounded-xl border px-3 py-2 text-xs"
          style={{ background: "rgba(242,95,92,.1)", borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>로딩 중...</div>
      ) : batches.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>조건에 맞는 배치가 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const varianceLines = b.lines.filter(
              (ln) => ln.bom_expected != null && Number(ln.bom_expected) !== Number(ln.quantity),
            );
            return (
              <div
                key={b.batch_id}
                className="overflow-hidden rounded-[14px] border"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div
                  className="flex items-center justify-between gap-3 border-b px-3 py-3"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-[6px]">
                      <span
                        className="rounded-full px-2 py-[2px] text-[10px] font-bold"
                        style={{ background: `${BATCH_TYPE_COLOR[b.batch_type]}22`, color: BATCH_TYPE_COLOR[b.batch_type] }}
                      >
                        {BATCH_TYPE_LABEL[b.batch_type]}
                      </span>
                      <span
                        className="rounded-full px-2 py-[2px] text-[10px] font-bold"
                        style={{ background: `${STATUS_COLOR[b.status]}18`, color: STATUS_COLOR[b.status] }}
                      >
                        {STATUS_LABEL[b.status]}
                      </span>
                      {b.owner_name && (
                        <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>👤 {b.owner_name}</span>
                      )}
                    </div>
                    <div className="truncate text-sm font-semibold">
                      {b.parent_item_name ?? "-"}
                      {b.parent_quantity != null ? ` × ${formatNumber(b.parent_quantity)}` : ""}
                    </div>
                    <div className="mt-1 text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                      {new Date(b.created_at).toLocaleString("ko-KR")}
                      {b.reference_no ? ` · ${b.reference_no}` : ""}
                      {b.confirmed_at ? ` · 확정 ${new Date(b.confirmed_at).toLocaleString("ko-KR")}` : ""}
                    </div>
                  </div>
                  {b.status === "OPEN" && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        onClick={() => void doConfirm(b.batch_id)}
                        className="rounded-lg px-3 py-1 text-[10px] font-bold"
                        style={{ background: LEGACY_COLORS.green, color: "#fff" }}
                      >확정</button>
                      <button
                        onClick={() => void doCancel(b.batch_id)}
                        className="rounded-lg px-3 py-1 text-[10px] font-bold"
                        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                      >취소</button>
                    </div>
                  )}
                </div>

                <div>
                  {b.lines.map((ln, index) => {
                    const isEditing = lineQtyEdit[ln.line_id] !== undefined;
                    const hasVariance = ln.bom_expected != null && Number(ln.bom_expected) !== Number(ln.quantity);
                    return (
                      <div
                        key={ln.line_id}
                        className="flex items-center gap-2 px-3 py-[9px] text-xs"
                        style={{
                          borderBottom: index < b.lines.length - 1 ? `1px solid ${LEGACY_COLORS.border}` : "none",
                          opacity: ln.included ? 1 : 0.4,
                        }}
                      >
                        {b.status === "OPEN" && (
                          <button
                            onClick={() => void doToggleLine(b.batch_id, ln.line_id, !ln.included)}
                            className="shrink-0 text-[14px]"
                            title={ln.included ? "제외하기" : "포함하기"}
                            style={{ color: ln.included ? LEGACY_COLORS.green : LEGACY_COLORS.muted }}
                          >
                            {ln.included ? "✓" : "—"}
                          </button>
                        )}
                        <span
                          className="shrink-0 rounded-full px-[6px] py-[2px] text-[9px] font-bold"
                          style={{ background: DIR_BG[ln.direction], color: DIR_COLOR[ln.direction] }}
                        >
                          {DIR_LABEL[ln.direction]}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {ln.item_name ?? ln.item_id}
                          {ln.process_stage ? (
                            <span className="ml-1 text-[9px]" style={{ color: LEGACY_COLORS.muted2 }}>
                              [{processStageLabel(ln.process_stage)}]
                            </span>
                          ) : null}
                        </span>
                        {b.status === "OPEN" ? (
                          isEditing ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <input
                                type="number"
                                value={lineQtyEdit[ln.line_id]}
                                onChange={(e) => setLineQtyEdit((prev) => ({ ...prev, [ln.line_id]: e.target.value }))}
                                className="w-14 rounded border px-1 py-[2px] text-center text-xs outline-none"
                                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void doOverrideLine(b.batch_id, ln.line_id, lineQtyEdit[ln.line_id]);
                                  if (e.key === "Escape") setLineQtyEdit((prev) => { const next = { ...prev }; delete next[ln.line_id]; return next; });
                                }}
                              />
                              <button
                                onClick={() => void doOverrideLine(b.batch_id, ln.line_id, lineQtyEdit[ln.line_id])}
                                className="rounded px-1 py-[2px] text-[10px] font-bold"
                                style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
                              >적용</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setLineQtyEdit((prev) => ({ ...prev, [ln.line_id]: String(ln.quantity) }))}
                              className="shrink-0 font-mono text-xs font-bold"
                              style={{
                                color: hasVariance ? LEGACY_COLORS.yellow : LEGACY_COLORS.text,
                                textDecoration: "underline",
                                textDecorationStyle: "dotted",
                              }}
                              title="클릭하여 수량 변경"
                            >
                              {formatNumber(ln.quantity)}
                            </button>
                          )
                        ) : (
                          <span className="shrink-0 font-mono font-bold">{formatNumber(ln.quantity)}</span>
                        )}
                        {hasVariance && (
                          <span className="shrink-0 text-[9px]" style={{ color: LEGACY_COLORS.yellow }}>
                            BOM {formatNumber(ln.bom_expected)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {b.status === "CONFIRMED" && varianceLines.length > 0 && (
                  <div
                    className="border-t px-3 py-2"
                    style={{ borderColor: LEGACY_COLORS.border, background: "rgba(244,185,66,.06)" }}
                  >
                    <div className="mb-1 text-[10px] font-bold" style={{ color: LEGACY_COLORS.yellow }}>BOM 편차</div>
                    {varianceLines.map((ln) => {
                      const diff = Number(ln.quantity) - Number(ln.bom_expected);
                      return (
                        <div key={ln.line_id} className="flex items-center gap-2 text-[10px]">
                          <span style={{ color: LEGACY_COLORS.muted2 }}>{ln.item_name}</span>
                          <span style={{ color: LEGACY_COLORS.muted }}>
                            예상 {formatNumber(ln.bom_expected)} → 실제 {formatNumber(ln.quantity)}
                          </span>
                          <span style={{ color: diff > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>
                            ({diff > 0 ? "+" : ""}{formatNumber(diff)})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
