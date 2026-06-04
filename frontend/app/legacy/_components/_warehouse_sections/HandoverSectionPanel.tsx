"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { Button } from "@/lib/ui/Button";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { api, type Item } from "@/lib/api";
import type { Handover } from "@/lib/api/types";
import { isDepartmentApprover } from "../_warehouse_steps";
import type { Operator } from "../login/useCurrentOperator";
import { HandoverComposeForm } from "./HandoverComposeForm";
import { printHandover } from "./handoverPrint";

type SubTab = "compose" | "mine" | "inbox";

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  submitted: { text: "인수 대기", tone: LEGACY_COLORS.yellow },
  received: { text: "인수 완료", tone: LEGACY_COLORS.green },
  draft: { text: "작성 중", tone: LEGACY_COLORS.muted },
};

export function HandoverSectionPanel({
  operator,
  operatorEmployeeId,
  items,
  refreshNonce,
  onChanged,
}: {
  operator: Operator | null;
  operatorEmployeeId: string | undefined;
  items: Item[];
  refreshNonce: number;
  onChanged: () => void;
}) {
  const canCompose = (operator?.department ?? "") === "튜브";
  const canReceive = isDepartmentApprover(operator);

  const [subTab, setSubTab] = useState<SubTab>(
    canCompose ? "compose" : canReceive ? "inbox" : "mine",
  );
  const [mine, setMine] = useState<Handover[]>([]);
  const [inbox, setInbox] = useState<Handover[]>([]);
  const [localNonce, setLocalNonce] = useState(0);

  // 인수 확인 PIN 모달 상태
  const [receiveTarget, setReceiveTarget] = useState<Handover | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const reload = useCallback(() => setLocalNonce((n) => n + 1), []);

  useEffect(() => {
    if (!operatorEmployeeId) return;
    api
      .listHandovers({ authorEmployeeId: operatorEmployeeId })
      .then(setMine)
      .catch(() => {});
  }, [operatorEmployeeId, refreshNonce, localNonce]);

  useEffect(() => {
    if (!operatorEmployeeId || !canReceive) return;
    api
      .listHandoverInbox(operatorEmployeeId)
      .then(setInbox)
      .catch(() => {});
  }, [operatorEmployeeId, canReceive, refreshNonce, localNonce]);

  const tabs = useMemo(() => {
    const t: { id: SubTab; label: string; count?: number }[] = [];
    if (canCompose) t.push({ id: "compose", label: "작성" });
    t.push({ id: "mine", label: "내 인수인계" });
    if (canReceive) t.push({ id: "inbox", label: "인수 대기함", count: inbox.length });
    return t;
  }, [canCompose, canReceive, inbox.length]);

  async function confirmReceive() {
    if (!receiveTarget || !operatorEmployeeId) return;
    setPinBusy(true);
    setPinError(null);
    try {
      await api.receiveHandover(receiveTarget.handover_id, {
        actor_employee_id: operatorEmployeeId,
        pin,
      });
      setReceiveTarget(null);
      setPin("");
      reload();
      onChanged();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "인수 확인에 실패했습니다.");
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {tabs.length > 1 && (
        <div className="flex gap-2">
          {tabs.map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className="rounded-[12px] border px-4 py-2 text-sm font-black transition-colors"
                style={{
                  background: active ? tint(LEGACY_COLORS.blue, 18) : tint(LEGACY_COLORS.blue, 6),
                  borderColor: active ? LEGACY_COLORS.blue : tint(LEGACY_COLORS.blue, 30),
                  color: LEGACY_COLORS.blue,
                }}
              >
                {t.label}
                {typeof t.count === "number" && t.count > 0 ? ` (${t.count})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {subTab === "compose" && canCompose && operatorEmployeeId && (
        <HandoverComposeForm
          authorEmployeeId={operatorEmployeeId}
          items={items}
          onCreated={() => {
            setSubTab("mine");
            reload();
            onChanged();
          }}
        />
      )}

      {subTab === "mine" && (
        <HandoverCardList
          docs={mine}
          emptyText="작성한 인수인계서가 없습니다."
          onPrint={printHandover}
        />
      )}

      {subTab === "inbox" && canReceive && (
        <HandoverCardList
          docs={inbox}
          emptyText="인수 대기 중인 인수인계서가 없습니다."
          onPrint={printHandover}
          onReceive={(doc) => {
            setReceiveTarget(doc);
            setPin("");
            setPinError(null);
          }}
        />
      )}

      <ConfirmModal
        open={!!receiveTarget}
        title="인수 확인"
        confirmLabel="인수 확인"
        busy={pinBusy}
        confirmDisabled={pin.length !== PIN_LENGTH}
        onClose={() => {
          if (!pinBusy) setReceiveTarget(null);
        }}
        onConfirm={confirmReceive}
      >
        <div className="flex flex-col gap-2">
          <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
            {receiveTarget?.title} — {receiveTarget?.from_department} → {receiveTarget?.to_department}
          </div>
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
            인수 확인 시 품목 수량만큼 {receiveTarget?.from_department} → {receiveTarget?.to_department} 로 이동합니다.
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
            placeholder="PIN"
            className="w-full rounded-[12px] border px-4 py-2.5 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          {pinError && (
            <div className="text-xs" style={{ color: LEGACY_COLORS.red }}>
              {pinError}
            </div>
          )}
        </div>
      </ConfirmModal>
    </div>
  );
}

function HandoverCardList({
  docs,
  emptyText,
  onPrint,
  onReceive,
}: {
  docs: Handover[];
  emptyText: string;
  onPrint: (doc: Handover) => void;
  onReceive?: (doc: Handover) => void;
}) {
  if (docs.length === 0) {
    return (
      <div
        className="rounded-[14px] border px-4 py-8 text-center text-sm"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {docs.map((doc) => {
        const st = STATUS_LABEL[doc.status] ?? STATUS_LABEL.draft;
        const totalQty = doc.lines.reduce((acc, l) => acc + l.quantity, 0);
        return (
          <div
            key={doc.handover_id}
            className="flex items-center gap-3 rounded-[14px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {doc.title}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: tint(st.tone, 16), color: st.tone }}
                >
                  {st.text}
                </span>
              </div>
              <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                {doc.from_department} → {doc.to_department} · 품목 {doc.lines.length}종 · 수량 {totalQty}
                {doc.received_by_name ? ` · 인수: ${doc.received_by_name}` : ""}
              </div>
            </div>
            <button
              onClick={() => onPrint(doc)}
              title="인쇄"
              aria-label="인쇄"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border transition-opacity hover:opacity-80"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              <Printer className="h-4 w-4" />
            </button>
            {onReceive && doc.status === "submitted" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onReceive(doc)}
                className="shrink-0 rounded-[12px] px-4 py-2 font-black"
                style={{ background: LEGACY_COLORS.green }}
              >
                인수 확인
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
