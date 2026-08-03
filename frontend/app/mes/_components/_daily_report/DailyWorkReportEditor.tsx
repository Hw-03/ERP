"use client";

import { CheckCircle2, PencilLine, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function DailyWorkReportEditor({
  initialContent,
  resetKey,
  editable,
  saving,
  saveError,
  onSave,
  onDirtyChange,
  saveRef,
  fillAvailableHeight = false,
}: {
  initialContent: string;
  resetKey?: string;
  editable: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  fillAvailableHeight?: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);
  const initialContentRef = useRef(initialContent);
  const appliedResetKeyRef = useRef(resetKey);
  const userEditedRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const dirty = content !== initialContentRef.current;

  useEffect(() => {
    if (appliedResetKeyRef.current !== resetKey) {
      appliedResetKeyRef.current = resetKey;
      userEditedRef.current = false;
      initialContentRef.current = initialContent;
      setContent(initialContent);
      setValidationError(null);
      return;
    }
    if (!userEditedRef.current) {
      initialContentRef.current = initialContent;
      setContent(initialContent);
    }
  }, [initialContent, resetKey]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = async () => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const next = content.trim();
    if (!next) {
      const error = new Error("일보 내용을 입력하세요.");
      setValidationError(error.message);
      return Promise.reject(error);
    }
    if (saving) return Promise.reject(new Error("저장 중입니다."));
    setValidationError(null);
    setSavingLocal(true);
    const promise = onSave(next)
      .then(() => {
        initialContentRef.current = next;
        setContent(next);
      })
      .finally(() => {
        savePromiseRef.current = null;
        setSavingLocal(false);
      });
    savePromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    if (saveRef) saveRef.current = save;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  if (!editable) {
    return (
      <section className="rounded-[20px] border p-4 lg:p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
            <PencilLine className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-black">작업 내역</h2>
          </div>
        </div>
        <p className="mt-5 whitespace-pre-wrap rounded-[16px] border px-4 py-4 text-sm leading-7" style={{ color: initialContent ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {initialContent || "작성된 일보가 없습니다."}
        </p>
      </section>
    );
  }

  return (
    <section className={`rounded-[20px] border p-4 lg:p-5 ${fillAvailableHeight ? "lg:flex lg:h-[424px] lg:flex-none lg:flex-col" : ""}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
            <PencilLine className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-black">작업 내역</h2>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ color: dirty ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}>
          {content.length.toLocaleString()} / 5,000
        </span>
      </div>
      <textarea
        aria-label="작업 내역"
        value={content}
        maxLength={5000}
        onChange={(event) => {
          userEditedRef.current = true;
          setContent(event.target.value);
        }}
        className={`mt-4 min-h-44 w-full resize-none rounded-[16px] border px-4 py-3.5 text-sm leading-7 outline-none transition focus-visible:ring-2 ${fillAvailableHeight ? "lg:min-h-0 lg:flex-1" : ""}`}
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      />
      {(validationError || saveError) && <p role="alert" className="mt-3 rounded-[12px] px-3 py-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>{validationError || saveError}</p>}
      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-3">
        <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
          <CheckCircle2 className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
          저장 후에도 과거 일보는 수정할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => { void save().catch(() => {}); }}
          disabled={saving || savingLocal}
          className="flex min-h-11 items-center gap-2 rounded-[12px] px-4 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: LEGACY_COLORS.blue }}
        >
          <Save className="h-4 w-4" />
          {saving ? "저장 중" : "저장"}
        </button>
      </div>
    </section>
  );
}
