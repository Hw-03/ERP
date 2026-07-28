"use client";

import { CalendarDays, CircleAlert, ClipboardList, FileText, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useDailyWorkActivityQuery, useDailyWorkReportQuery, useDailyWorkReportsQuery, useSaveDailyWorkReport } from "@/lib/queries/useDailyWorkReportsQuery";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { DailyWorkActivity } from "./DailyWorkActivity";
import { DailyWorkReportEditor } from "./DailyWorkReportEditor";
import { toKstDateKey } from "./dailyReportDate";

type ReportTab = "mine" | "all";

function Failure({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-[14px] border px-3 py-2.5 text-sm font-bold" style={{ color: LEGACY_COLORS.red, borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.errorBg }}>
      <CircleAlert className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

function PanelPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border px-5 py-10 text-center" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-card-shadow)" }}>
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[16px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}><Users className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{children}</p>
    </div>
  );
}

export function DailyWorkReportScreen({
  employeeId,
  onDirtyChange,
  saveRef,
  confirmNavigation,
}: {
  employeeId: string | null | undefined;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  confirmNavigation?: (proceed: () => void) => void;
}) {
  const [workDate, setWorkDate] = useState(() => toKstDateKey());
  const [tab, setTab] = useState<ReportTab>("mine");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const today = toKstDateKey();
  const localSaveRef = useRef<(() => Promise<void>) | null>(null);

  const reportQuery = useDailyWorkReportQuery(employeeId, workDate);
  const reportsQuery = useDailyWorkReportsQuery(workDate);
  const targetEmployeeId = tab === "mine" ? employeeId : selectedEmployeeId;
  const selectedReportQuery = useDailyWorkReportQuery(targetEmployeeId, workDate);
  const activityQuery = useDailyWorkActivityQuery(targetEmployeeId, workDate);
  const saveMutation = useSaveDailyWorkReport();
  const editable = Boolean(employeeId && targetEmployeeId === employeeId);
  const report = tab === "mine" ? reportQuery.data : selectedReportQuery.data;
  const editorResetKey = `${tab}:${workDate}:${targetEmployeeId ?? ""}`;

  const save = useCallback(async () => {
    if (!employeeId || !editable) return;
    setSaveError(null);
    await localSaveRef.current?.();
  }, [editable, employeeId]);

  useRegisterDirty("daily-work-report", dirty, save, () => setDirty(false));

  useEffect(() => {
    if (saveRef) saveRef.current = save;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [save, saveRef]);

  const persist = useCallback(async (content: string) => {
    if (!employeeId) return;
    setSaveError(null);
    try {
      await saveMutation.mutateAsync({
        employeeId,
        workDate,
        payload: { actorEmployeeId: employeeId, content },
      });
      setDirty(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "일지를 저장하지 못했습니다.");
      throw error;
    }
  }, [employeeId, saveMutation, workDate]);

  const requestChange = (proceed: () => void, message: string) => {
    if (confirmNavigation) {
      confirmNavigation(proceed);
      return;
    }
    if (dirty && !window.confirm(message)) return;
    proceed();
  };

  const changeTab = (next: ReportTab) => {
    if (next === tab) return;
    requestChange(() => {
      setDirty(false);
      setTab(next);
      setSelectedEmployeeId(null);
    }, "저장하지 않은 내용이 있습니다. 이동하면 작성 중인 내용이 사라집니다.");
  };

  const changeDate = (next: string) => {
    if (!next || next > today) return;
    requestChange(() => {
      setDirty(false);
      setWorkDate(next);
      setSelectedEmployeeId(null);
    }, "저장하지 않은 내용이 있습니다. 날짜를 바꾸면 작성 중인 내용이 사라집니다.");
  };

  const editorSaveRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    localSaveRef.current = () => editorSaveRef.current?.() ?? Promise.resolve();
  });

  if (!employeeId) {
    return <div className="flex min-h-0 flex-1 items-center justify-center"><Failure message="로그인한 작업자 정보를 찾을 수 없습니다." /></div>;
  }

  const reportLoadFailed = tab === "mine" ? reportQuery.isError : selectedReportQuery.isError;

  return (
    <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-5 lg:py-5" style={{ background: LEGACY_COLORS.bg }}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-8">
        <header className="rounded-[20px] border p-4 lg:p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-card-shadow)" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black tracking-[0.08em]" style={{ color: LEGACY_COLORS.blue }}>DAILY WORK REPORT</p>
                <h1 className="mt-0.5 text-xl font-black">일일 작업 일지</h1>
                <p className="mt-1 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>한 줄의 기록과 실제 MES 거래를 함께 확인합니다.</p>
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-[12px] border px-3 text-sm font-black" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <CalendarDays className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
              <span className="sr-only">일지 날짜</span>
              <input aria-label="일지 날짜" type="date" value={workDate} max={today} onChange={(event) => changeDate(event.target.value)} className="bg-transparent outline-none" />
            </label>
          </div>
          <div className="mt-5 inline-flex rounded-[14px] p-1" role="tablist" aria-label="일지 보기" style={{ background: LEGACY_COLORS.s2 }}>
            <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => changeTab("mine")} className="flex min-h-10 items-center rounded-[10px] px-3.5 text-sm font-black transition" style={{ color: tab === "mine" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2, background: tab === "mine" ? LEGACY_COLORS.blue : "transparent", boxShadow: tab === "mine" ? "var(--c-card-shadow)" : "none" }}><FileText className="mr-2 h-4 w-4" />내 일보</button>
            <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => changeTab("all")} className="flex min-h-10 items-center rounded-[10px] px-3.5 text-sm font-black transition" style={{ color: tab === "all" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2, background: tab === "all" ? LEGACY_COLORS.blue : "transparent", boxShadow: tab === "all" ? "var(--c-card-shadow)" : "none" }}><Users className="mr-2 h-4 w-4" />전체 일보</button>
          </div>
        </header>

        {tab === "all" && (
          <section className="rounded-[20px] border p-4 lg:p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-card-shadow)" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black">작성한 직원</h2>
                <p className="mt-1 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>직원을 선택하면 해당 날짜의 일지와 거래 활동을 읽을 수 있습니다.</p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>{(reportsQuery.data ?? []).length}명</span>
            </div>
            {reportsQuery.isError ? <div className="mt-4"><Failure message="작성자 목록을 불러오지 못했습니다." /></div> : (
              <div className="mt-4 flex flex-wrap gap-2">
                {(reportsQuery.data ?? []).length === 0 && <p className="rounded-[14px] border px-3 py-3 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2, borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>작성된 일지가 없습니다.</p>}
                {(reportsQuery.data ?? []).map((entry) => {
                  const selected = selectedEmployeeId === entry.employee_id;
                  return (
                    <button key={entry.employee_id} type="button" onClick={() => requestChange(() => {
                      setDirty(false);
                      setSelectedEmployeeId(entry.employee_id);
                    }, "저장하지 않은 내용이 있습니다. 직원을 바꾸면 작성 중인 내용이 사라집니다.")} className="min-h-11 rounded-[12px] border px-3 text-left text-sm font-bold transition active:scale-[0.98]" style={{ color: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.text, borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border, background: selected ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2 }}>
                      <span>{entry.employee_name}</span><span className="ml-1.5 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{entry.department}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {targetEmployeeId ? (
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
            <div className="min-w-0 space-y-3">
              {reportLoadFailed && <Failure message="일지를 불러오지 못했습니다." />}
              <DailyWorkReportEditor
                initialContent={report?.content ?? ""}
                resetKey={editorResetKey}
                editable={editable}
                saving={saveMutation.isPending}
                saveError={saveError}
                onSave={persist}
                onDirtyChange={(next) => { setDirty(next); onDirtyChange?.(next); }}
                saveRef={editorSaveRef}
              />
            </div>
            <div className="min-w-0 space-y-3">
              {activityQuery.isError ? <Failure message="거래 활동을 불러오지 못했습니다." /> : activityQuery.data ? <DailyWorkActivity activity={activityQuery.data} /> : <PanelPlaceholder>거래 활동을 불러오는 중입니다.</PanelPlaceholder>}
            </div>
          </div>
        ) : tab === "all" ? <PanelPlaceholder>작성한 직원을 선택하세요.</PanelPlaceholder> : null}
      </div>
    </div>
  );
}
