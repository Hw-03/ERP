"use client";

import { useState } from "react";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ASSEMBLY_CHECKLISTS, type AssemblyChecklistProductId } from "./assemblyChecklistData";
import { TYPO } from "../tokens";

const CARD_STYLE = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
} as const;

function getChecklistItemKey(productId: AssemblyChecklistProductId, sectionIndex: number, itemIndex: number): string {
  return `${productId}:${sectionIndex}:${itemIndex}`;
}

export function MobileAssemblyChecklistScreen({ onExit }: { onExit?: () => void }) {
  const [selectedProductId, setSelectedProductId] = useState<AssemblyChecklistProductId | null>(null);
  const [completedItemKeys, setCompletedItemKeys] = useState<Set<string>>(() => new Set());
  const selectedProduct = ASSEMBLY_CHECKLISTS.find((product) => product.id === selectedProductId);

  const toggleChecklistItem = (itemKey: string) => {
    setCompletedItemKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(itemKey)) {
        nextKeys.delete(itemKey);
      } else {
        nextKeys.add(itemKey);
      }

      return nextKeys;
    });
  };

  const clearChecklistSection = (sectionIndex: number) => {
    if (!selectedProduct) return;

    setCompletedItemKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      const section = selectedProduct.sections[sectionIndex];

      section.items.forEach((_item, itemIndex) => {
        nextKeys.delete(getChecklistItemKey(selectedProduct.id, sectionIndex, itemIndex));
      });

      return nextKeys;
    });
  };

  if (!selectedProduct) {
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
            <div>
              <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
                조립 체크리스트
              </h2>
              <p className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                제품을 선택하세요.
              </p>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-2">
          {ASSEMBLY_CHECKLISTS.map((product) => (
            <button
              key={product.id}
              type="button"
              aria-label={`${product.label} 체크리스트 열기`}
              onClick={() => setSelectedProductId(product.id)}
              className="flex items-center gap-4 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
              style={CARD_STYLE}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)` }}
              >
                <ClipboardCheck className="h-6 w-6" style={{ color: LEGACY_COLORS.blue }} />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
                  {product.label}
                </span>
                <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  조립 체크리스트
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="제품 선택으로 돌아가기"
          onClick={() => setSelectedProductId(null)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-[transform] active:scale-[0.94]"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
          {selectedProduct.label}
        </h2>
      </div>

      {selectedProduct.sections.map((section, sectionIndex) => {
        const hasCompletedSectionItem = section.items.some((_item, itemIndex) =>
          completedItemKeys.has(getChecklistItemKey(selectedProduct.id, sectionIndex, itemIndex)),
        );

        return (
        <section key={section.title ?? sectionIndex} className="rounded-[20px] border p-4" style={CARD_STYLE}>
          {section.title && (
            <h3 className={`${TYPO.overline} mb-3`} style={{ color: LEGACY_COLORS.muted2 }}>
              {section.title}
            </h3>
          )}
          <ol aria-label={`${section.title ?? selectedProduct.label} 체크리스트`} className="flex list-none flex-col gap-2 p-0">
            {section.items.map((item, itemIndex) => {
              const itemKey = getChecklistItemKey(selectedProduct.id, sectionIndex, itemIndex);
              const isCompleted = completedItemKeys.has(itemKey);

              return (
                <li key={itemKey}>
                  <button
                    type="button"
                    aria-pressed={isCompleted}
                    onClick={() => toggleChecklistItem(itemKey)}
                    className="flex min-h-11 w-full gap-3 rounded-[14px] border px-3 py-3 text-left transition-colors"
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
                      {item}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => clearChecklistSection(sectionIndex)}
            disabled={!hasCompletedSectionItem}
            className="mt-3 min-h-11 w-full rounded-[12px] border px-3 py-2 text-sm font-black disabled:opacity-45"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 45%, transparent)`,
              color: LEGACY_COLORS.green,
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
