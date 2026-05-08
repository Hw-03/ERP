"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { BomDeptTabs } from "./BomDeptTabs";
import { BomStatsRow } from "./BomStatsRow";
import { BomParentList } from "./BomParentList";
import { BomEditPanel } from "./BomEditPanel";
import { BomWhereUsedPanel } from "./BomWhereUsedPanel";
import { BomUnmatchedRawsDrawer } from "./BomUnmatchedRawsDrawer";
import { stageOf, type DeptLetter } from "./bomDept";

/**
 * 관리자 BOM 페이지 — bom_setup.html UX 본떠 부서탭 + split view 로 전면 개편.
 *
 * 모드:
 *   - edit (기본): 좌측에 R 단계 제외한 부모 후보, 우측에 BOM 그리드 + 자식 추가 박스
 *   - whereused: 좌측에 모든 품목, 우측에 "이 품목이 어느 부모의 자식인지" 결과
 *
 * 즉시 서버 저장. 드래프트/대기 상태 없음.
 */
interface Props {
  items: Item[];
  allBomRows: BOMDetailEntry[];
  refreshAllBom: () => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

type Mode = "edit" | "whereused";
type AddRequest = { childId: string; childName: string };
type DeleteRequest = { bomId: string; childName: string };

export function BomWorkbench({
  items,
  allBomRows,
  refreshAllBom,
  onStatusChange,
  onError,
}: Props) {
  const [dept, setDept] = useState<DeptLetter>("A"); // 조립이 가장 활용도 높음
  const [parentId, setParentId] = useState("");
  const [mode, setMode] = useState<Mode>("edit");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [whereUsedRows, setWhereUsedRows] = useState<BOMDetailEntry[]>([]);
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  const [addQty, setAddQty] = useState("1");
  const [addBusy, setAddBusy] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // 선택된 부모의 BOM 직계 자식
  useEffect(() => {
    if (!parentId) {
      setBomRows([]);
      return;
    }
    let alive = true;
    api
      .getBOM(parentId)
      .then((rows) => alive && setBomRows(rows))
      .catch(() => alive && setBomRows([]));
    return () => {
      alive = false;
    };
  }, [parentId]);

  // 선택된 품목의 역참조
  useEffect(() => {
    if (!parentId) {
      setWhereUsedRows([]);
      return;
    }
    let alive = true;
    api
      .getBOMWhereUsed(parentId)
      .then((rows) => alive && setWhereUsedRows(rows))
      .catch(() => alive && setWhereUsedRows([]));
    return () => {
      alive = false;
    };
  }, [parentId]);

  // 부서 변경 시 선택 초기화
  function handleDeptChange(next: DeptLetter) {
    setDept(next);
    setParentId("");
  }

  const parent = useMemo(() => items.find((i) => i.item_id === parentId) ?? null, [items, parentId]);

  // 통계 — 현재 부서 + 모드 기준의 부모 후보
  const stats = useMemo(() => {
    const pool = items.filter((i) => {
      if (i.process_type_code?.[0] !== dept) return false;
      if (mode === "edit") return stageOf(i.process_type_code) !== "R";
      return true;
    });
    const matchedParentIds = new Set(allBomRows.map((r) => r.parent_item_id));
    const matched = pool.filter((i) => matchedParentIds.has(i.item_id)).length;
    return {
      total: pool.length,
      matched,
      unmatched: pool.length - matched,
    };
  }, [items, allBomRows, dept, mode]);

  // 미배치 원자재 — 부서 R 단계 ∩ 어떤 BOM 의 자식도 아닌 것
  const rawItems = useMemo(
    () => items.filter((i) => i.process_type_code?.[0] === dept && stageOf(i.process_type_code) === "R"),
    [items, dept],
  );
  const childIdSet = useMemo(() => new Set(allBomRows.map((r) => r.child_item_id)), [allBomRows]);

  // 액션
  async function handleAddConfirm() {
    if (!addRequest || !parent) return;
    const qty = parseFloat(addQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      onError("수량은 0보다 커야 합니다.");
      return;
    }
    setAddBusy(true);
    try {
      const created = await api.createBOM({
        parent_item_id: parent.item_id,
        child_item_id: addRequest.childId,
        quantity: qty,
        unit: "EA",
      });
      setBomRows((cur) => [...cur, created]);
      refreshAllBom();
      onStatusChange(`"${addRequest.childName}" 을(를) 추가했습니다.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setAddBusy(false);
      setAddRequest(null);
      setAddQty("1");
    }
  }

  async function handleSaveQty(bomId: string, qty: number) {
    try {
      const updated = await api.updateBOM(bomId, { quantity: qty });
      setBomRows((cur) => cur.map((r) => (r.bom_id === updated.bom_id ? updated : r)));
      refreshAllBom();
      onStatusChange("수량을 변경했습니다.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "수량 변경 실패");
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteRequest) return;
    setDeleteBusy(true);
    try {
      await api.deleteBOM(deleteRequest.bomId);
      setBomRows((cur) => cur.filter((r) => r.bom_id !== deleteRequest.bomId));
      refreshAllBom();
      onStatusChange(`"${deleteRequest.childName}" 을(를) 삭제했습니다.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeleteBusy(false);
      setDeleteRequest(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 상단: 부서탭 + 모드 토글 */}
      <div className="flex items-center justify-between gap-3">
        <BomDeptTabs value={dept} onChange={handleDeptChange} />
        <div className="flex items-center gap-1 rounded-full border p-1" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold transition-colors"
            style={{
              background: mode === "edit" ? LEGACY_COLORS.blue : "transparent",
              color: mode === "edit" ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
            }}
          >
            <Pencil size={13} /> 편집
          </button>
          <button
            type="button"
            onClick={() => setMode("whereused")}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold transition-colors"
            style={{
              background: mode === "whereused" ? LEGACY_COLORS.blue : "transparent",
              color: mode === "whereused" ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
            }}
          >
            <ArrowRightLeft size={13} /> 사용처
          </button>
        </div>
      </div>

      {/* 메인 영역 */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* 좌측 (35%) */}
        <div className="flex w-[35%] min-w-[320px] flex-col gap-2">
          <BomStatsRow total={stats.total} matched={stats.matched} unmatched={stats.unmatched} />
          <BomParentList
            dept={dept}
            items={items}
            allBomRows={allBomRows}
            selectedId={parentId}
            onSelect={setParentId}
            mode={mode}
          />
        </div>

        {/* 우측 (나머지) */}
        <div className="flex min-h-0 flex-1 flex-col">
          {mode === "edit" ? (
            <BomEditPanel
              parent={parent}
              bomRows={bomRows}
              items={items}
              onSaveQty={handleSaveQty}
              onRequestDelete={(row, childName) =>
                setDeleteRequest({ bomId: row.bom_id, childName })
              }
              onPickChild={(childId, childName) => {
                setAddRequest({ childId, childName });
                setAddQty("1");
              }}
            />
          ) : (
            <BomWhereUsedPanel
              selected={parent}
              rows={whereUsedRows}
              items={items}
              onSelectParent={(id) => {
                setMode("edit");
                setParentId(id);
              }}
            />
          )}
        </div>
      </div>

      {/* 하단: 미배치 원자재 (편집 모드에서만) */}
      {mode === "edit" && <BomUnmatchedRawsDrawer rawItems={rawItems} childIdSet={childIdSet} />}

      {/* 추가 확인 모달 */}
      <ConfirmModal
        open={addRequest !== null}
        title="BOM 자식 품목 추가"
        tone="normal"
        onClose={() => {
          setAddRequest(null);
          setAddQty("1");
        }}
        onConfirm={handleAddConfirm}
        busy={addBusy}
        confirmLabel="추가"
      >
        {addRequest && parent && (
          <div className="flex flex-col gap-3">
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted }}>
              <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                {parent.item_name}
              </span>
              <span> 의 자식으로 </span>
              <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                {addRequest.childName}
              </span>
              <span> 을(를) 추가합니다.</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span style={{ color: LEGACY_COLORS.muted }}>수량</span>
              <input
                type="number"
                min="0"
                step="any"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                autoFocus
                className="flex-1 rounded-md border px-3 py-1.5 text-right font-semibold outline-none"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
              <span style={{ color: LEGACY_COLORS.muted2 }}>EA</span>
            </label>
          </div>
        )}
      </ConfirmModal>

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        open={deleteRequest !== null}
        title="BOM 자식 품목 삭제"
        tone="danger"
        onClose={() => setDeleteRequest(null)}
        onConfirm={handleDeleteConfirm}
        busy={deleteBusy}
        confirmLabel="삭제"
      >
        {deleteRequest && (
          <div className="text-sm" style={{ color: LEGACY_COLORS.muted }}>
            <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
              {deleteRequest.childName}
            </span>
            <span> 을(를) 이 BOM 에서 제거합니다.</span>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
