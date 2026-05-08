"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  api,
  type WeeklyGroupReport,
  type WeeklyReportResponse,
} from "@/lib/api";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../tokens";
import {
  AsyncState,
  EmptyState,
  IconButton,
  KpiCard,
  KpiRow,
  SectionCard,
  SectionHeader,
  SheetHeader,
} from "../primitives";

interface WeekOption {
  key: string;
  label: string;
  start: string;
  end: string;
  isCurrent: boolean;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function md(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekRange(weeksAgo: number): WeekOption {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + mondayOffset - 7 * weeksAgo);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    key: ymd(monday),
    start: ymd(monday),
    end: ymd(sunday),
    label: `${md(monday)} ~ ${md(sunday)}`,
    isCurrent: weeksAgo === 0,
  };
}

const WEEK_OPTIONS: WeekOption[] = Array.from({ length: 8 }, (_, i) => getWeekRange(i));

export function WeeklyReportScreen({ onBack }: { onBack: () => void }) {
  const [week, setWeek] = useState<WeekOption>(WEEK_OPTIONS[1] ?? WEEK_OPTIONS[0]); // 기본 지난 주
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWeeklyReport({
        week_start: week.start,
        week_end: week.end,
      });
      setData(res);
      // 기본 선택: 변동량이 가장 큰 그룹
      const top = [...res.groups].sort(
        (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
      )[0];
      setSelectedGroup(top?.process_code ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "주간보고를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week.key]);

  const selected = useMemo(
    () => data?.groups.find((g) => g.process_code === selectedGroup) ?? null,
    [data, selectedGroup],
  );

  return (
    <div className="flex flex-col">
      {/* 헤더 */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-3"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <IconButton icon={ArrowLeft} label="뒤로" size="md" onClick={onBack} />
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex flex-1 items-center justify-between gap-2 rounded-[14px] border px-3 py-2 text-left active:scale-[0.99]"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="min-w-0">
            <div
              className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              주간보고 · {week.isCurrent ? "이번 주" : "지난 주차"}
            </div>
            <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {week.label}
            </div>
          </div>
          <CalendarDays size={18} color={LEGACY_COLORS.muted as string} />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <AsyncState
          loading={loading}
          error={error}
          empty={!loading && !data}
          emptyView={<EmptyState icon={CalendarDays} title="데이터가 없습니다" />}
          onRetry={load}
        >
          {data ? (
            <>
              {/* 요약 KPI */}
              <KpiRow>
                <KpiCard
                  label="입고합"
                  value={formatQty(data.summary.total_in_qty)}
                  color={LEGACY_COLORS.green as string}
                />
                <KpiCard
                  label="출고합"
                  value={formatQty(data.summary.total_out_qty)}
                  color={LEGACY_COLORS.red as string}
                />
                <KpiCard
                  label="현재고"
                  value={formatQty(data.summary.total_current_qty)}
                  color={LEGACY_COLORS.blue as string}
                />
              </KpiRow>

              {/* 경고/메시지 */}
              {data.warnings.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {data.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="rounded-[14px] border px-3 py-2"
                      style={{
                        background:
                          w.level === "danger"
                            ? `${LEGACY_COLORS.red as string}14`
                            : w.level === "warn"
                              ? `${LEGACY_COLORS.yellow as string}14`
                              : `${LEGACY_COLORS.green as string}14`,
                        borderColor:
                          w.level === "danger"
                            ? `${LEGACY_COLORS.red as string}55`
                            : w.level === "warn"
                              ? `${LEGACY_COLORS.yellow as string}55`
                              : `${LEGACY_COLORS.green as string}55`,
                      }}
                    >
                      <div
                        className={`${TYPO.body} font-black`}
                        style={{
                          color:
                            w.level === "danger"
                              ? (LEGACY_COLORS.red as string)
                              : w.level === "warn"
                                ? (LEGACY_COLORS.yellow as string)
                                : (LEGACY_COLORS.green as string),
                        }}
                      >
                        {w.title}
                      </div>
                      <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                        {w.message}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* 모델×공정 매트릭스 */}
              {data.production_matrix.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <SectionHeader subtitle="Production" title="모델별 생산" />
                  <div className="-mx-4 overflow-x-auto pb-1">
                    <div className="flex gap-2 px-4">
                      {data.production_matrix.map((row) => (
                        <ProductionMatrixCard key={row.model_key} row={row} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 공정별 변화 */}
              <div className="flex flex-col gap-2">
                <SectionHeader subtitle="By Process" title="공정별 변화" />
                <div className="flex flex-col gap-2">
                  {data.groups.map((g) => (
                    <GroupCard
                      key={g.process_code}
                      group={g}
                      active={selectedGroup === g.process_code}
                      onSelect={() => setSelectedGroup(g.process_code)}
                    />
                  ))}
                </div>
              </div>

              {/* 선택 공정 품목 상세 */}
              {selected ? (
                <div className="flex flex-col gap-2 pb-4">
                  <SectionHeader
                    subtitle="Items"
                    title={`${selected.label} 품목 상세`}
                  />
                  {selected.items.length === 0 ? (
                    <EmptyState icon={CalendarDays} title="이 공정의 품목 변동이 없습니다" />
                  ) : (
                    <SectionCard padding="none">
                      <div
                        className="flex flex-col divide-y"
                        style={{ borderColor: LEGACY_COLORS.border as string }}
                      >
                        {selected.items.map((it) => (
                          <ItemDeltaRow key={it.item_id} item={it} />
                        ))}
                      </div>
                    </SectionCard>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </AsyncState>
      </div>

      {/* 주차 선택 sheet */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <SheetHeader title="주차 선택" onClose={() => setSheetOpen(false)} />
        <div className="flex flex-col gap-1 px-4 pb-4">
          {WEEK_OPTIONS.map((w) => {
            const active = w.key === week.key;
            return (
              <button
                key={w.key}
                type="button"
                onClick={() => {
                  setWeek(w);
                  setSheetOpen(false);
                }}
                className="flex items-center justify-between gap-2 rounded-[14px] border px-4 py-3 text-left active:scale-[0.99]"
                style={{
                  background: active
                    ? `${LEGACY_COLORS.blue as string}14`
                    : (LEGACY_COLORS.s2 as string),
                  borderColor: active
                    ? (LEGACY_COLORS.blue as string)
                    : (LEGACY_COLORS.border as string),
                }}
              >
                <div>
                  <div
                    className={`${TYPO.body} font-black`}
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    {w.label}
                  </div>
                  <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                    {w.isCurrent ? "이번 주" : ""}
                  </div>
                </div>
                {active ? (
                  <span
                    className={`${TYPO.caption} rounded-full px-2 py-[2px] font-bold`}
                    style={{
                      background: `${LEGACY_COLORS.blue as string}26`,
                      color: LEGACY_COLORS.blue as string,
                    }}
                  >
                    선택됨
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
}

function ProductionMatrixCard({
  row,
}: {
  row: {
    model_key: string;
    model_label: string;
    hf_qty: number;
    vf_qty: number;
    nf_qty: number;
    af_qty: number;
    total_qty: number;
  };
}) {
  return (
    <div
      className="flex w-[160px] shrink-0 flex-col gap-1 rounded-[16px] border px-3 py-3"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className={`${TYPO.caption} truncate font-bold uppercase tracking-[1px]`}
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {row.model_label}
      </div>
      <div
        className={`${TYPO.title} font-black tabular-nums`}
        style={{ color: LEGACY_COLORS.text }}
      >
        {formatQty(row.total_qty)}
      </div>
      <div className="flex flex-wrap gap-1 pt-1">
        {([
          ["HF", row.hf_qty],
          ["VF", row.vf_qty],
          ["NF", row.nf_qty],
          ["AF", row.af_qty],
        ] as const).map(([label, qty]) => (
          <span
            key={label}
            className={`${TYPO.caption} rounded-full px-2 py-[1px] font-bold tabular-nums`}
            style={{
              background: qty > 0 ? `${LEGACY_COLORS.blue as string}22` : "transparent",
              color: qty > 0 ? (LEGACY_COLORS.blue as string) : (LEGACY_COLORS.muted as string),
            }}
          >
            {label} {formatQty(qty)}
          </span>
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  active,
  onSelect,
}: {
  group: WeeklyGroupReport;
  active: boolean;
  onSelect: () => void;
}) {
  const positive = group.delta > 0;
  const negative = group.delta < 0;
  const tone = positive
    ? (LEGACY_COLORS.green as string)
    : negative
      ? (LEGACY_COLORS.red as string)
      : (LEGACY_COLORS.muted2 as string);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-3 rounded-[16px] border px-4 py-3 text-left active:scale-[0.99]"
      style={{
        background: active ? `${LEGACY_COLORS.blue as string}10` : (LEGACY_COLORS.s2 as string),
        borderColor: active ? (LEGACY_COLORS.blue as string) : (LEGACY_COLORS.border as string),
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
        style={{ background: `${tone}22`, color: tone }}
      >
        {positive ? <TrendingUp size={18} /> : negative ? <TrendingDown size={18} /> : <CalendarDays size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
          {group.label}
        </div>
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          {group.dept_name} · {group.item_count}품목
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`${TYPO.body} font-black tabular-nums`} style={{ color: tone }}>
          {group.delta >= 0 ? "+" : ""}
          {formatQty(group.delta)}
        </div>
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          현재 {formatQty(group.current_qty)}
        </div>
      </div>
      <ChevronRight size={16} color={LEGACY_COLORS.muted as string} />
    </button>
  );
}

function ItemDeltaRow({
  item,
}: {
  item: {
    item_id: string;
    erp_code: string | null;
    item_name: string;
    prev_qty: number;
    in_qty: number;
    out_qty: number;
    current_qty: number;
    delta: number;
  };
}) {
  const tone =
    item.delta > 0
      ? (LEGACY_COLORS.green as string)
      : item.delta < 0
        ? (LEGACY_COLORS.red as string)
        : (LEGACY_COLORS.muted2 as string);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div
          className={`${TYPO.body} truncate font-black`}
          style={{ color: LEGACY_COLORS.text }}
        >
          {item.item_name}
        </div>
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          {item.erp_code ?? "-"}
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
            전주 {formatQty(item.prev_qty)}
          </span>
          <span className={TYPO.caption} style={{ color: LEGACY_COLORS.green as string }}>
            +{formatQty(item.in_qty)}
          </span>
          <span className={TYPO.caption} style={{ color: LEGACY_COLORS.red as string }}>
            −{formatQty(item.out_qty)}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`${TYPO.body} font-black tabular-nums`} style={{ color: tone }}>
          {item.delta >= 0 ? "+" : ""}
          {formatQty(item.delta)}
        </div>
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          → {formatQty(item.current_qty)}
        </div>
      </div>
    </div>
  );
}
