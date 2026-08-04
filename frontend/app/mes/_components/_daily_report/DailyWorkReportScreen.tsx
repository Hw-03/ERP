"use client";

import { CircleAlert, ClipboardList, FileText, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDepartmentFallbackColor, LEGACY_COLORS } from "@/lib/mes/color";
import { useDailyWorkActivityQuery, useDailyWorkReportQuery, useDailyWorkReportsQuery, useSaveDailyWorkReport } from "@/lib/queries/useDailyWorkReportsQuery";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { DailyWorkActivity } from "./DailyWorkActivity";
import { DailyWorkDatePicker } from "./DailyWorkDatePicker";
import { DailyWorkReportEditor } from "./DailyWorkReportEditor";
import { toKstDateKey } from "./dailyReportDate";
import type { Operator } from "../login/useCurrentOperator";

type ReportTab = "mine" | "all";

const PRODUCTION_DEPARTMENT_ORDER: Record<string, number> = {
  "튜브": 0,
  "고압": 1,
  "진공": 2,
  "튜닝": 3,
  "조립": 4,
  "출하": 5,
};

function sortReportsByDepartment<T extends { department: string }>(reports: T[]): T[] {
  return reports.sort(
    (left, right) =>
      (PRODUCTION_DEPARTMENT_ORDER[left.department] ?? Object.keys(PRODUCTION_DEPARTMENT_ORDER).length)
      - (PRODUCTION_DEPARTMENT_ORDER[right.department] ?? Object.keys(PRODUCTION_DEPARTMENT_ORDER).length),
  );
}

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
    <div className="rounded-[20px] border px-5 py-10 text-center" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[16px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}><Users className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{children}</p>
    </div>
  );
}

export function DailyWorkReportScreen({
  employeeId,
  operator,
  onDirtyChange,
  saveRef,
  confirmNavigation,
}: {
  employeeId: string | null | undefined;
  operator?: Operator | null;
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
  const targetVersionRef = useRef(0);
  const contentVersionRef = useRef(0);

  const reportQuery = useDailyWorkReportQuery(employeeId, workDate);
  const reportsQuery = useDailyWorkReportsQuery(workDate);
  const targetEmployeeId = tab === "mine" ? employeeId : selectedEmployeeId;
  const selectedReportQuery = useDailyWorkReportQuery(targetEmployeeId, workDate);
  const activityQuery = useDailyWorkActivityQuery(targetEmployeeId, workDate, { live: workDate === today });
  const saveMutation = useSaveDailyWorkReport();
  const editable = Boolean(employeeId && targetEmployeeId === employeeId);
  const report = tab === "mine" ? reportQuery.data : selectedReportQuery.data;
  const reports = sortReportsByDepartment([...(reportsQuery.data ?? [])]);
  const selectedListEntry = (reportsQuery.data ?? []).find((entry) => entry.employee_id === targetEmployeeId);
  const headerEmployeeName = report?.employee_name ?? selectedListEntry?.employee_name ?? operator?.name ?? "-";
  const headerDepartment = report?.department ?? selectedListEntry?.department ?? operator?.department ?? "-";
  const headerDepartmentColor = getDepartmentFallbackColor(headerDepartment);
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

  const persist = useCallback(async (content: string): Promise<string> => {
    if (!employeeId) throw new Error("로그인한 작업자 정보가 없습니다.");
    const targetVersion = targetVersionRef.current;
    const contentVersion = contentVersionRef.current;
    setSaveError(null);
    try {
      const savedReport = await saveMutation.mutateAsync({
        employeeId,
        workDate,
        payload: { actorEmployeeId: employeeId, content },
      });
      if (targetVersion === targetVersionRef.current && contentVersion === contentVersionRef.current) setDirty(false);
      return savedReport.updated_at;
    } catch (error) {
      if (targetVersion === targetVersionRef.current && contentVersion === contentVersionRef.current) setSaveError(error instanceof Error ? error.message : "일보를 저장하지 못했습니다.");
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
      targetVersionRef.current += 1;
      setDirty(false);
      setSaveError(null);
      setTab(next);
      setSelectedEmployeeId(null);
    }, "저장하지 않은 내용이 있습니다. 이동하면 작성 중인 일보가 사라집니다.");
  };

  const changeDate = (next: string) => {
    if (!next || next > today) return;
    requestChange(() => {
      targetVersionRef.current += 1;
      setDirty(false);
      setSaveError(null);
      setWorkDate(next);
      setSelectedEmployeeId(null);
    }, "저장하지 않은 내용이 있습니다. 날짜를 바꾸면 작성 중인 일보가 사라집니다.");
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
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 lg:flex lg:flex-col lg:overflow-hidden lg:px-0 lg:py-0 lg:pr-4">
      <div className="scrollbar-hide flex w-full flex-col gap-3 pb-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pb-0">
        <header className="rounded-[20px] border p-4 lg:shrink-0 lg:px-5 lg:py-2.5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-h-11 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px]" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>
                <ClipboardList className="h-5 w-5" />
              </span>
              <h1 className="whitespace-nowrap text-xl font-black">일일 작업 일보</h1>
            </div>
            <DailyWorkDatePicker value={workDate} maxDate={today} onChange={changeDate} />
            <dl className="flex flex-wrap items-center gap-2">
              <div className="flex min-h-11 items-center gap-2 rounded-[12px] border px-3" style={{ background: `color-mix(in srgb, ${headerDepartmentColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${headerDepartmentColor} 35%, transparent)` }}>
                <dt className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>부서</dt>
                <dd className="text-sm font-black" style={{ color: headerDepartmentColor }}>{headerDepartment}</dd>
              </div>
              <div className="flex min-h-11 items-center gap-2 rounded-[12px] border px-3" style={{ background: `color-mix(in srgb, ${headerDepartmentColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${headerDepartmentColor} 35%, transparent)` }}>
                <dt className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>작성자</dt>
                <dd className="text-sm font-black" style={{ color: headerDepartmentColor }}>{headerEmployeeName}</dd>
              </div>
            </dl>
            <div className="ml-auto inline-flex rounded-[14px] p-1" role="tablist" aria-label="일보 보기" style={{ background: LEGACY_COLORS.s2 }}>
              <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => changeTab("mine")} className="flex min-h-10 items-center rounded-[10px] px-3.5 text-sm font-black transition" style={{ color: tab === "mine" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2, background: tab === "mine" ? LEGACY_COLORS.blue : "transparent", boxShadow: tab === "mine" ? "var(--c-card-shadow)" : "none" }}><FileText className="mr-2 h-4 w-4" />내 일보</button>
              <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => changeTab("all")} className="flex min-h-10 items-center rounded-[10px] px-3.5 text-sm font-black transition" style={{ color: tab === "all" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2, background: tab === "all" ? LEGACY_COLORS.blue : "transparent", boxShadow: tab === "all" ? "var(--c-card-shadow)" : "none" }}><Users className="mr-2 h-4 w-4" />전체 일보</button>
            </div>
          </div>
        </header>

        {tab === "all" && (
          <section className="rounded-[20px] border p-4 lg:shrink-0 lg:p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black">작성한 직원</h2>
                <p className="mt-1 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>직원을 선택하면 해당 날짜의 일보와 MES 거래를 읽을 수 있습니다.</p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s2 }}>{reports.length}명</span>
            </div>
            {reportsQuery.isError ? <div className="mt-4"><Failure message="작성자 목록을 불러오지 못했습니다." /></div> : (
              <div data-testid="daily-work-report-author-chips" className="mt-4 flex flex-wrap gap-2 lg:max-h-36 lg:overflow-y-auto lg:pr-1">
                {reports.length === 0 && <p className="rounded-[14px] border px-3 py-3 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2, borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>작성된 일보가 없습니다.</p>}
                {reports.map((entry) => {
                  const selected = selectedEmployeeId === entry.employee_id;
                  const departmentColor = getDepartmentFallbackColor(entry.department);
                  return (
                    <button key={entry.employee_id} type="button" onClick={() => requestChange(() => {
                      targetVersionRef.current += 1;
                      setDirty(false);
                      setSaveError(null);
                      setSelectedEmployeeId(entry.employee_id);
                    }, "저장하지 않은 내용이 있습니다. 직원을 바꾸면 작성 중인 일보가 사라집니다.")} className="min-h-11 rounded-[12px] border px-3 text-left text-sm font-bold transition active:scale-[0.98]" style={{ color: selected ? LEGACY_COLORS.white : LEGACY_COLORS.text, borderColor: `color-mix(in srgb, ${departmentColor} ${selected ? 60 : 35}%, transparent)`, background: selected ? departmentColor : `color-mix(in srgb, ${departmentColor} 12%, transparent)` }}>
                      <span>{entry.employee_name}</span><span className="ml-1.5 text-xs font-medium" style={{ color: selected ? LEGACY_COLORS.white : departmentColor }}>{entry.department}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {targetEmployeeId ? (
          <div className={`min-w-0 space-y-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-3 lg:space-y-0 ${editable ? "" : "lg:overflow-y-auto lg:pr-1"}`}>
            {reportLoadFailed && <Failure message="일보를 불러오지 못했습니다." />}
            {activityQuery.isError ? <Failure message="MES 거래를 불러오지 못했습니다." /> : activityQuery.data ? <DailyWorkActivity activity={activityQuery.data} /> : <PanelPlaceholder>MES 거래를 불러오는 중입니다.</PanelPlaceholder>}
            <DailyWorkReportEditor
              initialContent={report?.content ?? ""}
              initialUpdatedAt={report?.updated_at ?? null}
              resetKey={editorResetKey}
              editable={editable}
              saving={saveMutation.isPending}
              saveError={saveError}
              onSave={persist}
              onDirtyChange={(next) => { setDirty(next); onDirtyChange?.(next); }}
              onEdit={() => {
                contentVersionRef.current += 1;
                setSaveError(null);
              }}
              saveRef={editorSaveRef}
              fillAvailableHeight={editable}
            />
          </div>
        ) : tab === "all" ? <PanelPlaceholder>작성한 직원을 선택하세요.</PanelPlaceholder> : null}
      </div>
    </div>
  );
}
