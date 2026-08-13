"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Download, Save } from "lucide-react";
import { getAuditTerminalId } from "@/lib/activity-audit-context";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useActivityAuditListQuery } from "@/lib/queries/useSettingsQuery";
import { Button } from "@/lib/ui/Button";
import { AppSelect } from "../common/AppSelect";
import { EmptyState } from "../common";
import { FilterChip } from "../common/FilterChip";

type ActivityAuditFormat = "csv" | "xlsx";
type ActivityAuditFeedback = { kind: "success" | "error"; message: string };

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  if (!year || !monthNumber) return month;
  return `${year}년 ${Number(monthNumber)}월`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;

  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }
}

/** 현재 브라우저 단말명과 월별 작업 감사 파일 다운로드를 관리한다. */
export function AdminActivityAuditControls(): ReactNode {
  const { data: files = [], isLoading, error: queryError } = useActivityAuditListQuery();
  const [terminalName, setTerminalName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [terminalFeedback, setTerminalFeedback] = useState<ActivityAuditFeedback | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [format, setFormat] = useState<ActivityAuditFormat>("csv");
  const [downloading, setDownloading] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<ActivityAuditFeedback | null>(null);

  const monthOptions = useMemo(
    () => [...files]
      .sort((left, right) => right.month.localeCompare(left.month))
      .map((file) => ({ value: file.month, label: formatMonthLabel(file.month) })),
    [files],
  );
  const effectiveMonth = monthOptions.some((option) => option.value === selectedMonth)
    ? selectedMonth
    : monthOptions[0]?.value ?? "";

  async function handleTerminalRegistration(): Promise<void> {
    const name = terminalName.trim();
    if (!name || registering) return;

    const terminalId = getAuditTerminalId();
    if (!terminalId) {
      setTerminalFeedback({ kind: "error", message: "현재 브라우저의 단말 ID를 확인할 수 없습니다." });
      return;
    }

    setRegistering(true);
    setTerminalFeedback(null);
    try {
      const terminal = await adminApi.updateCurrentAuditTerminal({ terminal_id: terminalId, name });
      setTerminalName(terminal.name);
      setTerminalFeedback({ kind: "success", message: `현재 단말명을 ${terminal.name}로 등록했습니다.` });
    } catch (error) {
      setTerminalFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "단말명 등록에 실패했습니다.",
      });
    } finally {
      setRegistering(false);
    }
  }

  async function handleDownload(): Promise<void> {
    if (!effectiveMonth || downloading) return;

    setDownloading(true);
    setDownloadFeedback(null);
    try {
      const blob = await adminApi.downloadActivityAuditFile(effectiveMonth, format);
      downloadBlob(blob, `activity_audit_${effectiveMonth}.${format}`);
      setDownloadFeedback({
        kind: "success",
        message: `${formatMonthLabel(effectiveMonth)} 작업 감사 ${format === "xlsx" ? "Excel" : "CSV"} 다운로드를 시작했습니다.`,
      });
    } catch (error) {
      setDownloadFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "작업 감사 파일 다운로드에 실패했습니다.",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div data-testid="activity-audit-controls" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-[12px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <label htmlFor="activity-audit-terminal-name" className="text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          현재 단말명
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="activity-audit-terminal-name"
            value={terminalName}
            maxLength={80}
            placeholder="예: 출하 PC-1"
            onChange={(event) => setTerminalName(event.currentTarget.value)}
            className="min-h-11 min-w-0 flex-1 rounded-[12px] border px-3 text-[14px] font-medium outline-none focus-visible:border-[var(--c-blue)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/20"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <Button
            size="md"
            iconLeft={<Save />}
            loading={registering}
            disabled={!terminalName.trim()}
            onClick={() => void handleTerminalRegistration()}
            className="min-h-11 shrink-0"
          >
            {registering ? "등록 중..." : "단말명 등록"}
          </Button>
        </div>
        {terminalFeedback && (
          <div
            role={terminalFeedback.kind === "error" ? "alert" : "status"}
            className="mt-2 text-[12px] font-bold"
            style={{ color: terminalFeedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
          >
            {terminalFeedback.message}
          </div>
        )}
      </div>

      {isLoading ? (
        <div role="status" className="rounded-[12px] border px-3 py-4 text-[14px] font-bold" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          작업 감사 로그를 불러오는 중입니다.
        </div>
      ) : queryError ? (
        <div role="alert" className="rounded-[12px] border px-3 py-3 text-[14px] font-bold" style={{ background: LEGACY_COLORS.errorBg, borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}>
          {queryError instanceof Error ? queryError.message : "작업 감사 파일 목록 조회에 실패했습니다."}
        </div>
      ) : monthOptions.length === 0 ? (
        <EmptyState
          variant="no-data"
          compact
          title="아직 누적된 작업 감사 이력이 없습니다"
          description="적용 이후 사용자 활동이 기록되면 월별 파일을 내려받을 수 있습니다."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>대상 월</div>
              <AppSelect
                value={effectiveMonth}
                onChange={setSelectedMonth}
                options={monthOptions}
                triggerAriaLabel="작업 감사 대상 월"
                triggerClassName="min-h-11"
              />
            </div>
            <div role="group" aria-label="작업 감사 파일 형식">
              <div className="mb-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>파일 형식</div>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={format === "csv"} label="CSV" onClick={() => setFormat("csv")} size="sm" className="min-h-11" />
                <FilterChip active={format === "xlsx"} label="Excel" onClick={() => setFormat("xlsx")} size="sm" className="min-h-11" />
              </div>
            </div>
          </div>

          {downloadFeedback && (
            <div
              role={downloadFeedback.kind === "error" ? "alert" : "status"}
              className="rounded-[12px] border px-3 py-2 text-[14px] font-bold"
              style={{
                background: downloadFeedback.kind === "error" ? LEGACY_COLORS.errorBg : LEGACY_COLORS.successBg,
                borderColor: downloadFeedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                color: downloadFeedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
              }}
            >
              {downloadFeedback.message}
            </div>
          )}

          <div className="mt-auto pt-1">
            <Button
              size="md"
              iconLeft={<Download />}
              loading={downloading}
              onClick={() => void handleDownload()}
              className="min-h-11 w-full"
            >
              {downloading
                ? "작업 감사 로그 다운로드 중..."
                : `${formatMonthLabel(effectiveMonth)} 작업 감사 ${format === "xlsx" ? "Excel" : "CSV"} 다운로드`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
