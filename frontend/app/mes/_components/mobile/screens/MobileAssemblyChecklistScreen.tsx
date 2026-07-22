"use client";

import { useState } from "react";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ASSEMBLY_CHECKLISTS, type AssemblyChecklistProductId } from "./assemblyChecklistData";
import { TYPO } from "../tokens";

const CARD_STYLE = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
  boxShadow: "var(--c-card-shadow)",
} as const;

export function MobileAssemblyChecklistScreen() {
  const [selectedProductId, setSelectedProductId] = useState<AssemblyChecklistProductId | null>(null);
  const selectedProduct = ASSEMBLY_CHECKLISTS.find((product) => product.id === selectedProductId);

  if (!selectedProduct) {
    return (
      <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
        <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
          <div className="flex items-center gap-3">
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

      {selectedProduct.sections.map((section, sectionIndex) => (
        <section key={section.title ?? sectionIndex} className="rounded-[20px] border p-4" style={CARD_STYLE}>
          {section.title && (
            <h3 className={`${TYPO.overline} mb-3`} style={{ color: LEGACY_COLORS.muted2 }}>
              {section.title}
            </h3>
          )}
          <ol aria-label={`${section.title ?? selectedProduct.label} 체크리스트`} className="flex list-none flex-col gap-2 p-0">
            {section.items.map((item, itemIndex) => (
              <li key={item} className="flex gap-3 rounded-[14px] border px-3 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black"
                  style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
                >
                  {itemIndex + 1}
                </span>
                <p className={`${TYPO.body} whitespace-pre-line`} style={{ color: LEGACY_COLORS.text }}>
                  {item}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
