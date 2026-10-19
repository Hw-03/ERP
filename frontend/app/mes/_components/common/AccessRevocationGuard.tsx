"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { useAccessRevocationLeave } from "@/lib/ui/dirty-guard";
const AccessRevocationContext = createContext(false);

/** Retains mounted drafts while revoked controls (including their portals) are inert. */
export function AccessRevocationGuard({ allowed, onLeave, beforeLeave, children }: {
  allowed: boolean;
  onLeave: () => void;
  beforeLeave?: () => Promise<void>;
  children: ReactNode;
}): ReactNode {
  const preserve = useAccessRevocationLeave();
  const ancestorBlocked = useContext(AccessRevocationContext);
  const blocked = ancestorBlocked || !allowed;
  const latest = useRef({ allowed, ancestorBlocked, onLeave, beforeLeave, preserve });
  const admitted = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const heading = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    latest.current = { allowed, ancestorBlocked, onLeave, beforeLeave, preserve };
    if (allowed) admitted.current = true;
  }, [allowed, ancestorBlocked, beforeLeave, onLeave, preserve]);
  useLayoutEffect(() => { if (!allowed && !ancestorBlocked) heading.current?.focus(); }, [allowed, ancestorBlocked]);
  const leave = useCallback(async (): Promise<void> => {
    if (pending.current || latest.current.allowed || latest.current.ancestorBlocked) return;
    const request = generation.current;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (latest.current.beforeLeave) await latest.current.beforeLeave();
      const result = latest.current.preserve();
      const accepted = typeof result === "boolean" ? result : await result;
      if (accepted && request === generation.current && !latest.current.allowed && !latest.current.ancestorBlocked) latest.current.onLeave();
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : "작성 내용을 보존하지 못했습니다.");
    } finally {
      if (request === generation.current) { pending.current = false; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setBusy(false);
    setError(null);
    if (!allowed && !ancestorBlocked) void leave();
    return () => { generation.current += 1; };
  }, [allowed, ancestorBlocked, leave]);
  function block(event: SyntheticEvent): void {
    if (!latest.current.allowed || latest.current.ancestorBlocked) { event.preventDefault(); event.stopPropagation(); }
  }
  return <AccessRevocationContext.Provider value={blocked}><div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div inert={blocked || undefined} className="flex min-h-0 min-w-0 flex-1 flex-col" onClickCapture={block} onKeyDownCapture={block} onSubmitCapture={block}>
      {(allowed || admitted.current) && children}
    </div>
    {!allowed && !ancestorBlocked && <div className="absolute inset-0 z-[350] flex items-center justify-center rounded-[20px] bg-[var(--c-s1)]/95 p-6">
      <div className="max-w-md text-center text-[var(--c-text)]">
        <p ref={heading} tabIndex={-1} className="text-base font-bold outline-none">접근 권한이 변경되었습니다.</p>
        <p className="mt-2 text-sm text-[var(--c-muted2)]">작성 중인 내용을 보존한 뒤 사용 가능한 화면으로 이동합니다.</p>
        {error && <p role="alert" className="mt-2 text-sm text-[var(--c-red)]">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void leave()} className="mt-4 min-h-11 rounded-[12px] bg-[var(--c-blue)] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "내용 보존 중…" : "내용 보존 후 이동"}</button>
      </div>
    </div>}
  </div></AccessRevocationContext.Provider>;
}
