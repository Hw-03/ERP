"use client";

import { useState } from "react";
import { FileArchive, FileSpreadsheet, FileText } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { EmptyState } from "../common";
import { useAuditCsvListQuery } from "@/lib/queries/useSettingsQuery";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

export function AdminAuditCsvSection() {
  const { data: files = [], isLoading: loading, error: queryError } = useAuditCsvListQuery();
  const [downloading, setDownloading] = useState<Set<string>>(() => new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const error = queryError
    ? queryError instanceof Error ? queryError.message : "파일 목록 조회 실패"
    : null;

  async function handleDownload(
    month: string,
    format: "csv" | "xlsx",
    fileName: string,
  ): Promise<void> {
    const downloadKey = `${month}:${format}`;
    setDownloading((current) => new Set(current).add(downloadKey));
    setDownloadError(null);
    try {
      const blob = await adminApi.downloadAuditFile(month, format);
      downloadBlob(blob, fileName);
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure instanceof Error ? downloadFailure.message : "파일 다운로드에 실패했습니다.",
      );
    } finally {
      setDownloading((current) => {
        const next = new Set(current);
        next.delete(downloadKey);
        return next;
      });
    }
  }

  return (
    <section
      aria-labelledby="audit-log-title"
      className="flex min-h-0 flex-col rounded-[20px] border p-4 xl:h-full xl:overflow-hidden"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div
        data-testid="audit-log-header"
        className="flex min-h-11 shrink-0 flex-wrap items-center gap-3"
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
            color: LEGACY_COLORS.blue,
          }}
        >
          <FileArchive className="h-5 w-5" />
        </div>
        <h3 id="audit-log-title" className="min-w-0 flex-1 text-[18px] font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>
          내부 원본 로그 (월별)
        </h3>
      </div>

      <div
        data-testid="audit-log-body"
        className="mt-4 flex min-h-0 flex-1 flex-col xl:overflow-hidden"
      >
        <div
          className="flex min-h-0 flex-1 flex-col border-t pt-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {(error || downloadError) && (
            <div
              role="alert"
              className="mb-3 rounded-[10px] border px-3 py-2 text-[12px]"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
                color: LEGACY_COLORS.red,
              }}
            >
              {error || downloadError}
            </div>
          )}

          {files.length === 0 ? (
            <EmptyState
              variant="no-data"
              compact
              title={loading ? "불러오는 중..." : "아직 누적된 파일이 없습니다"}
              description="재고 이동 거래가 발생하면 이 자리에 표시됩니다."
            />
          ) : (
            <div data-testid="audit-log-scroll" className="min-h-0 flex-1 overflow-x-auto xl:overflow-auto">
              <div className="min-w-[760px] overflow-hidden rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                <div
                  className="grid items-center gap-2 px-3 py-2 text-[12px] font-black uppercase tracking-[0.08em]"
                  style={{
                    gridTemplateColumns: "1fr 120px 100px 80px 220px",
                    background: LEGACY_COLORS.s3,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  <span>월</span>
                  <span>파일명</span>
                  <span className="text-right">거래 행</span>
                  <span className="text-right">용량</span>
                  <span className="text-right">다운로드</span>
                </div>
                {files.map((file) => (
                  <div
                    key={file.month}
                    className="grid items-center gap-2 px-3 py-2 text-[14px]"
                    style={{
                      gridTemplateColumns: "1fr 120px 100px 80px 220px",
                      borderTop: `1px solid ${LEGACY_COLORS.border}`,
                    }}
                  >
                    <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {formatMonthLabel(file.month)}
                    </span>
                    <span className="font-mono text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {file.file_name}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                      {file.row_count.toLocaleString()}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                      {formatBytes(file.size_bytes)}
                    </span>
                    <span className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        iconLeft={<FileSpreadsheet />}
                        onClick={() => void handleDownload(file.month, "xlsx", `inout_${file.month}.xlsx`)}
                        disabled={downloading.has(`${file.month}:xlsx`)}
                        className="min-h-11"
                        style={{ background: LEGACY_COLORS.greenSolid, color: LEGACY_COLORS.white }}
                      >
                        엑셀
                      </Button>
                      <Button
                        size="sm"
                        iconLeft={<FileText />}
                        onClick={() => void handleDownload(file.month, "csv", file.file_name)}
                        disabled={downloading.has(`${file.month}:csv`)}
                        className="min-h-11"
                      >
                        CSV
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
