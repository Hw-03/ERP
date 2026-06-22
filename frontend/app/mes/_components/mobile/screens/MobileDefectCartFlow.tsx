"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Copy, Trash2, Warehouse } from "lucide-react";
import { LEGACY_COLORS, MES_DEPARTMENT_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";
import type { Item, ProductModel } from "../../_warehouse_v2/types";
import type { DefectCartMode } from "../../_defect_hub/DefectCartFlow";
import { DefectItemPicker } from "../../_defect_hub/DefectItemPicker";
import { ReasonFormFields } from "../../_defect_hub/ReasonFormFields";
import { ConfirmModal } from "@/lib/ui";
import { makeClientRequestId } from "@/lib/uuid";
import { TYPO } from "../tokens";
import {
  IconButton,
  PrimaryActionButton,
  SectionCard,
  SegmentedControl,
  StickyFooter,
  Stepper,
} from "../primitives";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";

interface CartLine {
  key: string;
  item: Item;
  qty: number;
  category: string;
  memo: string;
}

interface LineFailure {
  key: string;
  itemName: string;
  message: string;
}

const META: Record<DefectCartMode, { title: string; subtitle: string; submit: string }> = {
  add: { title: "불량 격리", subtitle: "정상 재고에서 여러 품목을 한 번에 격리합니다.", submit: "격리하기" },
  scrap: { title: "바로 폐기", subtitle: "정상 재고를 격리 없이 즉시 폐기합니다.", submit: "즉시 폐기" },
};

/**
 * 불량 격리 / 바로 폐기 — 모바일 전용 다품목 흐름.
 *
 * 데스크톱 DefectCartFlow 의 동작(출처·부서 → 여러 품목 담기 → 줄마다 수량·사유 →
 * 일괄 제출, 부분 실패 시 실패 줄만 남김)을 그대로 옮기되, 393px 세로 레이아웃으로
 * 재구성한다. 데스크톱 컴포넌트는 건드리지 않는다(동명 분리 정책).
 */
export function MobileDefectCartFlow({
  mode,
  items,
  productModels,
  currentEmployee,
  defaultSource,
  onDone,
  onCancel,
}: {
  mode: DefectCartMode;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  defaultSource?: SourceKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const meta = META[mode];
  const isWarehouseDept = PRODUCTION_LINES.includes(
    currentEmployee.department as (typeof PRODUCTION_LINES)[number],
  );

  const [source, setSource] = useState<SourceKind>(defaultSource ?? "production");
  const [dept, setDept] = useState<string>(isWarehouseDept ? currentEmployee.department : PRODUCTION_LINES[0]);
  const [step, setStep] = useState<1 | 2>(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);

  function addItem(item: Item) {
    setLines((prev) => {
      if (prev.some((l) => l.item.item_id === item.item_id)) return prev;
      const key = `${item.item_id}-${prev.length}`;
      setRequestIds((ids) => ({ ...ids, [key]: makeClientRequestId() }));
      return [...prev, { key, item, qty: 1, category: "", memo: "" }];
    });
  }
  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRequestIds((ids) => { const next = { ...ids }; delete next[key]; return next; });
  }
  function removeItemById(item: Item) {
    setLines((prev) => {
      const target = prev.find((l) => l.item.item_id === item.item_id);
      if (target) setRequestIds((ids) => { const next = { ...ids }; delete next[target.key]; return next; });
      return prev.filter((l) => l.item.item_id !== item.item_id);
    });
  }
  function copyReasonDown(index: number) {
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) => (i > index ? { ...l, category: src.category, memo: src.memo } : l));
    });
  }

  const allValid = lines.length > 0 && lines.every((l) => Number.isFinite(l.qty) && l.qty > 0);

  async function submitLine(line: CartLine, requestId: string): Promise<void> {
    if (mode === "add") {
      await defectsApi.quarantine({
        item_id: line.item.item_id,
        qty: line.qty,
        source,
        source_dept: source === "production" ? dept : undefined,
        target_dept: source === "warehouse" ? "창고" : dept,
        reason_category: line.category || null,
        reason_memo: line.memo,
        actor_employee_id: currentEmployee.employee_id,
        client_request_id: requestId,
      });
      return;
    }
    await stockRequestsApi.createStockRequest({
      requester_employee_id: currentEmployee.employee_id,
      request_type: "scrap_normal",
      reason_category: line.category,
      reason_memo: line.memo || null,
      notes: line.memo || null,
      client_request_id: requestId,
      lines: [
        {
          item_id: line.item.item_id,
          quantity: line.qty,
          from_bucket: source === "warehouse" ? "warehouse" : "production",
          from_department: source === "warehouse" ? null : (dept as Department),
          to_bucket: "none",
        },
      ],
    });
  }

  async function handleSubmit() {
    if (!allValid || busy) return;
    setBusy(true);
    setFailures([]);
    const results = await Promise.allSettled(
      lines.map((l) => submitLine(l, requestIds[l.key] ?? makeClientRequestId())),
    );
    const nextFailures: LineFailure[] = [];
    const failedKeys = new Set<string>();
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        const line = lines[i];
        failedKeys.add(line.key);
        nextFailures.push({
          key: line.key,
          itemName: line.item.item_name,
          message: res.reason instanceof Error ? res.reason.message : "처리 실패",
        });
      }
    });
    setBusy(false);
    if (nextFailures.length === 0) {
      onDone();
      return;
    }
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
  }

  // ── 공통 헤더 ───────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-2">
      <IconButton
        icon={ArrowLeft}
        label={step === 1 ? "취소" : "이전"}
        size="md"
        onClick={step === 1 ? onCancel : () => setStep(1)}
      />
      <div className="min-w-0">
        <h2 className={clsx(TYPO.headline, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {meta.title}
        </h2>
        <div className={clsx(TYPO.caption, "flex items-center gap-1.5 font-bold")}>
          <span style={{ color: step === 1 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>① 출처·부서</span>
          <span style={{ color: LEGACY_COLORS.muted }}>→</span>
          <span style={{ color: step === 2 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>② 품목 선택</span>
        </div>
      </div>
    </div>
  );

  // ── Step 1: 출처·부서 ───────────────────────────────────────────────
  // 항목 3-3 — Step2 와 동일하게 화면 전체 높이 채움(h-full) + 다음 버튼 StickyFooter 하단 고정.
  if (step === 1) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 pb-3">{header}</div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 pb-3">
            <div className="flex flex-col gap-2">
              <span className={clsx(TYPO.caption, "font-black uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
                출처
              </span>
              <SegmentedControl
                tabs={[
                  { id: "production", label: "부서 재고" },
                  { id: "warehouse", label: "창고 재고" },
                ]}
                active={source}
                onChange={(s) => setSource(s as SourceKind)}
              />
              <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted }}>
                {source === "warehouse"
                  ? "창고 보관 중인 정상 재고에서 처리합니다."
                  : "생산 부서에서 사용 중인 재고에서 처리합니다."}
              </span>
            </div>

            {source === "warehouse" ? (
              <SectionCard padding="md">
                <div className="flex items-center gap-3">
                  <Warehouse className="h-7 w-7 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                  <div className="min-w-0">
                    <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.blue }}>
                      창고
                    </div>
                    <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                      {mode === "add" ? "창고 불량 보관 구역으로 이동됩니다." : "창고 정상 재고에서 차감됩니다."}
                    </div>
                  </div>
                </div>
              </SectionCard>
            ) : (
              <div className="flex flex-col gap-2">
                <span className={clsx(TYPO.caption, "font-black uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
                  {mode === "add" ? "출처·격리 부서" : "출처 부서"}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {PRODUCTION_LINES.map((d) => {
                    const active = dept === d;
                    const c = MES_DEPARTMENT_COLORS[d] ?? LEGACY_COLORS.muted2;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDept(d)}
                        className={clsx(
                          "min-h-[52px] rounded-[14px] border font-black transition-[transform] active:scale-[0.98]",
                          TYPO.title,
                        )}
                        style={{
                          background: active ? tint(c, 14) : LEGACY_COLORS.s2,
                          borderColor: active ? c : LEGACY_COLORS.border,
                          borderWidth: active ? 2 : 1,
                          color: active ? c : LEGACY_COLORS.muted2,
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <StickyFooter>
          <PrimaryActionButton label="다음 →" intent="primary" onClick={() => setStep(2)} />
        </StickyFooter>
      </div>
    );
  }

  // ── Step 2: 품목 담기 ───────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 pb-3">{header}</div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 pb-3">
          <DefectItemPicker
            items={items}
            productModels={productModels}
            targetDepartment={dept}
            selectedIds={selectedIds}
            onAdd={addItem}
            onRemove={removeItemById}
          />

          <SectionCard
            title={`장바구니 ${lines.length}건`}
            padding={lines.length === 0 ? "md" : "sm"}
          >
            {lines.length === 0 ? (
              <div className={clsx(TYPO.body, "py-2 text-center font-bold")} style={{ color: LEGACY_COLORS.muted }}>
                위에서 품목을 추가하세요.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map((line, idx) => {
                  const fail = failures.find((f) => f.key === line.key);
                  return (
                    <div
                      key={line.key}
                      className="flex flex-col gap-2 rounded-[14px] border p-3"
                      style={{
                        background: LEGACY_COLORS.s1,
                        borderColor: fail ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
                            {line.item.mes_code ?? "(코드 없음)"}
                          </div>
                          <div className={clsx(TYPO.body, "truncate font-black")} style={{ color: LEGACY_COLORS.text }}>
                            {line.item.item_name}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          aria-label="삭제"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                          style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
                          수량
                        </span>
                        <Stepper value={line.qty} onChange={(n) => updateLine(line.key, { qty: n })} min={1} danger={mode === "scrap"} />
                      </div>

                      {idx < lines.length - 1 && (line.category || line.memo) && (
                        <button
                          type="button"
                          onClick={() => copyReasonDown(idx)}
                          className={clsx(TYPO.caption, "flex items-center gap-1 self-end font-bold")}
                          style={{ color: LEGACY_COLORS.blue }}
                        >
                          <Copy className="h-3 w-3" /> 아래 줄에 사유 복사
                        </button>
                      )}

                      <ReasonFormFields
                        category={line.category}
                        memo={line.memo}
                        onCategoryChange={(c) => updateLine(line.key, { category: c })}
                        onMemoChange={(m) => updateLine(line.key, { memo: m })}
                      />

                      {fail && (
                        <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.red }}>
                          실패: {fail.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <StickyFooter>
        {failures.length > 0 && (
          <div className={clsx(TYPO.caption, "mb-2 text-center font-bold")} style={{ color: LEGACY_COLORS.red }}>
            {failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.
          </div>
        )}
        <PrimaryActionButton
          label={busy ? "처리 중..." : `${meta.submit} (${lines.length}건)`}
          intent={mode === "scrap" ? "danger" : "primary"}
          disabled={!allValid || busy}
          onClick={() => setConfirmOpen(true)}
        />
      </StickyFooter>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSubmit();
        }}
        tone={mode === "scrap" ? "danger" : "normal"}
        title={mode === "scrap" ? "즉시 폐기 확인" : "불량 격리 확인"}
        confirmLabel={meta.submit}
        busy={busy}
        busyLabel="처리 중..."
      >
        <p className={clsx(TYPO.body, "font-bold")} style={{ color: LEGACY_COLORS.text }}>
          {lines.length}건을{" "}
          {mode === "scrap"
            ? "즉시 폐기합니다. 재고에서 차감되며 되돌릴 수 없습니다."
            : "격리합니다."}
        </p>
      </ConfirmModal>
    </div>
  );
}
