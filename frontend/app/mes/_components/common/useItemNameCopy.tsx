"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/** HTTP 접속에서도 복사하며 임시 선택으로 바뀐 포커스와 선택 영역을 복원한다. */
function copyWithSelection(text: string): boolean {
  const focused = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const inputSelection = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
    ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection }
    : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  // 상세 dialog 안에 두어 포커스 트랩이 임시 선택을 차단하지 않게 한다.
  (focused?.closest('[role="dialog"]') ?? document.body).appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } finally {
    textarea.remove();
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
    if (inputSelection && inputSelection.start !== null && inputSelection.end !== null &&
      (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)) {
      focused.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
    }
  }
}

/** 상세 패널의 전체 품목명 복사와 선택 변경 시 늦은 응답 무효화를 공유한다. */
export function useItemNameCopy(name: string | undefined, selectionKey: string | undefined, open: boolean): { button: ReactNode; error: ReactNode } {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const copyRequestRef = useRef(0);

  useEffect(() => {
    setCopyStatus("idle");
    copyRequestRef.current += 1;
    return () => { copyRequestRef.current += 1; };
  }, [selectionKey, name, open]);

  useEffect(() => {
    if (copyStatus !== "copied") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  /** 제목의 생략 표시와 관계없이 현재 표시 품목의 이름 전체를 복사한다. */
  async function handleCopyName(): Promise<void> {
    if (!name) return;
    const request = ++copyRequestRef.current;
    setCopyStatus("idle");
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(name);
          copied = true;
        } catch {
          // 권한 거부 시에도 같은 클릭에서 HTTP 호환 복사를 시도한다.
        }
      }
      if (request !== copyRequestRef.current) return;
      if (!copied) copied = copyWithSelection(name);
      setCopyStatus(copied ? "copied" : "error");
    } catch {
      if (request === copyRequestRef.current) setCopyStatus("error");
    }
  }

  return {
    button: name ? <button
      type="button"
      aria-label="품목명 복사"
      onClick={handleCopyName}
      className="flex h-6 w-16 items-center justify-center gap-1 rounded-md text-sm font-bold transition-colors hover:brightness-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: "var(--c-blue)", background: "color-mix(in srgb, var(--c-blue) 8%, transparent)" }}
    >
      {copyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span aria-live="polite">{copyStatus === "copied" ? "완료" : "복사"}</span>
    </button> : undefined,
    error: copyStatus === "error" ? <p role="alert" className="mb-3 text-sm" style={{ color: "var(--c-red)" }}>품목명을 복사하지 못했습니다. 복사 버튼으로 다시 시도해 주세요.</p> : null,
  };
}
