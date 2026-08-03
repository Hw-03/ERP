"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Network, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { AdminPageHeader } from "../_admin_primitives";
import { BomDeptTabs } from "./BomDeptTabs";
import { BomParentList } from "./BomParentList";
import { BomChildAddBox } from "./BomChildAddBox";
import { BomEditPanel } from "./BomEditPanel";
import { BomReviewModal } from "./BomReviewModal";
import { BomStatsRow, type StatusFilter } from "./BomStatsRow";
import { BomParentHeader } from "./BomParentHeader";
import { BomWhereUsedPanel } from "./BomWhereUsedPanel";
import { BomUnmatchedRawsDrawer } from "./BomUnmatchedRawsDrawer";
import { bomStatusOf, stageOf, type BomDeptFilter } from "./bomDept";

interface Props {
  items: Item[];
  allBomRows: BOMDetailEntry[];
  refreshAllBom: () => void;
  refreshItems: () => Promise<void>;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

type Mode = "edit" | "whereused";
type DeleteRequest = { bomId: string; childName: string };

export function BomWorkbench({
  items,
  allBomRows,
  refreshAllBom,
  refreshItems,
  onStatusChange,
  onError,
}: Props) {
  const [dept, setDept] = useState<BomDeptFilter>("A");
  const [parentId, setParentId] = useState("");
  const [mode, setMode] = useState<Mode>("edit");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [whereUsedRows, setWhereUsedRows] = useState<BOMDetailEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const completedSet = useMemo(
    () => new Set(items.filter((i) => i.bom_completed_at).map((i) => i.item_id)),
    [items],
  );
  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allBomRows) m.set(r.parent_item_id, (m.get(r.parent_item_id) ?? 0) + 1);
    return m;
  }, [allBomRows]);

  // 현재 부서의 부모 후보 (R 단계 제외, "ALL"일 때는 부서 필터 스킵)
  const parentCandidates = useMemo(
    () =>
      items.filter((i) => {
        if (dept !== "ALL" && i.process_type_code?.[0] !== dept) return false;
        return stageOf(i.process_type_code) !== "R";
      }),
    [items, dept],
  );

  // 4-state KPI
  const stats = useMemo(() => {
    let done = 0;
    let wip = 0;
    let todo = 0;
    for (const i of parentCandidates) {
      const s = bomStatusOf(i.item_id, completedSet, childCountMap);
      if (s === "done") done++;
      else if (s === "wip") wip++;
      else todo++;
    }
    return { total: parentCandidates.length, done, wip, todo };
  }, [parentCandidates, completedSet, childCountMap]);

  // 첫 부모 자동 선택 (부서/모드 바뀔 때, "ALL"일 때는 부서 필터 스킵)
  const modeCandidates = useMemo(() => {
    return items.filter((i) => {
      if (dept !== "ALL" && i.process_type_code?.[0] !== dept) return false;
      if (mode === "edit") return stageOf(i.process_type_code) !== "R";
      return true;
    });
  }, [items, dept, mode]);

  useEffect(() => {
    if (parentId && modeCandidates.some((c) => c.item_id === parentId)) return;
    setParentId(modeCandidates[0]?.item_id ?? "");
  }, [dept, mode, modeCandidates, parentId]);

  // 선택된 부모의 직계 자식
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

  // 선택된 품목의 역참조 (사용처 모드)
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

  function handleDeptChange(next: BomDeptFilter) {
    setDept(next);
    setParentId("");
  }

  const parent = useMemo(
    () => items.find((i) => i.item_id === parentId) ?? null,
    [items, parentId],
  );
  const isCompleted = parent ? completedSet.has(parent.item_id) : false;

  const rawItems = useMemo(
    () =>
      items.filter((i) => {
        if (dept !== "ALL" && i.process_type_code?.[0] !== dept) return false;
        return stageOf(i.process_type_code) === "R";
      }),
    [items, dept],
  );
  const childIdSet = useMemo(
    () => new Set(allBomRows.map((r) => r.child_item_id)),
    [allBomRows],
  );

  // 선택된 부모의 BOM 을 서버 기준으로 재동기화 (낙관적 갱신 desync·stale bom_id 차단)
  async function reloadBom() {
    if (!parentId) {
      setBomRows([]);
      return;
    }
    try {
      setBomRows(await api.getBOM(parentId));
    } catch {
      setBomRows([]);
    }
  }

  async function handleAdd(childId: string, childName: string, qty: number): Promise<boolean> {
    if (!parent) return false;
    if (!Number.isFinite(qty) || qty <= 0) {
      onError("수량은 0보다 커야 합니다.");
      return false;
    }
    try {
      await api.createBOM({
        parent_item_id: parent.item_id,
        child_item_id: childId,
        quantity: qty,
        unit: "EA",
      });
      await reloadBom();
      refreshAllBom();
      onStatusChange(`"${childName}" 을(를) 추가했습니다.`);
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : "추가 실패");
      return false;
    }
  }

  async function handleSaveQty(bomId: string, qty: number) {
    try {
      await api.updateBOM(bomId, { quantity: qty });
      await reloadBom();
      refreshAllBom();
      onStatusChange("수량을 변경했습니다.");
    } catch (err) {
      await reloadBom();
      onError(err instanceof Error ? err.message : "수량 변경 실패 — 목록을 새로고침했습니다.");
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteRequest) return;
    setDeleteBusy(true);
    try {
      await api.deleteBOM(deleteRequest.bomId);
      await reloadBom();
      refreshAllBom();
      onStatusChange(`"${deleteRequest.childName}" 을(를) 삭제했습니다.`);
    } catch (err) {
      await reloadBom();
      onError(err instanceof Error ? err.message : "삭제 실패 — 목록을 새로고침했습니다.");
    } finally {
      setDeleteBusy(false);
      setDeleteRequest(null);
    }
  }

  async function handleToggleCompletion(completed: boolean) {
    if (!parent) return;
    try {
      await api.updateBomCompletion(parent.item_id, completed);
      await refreshItems();
      onStatusChange(
        `"${parent.item_name}" ${completed ? "완료 처리됨" : "완료 해제됨"}`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "완료 상태 변경 실패");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminPageHeader
        icon={Network}
        title="BOM 관리"
        summary={
          mode === "edit" ? (
            <BomStatsRow
              total={stats.total}
              done={stats.done}
              wip={stats.wip}
              todo={stats.todo}
              active={statusFilter}
              onChange={setStatusFilter}
              placement="header"
            />
          ) : undefined
        }
        actions={
          <div
            role="group"
            aria-label="BOM 보기 방식"
            className="flex h-11 w-[168px] items-center gap-1 rounded-full border"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
          >
            <Button
              variant={mode === "edit" ? "primary" : "ghost"}
              size="sm"
              iconLeft={<Pencil size={13} />}
              onClick={() => setMode("edit")}
              className="h-11 min-w-[82px] rounded-full"
              style={
                mode === "edit"
                  ? { background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white, borderColor: "transparent" }
                  : { background: "transparent", color: LEGACY_COLORS.muted, borderColor: "transparent" }
              }
            >
              편집
            </Button>
            <Button
              variant={mode === "whereused" ? "primary" : "ghost"}
              size="sm"
              iconLeft={<ArrowRightLeft size={13} />}
              onClick={() => setMode("whereused")}
              className="h-11 min-w-[82px] rounded-full"
              style={
                mode === "whereused"
                  ? { background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white, borderColor: "transparent" }
                  : { background: "transparent", color: LEGACY_COLORS.muted, borderColor: "transparent" }
              }
            >
              사용처
            </Button>
          </div>
        }
      />

      {/* 부서 탭 + 선택된 부모 헤더 (한 줄) */}
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 max-w-full">
          <BomDeptTabs value={dept} onChange={handleDeptChange} />
        </div>
        <BomParentHeader
          parent={parent}
          mode={mode}
          childCount={mode === "edit" ? bomRows.length : whereUsedRows.length}
          isCompleted={isCompleted}
          onOpenReview={() => setReviewOpen(true)}
        />
      </div>

      {/* 메인: 좌(상위) | 중(자식추가) | 우(현재구성) */}
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{
          gridTemplateColumns: mode === "edit"
            ? "minmax(280px, 1fr) minmax(340px, 1fr) minmax(340px, 1fr)"
            : "minmax(280px, 0.78fr) minmax(0, 1.22fr)",
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <BomParentList
            dept={dept}
            items={items}
            allBomRows={allBomRows}
            completedSet={completedSet}
            statusFilter={statusFilter}
            selectedId={parentId}
            onSelect={setParentId}
            mode={mode}
          />
        </div>

        {mode === "edit" ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {parent ? (
                <BomChildAddBox
                  parent={parent}
                  bomRows={bomRows}
                  items={items}
                  onAdd={handleAdd}
                />
              ) : (
                <div
                  className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border text-sm"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  좌측에서 상위 품목을 먼저 선택하세요.
                </div>
              )}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <BomEditPanel
                parent={parent}
                bomRows={bomRows}
                items={items}
                onSaveQty={handleSaveQty}
                onRequestDelete={(row, childName) =>
                  setDeleteRequest({ bomId: row.bom_id, childName })
                }
              />
            </div>
          </>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BomWhereUsedPanel
              selected={parent}
              rows={whereUsedRows}
              items={items}
              onSelectParent={(id) => {
                setMode("edit");
                setParentId(id);
              }}
            />
          </div>
        )}
      </div>

      {/* 하단: 미배치 원자재 (편집 모드에서만) */}
      {mode === "edit" && <BomUnmatchedRawsDrawer rawItems={rawItems} childIdSet={childIdSet} />}

      {/* 검토 · 완료 모달 */}
      {reviewOpen && parent && (
        <BomReviewModal
          parent={parent}
          rows={bomRows}
          items={items}
          isCompleted={isCompleted}
          onClose={() => setReviewOpen(false)}
          onConfirm={handleToggleCompletion}
        />
      )}

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
