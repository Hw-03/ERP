"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useRegisterDirty } from "@/lib/ui/dirty-guard";

interface Props {
  items: Item[];
  allBomRows: BOMDetailEntry[];
}

export function AdminModelsSection({ items, allBomRows }: Props) {
  const ctx = useAdminModelsContext();
  const {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel,
    deleteModel,
    editForm,
    setEditForm,
    editDirty,
    editSaving,
    initEditForm,
    saveModel,
    reorderModels,
  } = ctx;

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  useRegisterDirty(
    "models",
    editDirty,
    async () => {
      if (selectedSlot != null) {
        await Promise.resolve(saveModel(selectedSlot));
      }
    },
  );
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
  }, [selectedSlot, addMode, inUse, productModels]);

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
    setAddMode(false);
    setSelectedSlot((current) => (current === slot ? null : slot));
  }

  function handleStartAdd() {
    setAddMode(true);
    setSelectedSlot(null);
  }

  function handleSubmitAdd() {
    if (!modelAddName.trim()) return;
    addModel();
    setAddMode(false);
  }

  function handleDelete(slot: number) {
    setDeleteTarget(slot);
  }

  function handleConfirmDelete() {
    if (deleteTarget === null) return;
    deleteModel(deleteTarget);
    if (selectedSlot === deleteTarget) setSelectedSlot(null);
    setDeleteTarget(null);
  }

  const deleteTargetModel = deleteTarget !== null ? productModels.find((m) => m.slot === deleteTarget) : null;

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminPageHeader
        icon={Layers}
        title="모델 관리"
        summary={
          <AdminKpiBar
            placement="header"
            items={[
              { key: "total", label: "전체 모델", value: productModels.length, hint: "등록된 슬롯", tone: LEGACY_COLORS.blue },
              { key: "use", label: "사용 중", value: inUse.length, hint: "이름이 등록된 모델", tone: LEGACY_COLORS.green },
              { key: "idle", label: "비활성", value: idle, hint: "이름 없는 빈 슬롯", tone: LEGACY_COLORS.muted2 },
            ]}
          />
        }
      />

      <div className="flex min-h-0 flex-1 gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]">
        <div className="flex min-h-0 w-[288px] shrink-0 xl:w-auto">
        <AdminListPanel
          title="모델 목록"
          countLabel={`${productModels.length}건`}
          width="100%"
          action={
            <Button variant="primary" size="sm" iconLeft={<Plus className="h-3.5 w-3.5" />} onClick={handleStartAdd}>
              추가
            </Button>
          }
          items={productModels}
          emptyState={<EmptyState variant="no-data" compact title="등록된 모델이 없습니다." />}
          renderItem={(model) => {
            const active = selected?.slot === model.slot;
            const used = Boolean(model.model_name);
            const isDragging = dragSlot === model.slot;
            const isDropTarget =
              dragSlot !== null && dropTargetSlot === model.slot && dragSlot !== model.slot;
            return (
              <div
                key={model.slot}
                draggable
                onDragStart={(e) => handleDragStart(e, model.slot)}
                onDragOver={(e) => handleDragOver(e, model.slot)}
                onDrop={(e) => handleDrop(e, model.slot)}
                onDragEnd={handleDragEnd}
                className="relative"
                style={{ opacity: isDragging ? 0.4 : 1 }}
              >
                {isDropTarget && (
                  <div
                    className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 rounded-full"
                    style={{ background: LEGACY_COLORS.blue }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleSelectModel(model.slot)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors duration-150 bg-[var(--c-s2)] hover:bg-[var(--c-s4)]"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                      : undefined,
                    borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab"
                    style={{ color: LEGACY_COLORS.muted2 }}
                    aria-label="드래그 핸들"
                  />
                  {/* 기호 배지 */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black"
                    style={{
                      background: used ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
                      color: used ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
                    }}
                  >
                    {model.symbol ?? "?"}
                  </div>
                  {/* 텍스트 */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {model.model_name ?? `슬롯 ${model.slot}`}
                    </div>
                    <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      M-{String(model.slot).padStart(4, "0")}
                    </div>
                  </div>
                  {/* 상태 배지 */}
                  <div className="shrink-0">
                    <StatusPill
                      label={used ? "사용 중" : "비활성"}
                      tone={used ? "success" : "neutral"}
                      showDot
                    />
                  </div>
                </button>
              </div>
            );
          }}
        />
        </div>

        <AdminDetailCard
          title={
            addMode
              ? "새 모델 추가"
              : selected
                ? selected.model_name ?? `슬롯 ${selected.slot}`
                : "모델을 선택하세요"
          }
          status={
            !addMode && selected ? (
              <StatusPill
                label={selected.model_name ? "사용 중" : "비활성"}
                tone={selected.model_name ? "success" : "neutral"}
              />
            ) : null
          }
          subtitle={
            addMode
              ? "모델명과 기호(선택)를 입력하세요."
              : selected
                ? `M-${String(selected.slot).padStart(4, "0")}`
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
            ) : selected ? (
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Save className="h-3.5 w-3.5" />}
                disabled={!editDirty || editSaving}
                loading={editSaving}
                onClick={() => saveModel(selected.slot)}
              >
                저장
              </Button>
            ) : null
          }
        >
          {addMode ? (
            <ModelAddForm
              modelAddName={modelAddName}
              setModelAddName={setModelAddName}
              modelAddSymbol={modelAddSymbol}
              setModelAddSymbol={setModelAddSymbol}
              onSubmit={handleSubmitAdd}
            />
          ) : selected ? (
            <ModelDetailView
              model={selected}
              linkedItems={linkedItems}
              linkedBomCount={linkedBomCount}
              editForm={editForm}
              setEditForm={setEditForm}
              onRequestDelete={() => handleDelete(selected.slot)}
            />
          ) : (
            <EmptyState
              variant="no-data"
              title="좌측에서 모델을 선택하세요"
              description="등록된 모델을 클릭하면 상세 정보와 연결 품목을 확인할 수 있습니다."
            />
          )}
        </AdminDetailCard>
      </div>
    </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title={`'${deleteTargetModel?.model_name ?? `슬롯 ${deleteTarget}`}' 모델을 삭제하시겠습니까?`}
        tone="danger"
        cautionMessage="이 작업은 되돌릴 수 없습니다. 연결된 BOM·품목 매핑이 해제됩니다."
        confirmLabel="삭제"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

interface ModelAddFormProps {
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
}: ModelAddFormProps) {
  const canSubmit = Boolean(modelAddName.trim());
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
          onChange={(e) => setModelAddName(e.target.value)}
          placeholder="예: ADX8000"
          className="w-full rounded-[12px] border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--c-blue)]"
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
          onChange={(e) => setModelAddSymbol(e.target.value.slice(0, 5))}
          placeholder="자동 생성"
          className="w-full rounded-[12px] border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--c-blue)]"
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
        className="mt-2 rounded-[12px] py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
        style={{ background: LEGACY_COLORS.blue }}
      >
        모델 추가
      </button>
    </form>
  );
}

import type { ModelEditForm } from "../_admin_hooks/useAdminModels";

interface ModelDetailViewProps {
  model: ProductModel;
  linkedItems: Item[];
  linkedBomCount: number;
  editForm: ModelEditForm;
  setEditForm: (updater: (prev: ModelEditForm) => ModelEditForm) => void;
  onRequestDelete: () => void;
}

function ModelDetailView({ model, linkedItems, linkedBomCount, editForm, setEditForm, onRequestDelete }: ModelDetailViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* 편집 가능 필드 */}
      <div
        className="rounded-[14px] border p-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          {/* 모델명 — 편집 */}
          <div className="min-w-0">
            <EditFieldRow label="모델명">
              <input
                value={editForm.model_name}
                onChange={(e) => setEditForm((f) => ({ ...f, model_name: e.target.value }))}
                placeholder="모델명 입력"
                className="w-full rounded-[10px] border px-3 py-2 text-[14px] outline-none focus:border-[var(--c-blue)]"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
            </EditFieldRow>
          </div>

          {/* 기호 — 편집 */}
          <EditFieldRow label="기호 (1-5자)">
            <input
              value={editForm.symbol}
              onChange={(e) => setEditForm((f) => ({ ...f, symbol: e.target.value.slice(0, 5) }))}
              placeholder="예: A"
              className="w-full rounded-[10px] border px-3 py-2 text-[14px] outline-none focus:border-[var(--c-blue)]"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            />
          </EditFieldRow>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:grid xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] xl:items-stretch xl:gap-3">
        <div className="flex min-h-0 shrink-0 flex-col gap-3">
          <SummaryStat
            label="연결 품목 수"
            value={linkedItems.length}
            hint="이 모델로 지정된 품목"
            tone={LEGACY_COLORS.blue}
          />
          <SummaryStat
            label="연결 BOM 수"
            value={linkedBomCount}
            hint="이 모델 품목을 부모로 가진 BOM"
            tone={LEGACY_COLORS.purple}
          />
        </div>

        {linkedItems.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              연결 품목 미리보기
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-[14px] border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              {linkedItems.slice(0, 6).map((it) => (
                <div key={it.item_id} className="flex items-center justify-between gap-2 text-[14px]">
                  <div className="min-w-0 flex-1 truncate" style={{ color: LEGACY_COLORS.text }}>
                    {it.item_name}
                  </div>
                  <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {it.mes_code ?? "—"}
                  </span>
                </div>
              ))}
              {linkedItems.length > 6 && (
                <div className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  외 {linkedItems.length - 6}건
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 모델 삭제 — 전폭 하단 버튼. ConfirmModal + PIN 인증으로 보호됨. */}
      <button
        type="button"
        onClick={onRequestDelete}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-[12px] border px-4 py-3 text-[14px] font-bold transition-colors hover:brightness-110"
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
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: string;
}) {
  return (
    <div
      className="flex-1 rounded-[14px] border px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${tone} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
      }}
    >
      <div className="text-[12px] font-bold" style={{ color: tone }}>
        {label}
      </div>
      <div className="mt-1 text-[24px] font-black leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {hint}
      </div>
    </div>
  );
}
