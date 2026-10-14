"use client";
import type { TransactionLog } from "@/lib/api/types/production";
import { OBSERVATION_LABELS, observationSummary } from "./stocktakeHistory";
import { formatHistoryDateTimeLong } from "./historyFormat";

/** Show the selected member first and label the remaining immutable observation scope. */
export function StocktakeHistoryDetail({ log }: { log: TransactionLog }) {
  const { work, selection, line } = log.stocktake_history!;
  const changed = work.observations.filter(row => observationSummary(row) !== "변동 없음");
  const unchanged = work.observations.filter(row => observationSummary(row) === "변동 없음");
  const single = work.itemCount === 1;
  const visible = selection === "item" || single ? [line] : changed;
  const folded = single ? [] : selection === "item" ? work.observations.filter(row => row.countId !== line.countId) : unchanged;
  const renderLine = (row: typeof line) => <section key={row.countId} aria-label={`${row.itemName} · ${work.department}`} className="border-t border-[var(--c-border)] py-3">
    <h4 className="break-words text-sm font-bold">{row.itemName}</h4>
    <p className="mt-1 text-xs text-[var(--c-muted2)]">{row.mesCode} · {work.department}</p>
    {!row.beforeQuantities || !row.afterQuantities ? <p className="mt-2 text-sm text-[var(--c-muted2)]">당시 수량 기록 없음</p> :
      <table className="mt-2 w-full table-fixed text-right text-sm tabular-nums" aria-label={`${row.itemName} 당시 반영 수량 (${row.unit ?? "단위 미기록"})`}>
        <caption className="pb-2 text-left text-xs text-[var(--c-muted2)]">당시 반영 수량 · {row.unit ?? "단위 미기록"}</caption>
        <thead className="text-xs text-[var(--c-muted2)]"><tr><th scope="col" className="w-[20%] py-2 text-left">분류</th><th scope="col">반영 전</th><th scope="col">반영 후</th><th scope="col">변화량</th></tr></thead>
        <tbody>{(Object.keys(OBSERVATION_LABELS) as (keyof typeof OBSERVATION_LABELS)[]).map(key => {
          const before = row.beforeQuantities[key];
          const after = row.afterQuantities[key];
          const delta = after - before;
          return <tr key={key} className="border-t border-[var(--c-border)]">
            <th scope="row" className="py-2 text-left font-medium">{OBSERVATION_LABELS[key]}</th>
            <td className="break-all pl-1">{before.toLocaleString()}</td><td className="break-all pl-1">{after.toLocaleString()}</td>
            <td className="break-all pl-1" style={{ color: delta > 0 ? "var(--c-blue)" : delta < 0 ? "var(--c-red)" : undefined }}>{delta > 0 ? "+" : ""}{delta.toLocaleString()}</td>
          </tr>;
        })}</tbody>
      </table>}
  </section>;
  return <section className="rounded-[20px] border border-[var(--c-border)] bg-[var(--c-s2)] p-4 text-sm">
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
      <dt className="text-[var(--c-muted2)]">작업</dt><dd className="font-bold">재고 전수조사</dd>
      <dt className="text-[var(--c-muted2)]">작업자</dt><dd>{work.actorName}</dd>
      <dt className="text-[var(--c-muted2)]">처리 위치</dt><dd>{work.department}</dd>
      <dt className="text-[var(--c-muted2)]">일시</dt><dd className="text-xs">{formatHistoryDateTimeLong(work.createdAt)}</dd>
    </dl>
    <h3 className="mb-1 mt-4 font-bold">재고 변화</h3>
    {visible.map(renderLine)}
    {folded.length > 0 && <details key={`${work.operationId}:${selection}:${line.countId}`}><summary className="flex min-h-11 cursor-pointer items-center text-[var(--c-muted2)]">
      {selection === "item" ? `함께 반영한 ${folded.length}품목` : `변동 없는 ${folded.length}품목`}
    </summary>{folded.map(renderLine)}</details>}
  </section>;
}
