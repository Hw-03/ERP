"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Clock3, History, Pencil } from "lucide-react";
import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation, DefectMemoRevision } from "@/lib/api/types/defects";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RECORD_GRID_CLASS = "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(110px,0.38fr)_minmax(110px,0.38fr)_minmax(0,2fr)] lg:gap-6";

interface CurrentEmployee {
  employee_id: string;
  name: string;
  department: string;
}

interface Props {
  locations: DefectLocation[];
  onProcess: (location: DefectLocation) => void;
  currentEmployee?: CurrentEmployee;
  onMemoUpdated?: (recordId: string, memo: string) => void;
  /** 전체 보기 시 이 부서를 가장 위에 표시. */
  priorityDept?: string;
}

function parseBackendTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isOverOneYear(value: string | null): boolean {
  const date = parseBackendTimestamp(value);
  return date !== null && Date.now() - date.getTime() > ONE_YEAR_MS;
}

function formatDateTime(value: string | null): string {
  const date = parseBackendTimestamp(value);
  if (!date) return "기록 없음";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

const memoText = (value: string | null | undefined) => value ?? "";
const historyMemoText = (value: string | null) => value && value.length > 0 ? value : "(빈 메모)";

export function DefectDepartmentList({
  locations,
  onProcess,
  currentEmployee,
  onMemoUpdated,
  priorityDept,
}: Props) {
  const grouped = groupByDepartment(locations);
  const depts = Object.keys(grouped).sort((a, b) => {
    if (priorityDept) {
      if (a === priorityDept) return -1;
      if (b === priorityDept) return 1;
    }
    return a.localeCompare(b, "ko");
  });
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  function toggleCollapse(dept: string) {
    setCollapsedDepts((previous) => {
      const next = new Set(previous);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  }

  function toggleItem(dept: string, itemId: string) {
    const key = `${dept}:${itemId}`;
    setExpandedItems((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (depts.length === 0) {
    return (
      <div className="rounded-[14px] border px-6 py-8 text-center" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}>
        <p className="text-base font-bold">격리된 불량 재고가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {depts.map((dept) => {
        const rows = grouped[dept];
        const isCollapsed = collapsedDepts.has(dept);
        const deptColor = getDepartmentFallbackColor(dept);
        return (
          <section key={dept} className="overflow-hidden rounded-[16px] border" style={{ borderColor: tint(deptColor, 40) }}>
            <button
              type="button"
              onClick={() => toggleCollapse(dept)}
              className="flex min-h-11 w-full items-center gap-3 px-5 text-left transition-colors hover:brightness-95"
              style={{ background: tint(deptColor, 10) }}
              aria-expanded={!isCollapsed}
            >
              <span className="text-base font-black" style={{ color: deptColor }}>{dept}</span>
              <span className="text-xs font-bold" style={{ color: tint(deptColor, 65) }}>{rows.length}건</span>
              <span className="ml-auto" style={{ color: tint(deptColor, 55) }}>
                {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </span>
            </button>

            {!isCollapsed && (
              <div className="divide-y" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                {groupByItem(rows).map((records) => {
                  const itemKey = `${dept}:${records[0].item_id}`;
                  return (
                    <DefectItemGroup
                      key={itemKey}
                      department={dept}
                      records={records}
                      expanded={expandedItems.has(itemKey)}
                      onToggle={() => toggleItem(dept, records[0].item_id)}
                      currentEmployee={currentEmployee}
                      onMemoUpdated={onMemoUpdated}
                      onProcess={onProcess}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DefectItemGroup({
  department,
  records,
  expanded,
  onToggle,
  currentEmployee,
  onMemoUpdated,
  onProcess,
}: {
  department: string;
  records: DefectLocation[];
  expanded: boolean;
  onToggle: () => void;
  currentEmployee?: CurrentEmployee;
  onMemoUpdated?: (recordId: string, memo: string) => void;
  onProcess: (location: DefectLocation) => void;
}) {
  if (records.length === 1) {
    return (
      <DefectRecordRow
        location={records[0]}
        currentEmployee={currentEmployee}
        onMemoUpdated={onMemoUpdated}
        onProcess={onProcess}
      />
    );
  }

  const latestRecord = findLatestRecord(records);
  const totalQuantity = records.reduce((total, record) => total + Number(record.quantity), 0);

  return (
    <>
      <button
        type="button"
        data-testid="defect-item-group-summary"
        aria-label={`${department} ${latestRecord.item_name} 격리 ${records.length}건`}
        aria-expanded={expanded}
        onClick={onToggle}
        className="min-h-11 w-full px-4 py-4 text-left transition-colors hover:brightness-95 sm:px-5 lg:min-h-[156px]"
        style={{ background: tint(getDepartmentFallbackColor(department), expanded ? 8 : 4) }}
      >
        <div className={RECORD_GRID_CLASS}>
          <DefectItemIdentity location={latestRecord} />
          <QuantitySummary quantity={totalQuantity} recordCount={records.length} />
          <div
            className="flex min-w-0 flex-col justify-center border-t pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>최근 격리</p>
            <p className="mt-1 break-words text-sm font-bold leading-5" style={{ color: LEGACY_COLORS.muted2 }}>{formatDateTime(latestRecord.defective_at)}</p>
            <p className="mt-1 break-words text-base font-black leading-6" style={{ color: LEGACY_COLORS.text }}>{quarantinedByName(latestRecord)}</p>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>격리 기록 {records.length}건</p>
              <p className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>펼쳐서 개별 기록 확인</p>
            </div>
            {expanded ? <ChevronUp className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} /> : <ChevronDown className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
          </div>
        </div>
      </button>

      {expanded && records.map((record) => (
        <DefectRecordRow
          key={record.record_id}
          location={record}
          hideItemIdentity
          currentEmployee={currentEmployee}
          onMemoUpdated={onMemoUpdated}
          onProcess={onProcess}
        />
      ))}
    </>
  );
}

function DefectRecordRow({
  location,
  hideItemIdentity = false,
  currentEmployee,
  onMemoUpdated,
  onProcess,
}: {
  location: DefectLocation;
  hideItemIdentity?: boolean;
  currentEmployee?: CurrentEmployee;
  onMemoUpdated?: (recordId: string, memo: string) => void;
  onProcess: (location: DefectLocation) => void;
}) {
  const [memo, setMemo] = useState(() => memoText(location.reason_memo));
  const [draftMemo, setDraftMemo] = useState(() => memoText(location.reason_memo));
  const [editing, setEditing] = useState(false);
  const [editPin, setEditPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<DefectMemoRevision[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const nextMemo = memoText(location.reason_memo);
    setMemo(nextMemo);
    setDraftMemo(nextMemo);
  }, [location.record_id, location.reason_memo]);

  useLayoutEffect(() => {
    const textarea = memoTextareaRef.current;
    if (!editing || !textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draftMemo, editing]);

  const canEditMemo = currentEmployee !== undefined;
  const pendingQty = Number(location.pending_quantity);
  const availableQty = Number(location.available_quantity);
  const warn = isOverOneYear(location.defective_at);
  const quarantinedBy = quarantinedByName(location);
  const reasonCategory = location.reason_category?.trim();

  async function saveMemo() {
    if (!currentEmployee || editPin.length !== PIN_LENGTH) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await defectsApi.updateMemo(location.record_id, {
        memo: draftMemo,
        actor_employee_id: currentEmployee.employee_id,
        pin: editPin,
      });
      setMemo(result.memo);
      setDraftMemo(result.memo);
      setEditing(false);
      setEditPin("");
      if (result.changed) {
        if (historyOpen) await loadHistory();
        else setHistory(null);
      }
      onMemoUpdated?.(location.record_id, result.memo);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "메모 저장에 실패했습니다.");
      setEditPin("");
    } finally {
      setSaving(false);
    }
  }

  async function toggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    if (history !== null) return;
    await loadHistory();
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await defectsApi.getMemoHistory(location.record_id));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "메모 이력을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <article
      aria-label={`${location.item_name} 격리 기록`}
      className="px-4 py-4 transition-colors hover:bg-[var(--c-s4)] sm:px-5"
    >
      <div
        data-testid="defect-record-grid"
        className={RECORD_GRID_CLASS}
      >
        <DefectItemIdentity location={location} hidden={hideItemIdentity} />

        <QuantitySummary quantity={location.quantity} recordCount={1} testId="defect-remaining-quantity" />

        <div
          data-testid="defect-quarantine-summary"
          className="flex min-w-0 flex-col justify-center border-t pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <p className="break-words text-sm font-bold leading-5" style={{ color: LEGACY_COLORS.muted2 }}>{formatDateTime(location.defective_at)}</p>
          <p className="mt-1 break-words text-base font-black leading-6" style={{ color: LEGACY_COLORS.text }}>{quarantinedBy}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {location.is_legacy && (
              <StatusBadge
                label={location.legacy_origin === "reconstructed" ? "기존 복원" : "기존 합산"}
                color={LEGACY_COLORS.muted2}
              />
            )}
            {pendingQty > 0 && <StatusBadge label={`승인 대기 ${formatQty(pendingQty)}개`} color={LEGACY_COLORS.yellow} />}
            {warn && <StatusBadge label="1년 초과" color={LEGACY_COLORS.red} icon={<AlertTriangle className="h-3 w-3" />} />}
          </div>
        </div>

        <div className="min-w-0 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div data-testid="defect-reason-summary" className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>격리 사유</span>
            <span
              className="min-w-0 flex-1 break-words text-sm font-black leading-5"
              style={{ color: reasonCategory ? LEGACY_COLORS.text : LEGACY_COLORS.muted }}
            >
              {reasonCategory || "미입력"}
            </span>
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                ref={memoTextareaRef}
                aria-label="격리 메모"
                value={draftMemo}
                onChange={(event) => setDraftMemo(event.target.value)}
                rows={3}
                disabled={saving}
                className="min-h-[76px] w-full resize-none overflow-hidden rounded-[10px] border px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 disabled:opacity-60"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
              />
              {saveError && <p className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>{saveError}</p>}
            </div>
          ) : (
            <div
              className="mt-2 min-h-11 whitespace-pre-wrap break-words rounded-[10px] border px-3 py-2 text-sm leading-5"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: memo ? LEGACY_COLORS.text : LEGACY_COLORS.muted }}
            >
              {memo || "메모 없음"}
            </div>
          )}

          <div data-testid="defect-memo-actions" className="mt-2 flex flex-wrap items-center gap-2 lg:flex-nowrap">
            {editing ? (
              <>
                <label className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>직원 PIN</span>
                  <input
                    aria-label="직원 PIN"
                    type="password"
                    inputMode="numeric"
                    pattern={`\\d{${PIN_LENGTH}}`}
                    maxLength={PIN_LENGTH}
                    value={editPin}
                    onChange={(event) => setEditPin(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      void saveMemo();
                    }}
                    disabled={saving}
                    className="min-h-11 w-28 rounded-[10px] border px-3 text-sm outline-none focus-visible:ring-2 disabled:opacity-60"
                    style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
                  />
                </label>
                <SmallActionButton label={saving ? "저장 중" : "저장"} onClick={() => void saveMemo()} disabled={saving || editPin.length !== PIN_LENGTH} />
                <SmallActionButton label="취소" onClick={() => { setDraftMemo(memo); setEditPin(""); setSaveError(null); setEditing(false); }} disabled={saving} />
              </>
            ) : canEditMemo ? (
              <SmallActionButton label="메모 수정" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setDraftMemo(memo); setEditPin(""); setSaveError(null); setEditing(true); }} />
            ) : null}
            <SmallActionButton
              label={historyOpen ? "메모 이력 닫기" : "메모 이력 보기"}
              icon={<History className="h-3.5 w-3.5" />}
              onClick={() => void toggleHistory()}
            />
            <button
              type="button"
              onClick={() => onProcess(location)}
              disabled={availableQty <= 0}
              className="ml-auto min-h-11 shrink-0 rounded-[10px] border px-4 text-sm font-black transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: tint(LEGACY_COLORS.red, 8), borderColor: tint(LEGACY_COLORS.red, 40), color: LEGACY_COLORS.red }}
            >
              처리
            </button>
          </div>

          {historyOpen && <MemoHistory history={history} loading={historyLoading} error={historyError} />}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ label, color, icon }: { label: string; color: string; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-black" style={{ color, background: tint(color, 10), borderColor: tint(color, 28) }}>
      {icon}{label}
    </span>
  );
}

function DefectItemIdentity({
  location,
  hidden = false,
}: {
  location: DefectLocation;
  hidden?: boolean;
}) {
  if (hidden) {
    return (
      <div data-testid="defect-child-item-placeholder" aria-hidden="true" className="flex min-w-0 items-center justify-center text-3xl font-black" style={{ color: LEGACY_COLORS.muted }}>-</div>
    );
  }

  return (
    <div data-testid="defect-item-summary" className="min-w-0 lg:flex lg:flex-col lg:justify-center">
      <p className="break-words text-base font-black leading-6" style={{ color: LEGACY_COLORS.text }}>{location.item_name}</p>
      {location.mes_code && <p className="mt-1 break-words text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{location.mes_code}</p>}
    </div>
  );
}

function QuantitySummary({
  quantity,
  recordCount,
  testId,
}: {
  quantity: number | string;
  recordCount: number;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-col items-center justify-center border-t pt-3 text-center lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
      style={{ borderColor: LEGACY_COLORS.border }}
    >
      <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>격리 수량</p>
      <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: LEGACY_COLORS.red }}>{formatQty(quantity)}개</p>
      {recordCount > 1 && <p className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>격리 {recordCount}건</p>}
    </div>
  );
}

function SmallActionButton({ label, onClick, icon, disabled = false }: { label: string; onClick: () => void; icon?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border px-3 text-xs font-black transition-colors hover:brightness-110 disabled:opacity-50"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
    >
      {icon}{label}
    </button>
  );
}

function MemoHistory({ history, loading, error }: { history: DefectMemoRevision[] | null; loading: boolean; error: string | null }) {
  const orderedHistory = history
    ? [...history].sort((left, right) => {
        const leftTime = parseBackendTimestamp(left.edited_at)?.getTime() ?? 0;
        const rightTime = parseBackendTimestamp(right.edited_at)?.getTime() ?? 0;
        return rightTime - leftTime;
      })
    : null;

  return (
    <div data-testid="defect-memo-history" className="mt-3 rounded-[10px] border p-2" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
      {loading && <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>이력을 불러오는 중...</p>}
      {error && <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
      {!loading && !error && orderedHistory?.length === 0 && <p className="px-1 py-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>메모 이력이 없습니다.</p>}
      {!loading && !error && orderedHistory && orderedHistory.length > 0 && (
        <ol className="flex flex-col gap-2">
          {orderedHistory.map((revision) => (
            <li
              key={revision.revision_id}
              className="flex min-w-0 gap-2 rounded-[10px] border px-3 py-2.5"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
            >
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted }} />
              <div className="min-w-0 flex-1">
                {revision.is_initial ? (
                  <>
                    <p className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>최초 등록</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
                      {`등록 메모: ${historyMemoText(revision.next_memo)}`}
                    </p>
                  </>
                ) : (
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="whitespace-pre-wrap break-words text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
                      {`변경 전: ${historyMemoText(revision.previous_memo)}`}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {`변경 후: ${historyMemoText(revision.next_memo)}`}
                    </p>
                  </div>
                )}
                <p className="mt-2 border-t pt-2 text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}>
                  {formatDateTime(revision.edited_at)} · {revision.edited_by_name || "처리자 미상"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function groupByDepartment(locations: DefectLocation[]): Record<string, DefectLocation[]> {
  return locations.reduce<Record<string, DefectLocation[]>>((groups, location) => {
    if (!groups[location.department]) groups[location.department] = [];
    groups[location.department].push(location);
    return groups;
  }, {});
}

function groupByItem(locations: DefectLocation[]): DefectLocation[][] {
  const groups = new Map<string, DefectLocation[]>();
  for (const location of locations) {
    const records = groups.get(location.item_id);
    if (records) records.push(location);
    else groups.set(location.item_id, [location]);
  }
  return Array.from(groups.values());
}

function findLatestRecord(records: DefectLocation[]): DefectLocation {
  return records.reduce((latest, record) => {
    const latestTime = parseBackendTimestamp(latest.defective_at)?.getTime();
    const recordTime = parseBackendTimestamp(record.defective_at)?.getTime();
    if (recordTime === undefined || recordTime === null) return latest;
    if (latestTime === undefined || latestTime === null || recordTime > latestTime) return record;
    return latest;
  });
}

function quarantinedByName(location: DefectLocation): string {
  return location.quarantined_by?.trim() || "처리자 미상";
}
