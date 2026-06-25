"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../common";
import { AdminKpiBar, AdminPageHeader } from "./_admin_primitives";
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

export function AdminAuditCsvSection() {
  const { data: files = [], isLoading: loading, error: qError, refetch: refetchFiles } = useAuditCsvListQuery();
  const backfillMutation = useTriggerAuditBackfillMutation();
  const busy = backfillMutation.isPending;
  const error = qError ? (qError instanceof Error ? qError.message : "파일 목록 조회 실패") : null;
  const [lastBackfill, setLastBackfill] = useState<string | null>(null);

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

  function handleDownload(url: string, fileName: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="flex min-h-0 flex-col">
      <AdminPageHeader
        icon={FileArchive}
        title="외부 제출용 입출고 로그"
        description="외부 심사 대응용 월별 입출고 CSV. 거래 발생 시 자동 누적됩니다."
      />

      <AdminKpiBar
        items={[
          { key: "months", label: "월 파일 수", value: stats.months, hint: "디스크 누적", tone: LEGACY_COLORS.blue },
          { key: "total", label: "총 거래 행", value: stats.total.toLocaleString(), hint: "헤더 제외", tone: LEGACY_COLORS.green },
          { key: "size", label: "총 용량", value: `${stats.sizeMb.toFixed(2)} MB`, hint: "전체 합계", tone: LEGACY_COLORS.purple },
          { key: "scope", label: "기록 범위", value: "자재 이동", hint: "생산 내부 제외", tone: LEGACY_COLORS.muted2 },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {/* 안내 + 백필 */}
        <div
          className="flex flex-col gap-3 rounded-[16px] border p-4 lg:flex-row lg:items-center lg:justify-between"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex-1">
            <div className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
              자동 누적 — 별도 작업 불필요
            </div>
            <div className="mt-1 text-[12px] leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              입고·출고·부서이동·폐기·조정·반품 등 자재 이동 거래가 확정될 때마다 해당 월 CSV 에 한 줄씩 추가됩니다.
              심사 공지가 오면 아래 목록에서 해당 월을 받아 제출하세요. DB 와 어긋날 일은 거의 없지만, 만약 누락이 의심되면 “백필 재실행”으로 즉시 정합성을 회복할 수 있습니다.
            </div>
            {lastBackfill && (
              <div className="mt-1.5 text-[11px]" style={{ color: LEGACY_COLORS.green }}>
                마지막 백필: {lastBackfill}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleBackfill}
            disabled={busy}
            className="flex shrink-0 items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-[12px] font-bold transition-opacity disabled:opacity-50"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${LEGACY_COLORS.blue} 40%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "백필 실행 중..." : "백필 재실행"}
          </button>
        </div>

        {/* 파일 목록 */}
        <div
          className="rounded-[16px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
              월별 파일
            </div>
            <button
              type="button"
              onClick={() => void refetchFiles()}
              disabled={loading}
              className="text-[11px] font-bold transition-colors hover:underline disabled:opacity-50"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {loading ? "새로고침 중..." : "새로고침"}
            </button>
          </div>

          {error && (
            <div
              className="mb-3 rounded-[10px] border px-3 py-2 text-[12px]"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
                color: LEGACY_COLORS.red,
              }}
            >
              {error}
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
            <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: LEGACY_COLORS.border }}>
              <div
                className="grid items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em]"
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
                  className="grid items-center gap-2 px-3 py-2 text-[13px]"
                  style={{
                    gridTemplateColumns: "1fr 120px 100px 80px 220px",
                    borderTop: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {formatMonthLabel(f.month)}
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {f.file_name}
                  </span>
                  <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                    {f.row_count.toLocaleString()}
                  </span>
                  <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                    {formatBytes(f.size_bytes)}
                  </span>
                  <span className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(adminApi.auditXlsxDownloadUrl(f.month), `inout_${f.month}.xlsx`)
                      }
                      className="flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[11px] font-bold text-white"
                      style={{ background: LEGACY_COLORS.green }}
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      엑셀
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(adminApi.auditCsvDownloadUrl(f.month), f.file_name)
                      }
                      className="flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[11px] font-bold text-white"
                      style={{ background: LEGACY_COLORS.blue }}
                    >
                      <FileText className="h-3 w-3" />
                      CSV
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-[10px] border px-3 py-2 text-[11px] leading-relaxed"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          <div className="mb-1 flex items-center gap-1.5 font-bold">
            <Download className="h-3 w-3" />
            컬럼 구성 (11)
          </div>
          일시 · 거래유형 · 품목코드 · 품목명 · 수량 · 변경전 재고 · 변경후 재고 · 참조번호 · 처리자 · 비고 · 거래ID
        </div>
      </div>
    </div>
  );
}
