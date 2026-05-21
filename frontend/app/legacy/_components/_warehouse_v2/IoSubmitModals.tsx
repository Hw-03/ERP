"use client";

import { ConfirmModal } from "@/lib/ui/ConfirmModal";

interface ResultState {
  kind: "success" | "error";
  title: string;
  message: string;
}

interface Props {
  result: ResultState | null;
  onClose: () => void;
}

export function IoSubmitModals({ result, onClose }: Props) {
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
      <p className="text-sm">{result?.message}</p>
    </ConfirmModal>
  );
}

export type { ResultState as IoSubmitResultState };
