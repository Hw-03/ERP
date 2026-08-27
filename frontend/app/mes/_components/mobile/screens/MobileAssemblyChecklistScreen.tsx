"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardCheck,
  GripVertical,
  ListOrdered,
  Pencil,
  Plus,
  Settings2,
} from "lucide-react";
import type { ProductModel } from "@/lib/api";
import type {
  AssemblyChecklist,
  AssemblyChecklistItem,
  AssemblyChecklistSection,
} from "@/lib/api/types/assembly-checklists";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  useAssemblyChecklistsQuery,
  useCreateAssemblyChecklistItemMutation,
  useCreateAssemblyChecklistMutation,
  useCreateAssemblyChecklistSectionMutation,
  useDeleteAssemblyChecklistItemMutation,
  useDeleteAssemblyChecklistSectionMutation,
  useMoveAssemblyChecklistItemMutation,
  useReorderAssemblyChecklistItemsMutation,
  useReorderAssemblyChecklistSectionsMutation,
  useUpdateAssemblyChecklistItemMutation,
  useUpdateAssemblyChecklistSectionMutation,
} from "@/lib/queries/useAssemblyChecklistsQuery";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { TYPO } from "../tokens";
import { useAssemblyChecklistItemDrag, type UseAssemblyChecklistItemDragResult } from "./useAssemblyChecklistItemDrag";
import { useAssemblyChecklistSectionDrag, type UseAssemblyChecklistSectionDragResult } from "./useAssemblyChecklistSectionDrag";

const CARD_STYLE = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
} as const;

type ScreenMode = "browse" | "manage" | "manageDetail";

type SectionEditorState = {
  sectionId: string | null;
};

type ItemEditorState = {
  itemId: string | null;
  sectionId: string;
};

function checklistItemKey(itemId: string): string {
  return itemId;
}

function sectionLabel(section: AssemblyChecklistSection): string {
  return section.title ?? "기본 항목";
}

function findItem(
  checklist: AssemblyChecklist,
  itemId: string | null,
): { item: AssemblyChecklistItem; section: AssemblyChecklistSection } | null {
  if (!itemId) return null;
  for (const section of checklist.sections) {
    const item = section.items.find((candidate) => candidate.item_id === itemId);
    if (item) return { item, section };
  }
  return null;
}

type DiscardEditor = "section" | "item";

type DragSaveState = {
  kind: "section" | "item";
  id: string;
};

function withSequentialItemOrder(items: AssemblyChecklistItem[]): AssemblyChecklistItem[] {
  return items.map((item, index) => ({ ...item, sort_order: index }));
}

function reorderChecklistSections(
  checklist: AssemblyChecklist,
  sectionIds: string[],
): AssemblyChecklist {
  if (sectionIds.length !== checklist.sections.length) return checklist;
  const sectionsById = new Map(checklist.sections.map((section) => [section.section_id, section]));
  const sections: AssemblyChecklistSection[] = [];
  for (const sectionId of sectionIds) {
    const section = sectionsById.get(sectionId);
    if (!section) return checklist;
    sections.push({ ...section, sort_order: sections.length });
  }
  return { ...checklist, sections };
}

function reorderChecklistItems(
  checklist: AssemblyChecklist,
  sectionId: string,
  itemIds: string[],
): AssemblyChecklist {
  return {
    ...checklist,
    sections: checklist.sections.map((section) => {
      if (section.section_id !== sectionId || itemIds.length !== section.items.length) return section;
      const itemsById = new Map(section.items.map((item) => [item.item_id, item]));
      const items: AssemblyChecklistItem[] = [];
      for (const itemId of itemIds) {
        const item = itemsById.get(itemId);
        if (!item) return section;
        items.push(item);
      }
      return { ...section, items: withSequentialItemOrder(items) };
    }),
  };
}

function moveChecklistItem(
  checklist: AssemblyChecklist,
  itemId: string,
  targetSectionId: string,
  targetIndex: number,
): AssemblyChecklist {
  const source = findItem(checklist, itemId);
  const target = checklist.sections.find((section) => section.section_id === targetSectionId);
  if (!source || !target) return checklist;

  const sourceItems = source.section.items.filter((item) => item.item_id !== itemId);
  const targetItems = source.section.section_id === targetSectionId
    ? sourceItems
    : target.items.filter((item) => item.item_id !== itemId);
  const insertionIndex = Math.max(0, Math.min(targetIndex, targetItems.length));
  targetItems.splice(insertionIndex, 0, source.item);

  return {
    ...checklist,
    sections: checklist.sections.map((section) => {
      if (section.section_id === source.section.section_id && section.section_id === targetSectionId) {
        return { ...section, items: withSequentialItemOrder(targetItems) };
      }
      if (section.section_id === source.section.section_id) {
        return { ...section, items: withSequentialItemOrder(sourceItems) };
      }
      if (section.section_id === targetSectionId) {
        return { ...section, items: withSequentialItemOrder(targetItems) };
      }
      return section;
    }),
  };
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className={TYPO.caption} style={{ color: LEGACY_COLORS.red }}>
      {message}
    </p>
  );
}

function Header({
  title,
  onBack,
  backLabel,
  rightAction,
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
  rightAction?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center">
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-full border transition-[transform] active:scale-[0.94]"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h2 className="min-w-0 truncate text-center text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
        {title}
      </h2>
      {rightAction ?? <span aria-hidden="true" className="h-10 w-10" />}
    </div>
  );
}

function ProductCard({
  checklist,
  onClick,
}: {
  checklist: AssemblyChecklist;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${checklist.model_name} 체크리스트 열기`}
      onClick={onClick}
      className="flex flex-1 items-center gap-4 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
      style={CARD_STYLE}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)` }}
      >
        <ClipboardCheck className="h-6 w-6" style={{ color: LEGACY_COLORS.blue }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
          {checklist.model_name}
        </span>
      </span>
    </button>
  );
}

function BrowseDetail({
  checklist,
  onBack,
  completedItemKeys,
  onToggle,
  onClearSection,
}: {
  checklist: AssemblyChecklist;
  onBack: () => void;
  completedItemKeys: Set<string>;
  onToggle: (itemKey: string) => void;
  onClearSection: (section: AssemblyChecklistSection) => void;
}) {
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      <Header title={checklist.model_name} onBack={onBack} backLabel="제품 선택으로 돌아가기" />

      {checklist.sections.map((section) => {
        const hasCompletedItem = section.items.some((item) => completedItemKeys.has(checklistItemKey(item.item_id)));
        return (
          <section key={section.section_id} className="rounded-[20px] border p-4" style={CARD_STYLE}>
            {section.title && (
              <h3 className={`${TYPO.overline} mb-3`} style={{ color: LEGACY_COLORS.muted2 }}>
                {section.title}
              </h3>
            )}
            <ol aria-label={`${section.title ?? checklist.model_name} 체크리스트`} className="flex list-none flex-col gap-2 p-0">
              {section.items.map((item, itemIndex) => {
                const itemKey = checklistItemKey(item.item_id);
                const isCompleted = completedItemKeys.has(itemKey);
                return (
                  <li key={item.item_id}>
                    <button
                      type="button"
                      aria-pressed={isCompleted}
                      onClick={() => onToggle(itemKey)}
                      className="no-btn-inset flex min-h-11 w-full gap-3 rounded-[14px] border px-3 py-3 text-left transition-colors"
                      style={{
                        background: isCompleted ? `color-mix(in srgb, ${LEGACY_COLORS.green} 10%, transparent)` : undefined,
                        borderColor: isCompleted
                          ? `color-mix(in srgb, ${LEGACY_COLORS.green} 45%, transparent)`
                          : LEGACY_COLORS.border,
                      }}
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black"
                        style={{
                          background: isCompleted
                            ? `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, transparent)`
                            : LEGACY_COLORS.s2,
                          color: isCompleted
                            ? `color-mix(in srgb, ${LEGACY_COLORS.green} 60%, ${LEGACY_COLORS.text})`
                            : LEGACY_COLORS.muted2,
                        }}
                      >
                        {itemIndex + 1}
                      </span>
                      <span className={`${TYPO.body} whitespace-pre-line`} style={{ color: LEGACY_COLORS.text }}>
                        {item.content}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              onClick={() => onClearSection(section)}
              disabled={!hasCompletedItem}
              className="mt-3 min-h-11 w-full rounded-[12px] border px-3 py-2 text-sm font-black disabled:opacity-45"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 45%, transparent)`,
                color: LEGACY_COLORS.yellow,
              }}
            >
              전체 해제
            </button>
          </section>
        );
      })}
    </div>
  );
}

function SheetPrimaryButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 w-full rounded-[16px] px-4 py-3 text-sm font-black transition-[transform,opacity] active:scale-[0.99] disabled:opacity-45"
      style={{ background: LEGACY_COLORS.blue, color: LEGACY_COLORS.s1 }}
    >
      {children}
    </button>
  );
}

function SheetSecondaryButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 w-full rounded-[16px] border px-4 py-3 text-sm font-bold transition-[transform,opacity] active:scale-[0.99] disabled:opacity-45"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
    >
      {children}
    </button>
  );
}

function SheetDangerButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 w-full rounded-[16px] border px-4 py-3 text-sm font-black transition-[transform,opacity] active:scale-[0.99] disabled:opacity-45"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.red} 9%, transparent)`,
        borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
        color: LEGACY_COLORS.red,
      }}
    >
      {children}
    </button>
  );
}

function SectionEditorSheet({
  open,
  section,
  draft,
  busy,
  onChange,
  onClose,
  onDelete,
  onSave,
}: {
  open: boolean;
  section: AssemblyChecklistSection | null;
  draft: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const isCreate = section === null;
  return (
    <BottomSheet open={open} onClose={onClose} title={isCreate ? "박스 추가" : "박스 편집"}>
      <div className="flex flex-col gap-3 px-5 pb-2">
        <label className={`flex flex-col gap-2 ${TYPO.body} font-bold`} style={{ color: LEGACY_COLORS.text }}>
          박스 이름
          <input
            aria-label="박스 이름"
            value={draft}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
            placeholder="예: 전원 ON"
            className="min-h-11 rounded-[12px] border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] disabled:opacity-45"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </label>
        {!isCreate && <SheetDangerButton ariaLabel="박스 삭제" disabled={busy} onClick={onDelete}>박스 삭제</SheetDangerButton>}
        <SheetSecondaryButton ariaLabel="취소" disabled={busy} onClick={onClose}>취소</SheetSecondaryButton>
        <div
          data-testid="checklist-section-save"
          className="sticky bottom-0 -mx-5 border-t px-5 pb-2 pt-3"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <SheetPrimaryButton
            ariaLabel={isCreate ? "박스 추가 저장" : "박스 이름 저장"}
            disabled={busy || !draft.trim()}
            onClick={onSave}
          >
            {isCreate ? "박스 추가" : "저장"}
          </SheetPrimaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}

function ItemEditorSheet({
  open,
  item,
  draft,
  busy,
  onChange,
  onClose,
  onDelete,
  onMove,
  onSave,
}: {
  open: boolean;
  item: AssemblyChecklistItem | null;
  draft: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onMove: () => void;
  onSave: () => void;
}) {
  const isCreate = item === null;
  return (
    <BottomSheet open={open} onClose={onClose} title={isCreate ? "항목 추가" : "항목 수정"}>
      <div className="flex flex-col gap-3 px-5 pb-2">
        <label className={`flex flex-col gap-2 ${TYPO.body} font-bold`} style={{ color: LEGACY_COLORS.text }}>
          항목 문구
          <textarea
            aria-label="항목 문구"
            value={draft}
            disabled={busy}
            rows={5}
            onChange={(event) => onChange(event.target.value)}
            className={`${TYPO.body} min-h-28 w-full resize-y rounded-[12px] border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] disabled:opacity-45`}
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </label>
        {!isCreate && (
          <>
            <SheetSecondaryButton ariaLabel="다른 박스로 이동" disabled={busy} onClick={onMove}>다른 박스로 이동</SheetSecondaryButton>
            <SheetDangerButton ariaLabel="항목 삭제" disabled={busy} onClick={onDelete}>항목 삭제</SheetDangerButton>
          </>
        )}
        <SheetSecondaryButton ariaLabel="취소" disabled={busy} onClick={onClose}>취소</SheetSecondaryButton>
        <div
          data-testid="checklist-item-save"
          className="sticky bottom-0 -mx-5 border-t px-5 pb-2 pt-3"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <SheetPrimaryButton
            ariaLabel={isCreate ? "항목 추가 저장" : "항목 저장"}
            disabled={busy || !draft.trim()}
            onClick={onSave}
          >
            {isCreate ? "항목 추가" : "저장"}
          </SheetPrimaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}

function DiscardChangesSheet({
  open,
  onClose,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  onDiscard: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="변경사항을 버릴까요?">
      <div className="flex flex-col gap-3 px-5 pb-2">
        <p className={TYPO.body} style={{ color: LEGACY_COLORS.text }}>
          저장하지 않은 변경사항은 사라집니다.
        </p>
        <SheetSecondaryButton ariaLabel="계속 편집" onClick={onClose}>계속 편집</SheetSecondaryButton>
        <SheetDangerButton ariaLabel="버리기" onClick={onDiscard}>버리기</SheetDangerButton>
      </div>
    </BottomSheet>
  );
}

function MoveItemSheet({
  open,
  source,
  sections,
  busy,
  onClose,
  onMove,
}: {
  open: boolean;
  source: { item: AssemblyChecklistItem; section: AssemblyChecklistSection } | null;
  sections: AssemblyChecklistSection[];
  busy: boolean;
  onClose: () => void;
  onMove: (section: AssemblyChecklistSection) => void;
}) {
  const targets = source ? sections.filter((section) => section.section_id !== source.section.section_id) : [];
  return (
    <BottomSheet open={open} onClose={onClose} title="다른 박스로 이동">
      <div className="flex flex-col gap-3 px-5 pb-2">
        <p className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
          선택한 항목을 대상 박스의 맨 아래로 이동합니다.
        </p>
        {targets.length === 0 ? (
          <p className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>이동할 다른 박스가 없습니다.</p>
        ) : targets.map((section) => (
          <button
            key={section.section_id}
            type="button"
            aria-label={`${sectionLabel(section)}으로 이동`}
            disabled={busy}
            onClick={() => onMove(section)}
            className="flex min-h-11 items-center justify-between rounded-[14px] border px-4 text-left text-sm font-black transition-[transform] active:scale-[0.99] disabled:opacity-45"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            <span>{sectionLabel(section)}</span>
            <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
          </button>
        ))}
        <SheetSecondaryButton ariaLabel="취소" disabled={busy} onClick={onClose}>취소</SheetSecondaryButton>
      </div>
    </BottomSheet>
  );
}

function DeleteItemSheet({
  open,
  item,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  item: AssemblyChecklistItem | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="항목을 삭제할까요?">
      <div className="flex flex-col gap-3 px-5 pb-2">
        <p className={`${TYPO.body} whitespace-pre-line`} style={{ color: LEGACY_COLORS.text }}>{item?.content}</p>
        <p className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>이 작업은 되돌릴 수 없습니다.</p>
        <SheetDangerButton ariaLabel="항목 삭제 확인" disabled={busy} onClick={onConfirm}>삭제</SheetDangerButton>
        <SheetSecondaryButton ariaLabel="취소" disabled={busy} onClick={onClose}>취소</SheetSecondaryButton>
      </div>
    </BottomSheet>
  );
}

function DeleteSectionSheet({
  open,
  section,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  section: AssemblyChecklistSection | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const itemCount = section?.items.length ?? 0;
  return (
    <BottomSheet open={open} onClose={onClose} title={`${section ? sectionLabel(section) : "이"} 박스를 삭제할까요?`}>
      <div className="flex flex-col gap-3 px-5 pb-2">
        <p className={TYPO.body} style={{ color: LEGACY_COLORS.text }}>{itemCount}개 항목도 함께 삭제됩니다.</p>
        <p className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>이 작업은 되돌릴 수 없습니다.</p>
        <SheetDangerButton ariaLabel="박스 삭제 확인" disabled={busy} onClick={onConfirm}>삭제</SheetDangerButton>
        <SheetSecondaryButton ariaLabel="취소" disabled={busy} onClick={onClose}>취소</SheetSecondaryButton>
      </div>
    </BottomSheet>
  );
}

function ManagedSection({
  section,
  onAddItem,
  onEditItem,
  onEditSection,
}: {
  section: AssemblyChecklistSection;
  onAddItem: (section: AssemblyChecklistSection) => void;
  onEditItem: (section: AssemblyChecklistSection, item: AssemblyChecklistItem) => void;
  onEditSection: (section: AssemblyChecklistSection) => void;
}) {
  const label = sectionLabel(section);
  return (
    <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`${TYPO.title} min-w-0 flex-1`} style={{ color: LEGACY_COLORS.text }}>{label}</h3>
        <button
          type="button"
          aria-label={`${label} 박스 편집`}
          onClick={() => onEditSection(section)}
          className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border transition-[transform] active:scale-[0.94]"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <ol className="mt-3 list-none divide-y p-0" aria-label={`${label} 관리 항목`} style={{ borderColor: LEGACY_COLORS.border }}>
        {section.items.map((item, index) => (
          <li key={item.item_id}>
            <div className="flex min-h-[52px] items-center">
              <button
                type="button"
                aria-label={`${item.content} 항목 편집`}
                onClick={() => onEditItem(section, item)}
                className="no-btn-inset flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-3 text-left transition-[transform] active:scale-[0.99]"
              >
                <span
                  className="w-5 shrink-0 text-center text-xs font-black"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  {index + 1}
                </span>
                <span className={`${TYPO.body} min-w-0 flex-1 whitespace-pre-line`} style={{ color: LEGACY_COLORS.text }}>
                  {item.content}
                </span>
              </button>
              <button
                type="button"
                aria-label={`${item.content} 항목 편집 바로가기`}
                onClick={() => onEditItem(section, item)}
                className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center transition-[transform] active:scale-[0.94]"
              >
                <Pencil className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        aria-label={`${label} 항목 추가`}
        onClick={() => onAddItem(section)}
        className="flex min-h-11 w-full items-center justify-center gap-2 border-t px-3 text-sm font-black transition-[transform] active:scale-[0.99]"
        style={{
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.blue,
        }}
      >
        <Plus className="h-4 w-4" />
        항목 추가
      </button>
    </section>
  );
}

function SortSection({
  section,
  sectionIndex,
  pending,
  savingDrag,
  itemDrag,
  sectionDrag,
}: {
  section: AssemblyChecklistSection;
  sectionIndex: number;
  pending: boolean;
  savingDrag: DragSaveState | null;
  itemDrag: UseAssemblyChecklistItemDragResult;
  sectionDrag: UseAssemblyChecklistSectionDragResult;
}) {
  const label = sectionLabel(section);
  const controlsLocked = pending || savingDrag !== null;
  const isSectionSaving = savingDrag?.kind === "section" && savingDrag.id === section.section_id;
  const sectionHandlers = sectionDrag.makeHandlers(section.section_id);
  const isSectionTarget = sectionDrag.dropTargetSectionId === section.section_id;
  const sectionShadow = isSectionTarget
    ? sectionDrag.dropPosition === "before"
      ? `inset 0 3px 0 ${LEGACY_COLORS.blue}`
      : `inset 0 -3px 0 ${LEGACY_COLORS.blue}`
    : undefined;

  return (
    <section
      data-checklist-section-id={section.section_id}
      data-checklist-section-sort-id={section.section_id}
      className="rounded-[20px] border p-4"
      style={{
        ...CARD_STYLE,
        background: sectionDrag.dragId === section.section_id
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`
          : CARD_STYLE.background,
        borderColor: isSectionTarget ? LEGACY_COLORS.blue : CARD_STYLE.borderColor,
        boxShadow: sectionShadow,
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label} 박스 순서 변경`}
          disabled={controlsLocked}
          className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] disabled:opacity-45"
          {...sectionHandlers}
          style={{ ...sectionHandlers.style, color: LEGACY_COLORS.muted2 }}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="w-5 shrink-0 text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>{sectionIndex + 1}</span>
        <h3 className={`${TYPO.title} min-w-0 flex-1`} style={{ color: LEGACY_COLORS.text }}>{label}</h3>
        {isSectionSaving && <span className={TYPO.caption} style={{ color: LEGACY_COLORS.blue }}>저장 중</span>}
      </div>
      <ol className="mt-3 flex list-none flex-col gap-2 p-0" aria-label={`${label} 순서 변경 항목`}>
        {section.items.map((item, index) => {
          const itemHandlers = itemDrag.makeHandlers(section.section_id, item.item_id);
          const isItemSaving = savingDrag?.kind === "item" && savingDrag.id === item.item_id;
          const isItemTarget = itemDrag.dropTargetSectionId === section.section_id
            && itemDrag.dropTargetItemId === item.item_id;
          const itemShadow = isItemTarget
            ? itemDrag.dropPosition === "before"
              ? `inset 0 3px 0 ${LEGACY_COLORS.blue}`
              : `inset 0 -3px 0 ${LEGACY_COLORS.blue}`
            : undefined;
          return (
            <li
              key={item.item_id}
              data-checklist-item-id={item.item_id}
              data-checklist-section-id={section.section_id}
              className="flex min-h-11 items-center gap-2 rounded-[14px] border px-2 py-2"
              style={{
                background: itemDrag.dragId === item.item_id
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`
                  : LEGACY_COLORS.s2,
                borderColor: isItemTarget ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                boxShadow: itemShadow,
              }}
            >
              <button
                type="button"
                aria-label={`${item.content} 항목 순서 변경`}
                disabled={controlsLocked}
                className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] disabled:opacity-45"
                {...itemHandlers}
                style={{ ...itemHandlers.style, color: LEGACY_COLORS.muted2 }}
              >
                <GripVertical className="h-5 w-5" />
              </button>
              <span className="w-5 shrink-0 text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>{index + 1}</span>
              <span className={`${TYPO.body} min-w-0 flex-1 whitespace-pre-line`} style={{ color: LEGACY_COLORS.text }}>
                {item.content}
              </span>
              {isItemSaving && <span className={TYPO.caption} style={{ color: LEGACY_COLORS.blue }}>저장 중</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ManageDetail({
  checklist,
  onBack,
  onLatest,
}: {
  checklist: AssemblyChecklist;
  onBack: () => void;
  onLatest: (checklist: AssemblyChecklist) => void;
}) {
  const [isSorting, setIsSorting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [itemDraft, setItemDraft] = useState("");
  const [sectionEditor, setSectionEditor] = useState<SectionEditorState | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [discardEditor, setDiscardEditor] = useState<DiscardEditor | null>(null);
  const [savingDrag, setSavingDrag] = useState<DragSaveState | null>(null);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const createSection = useCreateAssemblyChecklistSectionMutation();
  const updateSection = useUpdateAssemblyChecklistSectionMutation();
  const deleteSection = useDeleteAssemblyChecklistSectionMutation();
  const reorderSections = useReorderAssemblyChecklistSectionsMutation();
  const createItem = useCreateAssemblyChecklistItemMutation();
  const updateItem = useUpdateAssemblyChecklistItemMutation();
  const deleteItem = useDeleteAssemblyChecklistItemMutation();
  const moveItem = useMoveAssemblyChecklistItemMutation();
  const reorderItems = useReorderAssemblyChecklistItemsMutation();
  const pending = createSection.isPending || updateSection.isPending || deleteSection.isPending
    || reorderSections.isPending || createItem.isPending || updateItem.isPending || deleteItem.isPending
    || moveItem.isPending || reorderItems.isPending;
  const editedSection = sectionEditor?.sectionId
    ? checklist.sections.find((section) => section.section_id === sectionEditor.sectionId) ?? null
    : null;
  const editedItem = findItem(checklist, itemEditor?.itemId ?? null);
  const movedItem = findItem(checklist, moveItemId);
  const deletedItem = findItem(checklist, deleteItemId)?.item ?? null;
  const deletedSection = deleteSectionId
    ? checklist.sections.find((section) => section.section_id === deleteSectionId) ?? null
    : null;
  const isSectionDirty = sectionEditor !== null
    && sectionDraft !== (editedSection ? sectionLabel(editedSection) : "");
  const isItemDirty = itemEditor !== null
    && itemDraft !== (editedItem?.item.content ?? "");

  const persistMove = async ({
    itemId,
    targetSectionId,
    targetIndex,
  }: {
    itemId: string;
    targetSectionId: string;
    targetIndex: number;
  }): Promise<boolean> => {
    try {
      setErrorMessage(null);
      onLatest(await moveItem.mutateAsync({ itemId, targetSectionId, targetIndex }));
      return true;
    } catch {
      setErrorMessage("항목을 다른 박스로 이동하지 못했습니다.");
      return false;
    }
  };

  const persistDrag = async ({
    saving,
    optimistic,
    save,
    error,
  }: {
    saving: DragSaveState;
    optimistic: AssemblyChecklist;
    save: () => Promise<AssemblyChecklist>;
    error: string;
  }) => {
    const snapshot = checklist;
    setErrorMessage(null);
    setSavingDrag(saving);
    onLatest(optimistic);
    try {
      onLatest(await save());
    } catch {
      onLatest(snapshot);
      setErrorMessage(error);
    } finally {
      setSavingDrag(null);
    }
  };

  const itemDrag = useAssemblyChecklistItemDrag(
    checklist.sections,
    (sectionId, itemIds, itemId) => {
      void persistDrag({
        saving: { kind: "item", id: itemId },
        optimistic: reorderChecklistItems(checklist, sectionId, itemIds),
        save: () => reorderItems.mutateAsync({ sectionId, itemIds }),
        error: "항목 순서를 저장하지 못했습니다.",
      });
    },
    (input) => {
      void persistDrag({
        saving: { kind: "item", id: input.itemId },
        optimistic: moveChecklistItem(checklist, input.itemId, input.targetSectionId, input.targetIndex),
        save: () => moveItem.mutateAsync(input),
        error: "항목을 다른 박스로 이동하지 못했습니다.",
      });
    },
  );
  const sectionDrag = useAssemblyChecklistSectionDrag(checklist.sections, (sectionIds, sectionId) => {
    void persistDrag({
      saving: { kind: "section", id: sectionId },
      optimistic: reorderChecklistSections(checklist, sectionIds),
      save: () => reorderSections.mutateAsync({ modelSlot: checklist.model_slot, sectionIds }),
      error: "박스 순서를 저장하지 못했습니다.",
    });
  });

  const openCreateSection = () => {
    setErrorMessage(null);
    setDiscardEditor(null);
    setSectionDraft("");
    setSectionEditor({ sectionId: null });
  };

  const openEditSection = (section: AssemblyChecklistSection) => {
    setErrorMessage(null);
    setDiscardEditor(null);
    setSectionDraft(sectionLabel(section));
    setSectionEditor({ sectionId: section.section_id });
  };

  const openCreateItem = (section: AssemblyChecklistSection) => {
    setErrorMessage(null);
    setDiscardEditor(null);
    setItemDraft("");
    setItemEditor({ itemId: null, sectionId: section.section_id });
  };

  const openEditItem = (section: AssemblyChecklistSection, item: AssemblyChecklistItem) => {
    setErrorMessage(null);
    setDiscardEditor(null);
    setItemDraft(item.content);
    setItemEditor({ itemId: item.item_id, sectionId: section.section_id });
  };

  const saveSection = async () => {
    if (!sectionEditor) return;
    const title = sectionDraft.trim();
    if (!title) return;
    try {
      setErrorMessage(null);
      const latest = sectionEditor.sectionId
        ? await updateSection.mutateAsync({ sectionId: sectionEditor.sectionId, title })
        : await createSection.mutateAsync({ modelSlot: checklist.model_slot, title });
      onLatest(latest);
      setSectionEditor(null);
    } catch {
      setErrorMessage(sectionEditor.sectionId ? "박스 이름을 저장하지 못했습니다." : "박스를 추가하지 못했습니다.");
    }
  };

  const saveItem = async () => {
    if (!itemEditor) return;
    const content = itemDraft.trim();
    if (!content) return;
    try {
      setErrorMessage(null);
      const latest = itemEditor.itemId
        ? await updateItem.mutateAsync({ itemId: itemEditor.itemId, content })
        : await createItem.mutateAsync({ sectionId: itemEditor.sectionId, content });
      onLatest(latest);
      setItemEditor(null);
    } catch {
      setErrorMessage(itemEditor.itemId ? "항목 문구를 저장하지 못했습니다." : "항목을 추가하지 못했습니다.");
    }
  };

  const confirmDeleteItem = async () => {
    if (!deleteItemId) return;
    try {
      setErrorMessage(null);
      onLatest(await deleteItem.mutateAsync({ itemId: deleteItemId }));
      setDeleteItemId(null);
      setItemEditor(null);
    } catch {
      setErrorMessage("항목을 삭제하지 못했습니다.");
    }
  };

  const confirmDeleteSection = async () => {
    if (!deleteSectionId) return;
    try {
      setErrorMessage(null);
      onLatest(await deleteSection.mutateAsync({ sectionId: deleteSectionId }));
      setDeleteSectionId(null);
      setSectionEditor(null);
    } catch {
      setErrorMessage("박스를 삭제하지 못했습니다.");
    }
  };

  const closeItemEditor = () => {
    if (pending) return;
    if (isItemDirty) {
      setDiscardEditor("item");
      return;
    }
    setItemEditor(null);
  };

  const closeSectionEditor = () => {
    if (pending) return;
    if (isSectionDirty) {
      setDiscardEditor("section");
      return;
    }
    setSectionEditor(null);
  };

  const discardEditorChanges = () => {
    if (discardEditor === "item") {
      setItemEditor(null);
      setItemDraft("");
    }
    if (discardEditor === "section") {
      setSectionEditor(null);
      setSectionDraft("");
    }
    setDiscardEditor(null);
  };

  const closeMoveSheet = () => {
    if (pending || !movedItem) return;
    setMoveItemId(null);
    setItemEditor({ itemId: movedItem.item.item_id, sectionId: movedItem.section.section_id });
  };

  const closeDeleteItemSheet = () => {
    if (pending || !deleteItemId) return;
    const current = findItem(checklist, deleteItemId);
    setDeleteItemId(null);
    if (current) setItemEditor({ itemId: current.item.item_id, sectionId: current.section.section_id });
  };

  const closeDeleteSectionSheet = () => {
    if (pending || !deleteSectionId) return;
    setDeleteSectionId(null);
    setSectionEditor({ sectionId: deleteSectionId });
  };

  const moveSelectedItem = async (section: AssemblyChecklistSection) => {
    if (!moveItemId) return;
    const moved = await persistMove({
      itemId: moveItemId,
      targetSectionId: section.section_id,
      targetIndex: section.items.length,
    });
    if (moved) {
      setMoveItemId(null);
      setItemEditor(null);
    }
  };

  return (
    <>
      <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
        <Header title={checklist.model_name} onBack={onBack} backLabel="체크리스트 관리 목록으로 돌아가기" />
        {checklist.sections.length > 0 && (
          <div className="flex justify-end">
            <button
            type="button"
            aria-label="순서 변경"
            aria-pressed={isSorting}
            disabled={pending && !isSorting}
            onClick={() => setIsSorting((current) => !current)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-black transition-[transform] active:scale-[0.99] disabled:opacity-45"
            style={{
              background: isSorting
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                : LEGACY_COLORS.s2,
              borderColor: isSorting
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 50%, transparent)`
                : LEGACY_COLORS.border,
              color: isSorting ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
            }}
          >
            <ListOrdered className="h-4 w-4" style={{ color: isSorting ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }} />
            순서 변경
            </button>
          </div>
        )}
        <ErrorText message={errorMessage} />
        {isSorting
          ? checklist.sections.map((section, index) => (
            <SortSection
              key={section.section_id}
              section={section}
              sectionIndex={index}
              pending={pending}
              savingDrag={savingDrag}
              itemDrag={itemDrag}
              sectionDrag={sectionDrag}
            />
          ))
          : checklist.sections.map((section) => (
            <ManagedSection
              key={section.section_id}
              section={section}
              onAddItem={openCreateItem}
              onEditItem={openEditItem}
              onEditSection={openEditSection}
            />
          ))}
        {!isSorting && checklist.sections.length > 0 && (
          <button
            type="button"
            aria-label="박스 추가"
            disabled={pending}
            onClick={openCreateSection}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border px-3 text-sm font-black transition-[transform] active:scale-[0.99] disabled:opacity-45"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            <Plus className="h-4 w-4" />
            박스 추가
          </button>
        )}
        {!isSorting && checklist.sections.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              aria-label="박스 추가"
              disabled={pending}
              onClick={openCreateSection}
              className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-black transition-[transform] active:scale-[0.99] disabled:opacity-45"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`,
                color: LEGACY_COLORS.blue,
              }}
            >
              <Plus className="h-4 w-4" />
              박스 추가
            </button>
          </div>
        )}
      </div>
      <SectionEditorSheet
        open={sectionEditor !== null}
        section={editedSection}
        draft={sectionDraft}
        busy={pending}
        onChange={setSectionDraft}
        onClose={closeSectionEditor}
        onSave={() => void saveSection()}
        onDelete={() => {
          if (!editedSection) return;
          setSectionEditor(null);
          setDeleteSectionId(editedSection.section_id);
        }}
      />
      <ItemEditorSheet
        open={itemEditor !== null}
        item={editedItem?.item ?? null}
        draft={itemDraft}
        busy={pending}
        onChange={setItemDraft}
        onClose={closeItemEditor}
        onSave={() => void saveItem()}
        onMove={() => {
          if (!editedItem) return;
          setItemEditor(null);
          setMoveItemId(editedItem.item.item_id);
        }}
        onDelete={() => {
          if (!editedItem) return;
          setItemEditor(null);
          setDeleteItemId(editedItem.item.item_id);
        }}
      />
      <DiscardChangesSheet
        open={discardEditor !== null}
        onClose={() => setDiscardEditor(null)}
        onDiscard={discardEditorChanges}
      />
      <MoveItemSheet
        open={moveItemId !== null}
        source={movedItem}
        sections={checklist.sections}
        busy={pending}
        onClose={closeMoveSheet}
        onMove={(section) => void moveSelectedItem(section)}
      />
      <DeleteItemSheet
        open={deleteItemId !== null}
        item={deletedItem}
        busy={pending}
        onClose={closeDeleteItemSheet}
        onConfirm={() => void confirmDeleteItem()}
      />
      <DeleteSectionSheet
        open={deleteSectionId !== null}
        section={deletedSection}
        busy={pending}
        onClose={closeDeleteSectionSheet}
        onConfirm={() => void confirmDeleteSection()}
      />
    </>
  );
}

function ManageHome({
  checklists,
  models,
  onBack,
  onOpen,
  onAdd,
  pending,
}: {
  checklists: AssemblyChecklist[];
  models: ProductModel[];
  onBack: () => void;
  onOpen: (checklist: AssemblyChecklist) => void;
  onAdd: (model: ProductModel) => void;
  pending: boolean;
}) {
  const configuredSlots = new Set(checklists.map((checklist) => checklist.model_slot));
  const availableModels = models.filter((model) => model.model_name && !model.is_reserved && !configuredSlots.has(model.slot));
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      <Header title="체크리스트 관리" onBack={onBack} backLabel="체크리스트 선택으로 돌아가기" />
      <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
        <h3 className={TYPO.title} style={{ color: LEGACY_COLORS.text }}>제품 추가</h3>
        <p className={`mt-1 ${TYPO.caption}`} style={{ color: LEGACY_COLORS.muted2 }}>
          기존 MES 모델만 체크리스트에 등록할 수 있습니다.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {availableModels.length === 0 ? (
            <p className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>추가할 수 있는 모델이 없습니다.</p>
          ) : availableModels.map((model) => (
            <button
              key={model.slot}
              type="button"
              aria-label={`${model.model_name} 체크리스트 추가`}
              onClick={() => onAdd(model)}
              disabled={pending}
              className="flex min-h-11 items-center justify-between rounded-[12px] border px-3 py-2 text-left disabled:opacity-45"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              <span className="text-sm font-black">{model.model_name}</span>
              <span className="text-xs font-black" style={{ color: LEGACY_COLORS.blue }}>추가</span>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
        <h3 className={TYPO.title} style={{ color: LEGACY_COLORS.text }}>등록된 제품</h3>
        <div className="mt-3 flex flex-col gap-2">
          {checklists.map((checklist) => (
            <button
              key={checklist.checklist_id}
              type="button"
              aria-label={`${checklist.model_name} 관리`}
              onClick={() => onOpen(checklist)}
              className="flex min-h-11 items-center justify-between rounded-[12px] border px-3 text-left"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              <span className="text-sm font-black">{checklist.model_name}</span>
              <Settings2 className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MobileAssemblyChecklistScreen({ onExit }: { onExit?: () => void }) {
  const [mode, setMode] = useState<ScreenMode>("browse");
  const [selectedModelSlot, setSelectedModelSlot] = useState<number | null>(null);
  const [completedItemKeys, setCompletedItemKeys] = useState<Set<string>>(() => new Set());
  const [latestChecklist, setLatestChecklist] = useState<AssemblyChecklist | null>(null);
  const latestChecklistQueryRef = useRef<AssemblyChecklist[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { data: checklists = [], isLoading, error } = useAssemblyChecklistsQuery();
  const { data: models = [] } = useModelsQuery();
  const createChecklist = useCreateAssemblyChecklistMutation();

  useEffect(() => {
    if (latestChecklist && latestChecklistQueryRef.current !== checklists) {
      setLatestChecklist(null);
      latestChecklistQueryRef.current = null;
    }
  }, [checklists, latestChecklist]);

  const selectedChecklist = selectedModelSlot === null
    ? null
    : (latestChecklist?.model_slot === selectedModelSlot ? latestChecklist : null)
      ?? checklists.find((checklist) => checklist.model_slot === selectedModelSlot);

  const openChecklist = (checklist: AssemblyChecklist) => {
    setSelectedModelSlot(checklist.model_slot);
    setLatestChecklist(null);
    latestChecklistQueryRef.current = null;
  };

  const applyLatestChecklist = (latest: AssemblyChecklist) => {
    latestChecklistQueryRef.current = checklists;
    setLatestChecklist(latest);
  };

  const toggleChecklistItem = (itemKey: string) => {
    setCompletedItemKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(itemKey)) nextKeys.delete(itemKey);
      else nextKeys.add(itemKey);
      return nextKeys;
    });
  };

  const clearChecklistSection = (section: AssemblyChecklistSection) => {
    setCompletedItemKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      section.items.forEach((item) => nextKeys.delete(checklistItemKey(item.item_id)));
      return nextKeys;
    });
  };

  const addChecklist = async (model: ProductModel) => {
    try {
      setErrorMessage(null);
      const latest = await createChecklist.mutateAsync({ modelSlot: model.slot });
      applyLatestChecklist(latest);
      setSelectedModelSlot(latest.model_slot);
      setMode("manageDetail");
    } catch {
      setErrorMessage("체크리스트를 추가하지 못했습니다.");
    }
  };

  if (selectedChecklist && mode === "browse") {
    return (
      <BrowseDetail
        checklist={selectedChecklist}
        onBack={() => setSelectedModelSlot(null)}
        completedItemKeys={completedItemKeys}
        onToggle={toggleChecklistItem}
        onClearSection={clearChecklistSection}
      />
    );
  }

  if (selectedChecklist && mode === "manageDetail") {
    return (
      <ManageDetail
        checklist={selectedChecklist}
        onBack={() => {
          setSelectedModelSlot(null);
          setLatestChecklist(null);
          setMode("manage");
        }}
        onLatest={applyLatestChecklist}
      />
    );
  }

  if (mode === "manage") {
    return (
      <>
        <ManageHome
          checklists={checklists}
          models={models}
          onBack={() => setMode("browse")}
          onOpen={(checklist) => {
            openChecklist(checklist);
            setMode("manageDetail");
          }}
          onAdd={(model) => void addChecklist(model)}
          pending={createChecklist.isPending}
        />
        <ErrorText message={errorMessage} />
      </>
    );
  }

  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-3">
      <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
        <div className="flex items-center gap-3">
          {onExit && (
            <button
              type="button"
              aria-label="더보기 메뉴로 돌아가기"
              onClick={onExit}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-[transform] active:scale-[0.94]"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 20%, transparent)` }}
          >
            <ClipboardCheck className="h-6 w-6" style={{ color: LEGACY_COLORS.blue }} />
          </span>
          <h2 className={`${TYPO.display} min-w-0 flex-1 truncate leading-tight`} style={{ color: LEGACY_COLORS.text }}>
            조립 체크리스트
          </h2>
          <button
            type="button"
            aria-label="체크리스트 관리"
            onClick={() => setMode("manage")}
            className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
          >
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      </section>
      {isLoading ? (
        <p className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>체크리스트를 불러오는 중입니다.</p>
      ) : error ? (
        <p role="alert" className={TYPO.body} style={{ color: LEGACY_COLORS.red }}>체크리스트를 불러오지 못했습니다.</p>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {checklists.map((checklist) => <ProductCard key={checklist.checklist_id} checklist={checklist} onClick={() => openChecklist(checklist)} />)}
        </div>
      )}
    </div>
  );
}
