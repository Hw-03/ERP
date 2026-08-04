"use client";

import { useMemo, useState } from "react";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { EmptyState } from "../common";
import { AdminPageHeader } from "./_admin_primitives";
import { useAuditCsvListQuery, useTriggerAuditBackfillMutation } from "@/lib/queries/useSettingsQuery";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMonthLabel(month: string): string {
  // "2026-05" → "2026년 5월"
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  return `${y}년 ${Number(m)}월`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  try {
    document.body.appendChild(a);
    a.click();
  } finally {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }
}

export function AdminAuditCsvSection({ embedded = false }: { embedded?: boolean }) {
  const { data: files = [], isLoading: loading, error: qError, refetch: refetchFiles } = useAuditCsvListQuery();
  const backfillMutation = useTriggerAuditBackfillMutation();
  const busy = backfillMutation.isPending;
  const error = qError ? (qError instanceof Error ? qError.message : "파일 목록 조회 실패") : null;
  const [lastBackfill, setLastBackfill] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(() => new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [ledgerYear, setLedgerYear] = useState(() => new Date().getFullYear());
  const [ledgerDownloading, setLedgerDownloading] = useState(false);

  const stats = useMemo(() => {
    const total = files.reduce((s, f) => s + f.row_count, 0);
    const months = files.length;
    const sizeMb = files.reduce((s, f) => s + f.size_bytes, 0) / (1024 * 1024);
    return { total, months, sizeMb };
  }, [files]);

  const handleBackfill = () => {
    if (busy) return;
    const ok = window.confirm(
      "DB 기준으로 모든 월별 CSV 를 새로 만듭니다. 기존 파일은 덮어쓰여집니다. 계속할까요?",
    );
    if (!ok) return;
    backfillMutation.mutate(undefined, {
      onSuccess: (result) => {
        setLastBackfill(
          `${new Date().toLocaleString("ko-KR")} · ${result.total_rows.toLocaleString()}행 / ${result.months.length}개월`,
        );
      },
      onError: () => {},
    });
  };

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
        downloadFailure instanceof Error
          ? downloadFailure.message
          : "파일 다운로드에 실패했습니다.",
      );
    } finally {
      setDownloading((current) => {
        const next = new Set(current);
        next.delete(downloadKey);
        return next;
      });
    }
  }

  async function handleF704LedgerDownload(): Promise<void> {
    if (ledgerDownloading) return;
    setLedgerDownloading(true);
    setDownloadError(null);
    try {
      const blob = await adminApi.downloadF704Ledger(ledgerYear);
      downloadBlob(blob, `F704-02 (R01) ${ledgerYear}년 자재 입출고관리대장.xlsx`);
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : "대장 다운로드에 실패했습니다.",
      );
    } finally {
      setLedgerDownloading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      {!embedded && <AdminPageHeader
        icon={FileArchive}
        title="입출고 로그"
      />}

      <div className={`flex min-h-0 flex-1 flex-col gap-4 ${embedded ? "" : "overflow-y-auto pr-1"}`}>
        <div role="group" aria-label="외부 로그 작업" className="grid gap-3 xl:grid-cols-2">
          <section
            aria-label="F704-02 연간 자재 입출고관리대장"
            className="flex flex-col rounded-[20px] border p-4"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  F704-02 연간 자재 입출고관리대장
                </div>
                <div className="mt-1 text-[12px] leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
                  선택한 연도의 실제 창고 입·출고만 F704-02 원본 양식으로 생성합니다. 담당자 칸에는 처리자가 아닌 요청자가 표시됩니다.
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label htmlFor="f704-ledger-year" className="flex flex-col gap-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                대장 연도
                <input
                  id="f704-ledger-year"
                  type="number"
                  min={2000}
                  max={2100}
                  value={ledgerYear}
                  onChange={(event) => {
                    const year = Number(event.currentTarget.value);
                    if (Number.isInteger(year)) setLedgerYear(year);
                  }}
                  className="h-11 w-24 rounded-[12px] border px-3 text-[14px] font-bold tabular-nums outline-none transition-colors focus-visible:border-[var(--c-green)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-green)]/20"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </label>
              <Button
                size="md"
                iconLeft={<FileSpreadsheet />}
                loading={ledgerDownloading}
                onClick={() => void handleF704LedgerDownload()}
                className="min-h-11 w-full sm:w-auto"
                style={{ background: LEGACY_COLORS.green, color: LEGACY_COLORS.white }}
              >
                {ledgerDownloading ? "대장 생성 중..." : "F704-02 대장 다운로드"}
              </Button>
            </div>
          </section>

          <section
            aria-label="시스템 원본 로그 관리"
            className="flex flex-col rounded-[20px] border p-4"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                <RefreshCw className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  시스템 원본 로그 — 내부 확인용
                </div>
                <div className="mt-1 text-[12px] leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
                  월별 CSV/XLSX는 내부 확인용으로 유지됩니다. 필요하면 백필 재실행으로 DB 기준의 원본 로그를 다시 만듭니다.
                </div>
                {lastBackfill && (
                  <div className="mt-1.5 text-[12px]" style={{ color: LEGACY_COLORS.green }}>
                    마지막 백필: {lastBackfill}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                size="md"
                iconLeft={<RefreshCw />}
                loading={busy}
                onClick={handleBackfill}
                className="min-h-11 w-full sm:w-auto"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 40%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                {busy ? "백필 실행 중..." : "백필 재실행"}
              </Button>
            </div>
          </section>
        </div>

        {/* 파일 목록 */}
        <section
          aria-labelledby="audit-monthly-files-title"
          className="rounded-[20px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="audit-monthly-files-title" className="text-[16px] font-black" style={{ color: LEGACY_COLORS.text }}>
                시스템 원본 로그 (월별)
              </h3>
              <div className="mt-0.5 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {stats.months}개 파일 · {stats.total.toLocaleString()}행 · {stats.sizeMb.toFixed(2)} MB
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetchFiles()}
              loading={loading}
              className="min-h-11 px-2"
            >
              {loading ? "새로고침 중..." : "새로고침"}
            </Button>
          </div>

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
              description="자재 이동 거래가 발생하면 이 자리에 표시됩니다."
            />
          ) : (
            <div className="overflow-x-auto">
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
                {files.map((f) => (
                  <div
                    key={f.month}
                    className="grid items-center gap-2 px-3 py-2 text-[14px]"
                    style={{
                      gridTemplateColumns: "1fr 120px 100px 80px 220px",
                      borderTop: `1px solid ${LEGACY_COLORS.border}`,
                    }}
                  >
                    <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {formatMonthLabel(f.month)}
                    </span>
                    <span className="font-mono text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {f.file_name}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                      {f.row_count.toLocaleString()}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                      {formatBytes(f.size_bytes)}
                    </span>
                    <span className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        iconLeft={<FileSpreadsheet />}
                        onClick={() => void handleDownload(f.month, "xlsx", `inout_${f.month}.xlsx`)}
                        disabled={downloading.has(`${f.month}:xlsx`)}
                        className="min-h-11"
                        style={{ background: LEGACY_COLORS.green, color: LEGACY_COLORS.white }}
                      >
                        엑셀
                      </Button>
                      <Button
                        size="sm"
                        iconLeft={<FileText />}
                        onClick={() => void handleDownload(f.month, "csv", f.file_name)}
                        disabled={downloading.has(`${f.month}:csv`)}
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
        </section>

        <div
          className="rounded-[10px] border px-3 py-2 text-[12px] leading-relaxed"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          <details>
            <summary className="cursor-pointer font-bold">시스템 원본 컬럼 구성 (11)</summary>
            <div className="mt-2">
              일시 · 거래유형 · 품목코드 · 품목명 · 수량 · 변경전 재고 · 변경후 재고 · 참조번호 · 처리자 · 비고 · 거래ID
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
