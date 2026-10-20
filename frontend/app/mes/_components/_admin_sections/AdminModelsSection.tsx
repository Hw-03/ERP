"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAdminSessionState } from "../_admin_hooks/useAdminSessionState";
import { GripVertical, Layers, Plus, Save, Trash2, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { BOMDetailEntry, Item, ProductModel } from "@/lib/api";
import { Button } from "@/lib/ui/Button";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminModelsContext } from "./AdminModelsContext";
import { useLocalDirtyGuard, useRegisterDirty } from "@/lib/ui/dirty-guard";
import styles from "./_admin_primitives/AdminMasterData.module.css";
import { AdminReadBoundary, useAdminReadState } from "./_admin_primitives/AdminReadState";
import { AdminDetailSkeleton, AdminTableSkeleton } from "./_admin_primitives/AdminSkeleton";

interface Props {
  items: Item[];
  allBomRows: BOMDetailEntry[];
}

export function AdminModelsSection({ items, allBomRows }: Props) {
  const read = useAdminReadState("models");
  const detailRead = useAdminReadState("models", "items", "bom");
  const ctx = useAdminModelsContext();
  const {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel,
    adding,
    deleteModel,
    deleting,
    editForm,
    setEditForm,
    editDirty,
    editSaving,
    initEditForm,
    saveModel,
    reorderModels,
  } = ctx;

  const [selectedSlot, setSelectedSlot] = useAdminSessionState<number | null>("models.selection", null);
  const [addMode, setAddMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const saveSelected = async (): Promise<void> => {
    if (addMode) {
      if (!modelAddName.trim()) throw new Error("모델명을 입력하세요.");
      await addModel();
    } else if (selectedSlot != null) await saveModel(selectedSlot);
  };
  const dirty = addMode ? Boolean(modelAddName || modelAddSymbol) : editDirty;
  useRegisterDirty("models", dirty, saveSelected);
  const { confirmNavigation } = useLocalDirtyGuard(dirty, saveSelected);
  // 드래그 reorder 상태 — 부서 reorder 와 달리 정렬 키가 slot.
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const [dropTargetSlot, setDropTargetSlot] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, slot: number) {
    setDragSlot(slot);
    e.dataTransfer.effectAllowed = "move";
    // Firefox 호환을 위한 더미 데이터.
    try {
      e.dataTransfer.setData("text/plain", String(slot));
    } catch {
      // jsdom 등 일부 환경에서 setData 실패 — 무시.
    }
  }

  function handleDragOver(e: React.DragEvent, slot: number) {
    if (dragSlot === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetSlot !== slot) setDropTargetSlot(slot);
  }

  function handleDrop(e: React.DragEvent, slot: number) {
    e.preventDefault();
    if (dragSlot === null || dragSlot === slot) {
      setDragSlot(null);
      setDropTargetSlot(null);
      return;
    }
    const fromIdx = productModels.findIndex((m) => m.slot === dragSlot);
    const toIdx = productModels.findIndex((m) => m.slot === slot);
    if (fromIdx < 0 || toIdx < 0) {
      setDragSlot(null);
      setDropTargetSlot(null);
      return;
    }
    const next = [...productModels];
    const [moved] = next.splice(fromIdx, 1);
    if (moved) next.splice(toIdx, 0, moved);
    reorderModels(next);
    setDragSlot(null);
    setDropTargetSlot(null);
  }

  function handleDragEnd() {
    setDragSlot(null);
    setDropTargetSlot(null);
  }

  const inUse = useMemo(
    () => productModels.filter((m) => Boolean(m.model_name)),
    [productModels],
  );
  const idle = productModels.length - inUse.length;

  // 첫 항목 자동 선택
  useEffect(() => {
    if (selectedSlot !== null) return;
    if (addMode) return;
    const first = inUse[0] ?? productModels[0];
    if (first) setSelectedSlot(first.slot);
  }, [selectedSlot, addMode, inUse, productModels, setSelectedSlot]);

  const selected = useMemo(
    () => productModels.find((m) => m.slot === selectedSlot) ?? null,
    [productModels, selectedSlot],
  );

  // 선택 모델 변경 시 editForm 초기화
  useEffect(() => {
    if (selected) initEditForm(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.slot]);

  const linkedItems = useMemo(
    () =>
      selected
        ? items.filter((it) =>
            Array.isArray(it.model_slots) ? it.model_slots.includes(selected.slot) : false,
          )
        : [],
    [items, selected],
  );

  const linkedBomCount = useMemo(() => {
    if (!selected) return 0;
    const linkedItemIds = new Set(linkedItems.map((it) => it.item_id));
    const parents = new Set<string>();
    for (const row of allBomRows) {
      if (linkedItemIds.has(row.parent_item_id)) parents.add(row.parent_item_id);
    }
    return parents.size;
  }, [allBomRows, linkedItems, selected]);

  function handleSelectModel(slot: number) {
    if (selectedSlot === slot && !addMode) return;
    confirmNavigation(() => {
      setAddMode(false);
      setSelectedSlot(slot);
    });
  }

  function handleStartAdd() {
    confirmNavigation(() => {
      setAddMode(true);
      setSelectedSlot(null);
    });
  }

  function handleSubmitAdd() {
    if (!modelAddName.trim()) return;
    void addModel().then(() => setAddMode(false)).catch(() => {});
  }

  function handleDelete(slot: number) {
    setDeleteTarget(slot);
  }

  function handleConfirmDelete() {
    if (deleteTarget === null) return;
    void deleteModel(deleteTarget).then(() => {
      if (selectedSlot === deleteTarget) setSelectedSlot(null);
      setDeleteTarget(null);
    }).catch(() => {});
  }

  const deleteTargetModel = deleteTarget !== null ? productModels.find((m) => m.slot === deleteTarget) : null;

  return (
    <>
    <div className={`flex min-h-0 flex-1 flex-col ${styles.workspace}`}>
      <AdminPageHeader
        icon={Layers}
        title="모델 관리"
        summary={
          <AdminKpiBar
            loading={read.loading} unavailable={!!read.error}
            placement="header"
            items={[
              { key: "total", label: "전체 모델", value: productModels.length, hint: "등록된 모델", tone: LEGACY_COLORS.blue },
              { key: "use", label: "사용 중", value: inUse.length, hint: "이름이 등록된 모델", tone: LEGACY_COLORS.green },
              { key: "idle", label: "비활성", value: idle, hint: "이름 없는 모델", tone: LEGACY_COLORS.muted2 },
            ]}
          />
        }
        actions={<Button disabled={detailRead.loading || !!detailRead.error} variant="primary" size="md" className="min-h-11" iconLeft={<Plus className="h-4 w-4" />} onClick={handleStartAdd}>모델 추가</Button>}
      />

      <div className="flex min-h-0 flex-1 gap-4">
        <AdminListPanel
          read={read} skeleton={<AdminTableSkeleton columns="32px minmax(0,1fr) 84px 76px" count={4} />}
          title="모델 목록"
          countLabel={`${productModels.length}건`}
          width="clamp(360px, 28vw, 440px)"
          items={productModels}
          listRole="grid"
          listAriaLabel="모델 목록"
          externalScrollbar
          listHeader={
            <div
              role="row"
              className={`sticky top-0 z-10 grid grid-cols-[32px_minmax(0,1fr)_84px_76px] items-center border-b px-3 py-2 text-[12px] font-bold ${styles.tableHeader}`}
              style={{ background: "var(--c-inventory-table-header)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              <span role="columnheader" className="text-center">정렬</span>
              <span role="columnheader">모델명</span>
              <span role="columnheader" className="text-center">모델 기호</span>
              <span role="columnheader" className="text-center">상태</span>
            </div>
          }
          emptyState={<EmptyState variant="no-data" compact illustrated title="등록된 모델이 없습니다." />}
          renderItem={(model) => {
            const active = selected?.slot === model.slot;
            const modelNameLabel = model.model_name?.trim() || "미등록 모델";
            const used = Boolean(model.model_name?.trim());
            const isDragging = dragSlot === model.slot;
            const isDropTarget =
              dragSlot !== null && dropTargetSlot === model.slot && dragSlot !== model.slot;
            const symbolLabel = model.symbol?.trim() || "미지정";
            return (
              <div
                key={model.slot}
                role="row"
                aria-selected={active}
                aria-label={`${modelNameLabel} ${symbolLabel} ${used ? "사용 중" : "비활성"}`}
                tabIndex={0}
                draggable
                onDragStart={(e) => handleDragStart(e, model.slot)}
                onDragOver={(e) => handleDragOver(e, model.slot)}
                onDrop={(e) => handleDrop(e, model.slot)}
                onDragEnd={handleDragEnd}
                onClick={() => handleSelectModel(model.slot)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  handleSelectModel(model.slot);
                }}
                className={`relative grid w-full grid-cols-[32px_minmax(0,1fr)_84px_76px] items-center border-b py-2 pl-2 pr-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--c-blue)]/30 ${styles.tableRow}`}
                style={{
                  opacity: isDragging ? 0.4 : 1,
                  borderBottomColor: LEGACY_COLORS.border,
                }}
              >
                {isDropTarget && (
                  <div
                    className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 rounded-full"
                    style={{ background: LEGACY_COLORS.blue }}
                  />
                )}
                <div role="gridcell" className="flex justify-center">
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab"
                    style={{ color: LEGACY_COLORS.muted2 }}
                    aria-label="드래그 핸들"
                  />
                </div>
                <div role="gridcell" className="min-w-0 truncate text-[14px] font-semibold" style={{ color: LEGACY_COLORS.text }}>
                  {modelNameLabel}
                </div>
                <div
                  role="gridcell"
                  className="truncate text-center text-[12px] font-semibold"
                  style={{ color: LEGACY_COLORS.muted }}
                >
                  {symbolLabel}
                </div>
                <div role="gridcell" className="flex justify-center">
                  <StatusPill
                    label={used ? "사용 중" : "비활성"}
                    tone={used ? "success" : "neutral"}
                    showDot
                  />
                </div>
              </div>
            );
          }}
        />

        <AdminDetailCard
          selectionKey={detailRead.loading ? undefined : addMode ? "add" : selected?.slot}
          title={
            addMode
              ? "새 모델 추가"
              : selected
                ? undefined
                : detailRead.loading || detailRead.error || productModels.length > 0 ? undefined : "모델을 선택하세요"
          }
          subtitle={
            addMode
              ? "모델명과 기호(선택)를 입력하세요."
              : undefined
          }
          actions={
            addMode ? (
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<X className="h-3.5 w-3.5" />}
                onClick={() => setAddMode(false)}
              >
                취소
              </Button>
            ) : null
          }
        >
          <AdminReadBoundary read={{ ...detailRead, loading: detailRead.loading || (!!detailRead.managed && !detailRead.error && !selected && !addMode && productModels.length > 0) }} skeleton={<AdminDetailSkeleton variant="models" />} label="모델 상세">
          {addMode ? (
            <ModelAddForm
              modelAddName={modelAddName}
              setModelAddName={setModelAddName}
              modelAddSymbol={modelAddSymbol}
              setModelAddSymbol={setModelAddSymbol}
              onSubmit={handleSubmitAdd}
              busy={adding}
            />
          ) : selected ? (
            <fieldset className="contents" disabled={editSaving} aria-busy={editSaving}>
            <ModelDetailView
              model={selected}
              headerActions={<Button variant="primary" size="md" className="h-11 min-w-[88px]" iconLeft={<Save className="h-4 w-4" />} disabled={!editDirty || editSaving} loading={editSaving} onClick={() => void saveModel(selected.slot).catch(() => {})}>저장</Button>}
              linkedItems={linkedItems}
              linkedBomCount={linkedBomCount}
              editForm={editForm}
              setEditForm={setEditForm}
              onRequestDelete={() => handleDelete(selected.slot)}
            />
            </fieldset>
          ) : (
            <div className="flex min-h-full flex-col">
              <EmptyState
                variant="no-data"
                illustrated
                title="좌측에서 모델을 선택하세요"
                description="등록된 모델을 클릭하면 상세 정보와 연결 품목을 확인할 수 있습니다."
              />
            </div>
          )}
          </AdminReadBoundary>
        </AdminDetailCard>
      </div>
    </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title={`'${deleteTargetModel?.model_name?.trim() || "미등록 모델"}' 모델을 삭제하시겠습니까?`}
        tone="danger"
        cautionMessage="이 작업은 되돌릴 수 없습니다. 이 모델을 사용하는 품목이 있으면 삭제되지 않습니다."
        confirmLabel="삭제"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        busy={deleting}
      />
    </>
  );
}

interface ModelAddFormProps {
  busy?: boolean;
  modelAddName: string;
  setModelAddName: (v: string) => void;
  modelAddSymbol: string;
  setModelAddSymbol: (v: string) => void;
  onSubmit: () => void;
}

function ModelAddForm({
  modelAddName,
  setModelAddName,
  modelAddSymbol,
  setModelAddSymbol,
  onSubmit,
  busy = false,
}: ModelAddFormProps) {
  const canSubmit = Boolean(modelAddName.trim()) && !busy;
  return (
    <form
      className="flex max-w-[440px] flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div>
        <label className="mb-1 block text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          모델명 <span style={{ color: LEGACY_COLORS.red }}>*</span>
        </label>
        <input
          value={modelAddName}
          disabled={busy}
          onChange={(e) => setModelAddName(e.target.value)}
          placeholder="예: ADX8000"
          className="min-h-11 w-full rounded-[12px] border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--c-blue)]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          기호 (선택, 1-5자)
        </label>
        <input
          value={modelAddSymbol}
          disabled={busy}
          onChange={(e) => setModelAddSymbol(e.target.value.slice(0, 5))}
          placeholder="자동 생성"
          className="min-h-11 w-full rounded-[12px] border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--c-blue)]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-2 min-h-11 rounded-[12px] py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
        style={{ background: LEGACY_COLORS.blueSolid }}
      >
        모델 추가
      </button>
    </form>
  );
}

import type { ModelEditForm } from "../_admin_hooks/useAdminModels";

interface ModelDetailViewProps {
  model: ProductModel;
  headerActions: ReactNode;
  linkedItems: Item[];
  linkedBomCount: number;
  editForm: ModelEditForm;
  setEditForm: (updater: (prev: ModelEditForm) => ModelEditForm) => void;
  onRequestDelete: () => void;
}

function ModelDetailView({ model, headerActions, linkedItems, linkedBomCount, editForm, setEditForm, onRequestDelete }: ModelDetailViewProps): ReactNode {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* 편집 가능 필드 */}
      <div className={styles.detailHeader}>
        <div role="group" aria-label="모델 기본 정보" className={styles.modelFields}>
          {/* 모델명 — 편집 */}
          <div className={styles.fieldCard}>
            <EditFieldRow label="모델명">
              <input
                value={editForm.model_name}
                onChange={(e) => setEditForm((f) => ({ ...f, model_name: e.target.value }))}
                placeholder="모델명 입력"
                className="min-h-11 w-full rounded-[12px] border px-3 py-2 text-[14px] outline-none focus:border-[var(--c-blue)]"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
            </EditFieldRow>
          </div>

          {/* 기호 — 편집 */}
          <div className={styles.fieldCard}><EditFieldRow label="기호 (1-5자)">
            <input
              value={editForm.symbol}
              onChange={(e) => setEditForm((f) => ({ ...f, symbol: e.target.value.slice(0, 5) }))}
              placeholder="예: A"
              className="min-h-11 w-full rounded-[12px] border px-3 py-2 text-[14px] outline-none focus:border-[var(--c-blue)]"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            />
          </EditFieldRow></div>
          <SummaryStat
            label="연결 품목 수"
            value={linkedItems.length}
            tone={LEGACY_COLORS.blue}
          />
          <SummaryStat
            label="연결 BOM 수"
            value={linkedBomCount}
            tone={LEGACY_COLORS.purple}
          />
        </div>
        {headerActions}
      </div>

        {linkedItems.length > 0 && (
          <div data-scrollbar-rail-shell className="relative flex min-h-0 flex-1 flex-col rounded-[16px]" style={{ background: LEGACY_COLORS.bg }}>
            <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-4">
              <h3 className="text-[16px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                연결 품목 미리보기
              </h3>
              {linkedItems.length > 6 && (
                <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  외 {linkedItems.length - 6}건
                </span>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              <div data-scrollbar-rail-viewport role="region" aria-label="연결 품목 미리보기" className="absolute inset-y-0 left-0 right-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]">
                <div className="flex min-h-full flex-col gap-2 px-4 pb-4" style={{ background: LEGACY_COLORS.bg }}>
                  {linkedItems.slice(0, 6).map((it) => (
                    <div key={it.item_id} className={`${styles.previewRow} text-[14px]`}>
                      <div className="min-w-0 flex-1 truncate" style={{ color: LEGACY_COLORS.text }}>
                        {it.item_name}
                      </div>
                      <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {it.mes_code ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div data-scrollbar-rail-frame aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }} />
            <div data-scrollbar-rail-masks aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-between">
              <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 15px, var(--c-s1) 16px)" }} />
              <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 0 0, transparent 0 15px, var(--c-s1) 16px)" }} />
            </div>
          </div>
        )}

      {/* 모델 삭제 — 전폭 하단 버튼. ConfirmModal + PIN 인증으로 보호됨. */}
      <button
        type="button"
        onClick={onRequestDelete}
        className="standard-hover mt-auto flex w-full items-center justify-center gap-2 rounded-[12px] border px-4 py-3 text-[14px] font-bold transition-colors"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
          color: LEGACY_COLORS.red,
        }}
      >
        <Trash2 className="h-4 w-4" />
        이 모델 삭제
      </button>
    </div>
  );
}

function EditFieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] font-bold tracking-[0.06em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div
      className={styles.fieldCard}
    >
      <div className="text-[12px] font-bold" style={{ color: tone }}>
        {label}
      </div>
      <div className="mt-1.5 flex h-11 items-center text-[24px] font-black leading-none" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
