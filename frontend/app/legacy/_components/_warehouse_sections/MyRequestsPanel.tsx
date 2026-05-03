"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";
import { MyRequestRow } from "./MyRequestRow";

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onChanged: () => void;
}

export function MyRequestsPanel({ employeeId, refreshNonce, onChanged }: Props) {
  const [items, setItems] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StockRequest | null>(null);
  const [cancelPin, setCancelPin] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.listMyStockRequests(employeeId);
      setItems(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "요청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

  const openCancel = (request: StockRequest) => {
    setCancelTarget(request);
    setCancelPin("");
    setCancelError(null);
  };

  const closeCancel = () => {
    setCancelTarget(null);
    setCancelPin("");
    setCancelError(null);
  };

  const submitCancel = async () => {
    if (!cancelTarget || !cancelPin.trim() || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await api.cancelStockRequest(cancelTarget.request_id, {
        actor_employee_id: cancelTarget.requester_employee_id,
        pin: cancelPin,
      });
      closeCancel();
      await reload();
      onChanged();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "요청 취소에 실패했습니다.");
    } finally {
      setCancelBusy(false);
    }
  };

  if (!employeeId) {
    return (
      <div
        className="rounded-[14px] border px-5 py-6 text-sm"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        담당자를 먼저 선택하면 내 요청 현황이 표시됩니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
          불러오는 중...
        </div>
      )}
      {loadError && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
          }}
        >
          {loadError}
        </div>
      )}
      {!loading && items.length === 0 && !loadError && (
        <div
          className="rounded-[14px] border px-5 py-6 text-sm"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
        >
          아직 제출한 요청이 없습니다.
        </div>
      )}
      {items.map((req) => (
        <MyRequestRow
          key={req.request_id}
          req={req}
          onCancelRequest={() => openCancel(req)}
        />
      ))}

      <ConfirmModal
        open={cancelTarget !== null}
        title="요청 취소 — PIN 확인"
        tone="danger"
        confirmLabel="요청 취소"
        cancelLabel="닫기"
        busy={cancelBusy}
        onClose={closeCancel}
        onConfirm={submitCancel}
      >
        <p className="mb-3 text-sm" style={{ color: LEGACY_COLORS.text }}>
          본인 PIN을 입력하면 이 요청이 취소됩니다.
        </p>
        {cancelError && (
          <p className="mb-2 text-xs" style={{ color: LEGACY_COLORS.red }}>
            {cancelError}
          </p>
        )}
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={cancelPin}
          onChange={(e) => setCancelPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void submitCancel(); }}
          className="w-full rounded-[10px] border px-3 py-2 text-sm outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
          autoFocus
        />
      </ConfirmModal>
    </div>
  );
}
