"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { fetchBlob } from "@/lib/api-core";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { FilterChip } from "../common/FilterChip";
import { AdminAuditCsvSection } from "./AdminAuditCsvSection";

type RangePreset = "today" | "7d" | "30d" | "90d";
type DataScope = "all" | "items" | "transactions" | "employees" | "bom";
type ExportFormat = "csv" | "xlsx";
type ExportFeedback = { kind: "success" | "error"; message: string };

const EXPORT_PAGE_SIZE = 2000;

const SCOPE_LABEL: Record<DataScope, string> = {
  all: "전체",
  items: "품목",
  transactions: "입출고",
  employees: "직원",
  bom: "BOM",
};

function presetRange(preset: RangePreset): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (preset === "today") return { start: end, end };

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  return { start: startDate.toISOString().slice(0, 10), end };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, "").slice(0, 13);
}

async function fetchAllPages<T>(fetchPage: (skip: number, limit: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];

  while (true) {
    const page = await fetchPage(rows.length, EXPORT_PAGE_SIZE);
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return rows;
  }
}

function exportErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "데이터 내보내기에 실패했습니다.";
  if (error.message.includes("less than or equal to 2000")) {
    return "데이터 조회 범위가 허용 한도를 초과했습니다.";
  }
  return error.message;
}

function downloadTextBlob(content: string, fileName: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  downloadBinaryBlob(blob, fileName);
}

function downloadBinaryBlob(blob: Blob, fileName: string): void {
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

async function buildCsvFor(
  scope: Exclude<DataScope, "all">,
  range: { start: string; end: string },
  includeInactive: boolean,
  stamp: string,
): Promise<{ csv: string; fileName: string }> {
  if (scope === "items") {
    const items = await fetchAllPages((skip, limit) => api.getItems({ skip, limit }));
    const headers = ["품목 코드", "품명", "단위", "현재고", "안전재고", "부서", "공급처"];
    const rows = items.map((item) => [
      item.mes_code,
      item.item_name,
      item.unit,
      item.quantity,
      item.min_stock,
      item.department ?? "",
      item.supplier ?? "",
    ]);
    return {
      csv: [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"),
      fileName: `items_${stamp}.csv`,
    };
  }

  if (scope === "transactions") {
    const transactions = await fetchAllPages((skip, limit) => api.getTransactions({ skip, limit }));
    const headers = ["거래일시", "구분", "품목명", "수량변화", "단위", "메모"];
    const rows = transactions
      .filter((transaction) => {
        const date = (transaction.created_at ?? "").slice(0, 10);
        return date >= range.start && date <= range.end;
      })
      .map((transaction) => [
        transaction.created_at,
        transaction.transaction_type,
        transaction.item_name,
        transaction.quantity_change,
        transaction.item_unit,
        transaction.notes ?? "",
      ]);
    return {
      csv: [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"),
      fileName: `transactions_${stamp}.csv`,
    };
  }

  if (scope === "employees") {
    const employees = await api.getEmployees({ activeOnly: !includeInactive });
    const headers = ["이름", "부서", "직급", "등급", "창고 역할", "활성"];
    const rows = employees.map((employee) => [
      employee.name,
      employee.department,
      employee.role ?? "",
      employee.level,
      employee.warehouse_role,
      employee.is_active ? "Y" : "N",
    ]);
    return {
      csv: [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"),
      fileName: `employees_${stamp}.csv`,
    };
  }

  const bomRows = await api.getAllBOM();
  const headers = ["부모 코드", "부모명", "자식 코드", "자식명", "수량", "단위"];
  const rows = bomRows.map((row) => [
    row.parent_mes_code ?? "",
    row.parent_item_name,
    row.child_mes_code ?? "",
    row.child_item_name,
    row.quantity,
    row.unit,
  ]);
  return {
    csv: [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"),
    fileName: `bom_${stamp}.csv`,
  };
}

export function AdminExportSection() {
  const [scope, setScope] = useState<DataScope>("all");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ExportFeedback | null>(null);
  const [f704Year, setF704Year] = useState(() => new Date().getFullYear());
  const [f704Downloading, setF704Downloading] = useState(false);
  const [f704DownloadError, setF704DownloadError] = useState<string | null>(null);
  const [f705Year, setF705Year] = useState(() => new Date().getFullYear());
  const [f705Downloading, setF705Downloading] = useState(false);
  const [f705DownloadError, setF705DownloadError] = useState<string | null>(null);

  const range = useMemo(() => presetRange(preset), [preset]);
  const includesTransactions = scope === "all" || scope === "transactions";
  const includesEmployees = scope === "all" || scope === "employees";
  const supportsExcel = scope === "items" || scope === "transactions";

  function handleScopeChange(nextScope: DataScope): void {
    setScope(nextScope);
    if (nextScope !== "items" && nextScope !== "transactions") setFormat("csv");
  }

  async function handleF704Download(): Promise<void> {
    if (f704Downloading) return;
    setF704Downloading(true);
    setF704DownloadError(null);
    try {
      const blob = await adminApi.downloadF704Ledger(f704Year);
      downloadBinaryBlob(blob, `F704-02 (R01) ${f704Year}년 자재 입출고관리대장.xlsx`);
    } catch (error) {
      setF704DownloadError(error instanceof Error ? error.message : "대장 다운로드에 실패했습니다.");
    } finally {
      setF704Downloading(false);
    }
  }

  async function handleF705Download(): Promise<void> {
    if (f705Downloading) return;
    if (!Number.isInteger(f705Year) || f705Year < 2000 || f705Year > 2099) {
      setF705DownloadError("연도는 2000~2099 사이로 입력하세요.");
      return;
    }

    setF705Downloading(true);
    setF705DownloadError(null);
    try {
      const blob = await adminApi.downloadF705ProductionLog(f705Year);
      downloadBinaryBlob(blob, `F705-02 (R01) ${f705Year} 생산일지.xlsx`);
    } catch (error) {
      setF705DownloadError(error instanceof Error ? error.message : "생산일지 다운로드에 실패했습니다.");
    } finally {
      setF705Downloading(false);
    }
  }

  async function handleDataExport(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFeedback(null);

    try {
      const stamp = timestamp();
      if (format === "xlsx") {
        if (!supportsExcel) throw new Error("선택한 범위는 Excel 형식을 지원하지 않습니다.");
        const url = scope === "items"
          ? api.getItemsExportUrl()
          : api.getTransactionsExportUrl({ start_date: range.start, end_date: range.end });
        const blob = await fetchBlob(url);
        const prefix = scope === "items" ? "items" : "transactions";
        downloadBinaryBlob(blob, `${prefix}_${stamp}.xlsx`);
        setFeedback({ kind: "success", message: `${SCOPE_LABEL[scope]} Excel 다운로드를 시작했습니다.` });
        return;
      }

      const targets: Array<Exclude<DataScope, "all">> = scope === "all"
        ? ["items", "transactions", "employees", "bom"]
        : [scope];
      for (const target of targets) {
        const result = await buildCsvFor(target, range, includeInactive, stamp);
        downloadTextBlob(result.csv, result.fileName);
      }
      setFeedback({
        kind: "success",
        message: scope === "all"
          ? "전체 데이터 CSV 4개 다운로드를 시작했습니다."
          : `${SCOPE_LABEL[scope]} CSV 다운로드를 시작했습니다.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: exportErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const downloadLabel = scope === "all"
    ? "전체 데이터 CSV 4개 다운로드"
    : `${SCOPE_LABEL[scope]} ${format === "xlsx" ? "Excel" : "CSV"} 다운로드`;

  return (
    <div data-testid="admin-export-section" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div data-testid="export-scroll-container" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 xl:overflow-hidden">
        <div role="group" aria-label="공식 서식 내보내기" className="grid shrink-0 gap-3 xl:grid-cols-2">
          <ExportSurface
            ariaLabel="F704-02 연간 자재 입출고관리대장"
            tone={LEGACY_COLORS.green}
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="F704-02 연간 자재 입출고관리대장"
            className="h-full"
          >
            <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <label htmlFor="f704-year" className="flex flex-col gap-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                F704-02 연도
                <input
                  id="f704-year"
                  type="number"
                  min={2000}
                  max={2100}
                  value={f704Year}
                  onChange={(event) => {
                    const year = Number(event.currentTarget.value);
                    if (Number.isInteger(year)) setF704Year(year);
                  }}
                  className="h-11 w-28 rounded-[12px] border px-3 text-[14px] font-bold tabular-nums outline-none transition-colors focus-visible:border-[var(--c-green)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-green)]/20"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </label>
              <Button
                size="md"
                iconLeft={<FileSpreadsheet />}
                loading={f704Downloading}
                onClick={() => void handleF704Download()}
                className="min-h-11 w-full sm:w-auto"
                style={{ background: LEGACY_COLORS.green, color: LEGACY_COLORS.white }}
              >
                {f704Downloading ? "대장 생성 중..." : "F704-02 대장 다운로드"}
              </Button>
            </div>
            {f704DownloadError && <p role="alert" className="mt-3 text-[12px] font-bold" style={{ color: LEGACY_COLORS.red }}>{f704DownloadError}</p>}
          </ExportSurface>

          <ExportSurface
            ariaLabel="F705-02 연간 생산일지"
            tone={LEGACY_COLORS.green}
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="F705-02 연간 생산일지"
            className="h-full"
          >
            <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <label htmlFor="f705-year" className="flex flex-col gap-1.5 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                F705-02 연도
                <input
                  id="f705-year"
                  type="number"
                  min={2000}
                  max={2099}
                  value={f705Year}
                  onChange={(event) => setF705Year(Number(event.currentTarget.value))}
                  className="h-11 w-28 rounded-[12px] border px-3 text-[14px] font-bold tabular-nums outline-none transition-colors focus-visible:border-[var(--c-green)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-green)]/20"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </label>
              <Button
                size="md"
                iconLeft={<Download />}
                loading={f705Downloading}
                onClick={() => void handleF705Download()}
                className="min-h-11 w-full sm:w-auto"
                style={{ background: LEGACY_COLORS.green, color: LEGACY_COLORS.white }}
              >
                {f705Downloading ? "생산일지 생성 중..." : "F705-02 생산일지 다운로드"}
              </Button>
            </div>
            {f705DownloadError && <p role="alert" className="mt-3 text-[12px] font-bold" style={{ color: LEGACY_COLORS.red }}>{f705DownloadError}</p>}
          </ExportSurface>
        </div>

        <div
          data-testid="export-secondary-grid"
          role="group"
          aria-label="보조 데이터 내보내기"
          className="grid shrink-0 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-2"
        >
          <ExportSurface
            ariaLabel="데이터 내보내기"
            tone={LEGACY_COLORS.blue}
            icon={<FileText className="h-5 w-5" />}
            title="데이터 내보내기"
            className="min-h-0 xl:h-full xl:overflow-hidden"
          >
            <div data-testid="export-control-panel" className="mt-4 min-h-0 flex-1 xl:overflow-y-auto xl:pr-1">
              <div className="flex flex-col gap-4">
                <div role="group" aria-label="데이터 범위">
                  <Label>데이터 범위</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(SCOPE_LABEL) as DataScope[]).map((option) => (
                      <FilterChip
                        key={option}
                        active={scope === option}
                        label={SCOPE_LABEL[option]}
                        onClick={() => handleScopeChange(option)}
                        size="sm"
                        className="min-h-11"
                      />
                    ))}
                  </div>
                </div>

                {supportsExcel && (
                  <div data-testid="export-format-settings" role="group" aria-label="파일 형식">
                    <Label>파일 형식</Label>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterChip active={format === "csv"} label="CSV" onClick={() => setFormat("csv")} size="sm" className="min-h-11" />
                      <FilterChip active={format === "xlsx"} label="Excel" onClick={() => setFormat("xlsx")} size="sm" className="min-h-11" />
                    </div>
                  </div>
                )}

                {(includesTransactions || includesEmployees) && (
                  <div className={`grid gap-4 ${includesTransactions && includesEmployees ? "md:grid-cols-2" : ""}`}>
                    {includesTransactions && (
                      <div data-testid="export-period-settings">
                        <Label>기간 선택</Label>
                        <div
                          className="rounded-[12px] border px-3 py-2 text-[14px] font-medium"
                          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          {range.start} ~ {range.end}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["today", "7d", "30d", "90d"] as RangePreset[]).map((option) => (
                            <FilterChip
                              key={option}
                              active={preset === option}
                              label={option === "today" ? "오늘" : option === "7d" ? "7일" : option === "30d" ? "30일" : "90일"}
                              onClick={() => setPreset(option)}
                              size="sm"
                              className="min-h-11"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {includesEmployees && (
                      <div data-testid="export-inactive-option">
                        <Label>추가 옵션</Label>
                        <label
                          className="flex min-h-11 items-center gap-2 rounded-[12px] border px-3 text-[14px] font-medium"
                          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          <input
                            type="checkbox"
                            checked={includeInactive}
                            onChange={(event) => setIncludeInactive(event.currentTarget.checked)}
                            className="h-4 w-4 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--c-s2)]"
                            style={{ accentColor: LEGACY_COLORS.blue }}
                          />
                          비활성 데이터 포함
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {feedback && (
              <div
                role={feedback.kind === "error" ? "alert" : "status"}
                className="mt-3 shrink-0 rounded-[12px] border px-3 py-2 text-[14px] font-bold"
                style={{
                  background: feedback.kind === "error" ? LEGACY_COLORS.errorBg : LEGACY_COLORS.successBg,
                  borderColor: feedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                  color: feedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                }}
              >
                {feedback.message}
              </div>
            )}
            <div data-testid="export-download-action" className="mt-auto shrink-0 pt-4">
              <Button
                size="md"
                iconLeft={<Download />}
                loading={busy}
                onClick={() => void handleDataExport()}
                className="min-h-11 w-full"
              >
                {busy ? "내보내는 중..." : downloadLabel}
              </Button>
            </div>
          </ExportSurface>

          <AdminAuditCsvSection />
        </div>
      </div>
    </div>
  );
}

interface ExportSurfaceProps {
  ariaLabel: string;
  tone: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}

function ExportSurface({ ariaLabel, tone, icon, title, children, className = "" }: ExportSurfaceProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={`flex flex-col rounded-[20px] border p-4 ${className}`}
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex shrink-0 items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
          style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
        >
          {icon}
        </div>
        <h3 className="min-w-0 text-[18px] font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: LEGACY_COLORS.muted2 }}>
      {children}
    </div>
  );
}
