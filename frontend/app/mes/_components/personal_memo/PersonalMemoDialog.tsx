"use client";

import { NotebookPen } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { personalMemoApi, type PersonalMemo } from "@/lib/api/personal-memo";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { PopupDialogFrame } from "../common/PopupDialogFrame";
import { DailyWorkReportEditor } from "../_daily_report/DailyWorkReportEditor";

type Props = { employeeId: string; onClose: () => void; mobilePresentation?: boolean };

/** A keyed editor owns one employee's draft; no private text survives in a shared cache. */
export function PersonalMemoDialog(props: Props): ReactNode {
  return <EmployeeMemoDialog key={props.employeeId} {...props} />;
}

function EmployeeMemoDialog({ employeeId, onClose, mobilePresentation = false }: Props): ReactNode {
  const [memo, setMemo] = useState<PersonalMemo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(false);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const mounted = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    void personalMemoApi.get(employeeId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setMemo(value);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    });
    return () => controller.abort();
  }, [employeeId, loadAttempt]);

  const flush = useCallback(async (): Promise<void> => {
    await saveRef.current?.();
  }, []);
  useRegisterDirty(`personal-memo:${employeeId}`, dirty, flush, undefined, { mode: "auto-save" });

  const close = async (): Promise<void> => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setCloseError(false);
    try {
      await flush();
      if (mounted.current) onClose();
    } catch {
      if (mounted.current) setCloseError(true);
    } finally {
      closingRef.current = false;
      if (mounted.current) setClosing(false);
    }
  };

  return (
    <PopupDialogFrame title="메모장" icon={NotebookPen} subtitle="나만 볼 수 있는 개인 메모입니다." onClose={() => { void close(); }} mobilePresentation={mobilePresentation} closeLabel="메모장 닫기">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
        {loadError ? (
          <div className="rounded-[20px] border border-[var(--c-border)] bg-[var(--c-s2)] p-5 text-sm">
            <p role="alert">메모를 불러오지 못했습니다. 다시 시도해 주세요.</p>
            <button type="button" className="mt-3 min-h-11 rounded-[14px] border border-[var(--c-border)] px-4 font-semibold text-[var(--c-blue)]" onClick={() => setLoadAttempt((value) => value + 1)}>다시 불러오기</button>
          </div>
        ) : memo ? (
          <DailyWorkReportEditor initialContent={memo.content} initialUpdatedAt={memo.updated_at} resetKey={employeeId} editable saving={false} saveError={null}
            onSave={async (content) => (await personalMemoApi.save(employeeId, content)).updated_at}
            onDirtyChange={setDirty} saveRef={saveRef} mobile={mobilePresentation} fillAvailableHeight={mobilePresentation}
            copy={{ title: "메모", inputLabel: "메모", emptyMessage: "작성된 메모가 없습니다.", saveError: "메모를 저장하지 못했습니다.", footerHint: "입력한 내용은 자동으로 저장됩니다." }} />
        ) : <p role="status" className="py-8 text-center text-sm text-[var(--c-muted)]">메모를 불러오는 중…</p>}
        {closeError && <div role="alert" className="text-sm text-[var(--c-red)]">저장을 마치지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요.</div>}
        {(closeError || closing) && <button type="button" disabled={closing} onClick={() => { void close(); }} className="min-h-11 shrink-0 rounded-[14px] border border-[var(--c-border)] px-4 text-sm font-semibold text-[var(--c-blue)] disabled:opacity-50">{closing ? "저장 중…" : "저장 후 닫기"}</button>}
      </div>
    </PopupDialogFrame>
  );
}
