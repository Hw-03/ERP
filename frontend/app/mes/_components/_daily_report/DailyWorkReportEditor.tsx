"use client";

import { CheckCircle2, PencilLine } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

function formatKstTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function DailyWorkReportEditor({
  initialContent,
  initialUpdatedAt,
  resetKey,
  editable,
  saving,
  saveError,
  onSave,
  onDirtyChange,
  onEdit,
  saveRef,
  fillAvailableHeight = false,
  loading = false,
}: {
  initialContent: string;
  initialUpdatedAt?: string | null;
  resetKey?: string;
  editable: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (content: string) => Promise<string | null>;
  onDirtyChange?: (dirty: boolean) => void;
  onEdit?: () => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  fillAvailableHeight?: boolean;
  loading?: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [focused, setFocused] = useState(false);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [savingLocal, setSavingLocal] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialUpdatedAt ?? null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);
  const appliedResetKeyRef = useRef(resetKey);
  const userEditedRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentVersionRef = useRef(0);
  const contentRef = useRef(initialContent);
  const savedContentRef = useRef(initialContent);
  const dirtyRef = useRef(false);
  const saveLatestRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const dirty = content !== savedContent;

  useEffect(() => {
    if (appliedResetKeyRef.current !== resetKey) {
      appliedResetKeyRef.current = resetKey;
      contentVersionRef.current += 1;
      savePromiseRef.current = null;
      userEditedRef.current = false;
      contentRef.current = initialContent;
      savedContentRef.current = initialContent;
      dirtyRef.current = false;
      setContent(initialContent);
      setSavedContent(initialContent);
      setSavedAt(initialUpdatedAt ?? null);
      setSaveFailed(false);
      setLocalSaveError(null);
      setSavingLocal(false);
      return;
    }
    if (!userEditedRef.current) {
      contentRef.current = initialContent;
      savedContentRef.current = initialContent;
      setContent(initialContent);
      setSavedContent(initialContent);
      setSavedAt(initialUpdatedAt ?? null);
    }
  }, [initialContent, initialUpdatedAt, resetKey]);

  useEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => {
    contentVersionRef.current += 1;
  }, []);

  const save = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const targetKey = resetKey;
    if (savePromiseRef.current) {
      await savePromiseRef.current;
      if (appliedResetKeyRef.current === targetKey && dirtyRef.current) {
        return saveLatestRef.current();
      }
      return;
    }
    if (!dirtyRef.current) return;
    setLocalSaveError(null);
    setSaveFailed(false);
    setSavingLocal(true);
    const next = contentRef.current.trim();
    const contentVersion = contentVersionRef.current;
    let promise: Promise<void>;
    promise = onSave(next)
      .then((updatedAt) => {
        if (contentVersion !== contentVersionRef.current) return;
        userEditedRef.current = false;
        contentRef.current = next;
        savedContentRef.current = next;
        dirtyRef.current = false;
        setContent(next);
        setSavedContent(next);
        setSavedAt(updatedAt);
      })
      .catch((error: unknown) => {
        if (contentVersion !== contentVersionRef.current) throw error;
        setSaveFailed(true);
        setLocalSaveError(error instanceof Error ? error.message : "일보를 저장하지 못했습니다.");
        throw error;
      })
      .finally(() => {
        if (savePromiseRef.current !== promise) return;
        savePromiseRef.current = null;
        setSavingLocal(false);
      });
    savePromiseRef.current = promise;
    await promise;
    if (appliedResetKeyRef.current === targetKey && dirtyRef.current) {
      return saveLatestRef.current();
    }
  }, [onSave, resetKey]);
  saveLatestRef.current = save;

  useEffect(() => {
    if (!editable || loading || !dirty) return;
    autoSaveTimerRef.current = setTimeout(() => { void save().catch(() => {}); }, 1000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    };
  }, [content, dirty, editable, loading, save]);

  useEffect(() => {
    const onPageHide = () => {
      if (dirtyRef.current) void saveLatestRef.current().catch(() => {});
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    if (saveRef) saveRef.current = loading ? null : save;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  if (!editable) {
    return (
      <section className={`rounded-[20px] border p-4 lg:p-5 ${fillAvailableHeight ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : ""}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
            <PencilLine className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-black">작업 내역</h2>
          </div>
        </div>
        <p className={`mt-5 whitespace-pre-wrap rounded-[16px] border px-4 py-4 text-sm leading-7 ${fillAvailableHeight ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1" : ""}`} style={{ color: initialContent ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {loading ? <span role="status" aria-label="작업 내역 불러오는 중" className="block h-7 w-2/3 rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.s3 }} /> : initialContent || <><Image src="/images/dexray/daily-empty.webp" alt="" width={360} height={240} className="mx-auto hidden h-36 w-auto object-contain lg:block" />작성된 일보가 없습니다.</>}
        </p>
      </section>
    );
  }

  const saveStatus = saving || savingLocal
    ? "저장 중"
    : saveFailed || saveError
      ? "저장 실패 · 다시 시도하세요"
      : dirty
        ? "저장 대기 중"
        : savedAt
          ? `저장됨 · ${formatKstTime(savedAt)}`
          : null;

  return (
    <section aria-busy={loading || undefined} className={`rounded-[20px] border p-4 lg:p-5 ${fillAvailableHeight ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : ""}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
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
          {loading ? <span aria-label="글자 수 불러오는 중" className="inline-block h-3 w-4 motion-safe:animate-pulse rounded" style={{ background: LEGACY_COLORS.s3 }} /> : content.length.toLocaleString()} / 5,000
        </span>
      </div>
      {loading ? <div data-testid="daily-report-editor-skeleton" role="status" aria-label="작업 내역 불러오는 중" className={`mt-4 min-h-44 w-full rounded-[16px] border px-4 py-3.5 ${fillAvailableHeight ? "lg:min-h-0 lg:flex-1" : ""}`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="h-5 w-4/5 motion-safe:animate-pulse rounded" style={{ background: LEGACY_COLORS.s3 }} />
        <div className="mt-2 h-5 w-2/3 motion-safe:animate-pulse rounded" style={{ background: LEGACY_COLORS.s3 }} />
      </div> : <div className={`relative mt-4 flex min-h-44 flex-col ${fillAvailableHeight ? "lg:min-h-0 lg:flex-1" : ""}`}>
      {!content.trim() && !focused && <div data-testid="daily-empty-mascot" aria-hidden="true" className="pointer-events-none absolute inset-0 hidden items-center justify-center lg:flex"><Image src="/images/dexray/daily-empty.webp" alt="" width={360} height={240} className="h-auto max-h-[80%] w-[min(240px,50%)] object-contain" /></div>}
      <textarea
        aria-label="작업 내역"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        value={content}
        maxLength={5000}
        onChange={(event) => {
          const nextContent = event.target.value;
          contentVersionRef.current += 1;
          userEditedRef.current = true;
          contentRef.current = nextContent;
          dirtyRef.current = nextContent !== savedContentRef.current;
          setSaveFailed(false);
          setLocalSaveError(null);
          onEdit?.();
          setContent(nextContent);
        }}
        className={`min-h-44 w-full flex-1 resize-none rounded-[16px] border px-4 py-3.5 text-lg leading-7 outline-none transition focus-visible:ring-2 ${fillAvailableHeight ? "lg:min-h-0 lg:flex-1" : ""}`}
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      /></div>}
      {(saveError || localSaveError) && <p role="alert" className="mt-3 rounded-[12px] px-3 py-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>{saveError || localSaveError}</p>}
      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-3">
        <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
          <CheckCircle2 className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
          과거 일보도 수정할 수 있습니다.
        </p>
        <p aria-live="polite" className="text-xs font-bold" style={{ color: saveStatus?.startsWith("저장 실패") ? LEGACY_COLORS.red : LEGACY_COLORS.muted2 }}>{saveStatus}</p>
      </div>
    </section>
  );
}
