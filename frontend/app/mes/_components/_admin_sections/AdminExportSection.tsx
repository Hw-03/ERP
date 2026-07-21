"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../common";
import { FilterChip } from "../common/FilterChip";
import { AdminPageHeader } from "./_admin_primitives";

type Props = {
  itemsExportUrl: string;
  transactionsExportUrl: string;
};

type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";
type DataScope = "all" | "items" | "transactions" | "employees" | "bom";

interface ExportRecord {
  id: string;
  time: string; // ISO
  format: "Excel" | "CSV";
  scope: DataScope;
  range: string;
  fileName: string;
  status: "success" | "failed";
  sizeKb?: number;
  error?: string;
}

const SCOPE_LABEL: Record<DataScope, string> = {
  all: "전체",
  items: "품목",
  transactions: "거래",
  employees: "직원",
  bom: "BOM",
};

const STORAGE_KEY = "admin.export.recent";
const RECENT_LIMIT = 5;

function loadRecent(): ExportRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExportRecord[];
  } catch {
    return [];
  }
}

function saveRecent(rec: ExportRecord) {
  if (typeof window === "undefined") return;
  const list = loadRecent();
  const next = [rec, ...list].slice(0, RECENT_LIMIT);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function presetRange(preset: RangePreset): { start: string; end: string; label: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (preset === "today") {
    return { start: end, end, label: "오늘" };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : 30;
  const startD = new Date(today);
  startD.setDate(today.getDate() - days);
  const start = startD.toISOString().slice(0, 10);
  return { start, end, label: `${days}일` };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadBlob(content: string, fileName: string, type: string): number {
  const blob = new Blob([`﻿${content}`], { type: `${type};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return Math.round((blob.size / 1024) * 10) / 10;
}

export function AdminExportSection({ itemsExportUrl, transactionsExportUrl }: Props) {
  const [recent, setRecent] = useState<ExportRecord[]>([]);
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [scope, setScope] = useState<DataScope>("all");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const range = useMemo(() => presetRange(preset), [preset]);

  function pushRecord(rec: ExportRecord) {
    saveRecent(rec);
    setRecent(loadRecent());
  }

  function handleExcelAll() {
    // 백엔드에서 직접 xlsx 생성 — 새 탭에서 다운로드 트리거
    const stamp = new Date().toISOString().replace(/[:T]/g, "").slice(0, 13);

    // 품목 엑셀
    const itemsLink = document.createElement("a");
    itemsLink.href = itemsExportUrl;
    itemsLink.download = `items_${stamp}.xlsx`;
    document.body.appendChild(itemsLink);
    itemsLink.click();
    document.body.removeChild(itemsLink);

    pushRecord({
      id: `${Date.now()}-items`,
      time: new Date().toISOString(),
      format: "Excel",
      scope: "items",
      range: "전체 품목",
      fileName: `items_${stamp}.xlsx`,
      status: "success",
    });

    // 거래 엑셀 — 약간 지연 후
    setTimeout(() => {
      const txLink = document.createElement("a");
      txLink.href = transactionsExportUrl;
      txLink.download = `transactions_${stamp}.xlsx`;
      document.body.appendChild(txLink);
      txLink.click();
      document.body.removeChild(txLink);

      pushRecord({
        id: `${Date.now()}-tx`,
        time: new Date().toISOString(),
        format: "Excel",
        scope: "transactions",
        range: "최근 30일 거래",
        fileName: `transactions_${stamp}.xlsx`,
        status: "success",
      });
    }, 300);
  }

  async function handleCsvSelected() {
    setBusy(true);
    const stamp = new Date().toISOString().replace(/[:T]/g, "").slice(0, 13);
    const target = scope === "all" ? (["items", "transactions", "employees", "bom"] as DataScope[]) : [scope];

    try {
      for (const s of target) {
        const { csv, fileName } = await buildCsvFor(s, range, includeHeader, includeInactive, stamp);
        const sizeKb = downloadBlob(csv, fileName, "text/csv");
        pushRecord({
          id: `${Date.now()}-${s}`,
          time: new Date().toISOString(),
          format: "CSV",
          scope: s,
          range: `${range.start} ~ ${range.end}`,
          fileName,
          status: "success",
          sizeKb,
        });
      }
    } catch (err) {
      pushRecord({
        id: `${Date.now()}-err`,
        time: new Date().toISOString(),
        format: "CSV",
        scope,
        range: `${range.start} ~ ${range.end}`,
        fileName: `selected_${stamp}.csv`,
        status: "failed",
        error: err instanceof Error ? err.message : "내보내기 실패",
      });
    } finally {
      setBusy(false);
    }
  }

  async function buildCsvFor(
    scope: DataScope,
    range: { start: string; end: string },
    header: boolean,
    inactive: boolean,
    stamp: string,
  ): Promise<{ csv: string; fileName: string }> {
    if (scope === "items") {
      const items = await api.getItems({ limit: 5000 });
      // Item 타입에 is_active 필드가 없어 클라이언트 필터 불가 — 전체 반환
      const filtered = items;
      const headers = ["품목 코드", "품명", "단위", "현재고", "안전재고", "부서", "공급처"];
      const rows = filtered.map((it) => [
        it.mes_code,
        it.item_name,
        it.unit,
        it.quantity,
        it.min_stock,
        it.department ?? "",
        it.supplier ?? "",
      ]);
      const lines = [...(header ? [headers] : []), ...rows].map((r) => r.map(csvEscape).join(","));
      return { csv: lines.join("\n"), fileName: `items_${stamp}.csv` };
    }
    if (scope === "transactions") {
      const tx = await api.getTransactions({ limit: 5000 });
      const headers = ["거래일시", "구분", "품목명", "수량변화", "단위", "메모"];
      const rows = tx
        .filter((t) => {
          const d = (t.created_at ?? "").slice(0, 10);
          return d >= range.start && d <= range.end;
        })
        .map((t) => [
          t.created_at,
          t.transaction_type,
          t.item_name,
          t.quantity_change,
          t.item_unit,
          t.notes ?? "",
        ]);
      const lines = [...(header ? [headers] : []), ...rows].map((r) => r.map(csvEscape).join(","));
      return { csv: lines.join("\n"), fileName: `transactions_${stamp}.csv` };
    }
    if (scope === "employees") {
      const emps = await api.getEmployees({ activeOnly: !inactive });
      const headers = ["이름", "부서", "직급", "등급", "창고 역할", "활성"];
      const rows = emps.map((e) => [
        e.name,
        e.department,
        e.role ?? "",
        e.level,
        e.warehouse_role,
        e.is_active ? "Y" : "N",
      ]);
      const lines = [...(header ? [headers] : []), ...rows].map((r) => r.map(csvEscape).join(","));
      return { csv: lines.join("\n"), fileName: `employees_${stamp}.csv` };
    }
    if (scope === "bom") {
      const rows = await api.getAllBOM();
      const headers = ["부모 코드", "부모명", "자식 코드", "자식명", "수량", "단위"];
      const data = rows.map((r) => [
        r.parent_mes_code ?? "",
        r.parent_item_name,
        r.child_mes_code ?? "",
        r.child_item_name,
        r.quantity,
        r.unit,
      ]);
      const lines = [...(header ? [headers] : []), ...data].map((r) => r.map(csvEscape).join(","));
      return { csv: lines.join("\n"), fileName: `bom_${stamp}.csv` };
    }
    throw new Error(`지원하지 않는 범위: ${scope}`);
  }

  function handleClearRecent() {
    sessionStorage.removeItem(STORAGE_KEY);
    setRecent([]);
  }

  const lastExport = recent[0] ?? null;

  return (
    <div className="flex min-h-0 flex-col">
      <AdminPageHeader
        icon={Download}
        title="내보내기"
        description="시스템 데이터를 안전하게 내보내고 관리하세요."
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {/* 상단 2개 카드 */}
        <div className="grid gap-3 lg:grid-cols-2">
          <ExportCard
            tone={LEGACY_COLORS.green}
            icon={<FileSpreadsheet className="h-6 w-6" />}
            title="전체 데이터 내보내기 (Excel)"
            description="시스템의 모든 데이터를 Excel 파일로 내보냅니다. 백업 및 전체 분석에 적합합니다."
            actionLabel="전체 데이터 내보내기"
            onClick={handleExcelAll}
            disabled={busy}
          />
          <ExportCard
            tone={LEGACY_COLORS.blue}
            icon={<FileText className="h-6 w-6" />}
            title="선택 데이터 내보내기 (CSV)"
            description="필터로 선택한 데이터만 CSV 파일로 내보냅니다. 맞춤 분석 및 공유에 유용합니다."
            actionLabel={busy ? "내보내는 중..." : "선택 데이터 내보내기"}
            onClick={handleCsvSelected}
            disabled={busy}
          />
        </div>

        {/* 범위 설정 */}
        <div
          className="rounded-[16px] border p-4"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-3 flex items-center gap-2 text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>
            <Calendar className="h-4 w-4" />
            내보내기 범위 설정
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <Label>기간 선택</Label>
              <div
                className="rounded-[10px] border px-3 py-2 text-[14px]"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {range.start} ~ {range.end}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(["today", "7d", "30d", "90d"] as RangePreset[]).map((p) => (
                  <FilterChip
                    key={p}
                    active={preset === p}
                    label={p === "today" ? "오늘" : p === "7d" ? "7일" : p === "30d" ? "30일" : "90일"}
                    onClick={() => setPreset(p)}
                    size="sm"
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>데이터 유형</Label>
              <div
                className="rounded-[10px] border px-3 py-2 text-[14px]"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                전체 데이터
              </div>
              <div className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                CSV는 아래 데이터 범위 기준으로 내보냅니다.
              </div>
            </div>
            <div>
              <Label>데이터 범위</Label>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "items", "transactions", "employees", "bom"] as DataScope[]).map((s) => (
                  <FilterChip
                    key={s}
                    active={scope === s}
                    label={SCOPE_LABEL[s]}
                    onClick={() => setScope(s)}
                    size="sm"
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>추가 옵션</Label>
              <div className="flex flex-col gap-1.5 text-[14px]" style={{ color: LEGACY_COLORS.text }}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeHeader}
                    onChange={(e) => setIncludeHeader(e.target.checked)}
                  />
                  헤더 포함
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                  />
                  비활성 데이터 포함
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 하단: 최근 기록 + 마지막 내보내기 */}
        <div className={`grid gap-3 ${lastExport ? "lg:grid-cols-[1fr_280px]" : ""}`}>
          <div
            className="rounded-[16px] border p-4"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>
                최근 내보내기 기록 (이번 세션)
              </div>
              {recent.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearRecent}
                  className="min-h-11 px-2 text-[12px] font-bold transition-colors hover:underline"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  기록 지우기
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <EmptyState
                variant="no-data"
                compact
                title="아직 내보내기 기록이 없습니다"
                description="내보내기 후 이 자리에 표시됩니다. 새로고침 시 초기화됩니다."
              />
            ) : (
              <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                <div
                  className="grid items-center gap-2 px-3 py-2 text-[12px] font-black uppercase tracking-[0.08em]"
                  style={{
                    gridTemplateColumns: "120px 60px 100px 1fr 70px 70px",
                    background: LEGACY_COLORS.s3,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  <span>시간</span>
                  <span>유형</span>
                  <span>범위</span>
                  <span>파일</span>
                  <span className="text-right">크기</span>
                  <span className="text-right">상태</span>
                </div>
                {recent.map((r) => (
                  <div
                    key={r.id}
                    className="grid items-center gap-2 px-3 py-2 text-[12px]"
                    style={{
                      gridTemplateColumns: "120px 60px 100px 1fr 70px 70px",
                      borderTop: `1px solid ${LEGACY_COLORS.border}`,
                    }}
                  >
                    <span className="font-mono" style={{ color: LEGACY_COLORS.muted2 }}>
                      {formatDateTime(r.time)}
                    </span>
                    <span style={{ color: LEGACY_COLORS.text }}>{r.format}</span>
                    <span style={{ color: LEGACY_COLORS.text }}>{SCOPE_LABEL[r.scope]}</span>
                    <span className="truncate" style={{ color: LEGACY_COLORS.text }}>
                      {r.fileName}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                      {r.sizeKb ? `${r.sizeKb} KB` : "—"}
                    </span>
                    <span
                      className="flex items-center justify-end gap-1 text-[12px] font-bold"
                      style={{
                        color: r.status === "success" ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                      }}
                    >
                      {r.status === "success" ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          완료
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          실패
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 마지막 내보내기 */}
          {lastExport && (
            <div
              className="rounded-[16px] border p-4"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
            <div className="mb-2 text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              마지막 내보내기
            </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {lastExport.format === "Excel" ? (
                    <FileSpreadsheet className="h-5 w-5" style={{ color: LEGACY_COLORS.green }} />
                  ) : (
                    <FileText className="h-5 w-5" style={{ color: LEGACY_COLORS.blue }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {lastExport.fileName}
                    </div>
                    <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {SCOPE_LABEL[lastExport.scope]} · {lastExport.format}
                    </div>
                  </div>
                </div>
                <div
                  className="rounded-[8px] border px-2.5 py-1.5 text-[12px]"
                  style={{
                    background: `color-mix(in srgb, ${
                      lastExport.status === "success" ? LEGACY_COLORS.green : LEGACY_COLORS.red
                    } 8%, transparent)`,
                    borderColor: `color-mix(in srgb, ${
                      lastExport.status === "success" ? LEGACY_COLORS.green : LEGACY_COLORS.red
                    } 30%, transparent)`,
                    color: lastExport.status === "success" ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                  }}
                >
                  {lastExport.status === "success" ? "✓ 다운로드 성공" : `✗ ${lastExport.error ?? "실패"}`}
                </div>
                <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatDateTime(lastExport.time)}
                  {lastExport.sizeKb ? ` · ${lastExport.sizeKb} KB` : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="rounded-[10px] border px-3 py-2 text-[12px]"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          • Excel: 백엔드에서 생성된 .xlsx 파일을 직접 다운로드합니다.<br />
          • CSV: 클라이언트에서 데이터를 받아 CSV로 변환합니다. (UTF-8 BOM 포함)<br />
          • 최근 기록은 현재 세션에서만 유지되며, 새로고침 시 초기화됩니다.
        </div>
      </div>
    </div>
  );
}

interface ExportCardProps {
  tone: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
}

function ExportCard({ tone, icon, title, description, actionLabel, onClick, disabled }: ExportCardProps) {
  return (
    <div
      className="rounded-[16px] border p-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
            {title}
          </div>
          <div className="mt-1 text-[12px] leading-snug" style={{ color: LEGACY_COLORS.muted2 }}>
            {description}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
        style={{ background: tone }}
      >
        <Download className="h-4 w-4" />
        {actionLabel}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em]"
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {children}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}
