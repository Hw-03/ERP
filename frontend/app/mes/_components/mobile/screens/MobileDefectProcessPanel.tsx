"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../tokens";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Department } from "@/lib/api/types/shared";
import {
  DisassembleTree,
  toServerDecision,
  type ChildDecision,
} from "../../_defect_hub/DisassembleTree";
import { InlineErrorNote } from "../../_defect_hub/InlineErrorNote";
import { REASON_CATEGORIES } from "../../_defect_hub/reasonCategories";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { IconButton, SectionCard, Stepper } from "../primitives";

type ProcessAction = "unquarantine" | "scrap" | "return" | "disassemble";

/**
 * 불량 통합 처리 — 모바일 전용.
 *
 * 데스크톱 DefectProcessPanel 의 동작/옵션(정상복귀·재작업·전체폐기·반품, 사유 선택,
 * has_bom 일 때만 재작업, 창고 부서만 반품, 재작업 시 BOM 분해 step2)을 그대로 옮기되,
 * 393px 레이아웃(세로 액션 카드·Stepper·인라인 하단 버튼)으로 재구성한다.
 * 데스크톱 컴포넌트는 건드리지 않는다(동명 분리 정책).
 */
export function MobileDefectProcessPanel({
  location,
  currentEmployee,
  onDone,
  onCancel,
}: {
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const isWarehouse = location.department === "창고";
  const maxQty = Number(location.quantity);

  const [step, setStep] = useState<1 | 2>(1);
  const [action, setAction] = useState<ProcessAction>("unquarantine");
  const [processQty, setProcessQty] = useState<number>(maxQty);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [decisions, setDecisions] = useState<ChildDecision[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setStep(1);
    setAction("unquarantine");
    setProcessQty(Number(location.quantity));
    setCategory("");
    setMemo("");
    setDecisions([]);
    setBusy(false);
    setErrorMsg(null);
    setConfirmOpen(false);
  }, [location.item_id, location.department, location.quantity]);

  useEffect(() => {
    if (action !== "disassemble") setDecisions([]);
  }, [action]);

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (action === "unquarantine") {
        await defectsApi.unquarantine({
          item_id: location.item_id,
          qty: processQty,
          dept: location.department,
          reason_category: category || null,
          reason_memo: memo || null,
          actor_employee_id: currentEmployee.employee_id,
        });
      } else if (action === "scrap" || action === "return") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: action === "scrap" ? "defect_scrap" : "defect_return",
          reason_category: category || null,
          reason_memo: memo || null,
          notes: memo || null,
          lines: [
            {
              item_id: location.item_id,
              quantity: processQty,
              from_bucket: "defective",
              from_department: location.department as Department,
              to_bucket: "none",
            },
          ],
        });
      } else {
        const childDecisions = decisions.map(toServerDecision);
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_disassemble",
          reason_category: category || null,
          reason_memo: memo || null,
          notes: JSON.stringify({ child_decisions: childDecisions }),
          lines: [
            {
              item_id: location.item_id,
              quantity: processQty,
              from_bucket: "defective",
              from_department: location.department as Department,
              to_bucket: "none",
            },
          ],
        });
      }
      onDone();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const actionColor: Record<ProcessAction, string> = {
    unquarantine: LEGACY_COLORS.green,
    disassemble: LEGACY_COLORS.yellow,
    scrap: LEGACY_COLORS.red,
    return: LEGACY_COLORS.muted2,
  };
  const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

  // ── Step 2: BOM 분해(재작업) ──────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowLeft} label="이전" size="md" onClick={() => setStep(1)} />
          <div className="min-w-0">
            <h2 className={clsx(TYPO.headline, "font-black")} style={{ color: LEGACY_COLORS.text }}>
              불량 처리
            </h2>
            <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
              ① 처리 선택 → <span style={{ color: LEGACY_COLORS.yellow }}>② BOM 확인</span>
            </div>
          </div>
        </div>

        <SectionCard padding="sm">
          <div className="flex flex-col gap-1">
            <span className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.text }}>
              {location.mes_code} {location.item_name}
            </span>
            <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
              재작업 {formatQty(processQty)} / {formatQty(location.quantity)}개
              {category ? ` · ${category}` : ""}
            </span>
          </div>
        </SectionCard>

        <div className="flex flex-col gap-2">
          <span className={clsx(TYPO.caption, "font-black uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
            BOM 자식 트리
          </span>
          <DisassembleTree
            parentItemId={location.item_id}
            parentItemName={location.item_name}
            parentMesCode={location.mes_code ?? ""}
            parentQty={processQty}
            parentDept={location.department}
            decisions={decisions}
            onChange={setDecisions}
          />
        </div>

        {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}

        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
          className={clsx(
            "w-full rounded-[16px] px-4 py-[14px] font-black text-white transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
            TYPO.body,
          )}
          style={{ background: LEGACY_COLORS.yellow }}
        >
          {busy ? "처리 중..." : "최종 처리 →"}
        </button>

        <ConfirmModal
          open={confirmOpen}
          title="재작업(분해) 확인"
          tone="danger"
          cautionMessage="이 작업은 즉시 반영됩니다."
          confirmLabel="즉시 처리"
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void handleSubmit();
          }}
        >
          <span style={{ color: LEGACY_COLORS.text }}>
            {location.item_name} × {processQty}개를 분해·재작업합니다.
          </span>
        </ConfirmModal>
      </div>
    );
  }

  // ── Step 1: 액션 선택 + 사유 ─────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowLeft} label="목록" size="md" onClick={onCancel} />
        <div className="min-w-0">
          <h2 className={clsx(TYPO.headline, "font-black")} style={{ color: LEGACY_COLORS.text }}>
            불량 처리
          </h2>
          {location.has_bom && (
            <div className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
              <span style={{ color: LEGACY_COLORS.yellow }}>① 처리 선택</span> → ② BOM 확인
            </div>
          )}
        </div>
      </div>

      {/* 품목 정보 */}
      <SectionCard padding="sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
              {location.mes_code}
            </span>
            <span className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
              {location.item_name}
            </span>
          </div>
          <div className={clsx(TYPO.caption, "flex flex-wrap gap-x-4 gap-y-1 font-bold")} style={{ color: LEGACY_COLORS.muted }}>
            <span>격리 {formatQty(location.quantity)}개</span>
            <span>{location.department}</span>
            <span>격리일 {formatDate(location.defective_at)}</span>
          </div>
        </div>
      </SectionCard>

      {/* 처리 수량 */}
      <div className="flex items-center justify-between gap-3">
        <span className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
          처리 수량
        </span>
        <div className="flex items-center gap-2">
          <Stepper
            value={processQty}
            onChange={(n) => setProcessQty(Math.max(1, Math.min(maxQty, n)))}
            min={1}
            max={maxQty}
            danger={action === "scrap"}
          />
          <span className={clsx(TYPO.caption, "font-bold whitespace-nowrap")} style={{ color: LEGACY_COLORS.muted2 }}>
            / {formatQty(location.quantity)}
          </span>
        </div>
      </div>

      {/* 작업 선택 — 세로 카드 */}
      <div className="flex flex-col gap-2">
        <span className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
          작업 선택
        </span>
        <ActionRow
          label="정상 복귀"
          desc="불량 해제 후 정상 재고로"
          color={LEGACY_COLORS.green}
          selected={action === "unquarantine"}
          onClick={() => setAction("unquarantine")}
        />
        {location.has_bom && (
          <ActionRow
            label="재작업"
            desc="BOM 분해 후 처리"
            color={LEGACY_COLORS.yellow}
            selected={action === "disassemble"}
            onClick={() => setAction("disassemble")}
          />
        )}
        <ActionRow
          label="전체 폐기"
          desc="재고 차감, 되돌릴 수 없음"
          color={LEGACY_COLORS.red}
          selected={action === "scrap"}
          onClick={() => setAction("scrap")}
        />
        {isWarehouse && (
          <ActionRow
            label="반품"
            desc="창고 재고에서 차감"
            color={LEGACY_COLORS.muted2}
            selected={action === "return"}
            onClick={() => setAction("return")}
          />
        )}
      </div>

      {/* 사유 카테고리 */}
      <div className="flex flex-col gap-1.5">
        <label className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
          사유 카테고리 <span style={{ color: LEGACY_COLORS.muted }}>(선택)</span>
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={clsx("w-full rounded-[12px] border px-4 py-3 font-bold outline-none", TYPO.body)}
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: category ? LEGACY_COLORS.text : LEGACY_COLORS.muted,
          }}
        >
          <option value="">카테고리 선택</option>
          {REASON_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* 메모 */}
      <div className="flex flex-col gap-1.5">
        <label className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
          메모 <span style={{ color: LEGACY_COLORS.muted }}>(선택)</span>
        </label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 스크래치 다수 / 우측 끝단"
          rows={3}
          className={clsx("w-full resize-none rounded-[12px] border px-4 py-3 outline-none", TYPO.body)}
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>

      {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}

      {/* 하단 액션 */}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (action === "disassemble") {
            setStep(2);
          } else if (action === "unquarantine") {
            void handleSubmit();
          } else {
            setConfirmOpen(true);
          }
        }}
        className={clsx(
          "w-full rounded-[16px] px-4 py-[14px] font-black text-white transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
          TYPO.body,
        )}
        style={{ background: actionColor[action] }}
      >
        {busy
          ? "처리 중..."
          : action === "disassemble"
          ? "다음 →"
          : action === "unquarantine"
          ? "정상 복귀 →"
          : action === "scrap"
          ? "전체 폐기 →"
          : "반품 →"}
      </button>

      <ConfirmModal
        open={confirmOpen}
        title={action === "scrap" ? "폐기 확인" : "반품 확인"}
        tone="danger"
        cautionMessage="이 작업은 즉시 반영됩니다."
        confirmLabel="즉시 처리"
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSubmit();
        }}
      >
        <span style={{ color: LEGACY_COLORS.text }}>
          {action === "scrap"
            ? `${location.item_name} × ${processQty}개를 폐기합니다.`
            : `${location.item_name} × ${processQty}개를 반품합니다.`}
        </span>
      </ConfirmModal>
    </div>
  );
}

function ActionRow({
  label,
  desc,
  color,
  selected,
  onClick,
}: {
  label: string;
  desc: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1 rounded-[16px] border px-4 py-3 text-left transition-[transform] active:scale-[0.99]"
      style={{
        background: selected ? tint(color, 8) : LEGACY_COLORS.s2,
        borderColor: selected ? color : LEGACY_COLORS.border,
        borderWidth: 2,
      }}
    >
      <span className={clsx(TYPO.body, "font-black")} style={{ color: selected ? color : LEGACY_COLORS.text }}>
        {label}
      </span>
      <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted }}>
        {desc}
      </span>
    </button>
  );
}
