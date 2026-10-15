"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, type ReactElement } from "react";
import type { InventoryObservationLine, InventoryOperation, InventoryOperationLine } from "@/lib/api/types/production";
import { productionApi } from "@/lib/api/production";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { LoadFailureCard, LoadingSkeleton } from "../common";
import { HistoryKeyPointSummary } from "./HistoryKeyPointSummary";
import { HistoryItemStockCard } from "./HistoryItemStockCard";
import { HistoryMobileLogStock } from "./HistoryMobileInformation";
import { inventoryOperationHeader, inventoryOperationLineMeaning, inventoryOperationQuantityLabel, inventoryOperationStatusLabel, OPERATION_SOURCE_LABELS } from "./inventoryOperationPresentation";
import { formatQty } from "@/lib/mes/format";
import { HistoryDetailMemo } from "./HistoryDetailPanel";
import { formatHistoryDateTimeLong } from "./historyFormat";

const CATEGORIES = { normal: "정상", defect: "불량", b_grade: "B급", obsolete: "구형" } as const;
const POOL_CATEGORIES: Record<string, string> = { defect: "불량", b_grade: "B급", obsolete: "구형" };

/** 상태별 변화가 상쇄되는 경우에도 차이 0으로 표시하지 않는다. */
export function observationHasDifference(line: InventoryObservationLine): boolean {
  return (Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).some((key) => line.beforeQuantities[key] !== line.afterQuantities[key]);
}

export function operationSummary(operation: InventoryOperation): string {
  if (operation.businessCorrection) return "업무 정정 · 수량 변동 없음";
  const observations = operation.matchingObservationLines?.length ? operation.matchingObservationLines : operation.observationLines ?? [];
  if (observations.length) return observations.some(observationHasDifference) ? "실사 결과 · 재고 반영" : "실사 결과 · 수량 변동 없음";
  if (operation.poolMovements?.length) return `재고 상태 변경 ${operation.poolMovements.length}건`;
  return operation.lines.length ? `품목별 재고 변화 ${operation.lines.length}건` : "업무 처리 기록";
}

/** 관측은 거래 로그를 만들지 않고 서버에 저장된 네 상태의 전후 값을 보여 준다. */
function ObservationTable({ line, department }: { line: InventoryObservationLine; department: string | null }): ReactElement {
  return (
    <section className="border-t py-3 first:border-t-0" style={{ borderColor: C.border }}>
      <h4 className="font-bold">
        {line.itemName ?? "품목"}{" "}
        <span className="text-xs font-normal" style={{ color: C.muted }}>{line.mesCode} · {line.scopeKey === "warehouse" ? "창고" : department ?? "부서"}</span>
      </h4>
      <p className="my-2 text-xs" style={{ color: C.muted }}>{observationHasDifference(line) ? "실사 결과 · 재고 반영" : "실사 결과 · 수량 변동 없음"}</p>
      <div className="overflow-x-auto">
        <table aria-label={`${line.itemName ?? "품목"} 실사 관측`} className="w-full text-right text-sm tabular-nums">
          <thead className="text-xs" style={{ color: C.muted }}>
            <tr><th className="py-2 text-left">상태</th><th>반영 전</th><th>실사 반영</th><th>차이</th><th>예약</th></tr>
          </thead>
          <tbody>
            {(Object.entries(CATEGORIES) as Array<[keyof typeof CATEGORIES, string]>).map(([key, label]) => {
              const delta = line.afterQuantities[key] - line.beforeQuantities[key];
              return (
                <tr key={key}>
                  <th className="py-2 text-left font-medium">{label}</th>
                  <td>{line.beforeQuantities[key].toLocaleString()}</td>
                  <td>{line.afterQuantities[key].toLocaleString()}</td>
                  <td className="text-lg font-bold" style={{ color: delta > 0 ? C.green : delta < 0 ? C.red : C.muted2 }}>{delta > 0 ? "+" : ""}{delta.toLocaleString()}</td>
                  <td>{line.reservations[key].toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 전체 작업의 품목을 역할별로 나누고 실제 거래의 위치별 재고 표현을 공유한다. */
function OperationItems({ operation }: { operation: InventoryOperation }): ReactElement {
  const groups = new Map<string, InventoryOperationLine[]>();
  for (const line of operation.lines) {
    const { group } = inventoryOperationLineMeaning(operation, line);
    groups.set(group, [...(groups.get(group) ?? []), line]);
  }
  const orderedGroups = [...groups].sort(([left], [right]) => {
    const order = ["생산된 품목", "생산 취소 품목", "분해한 품목", "분해 취소 품목", "재작업한 품목"];
    const rank = (label: string): number => order.includes(label) ? order.indexOf(label) : order.length;
    return rank(left) - rank(right);
  });
  return <div className="space-y-4">
    {orderedGroups.map(([group, lines]) => <section key={group} aria-label={group} className="space-y-2">
      <h4 className="text-sm font-bold">{group} <span className="text-xs font-medium" style={{ color: C.muted2 }}>· {lines.length}건</span></h4>
      {lines.map((line, index) => <div key={line.logId} className={index > 0 ? "border-t" : ""} style={{ borderColor: C.border }}><HistoryItemStockCard variant="plain" itemName={line.itemName ?? line.mesCode ?? "품목"} mesCode={line.mesCode}
        stock={<div className="space-y-1 text-sm tabular-nums">
          <p className="text-lg font-bold" style={{ color: line.quantityChange > 0 ? C.green : line.quantityChange < 0 ? C.red : C.cyan }}>{inventoryOperationQuantityLabel(operation, line)}</p>
        </div>}
        stockDetails={line.historyLog ? <HistoryMobileLogStock log={line.historyLog} variant="plain" showRequestOrderStock={false} /> : <p className="text-right text-sm tabular-nums" style={{ color: C.muted2 }}>{line.quantityBefore == null || line.quantityAfter == null
            ? "전후 수량 기록 없음" : `${formatQty(line.quantityBefore)} → ${formatQty(line.quantityAfter)}`}</p>}
        >
        <HistoryDetailMemo variant="plain" excludeMemo={operation.reason} notes={line.notes === operation.displayLabel ? null : line.notes} reasonMemo={line.historyLog?.reason_memo} transactionType={line.transactionType} />
      </HistoryItemStockCard></div>)}
    </section>)}
  </div>;
}

/** 결과를 가리지 않고 원업무 연결과 처리 과정을 필요할 때 확인한다. */
function OperationProcessingInfo({ operation, onNavigate }: { operation: InventoryOperation; onNavigate: (id: string) => void }): ReactElement {
  return <details className="border-t pt-1" style={{ borderColor: C.border }}>
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium" style={{ color: C.muted2 }}>처리 정보 보기</summary>
    <div className="space-y-3 pb-3 text-sm">
      <p><span className="mr-2 text-xs" style={{ color: C.muted2 }}>작업 일시</span>{formatHistoryDateTimeLong(operation.effectiveAt)}</p>
      {operation.effects.some((effect) => effect.beforeState.status !== effect.afterState.status || effect.effectKind === "RESERVATION") && <section>
        <h4 className="mb-2 text-xs font-medium" style={{ color: C.muted2 }}>처리 상태</h4>
        <ul className="space-y-2">{operation.effects.map((effect) => {
          if (effect.effectKind === "RESERVATION") {
            const before = effect.beforeState.reserved;
            const after = effect.afterState.reserved;
            return typeof before === "number" && typeof after === "number" ? <li key={effect.effectId}>예약 수량 {before.toLocaleString()} → {after.toLocaleString()}</li> : null;
          }
          const before = effect.beforeState.status;
          const after = effect.afterState.status;
          if (typeof before !== "string" || typeof after !== "string" || before === after) return null;
          return <li key={effect.effectId}><span className="text-xs" style={{ color: C.muted2 }}>{OPERATION_SOURCE_LABELS[effect.subjectType] ?? "업무 처리"}</span><p>{inventoryOperationStatusLabel(before)} → {inventoryOperationStatusLabel(after)}</p></li>;
        })}</ul>
      </section>}
      {operation.businessCorrection && <section>
        <p className="break-all text-xs" style={{ color: C.muted2 }}>{OPERATION_SOURCE_LABELS[operation.businessCorrection.sourceType] ?? "원문서"} · {operation.businessCorrection.sourceId}</p>
        <div className="mt-2 flex flex-wrap gap-2">{operation.businessCorrection.sourceOperationIds.map((id, index) => <Button key={id} variant="secondary" size="md" className="min-h-11" onClick={() => onNavigate(id)}>원업무 {index + 1} 보기</Button>)}</div>
      </section>}
      <div className="flex flex-wrap gap-2">{operation.reversesOperationId && <Button variant="secondary" size="md" className="min-h-11" onClick={() => onNavigate(operation.reversesOperationId!)}>취소 전 작업 보기</Button>}{operation.reversalOperationId && <Button variant="secondary" size="md" className="min-h-11" onClick={() => onNavigate(operation.reversalOperationId!)}>취소 기록 보기</Button>}</div>
      {operation.cancelBlockers.length > 0 && <section><h4 className="mb-1 text-xs font-medium" style={{ color: C.muted2 }}>취소할 수 없는 이유</h4><ul className="space-y-1">{operation.cancelBlockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></section>}
      {operation.canCancel && <p className="text-xs" style={{ color: C.muted2 }}>작업 취소는 입출고 내역에서 해당 작업을 선택해 진행할 수 있습니다.</p>}
      <p className="text-xs" style={{ color: C.muted2 }}>재고는 작업 당시의 기록입니다.</p>
      {operation.lines.length > 1 && <p className="text-xs" style={{ color: C.muted2 }}>이 작업에 포함된 전체 품목을 표시합니다.</p>}
    </div>
  </details>;
}

/** 일반 수량 취소를 우회하지 않고 관측·정정과 원업무 증빙을 조회한다. */
export function InventoryOperationDetail({ operationId, onBack, onNavigate }: { operationId: string; onBack: () => void; onNavigate: (id: string) => void }): ReactElement {
  const query = useQuery({
    queryKey: ["transactions", "operations", "detail", operationId],
    queryFn: ({ signal }) => productionApi.getInventoryOperation(operationId, { signal }),
  });
  const operation = query.data;
  const loadedOperationId = operation?.operationId;
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!loadedOperationId) return;
    // 모바일 시트와 PC 패널 모두 이전 작업의 스크롤에 결과가 가려지지 않게 한다.
    for (let element = detailRef.current; element; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        element.scrollTop = 0;
        break;
      }
    }
  }, [loadedOperationId]);
  return <section ref={detailRef} aria-label="통합 작업 상세" className="flex min-h-0 flex-1 flex-col gap-3 p-3 text-sm [&>*]:shrink-0" style={{ color: C.text }}>
    <div className="flex items-start gap-3">
      <Button variant="ghost" size="md" className="min-h-11" onClick={onBack}>목록으로</Button>
      {operation && !query.isError && <div className="min-w-0 flex-1"><HistoryKeyPointSummary summary={inventoryOperationHeader(operation)} variant="plain" department={operation.department} /></div>}
    </div>
    {query.isLoading ? <LoadingSkeleton rows={4} /> : query.isError ? <LoadFailureCard prefix="작업 상세를 불러오지 못했습니다" message={query.error instanceof Error ? query.error.message : "다시 시도해 주세요."} retryLabel="다시 시도" onRetry={() => void query.refetch()} /> : operation && <>
      {operation.effectiveStatus === "cancelled" && <p style={{ color: C.red }}>이 작업은 취소되었습니다. 아래는 취소 전 작업 당시의 기록입니다.</p>}
      {operation.businessCorrection && <p className="py-2 text-lg font-bold">현재 재고 수량 변동 없음</p>}
      {!!operation.observationLines?.length && <div>{operation.observationLines.map((line) => <ObservationTable key={`${line.applicationId}-${line.countId}`} line={line} department={operation.department} />)}</div>}
      {!operation.observationLines?.length && Boolean(operation.poolMovements?.length) && (
        <section>
          <h4 className="mb-2 font-bold">상태 재고 변동</h4>
          <ul className="space-y-2">
            {operation.poolMovements?.map((movement) => {
              const line = operation.lines.find((candidate) => candidate.itemId === movement.itemId);
              const itemName = movement.itemName || line?.itemName || movement.itemId;
              const mesCode = movement.mesCode || line?.mesCode;
              const category = POOL_CATEGORIES[movement.category.toLowerCase()] ?? movement.category;
              const location = movement.physicalDepartment || (movement.scopeKey === "warehouse" ? "창고" : movement.scopeKey);
              return (
              <li key={movement.movementId} aria-label={[itemName, mesCode, category, location].filter(Boolean).join(" · ")} className="border-t first:border-t-0" style={{ borderColor: C.border }}>
                <HistoryItemStockCard variant="plain" itemName={itemName} mesCode={mesCode} role={`${category} · ${location}`} stock={<div className="space-y-1 tabular-nums">
                  <p className="text-lg font-bold" style={{ color: movement.delta > 0 ? C.green : movement.delta < 0 ? C.red : C.muted2 }}>{movement.delta > 0 ? "+" : ""}{formatQty(movement.delta)}</p>
                  <p className="text-sm" style={{ color: C.muted2 }}>{formatQty(movement.beforeQuantity)} → {formatQty(movement.afterQuantity)}</p>
                </div>}>
                <HistoryDetailMemo variant="plain" notes={null} reasonMemo={movement.reason} excludeMemo={operation.reason} />
                </HistoryItemStockCard>
              </li>
            ); })}
          </ul>
        </section>
      )}
      {!operation.observationLines?.length && operation.lines.length > 0 && <OperationItems operation={operation} />}
      <HistoryDetailMemo variant="plain" label="사유" notes={null} reasonMemo={operation.reason} />
      <OperationProcessingInfo key={operation.operationId} operation={operation} onNavigate={onNavigate} />
    </>}
  </section>;
}
