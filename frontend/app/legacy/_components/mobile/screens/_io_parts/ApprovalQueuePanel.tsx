"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, ShieldCheck } from "lucide-react";
import {
  api,
  type StockRequest,
  type StockRequestType,
} from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatDateTime, formatQty } from "@/lib/mes/format";
import type { ToastState } from "@/lib/ui/Toast";
import { useCurrentOperator } from "../../../login/useCurrentOperator";
import { isWarehouseStaff } from "../../../_warehouse_steps";
import { TYPO } from "../../tokens";
import {
  AsyncState,
  EmptyState,
  ErrorAlert,
  PinInput,
  PrimaryActionButton,
  SectionCard,
} from "../../primitives";
import { BottomSheet } from "@/lib/ui/BottomSheet";

const TYPE_LABEL: Record<StockRequestType, string> = {
  raw_receive: "공급업체 입고",
  raw_ship: "공급업체 출고",
  warehouse_to_dept: "창고→부서",
  dept_to_warehouse: "부서→창고",
  dept_internal: "부서 내 조정",
  mark_defective_wh: "불량 격리(창고)",
  mark_defective_prod: "불량 격리(부서)",
  supplier_return: "공급업체 반품",
  package_out: "패키지 출하",
};

export function ApprovalQueuePanel({
  showToast,
}: {
  showToast: (toast: ToastState) => void;
}) {
  const operator = useCurrentOperator();
  const allowed = isWarehouseStaff(operator);
  const [list, setList] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<
    | { kind: "approve" | "reject"; req: StockRequest }
    | null
  >(null);

  const load = async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.listWarehouseQueue();
      setList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "승인함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="px-4 py-6">
        <EmptyState
          icon={ShieldCheck}
          title="권한 없음"
          description="창고 정/부 담당자만 승인함에 접근할 수 있습니다."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && list.length === 0}
        emptyView={<EmptyState icon={Inbox} title="대기 중인 요청 없음" />}
        onRetry={load}
      >
        <div className="flex flex-col gap-2">
          {list.map((req) => (
            <QueueCard
              key={req.request_id}
              req={req}
              onApprove={() => setAction({ kind: "approve", req })}
              onReject={() => setAction({ kind: "reject", req })}
            />
          ))}
        </div>
      </AsyncState>

      <ActionSheet
        action={action}
        onClose={() => setAction(null)}
        operator={operator}
        showToast={showToast}
        onDone={() => {
          setAction(null);
          load();
        }}
      />
    </div>
  );
}

function QueueCard({
  req,
  onApprove,
  onReject,
}: {
  req: StockRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const totalQty = req.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  return (
    <SectionCard padding="md">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div
            className={`${TYPO.caption} font-semibold`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {TYPE_LABEL[req.request_type] ?? req.request_type}
          </div>
          <div
            className={`${TYPO.body} truncate font-black`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {req.requester_name} · {req.requester_department}
          </div>
          <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
            {req.request_code ?? req.request_id.slice(0, 8)} ·{" "}
            {formatDateTime(req.submitted_at ?? req.created_at)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`${TYPO.body} font-black tabular-nums`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {formatQty(totalQty)}
          </div>
          <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
            {req.lines.length}품목
          </div>
        </div>
      </div>
      {req.notes ? (
        <div className={`${TYPO.caption} mt-2`} style={{ color: LEGACY_COLORS.muted2 }}>
          메모: {req.notes}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onReject}
          className="flex-1 rounded-[14px] border py-3 text-sm font-bold"
          style={{
            background: `${LEGACY_COLORS.red as string}10`,
            borderColor: `${LEGACY_COLORS.red as string}55`,
            color: LEGACY_COLORS.red as string,
          }}
        >
          반려
        </button>
        <PrimaryActionButton
          label="승인"
          intent="success"
          onClick={onApprove}
          className="flex-[1.5]"
        />
      </div>
    </SectionCard>
  );
}

function ActionSheet({
  action,
  onClose,
  operator,
  showToast,
  onDone,
}: {
  action: { kind: "approve" | "reject"; req: StockRequest } | null;
  onClose: () => void;
  operator: ReturnType<typeof useCurrentOperator>;
  showToast: (toast: ToastState) => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPin("");
    setReason("");
    setErr(null);
    setBusy(false);
  }, [action?.req.request_id, action?.kind]);

  const submitTitle = action?.kind === "approve" ? "요청 승인" : "요청 반려";
  const requireReason = action?.kind === "reject";
  const meta = useMemo(() => action?.req, [action]);

  const submit = async () => {
    if (!action || !operator) return;
    if (pin.length < 4) {
      setErr("PIN을 입력해 주세요.");
      return;
    }
    if (requireReason && reason.trim().length === 0) {
      setErr("반려 사유를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        actor_employee_id: operator.employee_id,
        pin,
        reason: reason.trim() || undefined,
      };
      if (action.kind === "approve") {
        await api.approveStockRequest(action.req.request_id, payload);
        showToast({ type: "success", message: "요청을 승인했습니다." });
      } else {
        await api.rejectStockRequest(action.req.request_id, payload);
        showToast({ type: "info", message: "요청을 반려했습니다." });
      }
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        setErr("이미 처리된 요청입니다.");
      } else if (e instanceof ApiError && e.isUnavailable) {
        setErr("서버가 다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요.");
      } else {
        setErr(e instanceof Error ? e.message : "처리에 실패했습니다.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={!!action} onClose={onClose} title={submitTitle}>
      <div className="flex flex-col gap-3 px-5 pb-4">
        {meta ? (
          <div
            className="rounded-[14px] border px-3 py-3"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {TYPE_LABEL[meta.request_type] ?? meta.request_type}
            </div>
            <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {meta.requester_name} · {meta.requester_department}
            </div>
            <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              {meta.lines.length}품목 ·{" "}
              {formatQty(meta.lines.reduce((s, l) => s + Number(l.quantity || 0), 0))}
            </div>
          </div>
        ) : null}

        <PinInput label="내 PIN" value={pin} onChange={setPin} />

        <label className="flex flex-col gap-1">
          <span
            className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            사유 {requireReason ? "(필수)" : "(선택)"}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className={`${TYPO.body} rounded-[14px] border px-3 py-2 outline-none`}
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
            placeholder={requireReason ? "반려 사유" : "메모 (선택)"}
          />
        </label>

        <ErrorAlert message={err} />

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[14px] border py-3 font-bold"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            취소
          </button>
          <PrimaryActionButton
            label={action?.kind === "approve" ? "승인" : "반려"}
            intent={action?.kind === "approve" ? "success" : "danger"}
            onClick={submit}
            disabled={busy}
            loadingText="처리 중…"
            className="flex-[1.5]"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
