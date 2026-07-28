"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardCheck, GripVertical, Settings2, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { ProductModel } from "@/lib/api";
import type {
  AssemblyChecklist,
  AssemblyChecklistItem,
  AssemblyChecklistSection,
} from "@/lib/api/types/assembly-checklists";
import {
  useAssemblyChecklistsQuery,
  useCreateAssemblyChecklistItemMutation,
  useCreateAssemblyChecklistMutation,
  useCreateAssemblyChecklistSectionMutation,
  useDeleteAssemblyChecklistItemMutation,
  useMoveAssemblyChecklistItemMutation,
  useReorderAssemblyChecklistItemsMutation,
  useUpdateAssemblyChecklistItemMutation,
} from "@/lib/queries/useAssemblyChecklistsQuery";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { TYPO } from "../tokens";
import { useAssemblyChecklistItemDrag, type UseAssemblyChecklistItemDragResult } from "./useAssemblyChecklistItemDrag";

const CARD_STYLE = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
} as const;

type ScreenMode = "browse" | "manage" | "manageDetail";

function checklistItemKey(itemId: string): string {
  return itemId;
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
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
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
      <span aria-hidden="true" className="h-10 w-10" />
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
      className="flex items-center gap-4 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
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

function ManagedSection({
  section,
  onAddItem,
  onDeleteItem,
  onUpdateItem,
  pending,
  drag,
}: {
  section: AssemblyChecklistSection;
  onAddItem: (sectionId: string, content: string) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onUpdateItem: (itemId: string, content: string) => Promise<void>;
  pending: boolean;
  drag: UseAssemblyChecklistItemDragResult;
}) {
  const [itemDraft, setItemDraft] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRestoreItemId = useRef<string | null>(null);
  const label = section.title ?? "기본 항목";
  const isEmptyDropTarget = drag.dropTargetSectionId === section.section_id && !drag.dropTargetItemId;

  useEffect(() => {
    if (editingItemId) {
      textareaRef.current?.focus();
      return;
    }
    const itemId = focusRestoreItemId.current;
    if (!itemId) return;
    editButtonRefs.current.get(itemId)?.focus();
    focusRestoreItemId.current = null;
  }, [editingItemId]);

  const submit = async () => {
    const content = itemDraft.trim();
    if (!content) return;
    await onAddItem(section.section_id, content);
    setItemDraft("");
  };

  const saveEdit = async (itemId: string) => {
    const content = editDraft.trim();
    if (!content) return;
    try {
      await onUpdateItem(itemId, content);
      focusRestoreItemId.current = itemId;
      setEditingItemId(null);
      setEditDraft("");
    } catch {
      // ManageDetail displays the mutation failure while this row stays editable.
    }
  };

  return (
    <section
      data-checklist-section-id={section.section_id}
      className="rounded-[20px] border p-4"
      style={{
        ...CARD_STYLE,
        background: isEmptyDropTarget ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)` : CARD_STYLE.background,
        borderColor: isEmptyDropTarget ? LEGACY_COLORS.blue : CARD_STYLE.borderColor,
      }}
    >
      <h3 className={TYPO.title} style={{ color: LEGACY_COLORS.text }}>{label}</h3>
      <div className="mt-3 flex gap-2">
        <input
          aria-label={`${label} 항목`}
          value={itemDraft}
          onChange={(event) => setItemDraft(event.target.value)}
          placeholder="세부 항목 입력"
          className="min-h-11 min-w-0 flex-1 rounded-[12px] border px-3 text-sm font-medium outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending || !itemDraft.trim()}
          className="min-h-11 shrink-0 rounded-[12px] border px-3 text-sm font-black disabled:opacity-45"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 45%, transparent)`,
            color: LEGACY_COLORS.blue,
          }}
        >
          항목 추가
        </button>
      </div>
      <ol className="mt-3 flex list-none flex-col gap-2 p-0" aria-label={`${label} 관리 항목`}>
        {section.items.map((item, index) => {
          const isEditing = editingItemId === item.item_id;
          const interactionDisabled = pending || editingItemId !== null;
          const isDragTarget = drag.dragId === item.item_id
            || (drag.dropTargetSectionId === section.section_id && drag.dropTargetItemId === item.item_id);
          const dragHandlers = drag.makeHandlers(section.section_id, item.item_id);
          return (
            <li
              key={item.item_id}
              data-item-id={item.item_id}
              data-checklist-section-id={section.section_id}
              data-checklist-item-id={item.item_id}
              className="flex min-h-11 items-center gap-2 rounded-[14px] border px-2 py-2"
              style={{
                background: isDragTarget ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)` : LEGACY_COLORS.s2,
                borderColor: isDragTarget ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <button
                type="button"
                aria-label={`${item.content} 순서 변경`}
                disabled={interactionDisabled}
                className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] disabled:opacity-45"
                {...dragHandlers}
                style={{ ...dragHandlers.style, color: LEGACY_COLORS.muted2 }}
              >
                <GripVertical className="h-5 w-5" />
              </button>
              <span className="w-5 shrink-0 text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>{index + 1}</span>
              {isEditing ? (
                <div className="min-w-0 flex-1">
                  <textarea
                    aria-label={`${item.content} 문구`}
                    ref={textareaRef}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    disabled={pending}
                    rows={3}
                    className={`${TYPO.body} min-h-20 w-full resize-y rounded-[12px] border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] disabled:opacity-45`}
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      aria-label="항목 수정 취소"
                      disabled={pending}
                      onClick={() => {
                        focusRestoreItemId.current = item.item_id;
                        setEditingItemId(null);
                        setEditDraft("");
                      }}
                      className="min-h-11 rounded-[12px] border px-3 text-sm font-black disabled:opacity-45"
                      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      aria-label="항목 수정 저장"
                      onClick={() => void saveEdit(item.item_id)}
                      disabled={pending || !editDraft.trim()}
                      className="min-h-11 rounded-[12px] border px-3 text-sm font-black disabled:opacity-45"
                      style={{
                        background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
                        borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 45%, transparent)`,
                        color: LEGACY_COLORS.blue,
                      }}
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`${item.content} 수정`}
                  onClick={() => {
                    setEditingItemId(item.item_id);
                    setEditDraft(item.content);
                  }}
                  disabled={pending}
                  ref={(element) => {
                    if (element) editButtonRefs.current.set(item.item_id, element);
                    else editButtonRefs.current.delete(item.item_id);
                  }}
                  className={`${TYPO.body} no-btn-inset min-h-11 min-w-0 flex-1 whitespace-pre-line text-left disabled:opacity-45`}
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {item.content}
                </button>
              )}
              <button
                type="button"
                aria-label={`${item.content} 삭제`}
                disabled={interactionDisabled}
                onClick={() => {
                  if (window.confirm("이 체크리스트 항목을 삭제할까요?")) {
                    void onDeleteItem(item.item_id);
                  }
                }}
                className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] disabled:opacity-45"
                style={{ color: LEGACY_COLORS.red }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
  const [sectionTitle, setSectionTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createSection = useCreateAssemblyChecklistSectionMutation();
  const createItem = useCreateAssemblyChecklistItemMutation();
  const deleteItem = useDeleteAssemblyChecklistItemMutation();
  const moveItem = useMoveAssemblyChecklistItemMutation();
  const reorderItems = useReorderAssemblyChecklistItemsMutation();
  const updateItem = useUpdateAssemblyChecklistItemMutation();

  const saveSection = async () => {
    const title = sectionTitle.trim();
    if (!title) return;
    try {
      setErrorMessage(null);
      onLatest(await createSection.mutateAsync({ modelSlot: checklist.model_slot, title }));
      setSectionTitle("");
    } catch {
      setErrorMessage("박스를 추가하지 못했습니다.");
    }
  };

  const saveItem = async (sectionId: string, content: string) => {
    try {
      setErrorMessage(null);
      onLatest(await createItem.mutateAsync({ sectionId, content }));
    } catch {
      setErrorMessage("항목을 추가하지 못했습니다.");
    }
  };

  const saveOrder = async (sectionId: string, itemIds: string[]) => {
    try {
      setErrorMessage(null);
      onLatest(await reorderItems.mutateAsync({ sectionId, itemIds }));
    } catch {
      setErrorMessage("항목 순서를 저장하지 못했습니다.");
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      setErrorMessage(null);
      onLatest(await deleteItem.mutateAsync({ itemId }));
    } catch {
      setErrorMessage("항목을 삭제하지 못했습니다.");
    }
  };

  const saveUpdatedItem = async (itemId: string, content: string) => {
    try {
      setErrorMessage(null);
      onLatest(await updateItem.mutateAsync({ itemId, content }));
    } catch (error) {
      setErrorMessage("항목 문구를 저장하지 못했습니다.");
      throw error;
    }
  };

  const saveMove = async ({ itemId, targetSectionId, targetIndex }: { itemId: string; targetSectionId: string; targetIndex: number }) => {
    try {
      setErrorMessage(null);
      onLatest(await moveItem.mutateAsync({ itemId, targetSectionId, targetIndex }));
    } catch {
      setErrorMessage("항목을 다른 박스로 이동하지 못했습니다.");
    }
  };

  const drag = useAssemblyChecklistItemDrag(
    checklist.sections,
    (sectionId, itemIds) => { void saveOrder(sectionId, itemIds); },
    (input) => { void saveMove(input); },
  );
  const pending = createSection.isPending || createItem.isPending || deleteItem.isPending
    || moveItem.isPending || reorderItems.isPending || updateItem.isPending;
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      <Header title={checklist.model_name} onBack={onBack} backLabel="체크리스트 관리 목록으로 돌아가기" />
      <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
        <h3 className={TYPO.title} style={{ color: LEGACY_COLORS.text }}>박스 추가</h3>
        <div className="mt-3 flex gap-2">
          <input
            aria-label="박스 이름"
            value={sectionTitle}
            onChange={(event) => setSectionTitle(event.target.value)}
            placeholder="예: 전원 ON"
            className="min-h-11 min-w-0 flex-1 rounded-[12px] border px-3 text-sm font-medium outline-none"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <button
            type="button"
            onClick={() => void saveSection()}
            disabled={pending || !sectionTitle.trim()}
            className="min-h-11 shrink-0 rounded-[12px] border px-3 text-sm font-black disabled:opacity-45"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 45%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            박스 추가
          </button>
        </div>
      </section>
      <ErrorText message={errorMessage} />
      {checklist.sections.map((section) => (
        <ManagedSection
          key={section.section_id}
          section={section}
          onAddItem={saveItem}
          onDeleteItem={removeItem}
          onUpdateItem={saveUpdatedItem}
          pending={pending}
          drag={drag}
        />
      ))}
    </div>
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
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
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
        <div className="flex flex-col gap-2">
          {checklists.map((checklist) => <ProductCard key={checklist.checklist_id} checklist={checklist} onClick={() => openChecklist(checklist)} />)}
        </div>
      )}
    </div>
  );
}
