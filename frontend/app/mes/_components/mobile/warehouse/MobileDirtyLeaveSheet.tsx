"use client";

import clsx from "clsx";
import { useState } from "react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { SheetHeader, PrimaryActionButton } from "../primitives";

/**
 * 입출고 작성 중 다른 섹션으로 이탈할 때 확인 시트.
 *
 * 이동 직전 draft 를 flush 하거나 폐기할지 선택하게 해 실수로 화면을 떠나는 것을 막는다.
 */
export function MobileDirtyLeaveSheet({
  open,
  onConfirm,
  onCancel,
  onDiscard,
}: {
  open: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  /** 항목 3-4 — 저장하지 않고 그냥 나가기(작성 중 내용 폐기). 미전달 시 버튼 숨김. */
  onDiscard?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const handleCancel = () => {
    if (!busy) onCancel();
  };
  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={handleCancel} ariaLabel="작성 중 이동 확인">
      <SheetHeader title="작성 중인 입출고가 있어요" onClose={handleCancel} className="!items-center" />
      <div className="flex flex-col gap-3 px-5 pb-2">
        <PrimaryActionButton
          label={busy ? "저장 중…" : "임시저장하고 이동"}
          intent="primary"
          onClick={() => void handleConfirm()}
          disabled={busy}
        />
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className={clsx(
              "w-full rounded-[16px] border py-3 font-bold transition-[transform] active:scale-[0.99]",
              TYPO.body,
              "disabled:opacity-50",
            )}
            style={{
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
              color: LEGACY_COLORS.red,
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            }}
          >
            저장 안 하고 나가기
          </button>
        )}
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className={clsx(
            "w-full rounded-[16px] border py-3 font-bold transition-[transform] active:scale-[0.99]",
            TYPO.body,
            "disabled:opacity-50",
          )}
          style={{
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
            background: LEGACY_COLORS.s2,
          }}
        >
          계속 작성
        </button>
      </div>
    </BottomSheet>
  );
}
