"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, PackagePlus, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { Item } from "@/lib/api";
import { Button } from "@/lib/ui/Button";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { SlidePanel } from "../common/SlidePanel";
import { AdminPageHeader } from "./_admin_primitives";
import { FloorStage, FrontStage } from "../_warehouse_map_sections/WarehouseStages";
import { WarehouseJariPanel } from "../_warehouse_map_sections/WarehouseJariPanel";
import { buildCellIndex, rowLabel, SIZE_LABEL, SIZE_UNIT } from "../_warehouse_map_sections/helpers";
import {
  warehouseMapApi,
  type BoxSize,
  type ReconcileRow,
  type WarehouseAngle,
  type WarehouseBox,
  type WarehouseMap,
} from "@/lib/api/warehouse-map";

interface Props {
  items: Item[];
  onStatusChange: (s: string) => void;
  onError: (m: string) => void;
}

/**
 * 위치 배정 — 정면도 그림에서 빈 칸을 클릭해 박스를 놓고/뺀다.
 * floor(앵글 선택) → front(칸 선택) → add-box(품목 선택 전체 화면) 3단계.
 */
export function AdminWarehousePlacementSection({ items, onStatusChange, onError }: Props) {
  const [map, setMap] = useState<WarehouseMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<"floor" | "front" | "add-box">("floor");
  const [curAngleId, setCurAngleId] = useState<number | null>(null);
  const [panel, setPanel] = useState<{ row: number; layer: number } | null>(null);
  const [addBoxCtx, setAddBoxCtx] = useState<{ jariIndex: number; remaining: number; editBox?: WarehouseBox } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconcile, setReconcile] = useState<ReconcileRow[]>([]);

  useEffect(() => {
    warehouseMapApi
      .getMap()
      .then(setMap)
      .catch((e) => onError(e instanceof Error ? e.message : "창고 지도 로드 실패"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cellIndex = useMemo(() => buildCellIndex(map?.boxes ?? []), [map]);
  const angles = useMemo(() => map?.angles ?? [], [map]);
  const curAngle = useMemo(() => angles.find((a) => a.id === curAngleId) ?? null, [angles, curAngleId]);

  async function reload() {
    const m = await warehouseMapApi.getMap();
    setMap(m);
  }

  async function handleAddBox({
    jariIndex,
    size,
    lines,
    editBox,
  }: {
    jariIndex: number;
    size: BoxSize;
    lines: { item_id: string; quantity: number }[];
    editBox?: WarehouseBox;
  }) {
    if (!curAngle || !panel) return;
    setBusy(true);
    try {
      if (editBox) {
        await warehouseMapApi.updateBox(editBox.box_id, { items: lines });
        onStatusChange("박스를 수정했습니다.");
      } else {
        await warehouseMapApi.createBox({
          angle_id: curAngle.id,
          row_no: panel.row,
          layer_no: panel.layer,
          jari_index: jariIndex,
          size,
          items: lines,
        });
        onStatusChange("박스를 배치했습니다.");
      }
      const rc = await Promise.all(lines.map((l) => warehouseMapApi.reconcile(l.item_id)));
      setReconcile(rc.flatMap((r) => r.rows));
      await reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : editBox ? "수정 실패" : "배치 실패");
      throw e; // AddBoxScreen이 catch 해 화면 유지
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBox(boxId: string) {
    setBusy(true);
    try {
      await warehouseMapApi.deleteBox(boxId);
      onStatusChange("박스를 뺐습니다.");
      await reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "빼기 실패");
    } finally {
      setBusy(false);
    }
  }

  function openAngle(a: WarehouseAngle) {
    setCurAngleId(a.id);
    setStage("front");
    setPanel(null);
  }

  function backToFloor() {
    setStage("floor");
    setPanel(null);
  }

  const crumbStyle = { color: LEGACY_COLORS.blue, cursor: "pointer", whiteSpace: "nowrap" as const };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden pr-1">
      <AdminPageHeader
        icon={PackagePlus}
        title="위치 배정"
        description="정면도에서 칸을 클릭하고, 빈 자리에 박스를 넣거나 뺍니다. 배치 후 창고 재고와 대조해 경고합니다."
      />

      <div className="flex min-h-0 flex-1">
        {/* 좌: 지도 카드 or AddBox 화면 */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {stage === "add-box" && addBoxCtx && panel && curAngle ? (
            <AddBoxScreen
              angle={curAngle}
              row={panel.row}
              layer={panel.layer}
              jariIndex={addBoxCtx.jariIndex}
              remaining={addBoxCtx.remaining}
              editBox={addBoxCtx.editBox}
              items={items}
              busy={busy}
              onSubmit={async (args) => {
                await handleAddBox({ ...args, editBox: addBoxCtx.editBox });
                setStage("front");
                setAddBoxCtx(null);
              }}
              onCancel={() => {
                setStage("front");
                setAddBoxCtx(null);
              }}
            />
          ) : (
            <>
              <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                {/* 헤더 스트립 — 뒤로 + 경로 */}
                <div
                  style={{
                    flexShrink: 0,
                    height: 52,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "0 16px",
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  <button
                    onClick={backToFloor}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 14,
                      background: LEGACY_COLORS.s2,
                      border: `1px solid ${LEGACY_COLORS.border}`,
                      color: LEGACY_COLORS.text,
                      fontSize: 13,
                      display: stage === "floor" ? "none" : "flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: "pointer",
                    }}
                  >
                    <ChevronLeft size={14} /> 뒤로
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, minWidth: 0, overflow: "hidden" }}>
                    {stage === "floor" ? (
                      <span style={{ color: LEGACY_COLORS.muted2 }}>앵글을 클릭해 정면도로 들어가세요.</span>
                    ) : (
                      <>
                        <span onClick={backToFloor} style={crumbStyle}>창고</span>
                        <span style={{ color: LEGACY_COLORS.muted }}>›</span>
                        <span style={{ color: LEGACY_COLORS.text, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {curAngle?.label}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* stage 본문 */}
                <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                  {loading ? (
                    <div style={{ flex: 1, padding: 24 }}>
                      <LoadingSkeleton variant="card" rows={6} />
                    </div>
                  ) : stage === "floor" ? (
                    <FloorStage angles={angles} onAngleClick={openAngle} />
                  ) : curAngle ? (
                    <FrontStage
                      angle={curAngle}
                      cellIndex={cellIndex}
                      showSlotLabels
                      onCellClick={(row, layer) => setPanel({ row, layer })}
                    />
                  ) : null}
                </div>
              </div>

              {/* 재고 대조 — 지도 카드 하단 */}
              {reconcile.length > 0 && (
                <div
                  className="flex-shrink-0 rounded-[18px] border p-3"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="mb-2 text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                    재고 대조
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reconcile.map((r) => {
                      const isOver = r.status === "over";
                      const isOk = r.status === "ok";
                      return (
                        <div
                          key={r.item_id}
                          className="rounded-[12px] border px-3 py-2 text-[12px]"
                          style={{
                            background: isOver ? LEGACY_COLORS.warningBg : isOk ? LEGACY_COLORS.successBg : LEGACY_COLORS.s2,
                            borderColor: `color-mix(in srgb, ${isOver ? LEGACY_COLORS.yellow : isOk ? LEGACY_COLORS.green : LEGACY_COLORS.muted2} 30%, transparent)`,
                            color: isOver ? LEGACY_COLORS.yellow : isOk ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
                          }}
                        >
                          <div className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                            {r.item_name}
                          </div>
                          배치 합 {r.placed_total} / 창고 재고 {r.warehouse_qty}
                          {isOver
                            ? ` · ${r.diff}개 초과 배치됨`
                            : isOk
                            ? " · 일치"
                            : ` · ${Math.abs(r.diff)}개 미배치`}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 우: 칸 상세 슬라이드 패널 */}
        <SlidePanel open={!!panel} onClose={() => setPanel(null)}>
          {panel && curAngle && (
            <WarehouseJariPanel
              editable
              angle={curAngle}
              row={panel.row}
              layer={panel.layer}
              cellIndex={cellIndex}
              busy={busy}
              onDeleteBox={handleDeleteBox}
              onRequestAddBox={
                stage !== "add-box"
                  ? (ji, rem) => {
                      setAddBoxCtx({ jariIndex: ji, remaining: rem });
                      setStage("add-box");
                    }
                  : undefined
              }
              onRequestEditBox={
                stage !== "add-box"
                  ? (box) => {
                      setAddBoxCtx({ jariIndex: box.jari_index, remaining: 0, editBox: box });
                      setStage("add-box");
                    }
                  : undefined
              }
            />
          )}
        </SlidePanel>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// AddBox 서브스크린 — 박스 크기 + 품목 선택 전체 화면
// ──────────────────────────────────────────────

const SIZE_OPTS: { value: BoxSize; label: string; unit: number }[] = [
  { value: "SMALL",  label: "소 (1)", unit: 1 },
  { value: "MEDIUM", label: "중 (2)", unit: 2 },
  { value: "LARGE",  label: "대 (3)", unit: 3 },
];

function AddBoxScreen({
  angle,
  row,
  layer,
  jariIndex,
  remaining,
  editBox,
  items,
  busy,
  onSubmit,
  onCancel,
}: {
  angle: WarehouseAngle;
  row: number;
  layer: number;
  jariIndex: number;
  remaining: number;
  editBox?: WarehouseBox;
  items: Item[];
  busy: boolean;
  onSubmit: (args: { jariIndex: number; size: BoxSize; lines: { item_id: string; quantity: number }[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = !!editBox;
  const [size, setSize] = useState<BoxSize>(editBox ? editBox.size : remaining >= 2 ? "MEDIUM" : "SMALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Map<string, number>>(
    () => new Map(editBox ? editBox.items.map((it) => [it.item_id, it.quantity]) : []),
  );
  const [reconcileCache, setReconcileCache] = useState<Map<string, ReconcileRow>>(new Map());
  const [reconcileLoading, setReconcileLoading] = useState<Set<string>>(new Set());

  // 편집 모드: 미리 채워진 품목들의 "여유 재고"를 mount 시 한 번에 조회.
  useEffect(() => {
    if (!editBox) return;
    editBox.items.forEach((it) => {
      warehouseMapApi
        .reconcile(it.item_id)
        .then((r) => {
          if (r.rows.length > 0) setReconcileCache((prev) => new Map(prev).set(it.item_id, r.rows[0]));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 편집 모드는 박스 크기를 바꾸지 않으므로 용량 초과 개념이 없다.
  const overflow = isEdit ? false : (SIZE_UNIT[size] ?? 1) > remaining;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q
      ? items.filter((it) => it.item_name.toLowerCase().includes(q) || (it.mes_code ?? "").toLowerCase().includes(q))
      : items;
  }, [items, search]);

  function toggleItem(it: Item) {
    const willAdd = !cart.has(it.item_id);
    setCart((prev) => {
      const next = new Map(prev);
      if (next.has(it.item_id)) next.delete(it.item_id);
      else next.set(it.item_id, 1);
      return next;
    });
    if (willAdd && !reconcileCache.has(it.item_id) && !reconcileLoading.has(it.item_id)) {
      setReconcileLoading((prev) => new Set(prev).add(it.item_id));
      warehouseMapApi
        .reconcile(it.item_id)
        .then((r) => {
          if (r.rows.length > 0) {
            setReconcileCache((prev) => new Map(prev).set(it.item_id, r.rows[0]));
          }
        })
        .catch(() => {})
        .finally(() => {
          setReconcileLoading((prev) => {
            const s = new Set(prev);
            s.delete(it.item_id);
            return s;
          });
        });
    }
  }

  function getAvailable(itemId: string): number | null {
    const rc = reconcileCache.get(itemId);
    if (!rc) return null;
    // 편집 모드: placed_total에 이 박스의 현재 수량이 포함돼 있으므로 빼줘야
    // 실제 "이 박스를 제외한 배치 합"이 된다.
    const thisBoxQty = isEdit ? (editBox!.items.find((it) => it.item_id === itemId)?.quantity ?? 0) : 0;
    return rc.warehouse_qty - rc.placed_total + thisBoxQty;
  }

  function itemWouldExceed(itemId: string): boolean {
    const avail = getAvailable(itemId);
    if (avail === null) return false;
    return (cart.get(itemId) ?? 0) > avail;
  }

  const anyExceeds = Array.from(cart.keys()).some((id) => itemWouldExceed(id));
  const exceedingItems = Array.from(cart.entries())
    .filter(([id]) => itemWouldExceed(id))
    .map(([id, qty]) => {
      const name = items.find((it) => it.item_id === id)?.item_name ?? id;
      const avail = getAvailable(id) ?? 0;
      return { name, qty, avail };
    });

  async function submit() {
    const lines = Array.from(cart.entries())
      .filter(([, qty]) => qty > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }));
    if (!lines.length || overflow) return;
    try {
      await onSubmit({ jariIndex, size, lines });
    } catch {
      /* 부모가 onError로 표시 — 화면 유지 */
    }
  }

  const cartCount = cart.size;
  const cartTotal = Array.from(cart.values()).reduce((s, q) => s + q, 0);

  const inputBase = {
    background: LEGACY_COLORS.s2,
    border: `1px solid ${LEGACY_COLORS.border}`,
    color: LEGACY_COLORS.text,
  } as const;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {/* 헤더 */}
      <div
        style={{
          flexShrink: 0,
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          borderBottom: `1px solid ${LEGACY_COLORS.border}`,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 14,
            background: LEGACY_COLORS.s2,
            border: `1px solid ${LEGACY_COLORS.border}`,
            color: LEGACY_COLORS.text,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={14} /> 뒤로
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, minWidth: 0, overflow: "hidden" }}>
          <span style={{ color: LEGACY_COLORS.muted2, whiteSpace: "nowrap" }}>{angle.label}</span>
          <span style={{ color: LEGACY_COLORS.muted }}>›</span>
          <span style={{ color: LEGACY_COLORS.muted2, whiteSpace: "nowrap" }}>{rowLabel(row)}열 {layer}층</span>
          <span style={{ color: LEGACY_COLORS.muted }}>›</span>
          <span style={{ color: LEGACY_COLORS.text, fontWeight: 600, whiteSpace: "nowrap" }}>
            자리 {jariIndex + 1} — {isEdit ? "박스 편집" : "박스 넣기"}
          </span>
        </div>
      </div>

      {/* 크기 선택 */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: `1px solid ${LEGACY_COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: LEGACY_COLORS.muted2 }}>크기</span>
        {isEdit ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: LEGACY_COLORS.text }}>
            {SIZE_LABEL[size]}형 박스
          </span>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              {SIZE_OPTS.map((o) => {
                const disabled = o.unit > remaining;
                const active = size === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => !disabled && setSize(o.value)}
                    disabled={disabled}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 9999,
                      fontSize: 12,
                      fontWeight: 700,
                      background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                      color: active ? "white" : disabled ? LEGACY_COLORS.muted : LEGACY_COLORS.text,
                      border: `1px solid ${active ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.45 : 1,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <span style={{ marginLeft: "auto", fontSize: 12, color: LEGACY_COLORS.muted2 }}>
              남은 자리{" "}
              <strong style={{ color: overflow ? LEGACY_COLORS.yellow : LEGACY_COLORS.text }}>{remaining}</strong>
            </span>
          </>
        )}
      </div>

      {/* 검색 */}
      <div style={{ flexShrink: 0, padding: "10px 16px", borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
        <div
          style={{
            ...inputBase,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 10,
          }}
        >
          <Search size={14} style={{ color: LEGACY_COLORS.muted2, flexShrink: 0 }} />
          <input
            style={{ flex: 1, minWidth: 0, background: "transparent", outline: "none", fontSize: 13, color: LEGACY_COLORS.text }}
            placeholder="품목명 또는 코드로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 품목 리스트 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: LEGACY_COLORS.muted }}>
            검색 결과 없음
          </div>
        ) : (
          filtered.map((it) => {
            const selected = cart.has(it.item_id);
            const qty = cart.get(it.item_id) ?? 0;
            return (
              <div
                key={it.item_id}
                onClick={() => toggleItem(it)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  background: selected
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, ${LEGACY_COLORS.s1})`
                    : LEGACY_COLORS.s1,
                  cursor: "pointer",
                }}
              >
                {/* 체크박스 */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    flexShrink: 0,
                    background: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                    border: `1.5px solid ${selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected && <Check size={12} style={{ color: "white" }} />}
                </div>

                {/* 품목 정보 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? 600 : 400,
                      color: LEGACY_COLORS.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.item_name}
                  </div>
                  {it.mes_code && (
                    <div style={{ fontSize: 11, color: LEGACY_COLORS.muted2, marginTop: 1 }}>{it.mes_code}</div>
                  )}
                </div>

                {/* 수량 + 여유 재고 (선택 시만) */}
                {selected && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <input
                      type="number"
                      min={0}
                      value={qty}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value));
                        setCart((prev) => {
                          const next = new Map(prev);
                          next.set(it.item_id, v);
                          return next;
                        });
                      }}
                      style={{
                        ...inputBase,
                        width: 60,
                        textAlign: "center" as const,
                        padding: "3px 6px",
                        fontSize: 13,
                        borderRadius: 8,
                      }}
                    />
                    {(() => {
                      const avail = getAvailable(it.item_id);
                      const exceeds = itemWouldExceed(it.item_id);
                      if (reconcileLoading.has(it.item_id))
                        return <span style={{ fontSize: 10, color: LEGACY_COLORS.muted2 }}>확인 중…</span>;
                      if (avail !== null)
                        return (
                          <span style={{ fontSize: 10, whiteSpace: "nowrap", color: exceeds ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2 }}>
                            여유 {Math.max(0, avail)}개{exceeds ? " ⚠" : ""}
                          </span>
                        );
                      return null;
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 하단 고정 */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 16px",
          borderTop: `1px solid ${LEGACY_COLORS.border}`,
          background: LEGACY_COLORS.s2,
        }}
      >
        {anyExceeds && (
          <div style={{ fontSize: 12, color: LEGACY_COLORS.yellow }}>
            창고 재고를 초과하는 품목이 있습니다:
            {exceedingItems.map((it) => (
              <div key={it.name} style={{ marginTop: 2, paddingLeft: 8 }}>
                · {it.name} — 입력 {it.qty}개, 여유 {Math.max(0, it.avail)}개
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 13, color: LEGACY_COLORS.muted2 }}>
            {cartCount > 0 ? `${cartCount}개 품목 · 합계 수량 ${cartTotal}` : "품목을 선택하세요"}
          </span>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || overflow || cartCount === 0 || anyExceeds}>
            {isEdit ? "저장" : "배치"}
          </Button>
        </div>
      </div>
    </div>
  );
}
