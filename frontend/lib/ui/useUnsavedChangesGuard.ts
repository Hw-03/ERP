"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useUnsavedChangesGuard — PR-2 2-3.
 *
 * 저장 안 된 변경이 있을 때 이동 시도를 가로채는 가드.
 *
 * 사용:
 *   const { confirmNavigation, modalProps } = useUnsavedChangesGuard(dirty, save);
 *   ...
 *   <button onClick={() => confirmNavigation(() => router.push("/x"))} />
 *   <UnsavedChangesModal {...modalProps} />
 *
 * - dirty=true 일 때 beforeunload 자동 등록 (새로고침·창닫기 트리거 (d)).
 * - confirmNavigation(proceed):
 *     dirty=false → 즉시 proceed() 호출.
 *     dirty=true → 모달 노출 후 사용자 선택에 따라
 *       "저장하고 이동" → await onSave() → proceed()
 *       "저장하지 않고 이동" → proceed()
 *       ESC/배경 클릭 → 아무것도 안 함.
 */
export type UnsavedChangesModalProps = {
  open: boolean;
  busy: boolean;
  onSaveAndProceed: () => void;
  onProceedWithoutSave: () => void;
  onCancel: () => void;
};

export function useUnsavedChangesGuard(
  dirty: boolean,
  onSave: () => Promise<void> | void,
): {
  confirmNavigation: (proceed: () => void) => void;
  modalProps: UnsavedChangesModalProps;
} {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  // 최신 dirty / onSave 를 ref 로 들고 다녀 콜백 캡처 문제 회피
  const dirtyRef = useRef(dirty);
  const saveRef = useRef(onSave);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  // 트리거 (d) — 새로고침/창닫기
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 일부 브라우저는 returnValue 가 set 돼야 prompt 가 뜸
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const confirmNavigation = useCallback((proceed: () => void) => {
    if (!dirtyRef.current) {
      proceed();
      return;
    }
    pendingRef.current = proceed;
    setOpen(true);
  }, []);

  const runProceed = useCallback(() => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    if (fn) fn();
  }, []);

  const onSaveAndProceed = useCallback(() => {
    if (busy) return;
    setBusy(true);
    Promise.resolve()
      .then(() => saveRef.current())
      .then(() => {
        setBusy(false);
        runProceed();
      })
      .catch(() => {
        // 저장 실패 시 모달 유지, 사용자에게 재시도 기회. busy 해제.
        setBusy(false);
      });
  }, [busy, runProceed]);

  const onProceedWithoutSave = useCallback(() => {
    if (busy) return;
    runProceed();
  }, [busy, runProceed]);

  const onCancel = useCallback(() => {
    if (busy) return;
    pendingRef.current = null;
    setOpen(false);
  }, [busy]);

  const modalProps = useMemo<UnsavedChangesModalProps>(
    () => ({ open, busy, onSaveAndProceed, onProceedWithoutSave, onCancel }),
    [open, busy, onSaveAndProceed, onProceedWithoutSave, onCancel],
  );

  return { confirmNavigation, modalProps };
}
