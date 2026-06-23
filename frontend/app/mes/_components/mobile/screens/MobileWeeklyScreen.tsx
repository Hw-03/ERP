"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type {
  WeeklyReportResponse,
  WeeklyProductionModelRow,
} from "@/lib/api/types/weekly";
import { WeeklyGroupCards } from "../../_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "../../_weekly_sections/WeeklyDetailTable";
// 항목 4-13 — 모바일 생산현황을 PC 와 동일한 매트릭스 표로(frozen 컴포넌트 import 만, 수정 금지).
import { WeeklyProductionMatrix } from "../../_weekly_sections/WeeklyProductionMatrix";
import { AsyncState } from "../primitives";
import { TYPO } from "../tokens";

/**
 * 주간보고 모바일 전용 뷰.
 *
 * frozen(DesktopWeeklyReportView·_weekly_sections·weekly_report.py)은 수정하지
 * 않는다. 데이터 오케스트레이션(getWeeklyReport·selectedCode)은 데스크톱 뷰에서
 * 복제하고, 재사용 가능한 frozen 하위(WeeklyGroupCards·WeeklyDetailTable)는 import만
 * 한다. 가로 와이드 테이블 WeeklyProductionMatrix 만 모바일 카드로 대체.
 *
 * weekMon 은 셸이 관리하고 헤더 WeeklyWeekPicker 로 바꾼다(props 시그니처 보존).
 */
const CARD_STYLE = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
  boxShadow: "var(--c-card-shadow)",
} as const;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Kpi({ label, tone }: { label: string; tone?: string }) {
  return (
    <span
      className={clsx(TYPO.caption, "rounded-full px-2.5 py-1 font-black")}
      style={{ background: LEGACY_COLORS.s2, color: tone ?? LEGACY_COLORS.text }}
    >
      {label}
    </span>
  );
}

export function MobileWeeklyScreen({ weekMon }: { weekMon: Date }) {
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState("TF");
  const [reloadNonce, setReloadNonce] = useState(0);

  const weekStart = toDateStr(weekMon);
  const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * 86400000));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getWeeklyReport({ week_start: weekStart, week_end: weekEnd })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        // 응답에 현재 선택 코드가 없으면 첫 그룹으로 재조정(frozen 과 동일 fallback).
        setSelectedCode((prev) =>
          res.groups.length > 0 && !res.groups.find((g) => g.process_code === prev)
            ? res.groups[0].process_code
            : prev,
        );
      })
      .catch(() => {
        if (!cancelled) setError("주간보고 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, weekEnd, reloadNonce]);

  const matrixRows = data?.production_matrix ?? [];
  const hasProduction = matrixRows.some((r) => r.total_qty > 0);
  const totalQty = matrixRows.reduce((s, r) => s + r.total_qty, 0);
  const topModel = matrixRows.reduce(
    (best, r) => (r.total_qty > (best?.total_qty ?? 0) ? r : best),
    null as WeeklyProductionModelRow | null,
  );
  const activeDepts = data?.groups.filter((g) => g.produce_qty > 0).length ?? 0;
  const totalDepts = data?.groups.length ?? 0;
  const selectedGroup = data?.groups.find((g) => g.process_code === selectedCode);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      {/* 항목 5-8 — min-w-0 로 flex 자식이 main(414) 폭으로 줄어들게(없으면 콘텐츠 min-content=490 으로 부풀어
          공정별 변화 카드 우측 '현재/±0'가 잘림). 공정 전환과 무관하게 폭 고정. */}
      <div className="scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
        <AsyncState
          loading={loading && !data}
          error={error}
          onRetry={() => setReloadNonce((n) => n + 1)}
        >
          {/* 1. 생산 현황 */}
          <section className="rounded-[20px] border p-4" style={CARD_STYLE}>
            <div className={clsx(TYPO.overline, "mb-2")} style={{ color: LEGACY_COLORS.muted2 }}>
              생산 현황
            </div>
            {hasProduction ? (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <Kpi label={`총 ${totalQty.toLocaleString()}개`} />
                  {topModel && <Kpi label={`최다 ${topModel.model_label}`} tone={LEGACY_COLORS.blue} />}
                  <Kpi label={`생산부서 ${activeDepts}/${totalDepts}`} />
                </div>
                {/* 항목 4-13 — PC 와 동일 매트릭스 표(루트에 overflow-x-auto 있어 좁은 폭에서 가로 스크롤). */}
                <WeeklyProductionMatrix rows={matrixRows} />
              </>
            ) : (
              <div className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
                이번 주 생산 실적이 없습니다.
              </div>
            )}
          </section>

          {/* 2. 공정별 변화 — frozen WeeklyGroupCards(cols=1). 카드가 flex-1 이라 wrapper 에 min-h 부여. */}
          <section className="rounded-[20px] border p-3" style={CARD_STYLE}>
            <div className={clsx(TYPO.overline, "mb-2 px-1")} style={{ color: LEGACY_COLORS.muted2 }}>
              공정별 변화
            </div>
            <div className="min-h-[300px]">
              <WeeklyGroupCards
                groups={data?.groups ?? []}
                selected={selectedCode}
                onSelect={setSelectedCode}
                cols={1}
              />
            </div>
          </section>

          {/* 3. 품목 상세 — frozen WeeklyDetailTable(내부 모바일 카드 리스트). */}
          <section className="rounded-[20px] border p-3" style={CARD_STYLE}>
            <div className={clsx(TYPO.overline, "mb-2 px-1")} style={{ color: LEGACY_COLORS.muted2 }}>
              {selectedGroup ? `${selectedGroup.dept_name} 품목 상세` : "품목 상세"}
            </div>
            <WeeklyDetailTable group={selectedGroup} />
          </section>
        </AsyncState>
      </div>
    </div>
  );
}
