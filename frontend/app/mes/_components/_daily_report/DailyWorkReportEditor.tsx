"use client";

import { Save } from "lucide-react";
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
}: {
  initialContent: string;
  resetKey?: string;
  editable: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
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
      const error = new Error("일지 내용을 입력하세요.");
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
      <section className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <h2 className="text-base font-black">오늘 한 일</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
          {initialContent || "작성된 일지가 없습니다."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">오늘 한 일</h2>
          <p className="mt-1 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>작업 내용을 자유롭게 작성하세요.</p>
        </div>
        <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{content.length.toLocaleString()} / 5,000</span>
      </div>
      <textarea
        aria-label="오늘 한 일"
        value={content}
        maxLength={5000}
        onChange={(event) => {
          userEditedRef.current = true;
          setContent(event.target.value);
        }}
        className="mt-3 min-h-36 w-full resize-y rounded-[14px] border px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      />
      {(validationError || saveError) && <p role="alert" className="mt-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{validationError || saveError}</p>}
      <div className="mt-3 flex justify-end">
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
