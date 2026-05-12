"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Save } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { deptIoDisplayLabel, subTypeLabel } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";
import { SettingLabel } from "./_atoms";

interface Props {
  workType: IoWorkType;
  subType: IoSubType;
  bundles: IoBundle[];
  notes: string;
  referenceNo: string;
  hasShortage: boolean;
  hasInvalidQuantity: boolean;
  submitting: boolean;
  approval: boolean;
  onNotesChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onPrev: () => void;
}

type SectionKind = "in" | "out" | "move";

function sectionLabels(subType: IoSubType): Record<SectionKind, string | null> {
  if (subType === "produce") return { in: "입고되는 결과품", out: "출고되는 하위자재", move: null };
  if (subType === "disassemble") return { in: "입고되는 회수품목", out: "출고되는 상위품목", move: null };
  if (subType === "warehouse_to_dept") return { in: null, out: null, move: "이동 (창고 → 부서)" };
  if (subType === "dept_to_warehouse") return { in: null, out: null, move: "이동 (부서 → 창고)" };
  if (subType === "dept_transfer") return { in: null, out: null, move: "이동 (부서 ↔ 부서)" };
  if (subType === "adjust_in") return { in: "단품 입고", out: null, move: null };
  if (subType === "adjust_out") return { in: null, out: "단품 출고", move: null };
  if (subType === "defect_quarantine") return { in: null, out: "불량 격리", move: null };
  if (subType === "supplier_return") return { in: null, out: "공급처 반품", move: null };
  if (subType === "receive_supplier") return { in: "입고되는 항목", out: null, move: null };
  if (subType === "ship") return { in: null, out: "출고되는 항목", move: null };
  return { in: "입고되는 항목", out: "출고되는 항목", move: "이동 항목" };
}

function bundleMode(bundle: IoBundle): "bom" | "single" {
  if (bundle.source_kind === "bom_parent") return "bom";
  if (bundle.lines.some((line) => line.origin === "bom_auto")) return "bom";
  return "single";
}

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
  referenceNo,
  hasShortage,
  hasInvalidQuantity,
  submitting,
  approval,
  onNotesChange,
  onReferenceChange,
  onSubmit,
  onSaveDraft,
  onPrev,
}: Props) {
  const headerLabel = workType === "process"
    ? (deptIoDisplayLabel(subType) ?? subTypeLabel(subType))
    : subTypeLabel(subType);
  const allLines = bundles.flatMap((bundle) => bundle.lines);
  const includedLines = allLines.filter((line) => line.included);
  const totalQty = includedLines.reduce(
    (acc, line) => acc + (Number.isFinite(line.quantity) ? line.quantity : 0),
    0,
  );

  const bundleModeMap = new Map(bundles.map((b) => [b.bundle_id, bundleMode(b)]));
  const lineBundleMap = new Map<string, string>();
  for (const b of bundles) {
    for (const l of b.lines) lineBundleMap.set(l.line_id, b.bundle_id);
  }
  const sections = sectionLabels(subType);
  const sectionLines: Record<SectionKind, IoLine[]> = { in: [], out: [], move: [] };
  for (const line of includedLines) {
    const kind = classifySection(line);
    if (kind) sectionLines[kind].push(line);
  }
  const submitDisabled =
    submitting || includedLines.length === 0 || hasShortage || hasInvalidQuantity;
  const accent = approval ? LEGACY_COLORS.yellow : LEGACY_COLORS.blue;
  const isCaution = subType === "defect_quarantine" || subType === "supplier_return";
  const blockerText = hasShortage
    ? "재고 부족 라인이 있어 제출할 수 없습니다. Step 4에서 라인을 다시 확인하세요."
    : hasInvalidQuantity
    ? "0 이하 수량 라인이 있어 제출할 수 없습니다."
    : includedLines.length === 0
    ? "체크된 라인이 없어 제출할 수 없습니다."
    : null;

  return (
    <div className="space-y-4">
      {/* 작업 요약 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3"
        style={{
          background: tint(accent, 6),
          borderColor: tint(accent, 24),
        }}
      >
        <div>
          <SettingLabel label={approval ? "승인 요청으로 저장" : "즉시 재고 반영"} />
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            {headerLabel} · 반영 {includedLines.length}건 · 총 {formatQty(totalQty)}
          </div>
        </div>
        {approval ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black"
            style={{ background: tint(LEGACY_COLORS.yellow, 14), color: LEGACY_COLORS.yellow }}
          >
            <AlertTriangle className="h-4 w-4" />
            승인 필요
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black"
            style={{ background: tint(LEGACY_COLORS.green, 14), color: LEGACY_COLORS.green }}
          >
            <CheckCircle2 className="h-4 w-4" />
            즉시 처리
          </span>
        )}
      </div>

      {/* 입고/출고/이동 섹션 */}
      <div className="space-y-3">
        {(["in", "out", "move"] as SectionKind[]).map((kind) => {
          const label = sections[kind];
          const lines = sectionLines[kind];
          if (!label || lines.length === 0) return null;
          return (
            <LineSection
              key={kind}
              title={label}
              kind={kind}
              lines={lines}
              bundleModeMap={bundleModeMap}
              lineBundleMap={lineBundleMap}
            />
          );
        })}
      </div>

      {/* 참조번호 / 메모 */}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="참조번호"
          value={referenceNo}
          onChange={onReferenceChange}
          placeholder="발주/작업/출하 번호"
        />
        <Field label="메모 (선택)" value={notes} onChange={onNotesChange} placeholder="작업 메모" />
      </div>

      {/* 보조 액션 (이전 / 임시저장) */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-[12px] border px-4 py-2 text-[12px] font-bold disabled:opacity-40"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          이전 단계
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={submitting || bundles.length === 0}
          className="flex items-center gap-1.5 rounded-[12px] border px-4 py-2 text-[12px] font-bold disabled:opacity-40"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          <Save className="h-4 w-4" />
          임시저장
        </button>
      </div>

      {/* caution */}
      {isCaution && (
        <div
          className="flex items-start gap-2 rounded-[12px] border px-3 py-2 text-xs"
          style={{
            background: tint(LEGACY_COLORS.red, 8),
            borderColor: tint(LEGACY_COLORS.red, 40),
            color: LEGACY_COLORS.red,
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-bold">
            되돌릴 수 없습니다. 최종 확인 팝업에서 한 번 더 점검하세요.
          </span>
        </div>
      )}

      {/* blocker */}
      {blockerText && (
        <div
          className="rounded-[12px] border px-3 py-2 text-center text-xs font-bold"
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
        onClick={onSubmit}
        disabled={submitDisabled}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] px-6 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
        style={{ background: accent }}
      >
        {isCaution && !submitting && <AlertTriangle className="h-5 w-5" />}
        {!isCaution && <ClipboardCheck className="h-5 w-5" />}
        {submitting
          ? "처리 중..."
          : approval
          ? `승인 요청 보내기 ${includedLines.length}건`
          : `즉시 반영하기 ${includedLines.length}건`}
      </button>
    </div>
  );
}

function LineSection({
  title,
  kind,
  lines,
  bundleModeMap,
  lineBundleMap,
}: {
  title: string;
  kind: SectionKind;
  lines: IoLine[];
  bundleModeMap: Map<string, "bom" | "single">;
  lineBundleMap: Map<string, string>;
}) {
  const headerColor =
    kind === "in" ? LEGACY_COLORS.green : kind === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const totalQty = lines.reduce((acc, l) => acc + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
  return (
    <div
      className="rounded-[14px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: tint(headerColor, 30) }}
    >
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: tint(headerColor, 6), borderBottom: `1px solid ${tint(headerColor, 30)}` }}
      >
        <span className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: headerColor }}>
          {title} · {lines.length}건
        </span>
        <span className="text-sm font-black tabular-nums" style={{ color: headerColor }}>
          총 {formatQty(totalQty)}
        </span>
      </div>
      <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
        {lines.map((line) => {
          const mode = bundleModeMap.get(lineBundleMap.get(line.line_id) ?? "") ?? "single";
          const isChild = line.origin === "bom_auto";
          const dir = signFor(line);
          return (
            <li
              key={line.line_id}
              className="flex items-center justify-between gap-3 px-4 py-2"
              style={{
                paddingLeft: isChild ? 32 : 16,
                borderLeft: isChild ? `3px solid ${tint(LEGACY_COLORS.muted2, 30)}` : "none",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {line.item_name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  <span>{line.erp_code ?? "-"}</span>
                  {(line.from_department || line.to_department) && (
                    <span>· {line.from_department ?? "-"}{line.direction === "move" ? ` → ${line.to_department ?? "-"}` : ""}</span>
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      background: tint(line.origin === "manual" ? LEGACY_COLORS.muted2 : LEGACY_COLORS.blue, 14),
                      color: line.origin === "manual" ? LEGACY_COLORS.muted2 : LEGACY_COLORS.blue,
                    }}
                  >
                    {mode === "bom" && line.origin !== "manual" ? "BOM 적용" : "이 품목만"}
                  </span>
                </div>
              </div>
              <span
                className="shrink-0 text-base font-black tabular-nums"
                style={{ color: dir.color }}
              >
                {dir.sign ?? ""}
                {formatQty(line.quantity)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
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
    <label className="flex flex-col gap-1">
      <SettingLabel label={label} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-[12px] border px-3 text-sm font-bold outline-none focus:border-[var(--c-blue)]"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      />
    </label>
  );
}
