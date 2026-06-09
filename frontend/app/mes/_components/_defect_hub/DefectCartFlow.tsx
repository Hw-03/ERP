"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, Copy, Trash2, Warehouse } from "lucide-react";
import { LEGACY_COLORS, MES_DEPARTMENT_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import { DefectItemPicker } from "./DefectItemPicker";
import { ReasonFormFields } from "./ReasonFormFields";
import { ConfirmModal } from "@/lib/ui";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";

/** add = 새 불량 격리 / scrap = 정상재고 즉시 폐기. */
export type DefectCartMode = "add" | "scrap";

interface CartLine {
  key: string;
  item: Item;
  qty: string;
  category: string;
  memo: string;
}

interface LineFailure {
  key: string;
  itemName: string;
  message: string;
}

interface Props {
  mode: DefectCartMode;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  /** 역할 기반 기본 출처. 미지정 시 "production". */
  defaultSource?: SourceKind;
  onDone: () => void;
  onCancel: () => void;
}

const TITLES: Record<DefectCartMode, { title: string; subtitle: string; submit: string }> = {
  add: {
    title: "불량 격리",
    subtitle: "정상 재고에서 여러 품목을 골라 한 번에 격리합니다. 즉시 처리.",
    submit: "격리하기",
  },
  scrap: {
    title: "바로 폐기",
    subtitle: "정상 재고를 격리 없이 즉시 폐기합니다. 즉시 처리.",
    submit: "즉시 폐기",
  },
};

/**
 * 불량 탭 전폭 작업 흐름 — 새 불량 추가 / R 바로 폐기·반품.
 * 상단에서 출처(창고/부서)+부서 1회 선택 → DefectItemPicker 로 여러 품목 담기 →
 * 장바구니 줄마다 수량 + 품목별 사유 → 제출 시 줄마다 단건 API 루프(Promise.allSettled).
 */
export function DefectCartFlow({
  mode,
  items,
  productModels,
  currentEmployee,
  defaultSource,
  onDone,
  onCancel,
}: Props) {
  const meta = TITLES[mode];

  const [source, setSource] = useState<SourceKind>(defaultSource ?? "production");
  const [dept, setDept] = useState<string>(
    PRODUCTION_LINES.includes(currentEmployee.department as (typeof PRODUCTION_LINES)[number])
      ? currentEmployee.department
      : PRODUCTION_LINES[0],
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Step 2 → Step 1 뒤로가기 처리. DesktopDefectView의 popstate와 공존.
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const s = e.state as { defect?: string; step?: number } | null;
      if (s?.defect === "cart" && (!s.step || s.step === 1)) {
        setStep(1);
        setLines([]);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);

  function addItem(item: Item) {
    setLines((prev) =>
      prev.some((l) => l.item.item_id === item.item_id)
        ? prev
        : [...prev, { key: `${item.item_id}-${Date.now()}`, item, qty: "1", category: "", memo: "" }],
    );
  }

  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function removeItemById(item: Item) {
    setLines((prev) => prev.filter((l) => l.item.item_id !== item.item_id));
  }

  function copyReasonDown(index: number) {
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) =>
        i > index ? { ...l, category: src.category, memo: src.memo } : l,
      );
    });
  }

  const allValid =
    lines.length > 0 &&
    lines.every((l) => {
      const n = Number(l.qty);
      return Number.isFinite(n) && n > 0;
    });

  async function submitLine(line: CartLine): Promise<void> {
    const qty = Number(line.qty);
    if (mode === "add") {
      await defectsApi.quarantine({
        item_id: line.item.item_id,
        qty,
        source,
        source_dept: source === "production" ? dept : undefined,
        target_dept: dept,
        reason_category: line.category || null,
        reason_memo: line.memo,
        actor_employee_id: currentEmployee.employee_id,
      });
      return;
    }
    await stockRequestsApi.createStockRequest({
      requester_employee_id: currentEmployee.employee_id,
      request_type: "scrap_normal",
      reason_category: line.category,
      reason_memo: line.memo || null,
      notes: line.memo || null,
      lines: [
        {
          item_id: line.item.item_id,
          quantity: qty,
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
    const results = await Promise.allSettled(lines.map((l) => submitLine(l)));
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
    // 성공분은 제거하고 실패분만 남긴다.
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
  }

  // 스텝 인디케이터 공통
  const stepIndicator = (
    <div className="flex items-center gap-2 text-xs font-bold">
      <span style={{ color: step === 1 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
        ① 출처·부서 선택
      </span>
      <span style={{ color: LEGACY_COLORS.muted }}>→</span>
      <span style={{ color: step === 2 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
        ② 품목 선택
      </span>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 공통 헤더 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={step === 1 ? onCancel : () => window.history.back()}
          disabled={busy}
          className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 1 ? "취소" : "이전"}
        </button>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
            {meta.title}
          </h2>
          {stepIndicator}
        </div>
      </div>

      {/* 1단계: 출처·부서 선택 */}
      {step === 1 && (
        <div key="step1" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3">
          {/* 2단 메인 영역 */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
            {/* 좌: 출처 카드 */}
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-[11px] font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                출처
              </div>
              <div className="grid min-h-0 flex-1 grid-rows-2 gap-3">
                {(["production", "warehouse"] as SourceKind[]).map((s) => {
                  const active = source === s;
                  const Icon = s === "warehouse" ? Warehouse : Building2;
                  const label = s === "warehouse" ? "창고 재고" : "부서 재고";
                  const desc =
                    s === "warehouse"
                      ? "창고 보관 중인 정상 재고에서 불량을 격리합니다"
                      : "생산 부서에서 사용 중인 재고에서 불량을 격리합니다";
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSource(s)}
                      className="flex h-full flex-col justify-between rounded-[22px] border p-7 text-left transition-all hover:brightness-110 active:scale-[0.99]"
                      style={{
                        background: active ? tint(LEGACY_COLORS.red, 7) : LEGACY_COLORS.s2,
                        borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                        borderWidth: active ? 2 : 1,
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <Icon
                          className="h-9 w-9 shrink-0"
                          style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}
                        />
                        <span className="text-3xl font-black" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.text }}>
                          {label}
                        </span>
                      </div>
                      <span className="text-base font-bold" style={{ color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 우: 격리 위치 */}
            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-[11px] font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {source === "warehouse" ? "격리 위치" : mode === "add" ? "출처·격리 부서" : "출처 부서"}
              </div>
              {source === "warehouse" ? (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[22px] border-2"
                  style={{ background: tint(LEGACY_COLORS.blue, 7), borderColor: LEGACY_COLORS.blue }}
                >
                  <Warehouse className="h-16 w-16" style={{ color: LEGACY_COLORS.blue }} />
                  <span className="text-4xl font-black" style={{ color: LEGACY_COLORS.blue }}>창고</span>
                  <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    창고 불량 보관 구역으로 이동됩니다
                  </span>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-3">
                  {PRODUCTION_LINES.map((d) => {
                    const active = dept === d;
                    const deptColor = MES_DEPARTMENT_COLORS[d] ?? LEGACY_COLORS.muted2;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDept(d)}
                        className="h-full rounded-[18px] border text-3xl font-black transition-all hover:brightness-110 active:scale-[0.99]"
                        style={{
                          background: active ? tint(deptColor, 14) : LEGACY_COLORS.s2,
                          borderColor: active ? deptColor : LEGACY_COLORS.border,
                          borderWidth: active ? 2 : 1,
                          color: active ? deptColor : LEGACY_COLORS.muted2,
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={() => {
                window.history.pushState({ defect: "cart", mode, step: 2 }, "");
                setStep(2);
              }}
              className="flex items-center gap-1 rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99]"
              style={{ background: LEGACY_COLORS.red }}
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* 2단계: 품목 선택 */}
      {step === 2 && (
        <div key="step2" className="animate-view-fade flex min-h-0 flex-1 flex-col gap-3">

          {/* 좌 피커 + 우 장바구니 */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
            <div className="min-h-0">
              <DefectItemPicker
                items={items}
                productModels={productModels}
                targetDepartment={dept}
                selectedIds={selectedIds}
                onAdd={addItem}
                onRemove={removeItemById}
              />
            </div>

            {/* 장바구니 */}
            <div
              className="flex min-h-0 flex-col overflow-y-auto rounded-[16px] border"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
            >
              <div
                className="sticky top-0 z-10 px-4 py-2 text-xs font-black uppercase tracking-[1.5px]"
                style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
              >
                장바구니 {lines.length}건
              </div>
              {lines.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
                  왼쪽에서 품목을 추가하세요.
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-3">
                  {lines.map((line, idx) => {
                    const fail = failures.find((f) => f.key === line.key);
                    return (
                      <div
                        key={line.key}
                        className="flex flex-col gap-2 rounded-[12px] border px-3 py-2"
                        style={{
                          background: LEGACY_COLORS.s1,
                          borderColor: fail ? tint(LEGACY_COLORS.red, 30) : LEGACY_COLORS.border,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                              {line.item.mes_code ?? "(코드 없음)"}
                            </div>
                            <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                              {line.item.item_name}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            className="no-btn-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110"
                            style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
                            aria-label="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                            수량
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            placeholder="예: 3"
                            className="w-16 rounded-[8px] border px-2 py-1 text-center text-sm font-bold outline-none"
                            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                          {idx < lines.length - 1 && (line.category || line.memo) && (
                            <button
                              type="button"
                              onClick={() => copyReasonDown(idx)}
                              className="ml-auto flex items-center gap-1 text-xs font-bold hover:underline"
                              style={{ color: LEGACY_COLORS.blue }}
                            >
                              <Copy className="h-3 w-3" />
                              위 사유 복사
                            </button>
                          )}
                        </div>

                        <ReasonFormFields
                          category={line.category}
                          memo={line.memo}
                          onCategoryChange={(c) => updateLine(line.key, { category: c })}
                          onMemoChange={(m) => updateLine(line.key, { memo: m })}
                        />

                        {fail && (
                          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>실패: {fail.message}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 하단 제출 바 */}
          <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
            {failures.length > 0 ? (
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>
                {failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.
              </span>
            ) : (
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                줄마다 수량·사유를 입력하세요.
              </span>
            )}
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!allValid || busy}
              className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
              style={{ background: LEGACY_COLORS.red }}
            >
              {busy ? "처리 중..." : `${meta.submit} (${lines.length}건) →`}
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }}
        tone={mode === "scrap" ? "danger" : "normal"}
        title={mode === "scrap" ? "즉시 폐기 확인" : "불량 격리 확인"}
        confirmLabel={meta.submit}
        busy={busy}
        busyLabel="처리 중..."
      >
        <p className="mb-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
          {lines.length}건을{" "}
          {mode === "scrap"
            ? "즉시 폐기합니다. 재고에서 차감되며 되돌릴 수 없습니다."
            : "격리합니다."}
        </p>
      </ConfirmModal>
    </div>
  );
}
