"use client";

import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { Item } from "@/lib/api";
import { Button } from "@/lib/ui/Button";
import { AdminPageHeader } from "./_admin_primitives";
import {
  warehouseMapApi,
  type BoxSize,
  type ReconcileRow,
  type WarehouseAngle,
  type WarehouseBox,
} from "@/lib/api/warehouse-map";

const SIZE_OPTIONS: { value: BoxSize; label: string; unit: number }[] = [
  { value: "LARGE", label: "대 (높이 3)", unit: 3 },
  { value: "MEDIUM", label: "중 (높이 2)", unit: 2 },
  { value: "SMALL", label: "소 (높이 1)", unit: 1 },
];

interface Props {
  items: Item[];
  onStatusChange: (s: string) => void;
  onError: (m: string) => void;
}

export function AdminWarehousePlacementSection({ items, onStatusChange, onError }: Props) {
  const [angles, setAngles] = useState<WarehouseAngle[]>([]);
  const [angleId, setAngleId] = useState<number | null>(null);
  const [row, setRow] = useState(1);
  const [layer, setLayer] = useState(1);
  const [jari, setJari] = useState(0);
  const [size, setSize] = useState<BoxSize>("MEDIUM");
  const [lines, setLines] = useState<{ item_id: string; quantity: number }[]>([]);
  const [search, setSearch] = useState("");
  const [stack, setStack] = useState<WarehouseBox[]>([]);
  const [reconcile, setReconcile] = useState<ReconcileRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    warehouseMapApi
      .getStructure()
      .then((s) => {
        setAngles(s);
        if (s.length && angleId == null) setAngleId(s[0].id);
      })
      .catch((e) => onError(e instanceof Error ? e.message : "구조 로드 실패"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const angle = useMemo(() => angles.find((a) => a.id === angleId) ?? null, [angles, angleId]);

  // 현재 자리 스택 조회
  useEffect(() => {
    if (angleId == null) return;
    warehouseMapApi.getJari(angleId, row, layer, jari).then(setStack).catch(() => setStack([]));
  }, [angleId, row, layer, jari, saving]);

  const usedUnits = stack.reduce(
    (s, b) => s + (SIZE_OPTIONS.find((o) => o.value === b.size)?.unit ?? 1),
    0,
  );
  const remaining = 3 - usedUnits;
  const newUnit = SIZE_OPTIONS.find((o) => o.value === size)?.unit ?? 1;
  const overflow = newUnit > remaining;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((it) => it.item_name.toLowerCase().includes(q) || (it.mes_code || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [items, search]);

  const itemName = (id: string) => items.find((i) => i.item_id === id)?.item_name ?? id;

  function addLine(it: Item) {
    if (lines.some((l) => l.item_id === it.item_id)) return;
    setLines((p) => [...p, { item_id: it.item_id, quantity: 1 }]);
    setSearch("");
  }

  async function submit() {
    if (angleId == null || !lines.length) return;
    setSaving(true);
    try {
      await warehouseMapApi.createBox({
        angle_id: angleId,
        row_no: row,
        layer_no: layer,
        jari_index: jari,
        size,
        items: lines,
      });
      onStatusChange("박스를 배치했습니다.");
      // 재고 대조
      const rc = await Promise.all(lines.map((l) => warehouseMapApi.reconcile(l.item_id)));
      setReconcile(rc.flatMap((r) => r.rows));
      setLines([]);
    } catch (e) {
      onError(e instanceof Error ? e.message : "배치 실패");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: LEGACY_COLORS.s2,
    border: `1px solid ${LEGACY_COLORS.border}`,
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 13,
    color: LEGACY_COLORS.text,
  } as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <AdminPageHeader
        icon={PackagePlus}
        title="위치 배정"
        description="품목을 골라 창고 자리(앵글·줄·층·자리)에 박스로 배치합니다. 자리 합계와 창고 재고를 대조해 경고합니다."
      />

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.1fr 0.9fr" }}>
        {/* 입력 폼 */}
        <div
          className="flex flex-col gap-3 rounded-[18px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {/* 자리 선택 */}
          <div className="grid grid-cols-4 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              앵글
              <select style={inputStyle} value={angleId ?? ""} onChange={(e) => setAngleId(Number(e.target.value))}>
                {angles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              줄 (1~{angle?.rows ?? 1})
              <input type="number" min={1} max={angle?.rows ?? 1} style={inputStyle} value={row} onChange={(e) => setRow(Math.max(1, Number(e.target.value)))} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              층 (1~{angle?.layers ?? 1})
              <input type="number" min={1} max={angle?.layers ?? 1} style={inputStyle} value={layer} onChange={(e) => setLayer(Math.max(1, Number(e.target.value)))} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              자리 (1~{angle?.jaris_per_cell ?? 3})
              <select style={inputStyle} value={jari} onChange={(e) => setJari(Number(e.target.value))}>
                {Array.from({ length: angle?.jaris_per_cell ?? 3 }, (_, i) => (
                  <option key={i} value={i}>
                    자리 {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 현재 자리 상태 */}
          <div
            className="rounded-[12px] border px-3 py-2 text-[12px]"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            현재 자리: 사용 {usedUnits}/3 · 남은 높이 {remaining}
            {stack.length > 0 && (
              <span style={{ color: LEGACY_COLORS.text }}>
                {" "}— {stack.map((b) => SIZE_OPTIONS.find((o) => o.value === b.size)?.label.split(" ")[0]).join(", ")} 박스
              </span>
            )}
          </div>

          {/* 박스 크기 */}
          <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            박스 크기
            <select style={inputStyle} value={size} onChange={(e) => setSize(e.target.value as BoxSize)}>
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={o.unit > remaining}>
                  {o.label}
                  {o.unit > remaining ? " — 자리 부족" : ""}
                </option>
              ))}
            </select>
          </label>

          {/* 품목 검색 */}
          <div className="relative">
            <div className="flex items-center gap-2" style={inputStyle}>
              <Search size={14} style={{ color: LEGACY_COLORS.blue }} />
              <input
                className="flex-1 bg-transparent outline-none"
                style={{ color: LEGACY_COLORS.text, fontSize: 13 }}
                placeholder="박스에 담을 품목 검색 (품목명·코드)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {filteredItems.length > 0 && (
              <div
                className="absolute z-10 mt-1 w-full overflow-hidden rounded-[12px] border"
                style={{ background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-popup-shadow)" }}
              >
                {filteredItems.map((it) => (
                  <div
                    key={it.item_id}
                    onClick={() => addLine(it)}
                    className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] hover:brightness-110"
                    style={{ color: LEGACY_COLORS.text, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                  >
                    <span className="truncate">{it.item_name}</span>
                    <span style={{ color: LEGACY_COLORS.muted2 }}>{it.mes_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 담긴 품목 라인 */}
          <div className="flex flex-col gap-1.5">
            {lines.length === 0 ? (
              <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
                위에서 품목을 검색해 박스에 담으세요.
              </div>
            ) : (
              lines.map((l, i) => (
                <div key={l.item_id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[12px]" style={{ color: LEGACY_COLORS.text }}>
                    {itemName(l.item_id)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={l.quantity}
                    onChange={(e) =>
                      setLines((p) => p.map((x, xi) => (xi === i ? { ...x, quantity: Math.max(0, Number(e.target.value)) } : x)))
                    }
                    style={{ ...inputStyle, width: 80 }}
                  />
                  <button onClick={() => setLines((p) => p.filter((_, xi) => xi !== i))} style={{ color: LEGACY_COLORS.muted2 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <Button onClick={submit} disabled={saving || overflow || !lines.length} className="mt-1">
            <Plus size={14} /> {overflow ? "자리 높이 초과" : "이 자리에 박스 배치"}
          </Button>
        </div>

        {/* 재고 대조 결과 */}
        <div
          className="flex flex-col gap-2 rounded-[18px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
            재고 대조
          </div>
          {reconcile.length === 0 ? (
            <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
              배치 후 품목별 배치 합계와 창고 재고를 비교합니다.
            </div>
          ) : (
            reconcile.map((r) => {
              const warn = r.status !== "ok";
              return (
                <div
                  key={r.item_id}
                  className="rounded-[12px] border px-3 py-2 text-[12px]"
                  style={{
                    background: warn ? LEGACY_COLORS.warningBg : LEGACY_COLORS.successBg,
                    borderColor: `color-mix(in srgb, ${warn ? LEGACY_COLORS.yellow : LEGACY_COLORS.green} 30%, transparent)`,
                    color: warn ? LEGACY_COLORS.yellow : LEGACY_COLORS.green,
                  }}
                >
                  <div className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {r.item_name}
                  </div>
                  배치 합 {r.placed_total} / 창고 재고 {r.warehouse_qty}
                  {warn ? ` · 차이 ${r.diff > 0 ? "+" : ""}${r.diff} (${r.status === "over" ? "초과" : "부족"})` : " · 일치"}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
