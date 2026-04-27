---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/_dept_steps/ConfirmStep.tsx
status: active
updated: 2026-04-27
source_sha: 10c8c74ddbd4
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ConfirmStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/_dept_steps/ConfirmStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `6664` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_dept_steps|frontend/app/legacy/_components/mobile/io/dept/_dept_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import type { Employee, Item, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";
import {
  PrimaryActionButton,
  SectionCard,
  SectionCardRow,
  StickyFooter,
} from "../../../primitives";
import { useDeptWizard } from "../context";

export function StepConfirm({
  items,
  employee,
  packages,
  onSubmit,
  onBack,
}: {
  items: Item[];
  employee: Employee | null;
  packages: ShipPackage[];
  onSubmit: () => void;
  onBack?: () => void;
}) {
  const { state, dispatch } = useDeptWizard();
  const pkg = packages.find((p) => p.package_id === state.packageId) ?? null;
  const pkgQty = state.items.get("__PACKAGE__") ?? 1;

  const selectedList = Array.from(state.items.entries())
    .filter(([id]) => id !== "__PACKAGE__")
    .map(([id, q]) => ({ item: items.find((i) => i.item_id === id), qty: q }))
    .filter((e): e is { item: Item; qty: number } => !!e.item);

  const totalQty = selectedList.reduce((s, e) => s + e.qty, 0);
  const directionLabel = state.direction === "in" ? "입고" : state.direction === "out" ? "출고" : "-";
  const intent: "success" | "danger" = state.direction === "in" ? "success" : "danger";
  const headlineColor = state.direction === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red;
  const headline = `${state.department ?? ""}부 · ${directionLabel}을 처리합니다`;

  return (
    <div className="flex flex-col gap-3 px-4 pb-36 pt-4">
      <div>
        <div
          className={`${TYPO.headline} font-black leading-tight`}
          style={{ color: headlineColor }}
        >
          {headline}
        </div>
        <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted2 }}>
          확정을 누르면 지금 즉시 재고가 반영됩니다.
        </div>
      </div>

      <SectionCard title="기본 정보" padding="sm">
        <SectionCardRow label="부서" value={state.department ?? "-"} />
        <SectionCardRow label="담당" value={employee?.name ?? "-"} />
        <SectionCardRow
          label="방향"
          value={state.direction === "in" ? "부서 입고" : state.direction === "out" ? "부서 출고" : "-"}
          valueColor={headlineColor}
        />
      </SectionCard>

      {state.usePackage ? (
        <SectionCard title="패키지" padding="sm">
          <SectionCardRow label="이름" value={pkg ? pkg.name : "-"} />
          <SectionCardRow
            label="출하 수량"
            value={pkg ? `${pkgQty}회` : "-"}
            valueColor={LEGACY_COLORS.purple}
          />
          {pkg ? (
            <SectionCardRow
              label="구성"
              value={`${pkg.items.length}개`}
              valueColor={LEGACY_COLORS.muted2}
            />
          ) : null}
        </SectionCard>
      ) : (
        <SectionCard
          title={`품목 · ${selectedList.length}건 · 합계 ${formatNumber(totalQty)}`}
          padding="none"
        >
          <div className="max-h-[30vh] overflow-y-auto">
            {selectedList.map((e, idx) => (
              <div
                key={e.item.item_id}
                className="flex items-center justify-between px-4 py-2"
                style={{
                  borderBottom: idx === selectedList.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                    {e.item.item_name}
                  </div>
                  <div className={`${TYPO.caption} truncate`} style={{ color: LEGACY_COLORS.muted }}>
                    {e.item.erp_code}
                  </div>
                </div>
                <div
                  className={`${TYPO.title} shrink-0 font-black tabular-nums`}
                  style={{ color: LEGACY_COLORS.blue }}
                >
                  {formatNumber(e.qty)} {e.item.unit}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="참조번호 · 비고" padding="sm">
        <div className="flex flex-col gap-2">
          <input
            value={state.referenceNo}
            onChange={(e) => dispatch({ type: "SET_REFERENCE", referenceNo: e.target.value })}
            placeholder="참조번호 (예: DIO-240412)"
            className={`${TYPO.body} rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <textarea
            value={state.note}
            onChange={(e) => dispatch({ type: "SET_NOTE", note: e.target.value })}
            rows={2}
            placeholder="비고 (선택)"
            className={`${TYPO.body} resize-none rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </div>
      </SectionCard>

      {state.error ? (
        <div
          className={`${TYPO.caption} rounded-[14px] border px-3 py-2`}
          style={{
            background: "rgba(242,95,92,.12)",
            borderColor: "rgba(242,95,92,.28)",
            color: LEGACY_COLORS.red,
          }}
        >
          {state.error}
        </div>
      ) : null}

      <StickyFooter>
        <div className="flex flex-col gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={state.submitting}
              className={`${TYPO.caption} w-full rounded-[14px] py-2 font-semibold disabled:opacity-40`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              뒤로 가서 수정
            </button>
          ) : null}
          <PrimaryActionButton
            intent={intent}
            label={
              state.usePackage
                ? `패키지 출하 확정 · ${pkgQty}회`
                : `부서 ${directionLabel} 확정`
            }
            count={state.usePackage ? undefined : selectedList.length}
            total={state.usePackage ? undefined : totalQty}
            onClick={onSubmit}
            disabled={state.submitting}
            loadingText="처리 중…"
          />
        </div>
      </StickyFooter>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
