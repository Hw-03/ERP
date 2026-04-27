---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/AdminBomSection.tsx
status: active
updated: 2026-04-27
source_sha: 141dca0954cd
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminBomSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/AdminBomSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `11681` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 238줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

// 5.5-E: BOM 4-step 인디케이터 분리 (BomStepIndicator).
// 5.6-E: 좌측 parent picker / 우측 child picker / where-used 분리.
//        AdminBomSection 은 orchestration only — 가운데 BOM 목록(active/all view) 만 inline.

import { X } from "lucide-react";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { useAdminBomContext } from "./AdminBomContext";
import { BomStepIndicator } from "./_bom_parts/BomStepIndicator";
import { BomParentPicker } from "./_bom_parts/BomParentPicker";
import { BomChildPicker } from "./_bom_parts/BomChildPicker";
import { BomWhereUsedPanel } from "./_bom_parts/BomWhereUsedPanel";

// Props 없음. 모든 상태/액션은 AdminBomProvider 가 제공하는 Context 에서 읽는다.
export function AdminBomSection() {
  const {
    items,
    parentId,
    bomRows,
    allBomRows,
    pendingChildId,
    editingBomId,
    setEditingBomId,
    editingQty,
    setEditingQty,
    saveBomQty: onSaveBomQty,
    deleteBomRow: onDeleteBomRow,
  } = useAdminBomContext();

  return (
    <div className="flex flex-col h-full gap-3">
      <BomStepIndicator parentSelected={!!parentId} childSelected={!!pendingChildId} />

      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
        <BomParentPicker />

        {/* 우측: BOM 상세 */}
        <div className="flex min-h-0 flex-col gap-3">
          <BomChildPicker />

          {/* BOM 목록 테이블 */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            {parentId ? (
              <>
                <div
                  className="shrink-0 border-b px-5 py-3 text-sm font-bold uppercase tracking-[0.18em]"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                >
                  구성 자재 목록
                </div>
                {bomRows.length === 0 ? (
                  <EmptyState
                    variant="no-data"
                    compact
                    title="등록된 BOM 항목이 없습니다."
                    description="자재를 추가하면 이곳에 표시됩니다."
                  />
                ) : (
                  <div className="min-h-0 overflow-y-auto">
                    <div
                      className="grid items-center border-b px-5 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                      style={{
                        gridTemplateColumns: "36px 1fr 120px 100px 80px 80px 40px",
                        borderColor: LEGACY_COLORS.border,
                        color: LEGACY_COLORS.muted2,
                      }}
                    >
                      <span>구분</span>
                      <span>자재명</span>
                      <span className="text-right">ERP 코드</span>
                      <span className="text-right">소요량</span>
                      <span className="text-right">재고</span>
                      <span className="text-right">가능수량</span>
                      <span />
                    </div>
                    {bomRows.map((row, index) => {
                      const childItem = items.find((item) => item.item_id === row.child_item_id);
                      const stock = Number(childItem?.quantity ?? 0);
                      const capacity = row.quantity > 0 ? Math.floor(stock / Number(row.quantity)) : 0;
                      return (
                        <div
                          key={row.bom_id}
                          className="grid items-center px-5 py-3"
                          style={{
                            gridTemplateColumns: "36px 1fr 120px 100px 80px 80px 40px",
                            borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                          }}
                        >
                          <span
                            className="rounded px-1 py-0.5 text-xs font-bold w-fit"
                            style={{
                              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
                              color: LEGACY_COLORS.blue,
                            }}
                          >
                            {childItem?.category}
                          </span>
                          <div>
                            <div className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
                              {childItem?.item_name || row.child_item_id}
                            </div>
                          </div>
                          <div className="text-right text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {childItem?.erp_code ?? "-"}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {editingBomId === row.bom_id ? (
                              <input
                                autoFocus
                                type="number"
                                value={editingQty}
                                onChange={(e) => setEditingQty(e.target.value)}
                                onBlur={() => onSaveBomQty(row)}
                                onKeyDown={(e) => e.key === "Enter" && onSaveBomQty(row)}
                                className="w-14 rounded border bg-transparent px-1 text-right text-sm outline-none"
                                style={{ borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                              />
                            ) : (
                              <span
                                title="클릭하여 수량 편집"
                                onClick={() => {
                                  setEditingBomId(row.bom_id);
                                  setEditingQty(String(row.quantity));
                                }}
                                className="cursor-pointer text-sm hover:underline"
                                style={{ color: LEGACY_COLORS.text }}
                              >
                                ×{formatNumber(row.quantity)}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                          </div>
                          <div
                            className="text-right text-sm"
                            style={{ color: stock > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.red }}
                          >
                            {formatNumber(stock)}
                          </div>
                          <div
                            className="text-right text-sm font-bold"
                            style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
                          >
                            {formatNumber(capacity)}
                          </div>
                          <div className="flex justify-end">
                            <button
                              onClick={() => onDeleteBomRow(row.bom_id)}
                              className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
                              style={{ color: LEGACY_COLORS.red }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  className="flex shrink-0 items-center justify-between border-b px-5 py-3"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                    전체 BOM 현황
                  </span>
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{allBomRows.length}개 관계</span>
                </div>
                {allBomRows.length === 0 ? (
                  <EmptyState
                    variant="no-data"
                    compact
                    title="등록된 BOM이 없습니다."
                    description="제품을 선택해 BOM을 등록할 수 있습니다."
                  />
                ) : (
                  <div className="min-h-0 overflow-y-auto">
                    <div
                      className="grid grid-cols-[80px_1fr_1fr_80px] border-b px-5 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      <span>구분</span>
                      <span>상위 품목</span>
                      <span>하위 품목</span>
                      <span className="text-right">수량</span>
                    </div>
                    {allBomRows.map((row, index) => (
                      <div
                        key={row.bom_id}
                        className="grid grid-cols-[80px_1fr_1fr_80px] items-center px-5 py-2.5"
                        style={{
                          borderBottom: index === allBomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <div className="flex gap-1">
                          <span
                            className="rounded px-1 py-0.5 text-xs font-bold"
                            style={{
                              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
                              color: LEGACY_COLORS.blue,
                            }}
                          >
                            {row.parent_erp_code?.split("-")[1] ?? "?"}
                          </span>
                        </div>
                        <div>
                          <div className="truncate text-sm">{row.parent_item_name}</div>
                          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.parent_erp_code}</div>
                        </div>
                        <div>
                          <div className="truncate text-sm">{row.child_item_name}</div>
                          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.child_erp_code}</div>
                        </div>
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
