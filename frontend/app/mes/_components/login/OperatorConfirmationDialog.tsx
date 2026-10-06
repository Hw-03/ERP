"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactPortal, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Operator } from "./useCurrentOperator";

interface OperatorConfirmationDialogProps {
  operator: Operator;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onContinue: () => void;
  onSwitchAccount: () => void;
  mascotSrc?: string;
}

/** Modal top layer preserves the mounted work screen and isolates existing portal dialogs. */
export function OperatorConfirmationDialog({ operator, dialogRef, onContinue, onSwitchAccount, mascotSrc }: OperatorConfirmationDialogProps): ReactPortal {
  const titleId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    titleRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dialogRef]);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => event.preventDefault()}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[480px] overflow-y-auto overscroll-contain rounded-[24px] border p-6 backdrop:bg-black/55"
      style={{ background: "var(--c-popup-bg)", borderColor: "var(--c-border)", color: "var(--c-text)", boxShadow: "var(--c-popup-shadow)" }}
    >
      <div data-mascot-slot aria-hidden="true" className="mx-auto mb-5 h-24 w-24 shrink-0 lg:h-32 lg:w-32">
        {mascotSrc && failedSrc !== mascotSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mascotSrc} alt="" draggable={false} className="h-full w-full object-contain" onError={() => setFailedSrc(mascotSrc)} />
        )}
      </div>
      <h2 ref={titleRef} id={titleId} tabIndex={-1} className="text-center text-lg font-bold outline-none">현재 작업자를 확인해 주세요</h2>
      <div id={descriptionId} className="mt-3 text-center text-sm leading-relaxed">
        <p>현재 <strong>{operator.name}</strong> 직원으로 로그인되어 있습니다.</p>
        <p className="mt-2">{operator.name} 직원으로 작업을 계속하시겠습니까?</p>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <button type="button" onClick={onContinue} className="min-h-11 rounded-[14px] px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: "var(--c-blue)" }}>
          {operator.name}(으)로 계속
        </button>
        <button type="button" onClick={onSwitchAccount} className="min-h-11 rounded-[14px] border px-4 py-3 text-sm font-bold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: "var(--c-s2)", borderColor: "var(--c-border)", color: "var(--c-text)" }}>
          다른 계정으로 로그인
        </button>
      </div>
      <p className="mt-4 text-center text-sm leading-relaxed" style={{ color: "var(--c-muted2)" }}>
        다른 계정으로 로그인하면 저장하지 않은 내용은 사라집니다.
      </p>
    </dialog>, document.body,
  );
}
