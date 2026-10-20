import type { ReactElement, Ref } from "react";
import { Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/** 조회 중에도 삭제 동작과 같은 모양·너비의 비활성 자리를 유지한다. */
export function ItemDeleteButton({ disabled = false, buttonRef, onClick }: {
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onClick?: () => void;
}): ReactElement {
  return <button ref={buttonRef} type="button" disabled={disabled} onClick={onClick}
    className="standard-hover flex min-h-11 items-center gap-1 rounded-[12px] px-3 py-1.5 text-[14px] font-bold transition-colors disabled:cursor-not-allowed"
    style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.red, border: `1px solid ${LEGACY_COLORS.red}` }}>
    <Trash2 className="h-3.5 w-3.5" />삭제
  </button>;
}
