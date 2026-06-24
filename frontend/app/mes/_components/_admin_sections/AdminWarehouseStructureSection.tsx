"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { AdminPageHeader } from "./_admin_primitives";
import { warehouseMapApi, type WarehouseAngle } from "@/lib/api/warehouse-map";

interface Props {
  onStatusChange: (s: string) => void;
  onError: (m: string) => void;
}

type DragSession = {
  id: number;
  mode: "move" | "resize";
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
};

// 평면도 배경 격자 한 칸 = 40px (FloorStage와 일치). 드래그 스냅은 10px 단위.
const GRID = 40;
const SNAP = 10;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

export function AdminWarehouseStructureSection({ onStatusChange, onError }: Props) {
  const [angles, setAngles] = useState<WarehouseAngle[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const anglesRef = useRef<WarehouseAngle[]>([]);
  const dragRef = useRef<DragSession | null>(null);
  const dirtyRef = useRef<Set<number>>(new Set());
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);

  anglesRef.current = angles;
  scaleRef.current = scale;

  const load = () =>
    warehouseMapApi
      .getStructure()
      .then(setAngles)
      .catch((e) => onError(e instanceof Error ? e.message : "구조 로드 실패"));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 드래그 이동 / 리사이즈 (mouseup 시 저장)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      // 캔버스가 scale 배율로 확대/축소되므로 화면 델타를 배율로 나눠 논리 좌표로 환산
      const dx = (e.clientX - d.sx) / scaleRef.current;
      const dy = (e.clientY - d.sy) / scaleRef.current;
      dirtyRef.current.add(d.id);
      setAngles((prev) =>
        prev.map((a) => {
          if (a.id !== d.id) return a;
          if (d.mode === "move")
            return { ...a, pos_x: Math.max(0, Math.round(d.ox + dx)), pos_y: Math.max(0, Math.round(d.oy + dy)) };
          return { ...a, width: Math.max(30, Math.round(d.ow + dx)), height: Math.max(20, Math.round(d.oh + dy)) };
        }),
      );
    }
    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && dirtyRef.current.has(d.id)) {
        dirtyRef.current.delete(d.id);
        const a = anglesRef.current.find((x) => x.id === d.id);
        if (a) {
          const snapped = {
            pos_x: Math.max(0, snap(a.pos_x)),
            pos_y: Math.max(0, snap(a.pos_y)),
            width: Math.max(GRID, snap(a.width)),
            height: Math.max(GRID, snap(a.height)),
          };
          setAngles((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...snapped } : x)));
          warehouseMapApi
            .updateAngle(a.id, snapped)
            .then(() => onStatusChange("앵글 배치를 저장했습니다."))
            .catch((e) => onError(e instanceof Error ? e.message : "저장 실패"));
        }
      }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 캔버스(880×300 논리 좌표)를 카드 크기에 맞춰 확대/축소 — 표시만 scale, 좌표계는 유지
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const fit = () => {
      const aw = el.clientWidth - 32;
      const ah = el.clientHeight - 32;
      if (aw > 0 && ah > 0) setScale(Math.min(aw / 880, ah / 300));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selected = useMemo(() => angles.find((a) => a.id === selectedId) ?? null, [angles, selectedId]);

  function patchSelected(patch: Partial<WarehouseAngle>) {
    if (selectedId == null) return;
    setAngles((prev) => prev.map((a) => (a.id === selectedId ? { ...a, ...patch } : a)));
  }

  async function saveSelected() {
    if (!selected) return;
    try {
      await warehouseMapApi.updateAngle(selected.id, {
        label: selected.label,
        rows: selected.rows,
        layers: selected.layers,
        pos_x: selected.pos_x,
        pos_y: selected.pos_y,
        width: selected.width,
        height: selected.height,
      });
      onStatusChange(`${selected.label} 저장됨`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "저장 실패");
    }
  }

  async function addAngle() {
    try {
      const created = await warehouseMapApi.createAngle({
        label: `앵글 ${angles.length + 1}`,
        rows: 4,
        layers: 6,
        pos_x: 40,
        pos_y: 40,
        width: 80,
        height: 120,
      });
      await load();
      setSelectedId(created.id);
      onStatusChange("앵글을 추가했습니다.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "추가 실패");
    }
  }

  async function deleteAngle() {
    if (!selected) return;
    try {
      await warehouseMapApi.deleteAngle(selected.id);
      setSelectedId(null);
      await load();
      onStatusChange("앵글을 삭제했습니다.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "삭제 실패 (박스가 남아 있으면 먼저 비워주세요)");
    }
  }

  const inputStyle = {
    background: LEGACY_COLORS.s2,
    border: `1px solid ${LEGACY_COLORS.border}`,
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 13,
    color: LEGACY_COLORS.text,
    width: "100%",
  } as const;

  const gridMinor = `color-mix(in srgb, ${LEGACY_COLORS.muted2} 5%, transparent)`;
  const gridMajor = `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <AdminPageHeader
        icon={Warehouse}
        title="앵글 편집"
        description="앵글을 드래그해 위치를 옮기고, 우하단 모서리로 크기를 조절하세요. 손을 떼는 순간 자동 저장됩니다."
        actions={
          <Button variant="secondary" onClick={addAngle}>
            <Plus size={14} /> 앵글 추가
          </Button>
        }
      />

      <div className="flex items-start gap-4">
        {/* 평면도 편집 캔버스 — 880×300 논리 좌표를 카드 크기에 맞춰 scale 확대 */}
        <div
          className="rounded-[18px] border"
          style={{ borderColor: LEGACY_COLORS.border, overflow: "hidden", flex: 1, minWidth: 0, height: "60vh", minHeight: 460, display: "flex" }}
        >
          <div
            ref={stageWrapRef}
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: LEGACY_COLORS.s2,
              overflow: "hidden",
            }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
              <div
                style={{
                  position: "relative",
                  width: 880,
                  height: 300,
                  background: LEGACY_COLORS.s4,
                  border: `1px solid ${LEGACY_COLORS.borderStrong}`,
                  borderRadius: 18,
                  overflow: "hidden",
                  boxShadow: "inset 0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    backgroundImage: [
                      `linear-gradient(${gridMajor} 1px, transparent 1px)`,
                      `linear-gradient(90deg, ${gridMajor} 1px, transparent 1px)`,
                      `linear-gradient(${gridMinor} 1px, transparent 1px)`,
                      `linear-gradient(90deg, ${gridMinor} 1px, transparent 1px)`,
                    ].join(", "),
                    backgroundSize: `${GRID}px ${GRID}px, ${GRID}px ${GRID}px, ${SNAP}px ${SNAP}px, ${SNAP}px ${SNAP}px`,
                  }}
                />
                {angles.map((a) => {
              const sel = a.id === selectedId;
              return (
                <div
                  key={a.id}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).dataset.handle) return;
                    dragRef.current = { id: a.id, mode: "move", sx: e.clientX, sy: e.clientY, ox: a.pos_x, oy: a.pos_y, ow: a.width, oh: a.height };
                    setSelectedId(a.id);
                  }}
                  style={{
                    position: "absolute",
                    left: a.pos_x,
                    top: a.pos_y,
                    width: a.width,
                    height: a.height,
                    background: LEGACY_COLORS.s1,
                    border: `${sel ? 2 : 1}px solid ${sel ? LEGACY_COLORS.blue : LEGACY_COLORS.border}`,
                    borderRadius: 14,
                    boxShadow: "0 1px 3px rgba(45,70,106,0.10)",
                    cursor: "move",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    userSelect: "none",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: LEGACY_COLORS.text, pointerEvents: "none" }}>
                    {a.label}
                  </span>
                  <span style={{ fontSize: 9, color: LEGACY_COLORS.muted2, pointerEvents: "none" }}>
                    {a.rows}열·{a.layers}층
                  </span>
                  <div
                    data-handle="1"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      dragRef.current = { id: a.id, mode: "resize", sx: e.clientX, sy: e.clientY, ox: a.pos_x, oy: a.pos_y, ow: a.width, oh: a.height };
                      setSelectedId(a.id);
                    }}
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: 0,
                      width: 14,
                      height: 14,
                      cursor: "se-resize",
                      background: `linear-gradient(135deg, transparent 50%, ${sel ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2} 50%)`,
                      borderRadius: "0 0 14px 0",
                    }}
                  />
                </div>
              );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 선택 앵글 편집 */}
        <div
          className="flex w-[280px] shrink-0 flex-col gap-3 rounded-[18px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {!selected ? (
            <div className="text-[13px]" style={{ color: LEGACY_COLORS.muted }}>
              왼쪽 평면도에서 앵글을 클릭해 편집하세요.
            </div>
          ) : (
            <>
              <div className="text-[14px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                {selected.label} 편집
              </div>
              <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                이름
                <input style={inputStyle} value={selected.label} onChange={(e) => patchSelected({ label: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  열 수
                  <input type="number" min={1} style={inputStyle} value={selected.rows} onChange={(e) => patchSelected({ rows: Math.max(1, Number(e.target.value)) })} />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  층 수
                  <input type="number" min={1} style={inputStyle} value={selected.layers} onChange={(e) => patchSelected({ layers: Math.max(1, Number(e.target.value)) })} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  너비
                  <input type="number" style={inputStyle} value={selected.width} onChange={(e) => patchSelected({ width: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  높이
                  <input type="number" style={inputStyle} value={selected.height} onChange={(e) => patchSelected({ height: Number(e.target.value) })} />
                </label>
              </div>
              <Button onClick={saveSelected}>
                <Save size={14} /> 저장
              </Button>
              <Button variant="danger" onClick={deleteAngle}>
                <Trash2 size={14} /> 앵글 삭제
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
