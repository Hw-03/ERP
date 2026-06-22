"use client";

/**
 * 창고 지도 탭 — 보기(전 직원) + 편집(창고 정/부 관리자 전용).
 *
 * 일반 직원: 읽기 전용 지도(DesktopWarehouseMapView)만.
 * 창고 정/부 관리자(warehouse_role primary/deputy): "편집 모드" 토글 → 본인 PIN 확인 →
 *   구조 편집 / 위치 배정 편집기 노출. 편집 쓰기는 X-Employee-Code + X-Operator-Pin 으로
 *   백엔드 require_warehouse_manager 가 검증(api-core operator 자격증명 주입).
 *
 * 편집기 본체(AdminWarehouseStructureSection / AdminWarehousePlacementSection)는
 * 기존 관리자 탭 컴포넌트를 그대로 재사용한다(관리자 탭에서는 제거됨).
 */

import { useEffect, useRef, useState } from "react";
import { Eye, Pencil, ShieldCheck } from "lucide-react";
import type { Item } from "@/lib/api";
import { employeesApi } from "@/lib/api/employees";
import { itemsApi } from "@/lib/api/items";
import { registerOperatorCredsProvider } from "@/lib/api-core";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useCurrentOperator } from "./login/useCurrentOperator";
import { DesktopWarehouseMapView } from "./DesktopWarehouseMapView";
import { AdminWarehouseStructureSection } from "./_admin_sections/AdminWarehouseStructureSection";
import { AdminWarehousePlacementSection } from "./_admin_sections/AdminWarehousePlacementSection";

const EDITOR_TABS = [
  { id: "map" as const, label: "지도 이동" },
  { id: "placement" as const, label: "위치 배정" },
  { id: "structure" as const, label: "구조 편집" },
];

export function DesktopWarehouseMapTab({
  onStatusChange,
}: {
  onStatusChange?: (msg: string) => void;
}) {
  const operator = useCurrentOperator();
  const isManager =
    operator?.warehouse_role === "primary" || operator?.warehouse_role === "deputy";

  const [editMode, setEditMode] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [editorTab, setEditorTab] = useState<"map" | "placement" | "structure">("map");
  const [editorError, setEditorError] = useState<string | null>(null);

  // operator 자격증명을 ref 로 보관하고 provider 는 ref 를 읽게 해 stale 클로저 방지.
  const credsRef = useRef<{ code: string; pin: string } | null>(null);
  useEffect(() => {
    registerOperatorCredsProvider(() => credsRef.current);
    return () => {
      credsRef.current = null;
      registerOperatorCredsProvider(() => null);
    };
  }, []);

  async function confirmPin() {
    if (!operator || !pin) return;
    setVerifying(true);
    setPinError(null);
    try {
      await employeesApi.verifyEmployeePin(operator.employee_id, pin);
      credsRef.current = { code: operator.employee_code, pin };
      const list = await itemsApi.getItems({});
      setItems(list);
      setEditMode(true);
      setPinOpen(false);
      setPin("");
      onStatusChange?.("창고 지도 편집 모드");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "PIN 확인에 실패했습니다.");
    } finally {
      setVerifying(false);
    }
  }

  function exitEditMode() {
    credsRef.current = null;
    setEditMode(false);
    setEditorError(null);
    onStatusChange?.("창고 지도");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {isManager && (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[16px] border px-4 py-2.5"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            boxShadow: "var(--c-card-shadow)",
          }}
        >
          <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            <ShieldCheck className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
            창고 {operator?.warehouse_role === "primary" ? "관리자" : "부관리자"} · {operator?.name}
          </div>

          {editMode ? (
            <button
              type="button"
              onClick={exitEditMode}
              className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[13px] font-bold transition-colors hover:brightness-[1.04]"
              style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
            >
              <Eye className="h-4 w-4" />
              보기 모드로
            </button>
          ) : pinOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmPin();
                  if (e.key === "Escape") {
                    setPinOpen(false);
                    setPin("");
                    setPinError(null);
                  }
                }}
                placeholder="본인 PIN"
                className="w-28 rounded-[10px] border px-3 py-1.5 text-[13px] font-bold outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
              <button
                type="button"
                onClick={() => void confirmPin()}
                disabled={verifying || !pin}
                className="rounded-[12px] px-3 py-2 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: LEGACY_COLORS.blue }}
              >
                {verifying ? "확인 중…" : "편집 시작"}
              </button>
              {pinError && (
                <span className="text-[12px] font-bold" style={{ color: LEGACY_COLORS.red }}>
                  {pinError}
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPinOpen(true);
                setPinError(null);
              }}
              className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[13px] font-bold text-white transition-colors hover:brightness-[1.04]"
              style={{ background: LEGACY_COLORS.blue }}
            >
              <Pencil className="h-4 w-4" />
              편집 모드
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {editMode ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="mb-3 flex shrink-0 gap-1 border-b pb-1"
              style={{ borderColor: LEGACY_COLORS.border }}
            >
              {EDITOR_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditorTab(t.id)}
                  className="rounded-[10px] px-3 py-1.5 text-[13px] font-bold transition-colors"
                  style={
                    editorTab === t.id
                      ? { background: LEGACY_COLORS.blue, color: "#fff" }
                      : { background: "transparent", color: LEGACY_COLORS.muted2 }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            {editorError && (
              <div
                className="mb-3 shrink-0 rounded-[12px] border px-4 py-2.5 text-[13px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
                  color: LEGACY_COLORS.red,
                }}
              >
                {editorError}
              </div>
            )}
            {editorTab === "map" && (
              <div
                className="mb-2 shrink-0 text-[12px] font-bold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                줄 확대 화면에서 박스를 드래그해 같은 줄의 다른 자리로 옮길 수 있어요. 추가·삭제는 “위치 배정”에서.
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              {editorTab === "map" ? (
                <DesktopWarehouseMapView editable onStatusChange={onStatusChange} />
              ) : editorTab === "structure" ? (
                <AdminWarehouseStructureSection
                  onStatusChange={onStatusChange ?? (() => {})}
                  onError={setEditorError}
                />
              ) : (
                <AdminWarehousePlacementSection
                  items={items}
                  onStatusChange={onStatusChange ?? (() => {})}
                  onError={setEditorError}
                />
              )}
            </div>
          </div>
        ) : (
          <DesktopWarehouseMapView onStatusChange={onStatusChange} />
        )}
      </div>
    </div>
  );
}
