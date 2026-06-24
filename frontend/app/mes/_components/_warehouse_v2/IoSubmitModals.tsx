"use client";

import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { LEGACY_COLORS } from "@/lib/mes/color";

interface ResultState {
  kind: "success" | "error";
  title: string;
  message: string;
}

interface Props {
  result: ResultState | null;
  onClose: () => void;
  /** R5(박스 배치 수량 부족) 차단 시 창고 지도로 이동. */
  onGoToMap?: () => void;
}

export function IoSubmitModals({ result, onClose, onGoToMap }: Props) {
  // R5 차단 메시지면 배치 화면 바로가기 노출.
  const showMapLink =
    result?.kind === "error" && !!onGoToMap && result.message.includes("박스 배치");

  return (
    <ConfirmModal
      open={result !== null}
      title={result?.title ?? ""}
      tone={result?.kind === "error" ? "danger" : "normal"}
      confirmLabel="확인"
      cancelLabel="닫기"
      onClose={onClose}
      onConfirm={onClose}
    >
      <p className="whitespace-pre-line text-sm leading-relaxed">{result?.message}</p>
      {showMapLink && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onGoToMap?.();
          }}
          className="mt-3 rounded-[10px] px-3 py-2 text-sm font-bold text-white transition-colors hover:brightness-[1.04]"
          style={{ background: LEGACY_COLORS.blue }}
        >
          창고 지도에서 배치하기 →
        </button>
      )}
    </ConfirmModal>
  );
}

export type { ResultState as IoSubmitResultState };
