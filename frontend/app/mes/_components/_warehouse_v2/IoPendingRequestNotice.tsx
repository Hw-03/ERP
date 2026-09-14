"use client";

import type { IoDraftPayload } from "@/lib/api";
import type { RefObject } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { subTypeLabel } from "./ioWorkType";
import type { PendingIoDraftRequest } from "./ioPendingRequest";

/** 편집 중인 폼과 별개로 서버에 보낸 원 요청을 직원에게 보여준다. */
export function IoPendingRequestNotice({ request, draftRequest, busy, onRecover, buttonRef }: {
  request: IoDraftPayload | null;
  draftRequest?: PendingIoDraftRequest | null;
  busy: boolean;
  onRecover: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  if (!request && !draftRequest) return null;
  return (
    <section
      aria-label="이전 입출고 요청 확인"
      className="shrink-0 rounded-xl border p-3 text-sm"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.warningBg }}
    >
      <p className="font-bold">
        처리 결과 확인 필요{request ? ` · ${subTypeLabel(request.sub_type)}` : " · 임시저장 제출"}
      </p>
      <p className="mt-1">이전 요청이 이미 처리됐을 수 있습니다. 결과 확인 전에는 새 요청을 제출할 수 없습니다.</p>
      {request && (
        <ul className="my-2 max-h-24 overflow-y-auto">
          {request.bundles.map((bundle, index) => (
            <li key={bundle.bundle_id || index}>{bundle.title} · 수량 {bundle.quantity}</li>
          ))}
        </ul>
      )}
      <button ref={buttonRef} type="button" className="min-h-11 rounded-lg border px-3 py-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy} onClick={onRecover}>
        {busy ? "확인 중…" : "이전 요청 결과 확인"}
      </button>
    </section>
  );
}
