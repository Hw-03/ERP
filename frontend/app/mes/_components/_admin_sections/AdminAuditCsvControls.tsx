"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { useAuditCsvListQuery } from "@/lib/queries/useSettingsQuery";
import { AppSelect } from "../common/AppSelect";
import { EmptyState } from "../common";
import { FilterChip } from "../common/FilterChip";

type AuditFormat = "csv" | "xlsx";
type AuditFeedback = { kind: "success" | "error"; message: string };

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

/** 단일 데이터 내보내기 카드에서 월별 원본 로그 선택과 다운로드만 담당한다. */
export function AdminAuditCsvControls(): ReactNode {
  const { data: files = [], isLoading, error: queryError } = useAuditCsvListQuery();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [format, setFormat] = useState<AuditFormat>("csv");
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<AuditFeedback | null>(null);

  const monthOptions = useMemo(
    () => [...files]
      .sort((left, right) => right.month.localeCompare(left.month))
      .map((file) => ({ value: file.month, label: formatMonthLabel(file.month) })),
    [files],
  );
  const effectiveMonth = monthOptions.some((option) => option.value === selectedMonth)
    ? selectedMonth
    : monthOptions[0]?.value ?? "";

  async function handleDownload(): Promise<void> {
    if (!effectiveMonth || downloading) return;

    setDownloading(true);
    setFeedback(null);
    try {
      const blob = await adminApi.downloadAuditFile(effectiveMonth, format);
      downloadBlob(blob, `inout_${effectiveMonth}.${format}`);
      setFeedback({
        kind: "success",
        message: `${formatMonthLabel(effectiveMonth)} ${format === "xlsx" ? "Excel" : "CSV"} 다운로드를 시작했습니다.`,
      });
    } catch (downloadError) {
      setFeedback({
        kind: "error",
        message: downloadError instanceof Error ? downloadError.message : "파일 다운로드에 실패했습니다.",
      });
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div
        role="status"
        className="rounded-[12px] border px-3 py-4 text-[14px] font-bold"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        원본 로그를 불러오는 중입니다.
      </div>
    );
  }

  if (queryError) {
    return (
      <div
        role="alert"
        className="rounded-[12px] border px-3 py-3 text-[14px] font-bold"
        style={{ background: LEGACY_COLORS.errorBg, borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
      >
        {queryError instanceof Error ? queryError.message : "파일 목록 조회에 실패했습니다."}
      </div>
    );
  }

  if (monthOptions.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        compact
        title="아직 누적된 파일이 없습니다"
        description="재고 이동 거래가 발생하면 원본 로그를 내려받을 수 있습니다."
      />
    );
  }

  return (
    <div data-testid="audit-csv-controls" className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            대상 월
          </div>
          <AppSelect
            value={effectiveMonth}
            onChange={setSelectedMonth}
            options={monthOptions}
            triggerAriaLabel="대상 월"
            triggerClassName="min-h-11"
          />
        </div>

        <div role="group" aria-label="원본 로그 파일 형식">
          <div className="mb-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            파일 형식
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={format === "csv"}
              label="CSV"
              onClick={() => setFormat("csv")}
              size="sm"
              className="min-h-11"
            />
            <FilterChip
              active={format === "xlsx"}
              label="Excel"
              onClick={() => setFormat("xlsx")}
              size="sm"
              className="min-h-11"
            />
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className="mt-3 rounded-[12px] border px-3 py-2 text-[14px] font-bold"
          style={{
            background: feedback.kind === "error" ? LEGACY_COLORS.errorBg : LEGACY_COLORS.successBg,
            borderColor: feedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
            color: feedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
          }}
        >
          {feedback.message}
        </div>
      )}

      <div className="mt-auto pt-4">
        <Button
          size="md"
          iconLeft={<Download />}
          loading={downloading}
          disabled={!effectiveMonth}
          onClick={() => void handleDownload()}
          className="min-h-11 w-full"
        >
          {downloading
            ? "원본 로그 다운로드 중..."
            : `${formatMonthLabel(effectiveMonth)} ${format === "xlsx" ? "Excel" : "CSV"} 다운로드`}
        </Button>
      </div>
    </div>
  );
}
