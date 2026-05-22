"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Layers,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { deptIoDisplayLabel, subTypeLabel, type ApprovalKind } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";
import { ConfirmModal, type ConfirmTone } from "@/lib/ui/ConfirmModal";

interface Props {
  workType: IoWorkType;
  subType: IoSubType;
  bundles: IoBundle[];
  notes: string;
  hasShortage: boolean;
  hasInvalidQuantity: boolean;
  submitting: boolean;
  approvalKind: ApprovalKind;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
}

const APPROVAL_META: Record<
  ApprovalKind,
  {
    summaryLabel: string;
    badgeText: string;
    submitText: (n: number) => string;
    accentColor: "blue" | "yellow" | "green";
  }
> = {
  none: {
    summaryLabel: "즉시 재고 반영",
    badgeText: "즉시 처리",
    submitText: (n) => `즉시 반영하기 ${n}건`,
    accentColor: "blue",
  },
  warehouse: {
    summaryLabel: "창고 결재 요청",
    badgeText: "창고 결재 필요",
    submitText: (n) => `창고 결재 요청 ${n}건`,
    accentColor: "yellow",
  },
  department: {
    summaryLabel: "부서 결재 요청",
    badgeText: "부서 결재 필요",
    submitText: (n) => `부서 결재 요청 ${n}건`,
    accentColor: "yellow",
  },
};

function directionAccent(subType: IoSubType): string {
  if (
    subType === "defect_quarantine" ||
    subType === "supplier_return" ||
    subType === "defect_restore" ||
    subType === "defect_process" ||
    subType === "warehouse_to_dept" ||
    subType === "disassemble" ||
    subType === "adjust_out"
  ) {
    return LEGACY_COLORS.red;
  }
  return LEGACY_COLORS.blue;
}

function confirmCopy(
  subType: IoSubType,
  approvalKind: ApprovalKind,
): { title: string; tone: ConfirmTone; confirmLabel: string } {
  const needsApproval = approvalKind !== "none";
  const verb = needsApproval ? "요청하시겠습니까?" : "진행하시겠습니까?";
  const confirmLabel = needsApproval ? "결재 요청" : "즉시 반영";
  if (subType === "defect_quarantine") {
    return { title: `불량 격리를 ${verb}`, tone: "danger", confirmLabel };
  }
  if (subType === "defect_restore") {
    return { title: `격리 해제(정상 복귀)를 ${verb}`, tone: "danger", confirmLabel };
  }
  if (subType === "defect_process") {
    return { title: `격리 처리를 ${verb}`, tone: "danger", confirmLabel };
  }
  if (subType === "supplier_return") {
    return { title: `공급처 반품을 ${verb}`, tone: "danger", confirmLabel };
  }
  if (subType === "warehouse_to_dept") {
    return { title: `창고 반출을 ${verb}`, tone: "danger", confirmLabel };
  }
  if (subType === "dept_to_warehouse") {
    return { title: `창고 반입을 ${verb}`, tone: "normal", confirmLabel };
  }
  if (subType === "produce" || subType === "adjust_in") {
    return { title: `부서 입고를 ${verb}`, tone: "normal", confirmLabel };
  }
  if (subType === "disassemble" || subType === "adjust_out") {
    return { title: `부서 출고를 ${verb}`, tone: "danger", confirmLabel };
  }
  if (subType === "receive_supplier") {
    return { title: `원자재 입고를 ${verb}`, tone: "normal", confirmLabel };
  }
  return { title: needsApproval ? "제출하시겠습니까?" : "진행하시겠습니까?", tone: "normal", confirmLabel };
}

type SectionKind = "in" | "out" | "move";

function classifySection(line: IoLine): SectionKind | null {
  if (line.direction === "in") return "in";
  if (line.direction === "out") return "out";
  if (line.direction === "defective") return "out";
  if (line.direction === "move") return "move";
  if (line.direction === "adjust") {
    if (line.to_bucket === "production") return "in";
    if (line.from_bucket === "production") return "out";
  }
  return null;
}

function signFor(line: IoLine): { sign: "+" | "-" | null; color: string } {
  const section = classifySection(line);
  if (section === "in") return { sign: "+", color: LEGACY_COLORS.green };
  if (section === "out") return { sign: "-", color: LEGACY_COLORS.red };
  return { sign: null, color: LEGACY_COLORS.muted2 };
}

export function IoConfirmStep({
  workType,
  subType,
  bundles,
  notes,
  hasShortage,
  hasInvalidQuantity,
  submitting,
  approvalKind,
  onNotesChange,
  onSubmit,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const meta = APPROVAL_META[approvalKind];
  const isApproval = approvalKind !== "none";
  const copy = confirmCopy(subType, approvalKind);
  const headerLabel = workType === "process"
    ? (deptIoDisplayLabel(subType) ?? subTypeLabel(subType))
    : subTypeLabel(subType);
  const allLines = bundles.flatMap((bundle) => bundle.lines);
  const includedLines = allLines.filter((line) => line.included);
  // BOM 부모 라인(생산 결과품 등)은 묶음 카드 헤더에서 이미 표시되므로 표시 라인 목록에선 숨긴다.
  const bomParentLineIds = new Set<string>();
  for (const b of bundles) {
    if (b.source_kind !== "bom_parent") continue;
    for (const l of b.lines) {
      if (l.origin === "direct") bomParentLineIds.add(l.line_id);
    }
  }
  const visibleIncludedLines = includedLines.filter(
    (line) => !bomParentLineIds.has(line.line_id),
  );
  const totalQty = visibleIncludedLines.reduce(
    (acc, line) => acc + (Number.isFinite(line.quantity) ? line.quantity : 0),
    0,
  );

  const displayBundles = bundles.filter((b) =>
    b.lines.some((l) => l.included && !bomParentLineIds.has(l.line_id)),
  );

  const submitDisabled =
    submitting || includedLines.length === 0 || hasShortage || hasInvalidQuantity;
  const accent = directionAccent(subType);
  const isCaution = subType === "defect_quarantine" || subType === "supplier_return";
  const blockerText = hasShortage
    ? "재고 부족 라인이 있어 제출할 수 없습니다. Step 4에서 라인을 다시 확인하세요."
    : hasInvalidQuantity
    ? "0 이하 수량 라인이 있어 제출할 수 없습니다."
    : includedLines.length === 0
    ? "체크된 라인이 없어 제출할 수 없습니다."
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {/* 작업 요약 */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border px-5 py-4"
        style={{
          background: tint(accent, 6),
          borderColor: tint(accent, 24),
        }}
      >
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {meta.summaryLabel}
          </div>
          <div className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
            {headerLabel} · 반영 {visibleIncludedLines.length}건 · 총 {formatQty(totalQty)}
          </div>
        </div>
        {isApproval ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black"
            style={{ background: tint(accent, 14), color: accent }}
          >
            <AlertTriangle className="h-5 w-5" />
            {meta.badgeText}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black"
            style={{ background: tint(accent, 14), color: accent }}
          >
            <CheckCircle2 className="h-5 w-5" />
            {meta.badgeText}
          </span>
        )}
      </div>

      {/* 묶음 카드 목록 (1단 세로 스크롤) */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
        {displayBundles.map((bundle) => (
          <ConfirmBundleCard
            key={bundle.bundle_id}
            bundle={bundle}
            bomParentLineIds={bomParentLineIds}
          />
        ))}
      </div>

      {/* 메모 */}
      <div className="mt-auto flex flex-col gap-5">
        <Field label="메모 (선택)" value={notes} onChange={onNotesChange} placeholder="작업 메모" />

      {/* caution */}
      {isCaution && (
        <div
          className="flex items-start gap-3 rounded-[16px] border px-4 py-3 text-sm"
          style={{
            background: tint(LEGACY_COLORS.red, 8),
            borderColor: tint(LEGACY_COLORS.red, 40),
            color: LEGACY_COLORS.red,
          }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-bold">
            되돌릴 수 없습니다. 최종 확인 팝업에서 한 번 더 점검하세요.
          </span>
        </div>
      )}

      {/* blocker */}
      {blockerText && (
        <div
          className="rounded-[16px] border px-4 py-3 text-center text-sm font-bold"
          style={{
            background: tint(LEGACY_COLORS.yellow, 10),
            borderColor: tint(LEGACY_COLORS.yellow, 40),
            color: LEGACY_COLORS.yellow,
          }}
        >
          {blockerText}
        </div>
      )}

      {/* 큰 한 줄 실행 버튼 (옛 ExecuteStep 패턴) */}
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={submitDisabled}
        className="flex w-full items-center justify-center gap-3 rounded-[22px] px-7 py-7 text-xl font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
        style={{ background: accent }}
      >
        {isCaution && !submitting && <AlertTriangle className="h-6 w-6" />}
        {!isCaution && <ClipboardCheck className="h-6 w-6" />}
        {submitting ? "처리 중..." : meta.submitText(includedLines.length)}
      </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={copy.title}
        tone={copy.tone}
        cautionMessage="제출 후 수정·취소는 관리자의 승인이 필요합니다."
        confirmLabel={copy.confirmLabel}
        cancelLabel="취소"
        busy={submitting}
        busyLabel="처리 중..."
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onSubmit();
        }}
      >
        <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
          {headerLabel} · 반영 {visibleIncludedLines.length}건 · 총 {formatQty(totalQty)}
        </div>
      </ConfirmModal>
    </div>
  );
}

function ConfirmBundleCard({
  bundle,
  bomParentLineIds,
}: {
  bundle: IoBundle;
  bomParentLineIds: Set<string>;
}) {
  // Hook 규칙: 모든 hook 은 early-return 위에서 호출.
  const [collapsed, setCollapsed] = useState(true);

  // 단일 라인 비-BOM 묶음(낱개 manual + direct_item 단품) 은 카드 래퍼 없이 한 줄로 평탄화.
  // step 4 의 IoBundleCard 단품 분기와 동일한 UX.
  if (bundle.source_kind !== "bom_parent" && bundle.lines.length === 1) {
    const onlyLine = bundle.lines[0];
    if (!onlyLine.included || bomParentLineIds.has(onlyLine.line_id)) return null;
    const dir = signFor(onlyLine);
    return (
      <div className="flex min-h-[60px] items-center justify-between gap-4 px-1 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            {onlyLine.item_name}
          </div>
          <div
            className="flex flex-wrap items-center gap-2 text-xs font-semibold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <span>{onlyLine.item_code ?? "-"}</span>
            {onlyLine.direction === "move" && (onlyLine.from_department || onlyLine.to_department) && (
              <span>
                · {onlyLine.from_department ?? "창고"} → {onlyLine.to_department ?? "창고"}
              </span>
            )}
            {onlyLine.direction !== "move" && (onlyLine.from_department || onlyLine.to_department) && (
              <span>· {onlyLine.from_department || onlyLine.to_department}</span>
            )}
          </div>
        </div>
        <span
          className="shrink-0 text-xl font-black tabular-nums"
          style={{ color: dir.color }}
        >
          {dir.sign ?? ""}
          {formatQty(onlyLine.quantity)}
        </span>
      </div>
    );
  }

  const directParentLine =
    bundle.source_kind === "bom_parent"
      ? bundle.lines.find((line) => line.origin === "direct")
      : undefined;
  const visibleLines = bundle.lines.filter(
    (line) => line.included && !bomParentLineIds.has(line.line_id),
  );
  const isSingle = bundle.source_kind === "direct_item";
  const isCollapsible = !isSingle && visibleLines.length > 0;

  const tone = LEGACY_COLORS.blue;
  // 헤더 우측 sign + 수량 결정용 대표 라인:
  //   BOM   → 부모 라인 (생산 결과품 등)
  //   단품  → 그 자체 단일 included 라인
  //   패키지 → 첫 included 라인
  const headerLine =
    directParentLine ?? bundle.lines.find((line) => line.included) ?? null;
  const headerDir = headerLine
    ? signFor(headerLine)
    : { sign: null as null, color: LEGACY_COLORS.muted2 };
  const headerQty = headerLine ? formatQty(headerLine.quantity) : "";

  return (
    <article
      className="rounded-[18px] border-2 p-4"
      style={{
        background: tint(tone, 6),
        borderColor: tint(tone, 40),
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (isCollapsible) setCollapsed((v) => !v);
          }}
          disabled={!isCollapsible}
          className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
          title={isCollapsible ? (collapsed ? "펼치기" : "접기") : undefined}
          aria-expanded={isCollapsible ? !collapsed : undefined}
        >
          <Layers className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <h3 className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            {bundle.title}
          </h3>
          {isCollapsible &&
            (collapsed ? (
              <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            ) : (
              <ChevronUp className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            ))}
        </button>
        {headerLine && (
          <span
            className="shrink-0 text-xl font-black tabular-nums"
            style={{ color: headerDir.color }}
          >
            {headerDir.sign ?? ""}
            {headerQty}
          </span>
        )}
      </div>

      {/* 헤더 메타 한 줄 */}
      {isSingle && headerLine && (
        <div
          className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          <span>{headerLine.item_code ?? "-"}</span>
          {(headerLine.from_department || headerLine.to_department) && (
            <span>
              · {headerLine.from_department ?? "-"}
              {headerLine.direction === "move" ? ` → ${headerLine.to_department ?? "-"}` : ""}
            </span>
          )}
        </div>
      )}

      {bundle.source_kind === "bom_parent" && (
        <div
          className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          <span>반영 {visibleLines.length}개</span>
          <span>·</span>
          <span>BOM 자동 전개 · 상위 1 + 하위 {visibleLines.length}</span>
        </div>
      )}

      {/* 자식 ul (조건부) */}
      {!collapsed && isCollapsible && (
        <ul
          className="mt-3 divide-y rounded-[12px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          {visibleLines.map((line) => (
            <ConfirmLineRow
              key={line.line_id}
              line={line}
              isChild={line.origin === "bom_auto" || line.origin === "package_auto"}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

function ConfirmLineRow({ line, isChild }: { line: IoLine; isChild: boolean }) {
  const dir = signFor(line);
  return (
    <li
      className="flex min-h-[64px] items-center justify-between gap-4 px-5 py-3"
      style={{
        paddingLeft: isChild ? 40 : 20,
        borderLeft: isChild ? `3px solid ${tint(LEGACY_COLORS.muted2, 30)}` : "none",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
          {line.item_name}
        </div>
        <div
          className="flex flex-wrap items-center gap-2 text-xs font-semibold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          <span>{line.item_code ?? "-"}</span>
          {(line.from_department || line.to_department) && (
            <span>
              · {line.from_department ?? "-"}
              {line.direction === "move" ? ` → ${line.to_department ?? "-"}` : ""}
            </span>
          )}
        </div>
      </div>
      <span
        className="shrink-0 text-xl font-black tabular-nums"
        style={{ color: dir.color }}
      >
        {dir.sign ?? ""}
        {formatQty(line.quantity)}
      </span>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-[16px] border px-4 text-base font-bold outline-none focus:border-[var(--c-blue)]"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      />
    </label>
  );
}
