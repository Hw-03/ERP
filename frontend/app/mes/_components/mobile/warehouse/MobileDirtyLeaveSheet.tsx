"use client";

import clsx from "clsx";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { SheetHeader, PrimaryActionButton } from "../primitives";

/**
 * 입출고 작성 중 다른 섹션으로 이탈할 때 확인 시트.
 *
 * 위저드의 묶음은 자동 임시저장되므로 손실은 없지만, 이동 직전 draft 를 flush 하고
 * 사용자에게 '내 요청'에서 이어서 진행할 수 있음을 알려 작성 중 화면을 실수로 떠나는
 * 것을 막는다.
 */
export function MobileDirtyLeaveSheet({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel} ariaLabel="작성 중 이동 확인">
      <SheetHeader title="작성 중인 입출고가 있어요" onClose={onCancel} />
      <div className="flex flex-col gap-3 px-5 pb-2">
        <p className={clsx(TYPO.body, "font-semibold")} style={{ color: LEGACY_COLORS.muted }}>
          지금까지 담은 작업 묶음은 자동으로 임시저장돼요. 다른 화면으로 이동해도 ‘내 요청’에서
          이어서 진행할 수 있어요.
        </p>
        <PrimaryActionButton label="임시저장하고 이동" intent="primary" onClick={onConfirm} />
        <button
          type="button"
          onClick={onCancel}
          className={clsx(
            "w-full rounded-[16px] border py-3 font-bold transition-[transform] active:scale-[0.99]",
            TYPO.body,
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
