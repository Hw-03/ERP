"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { InventoryObservationLine, InventoryOperation } from "@/lib/api/types/production";
import { productionApi } from "@/lib/api/production";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "./historyFormat";

const CATEGORIES = { normal: "정상", defect: "불량", b_grade: "B급", obsolete: "불용" } as const;
const POOL_CATEGORIES: Record<string, string> = { defect: "불량", b_grade: "B급", obsolete: "구형" };
const SOURCE_LABELS: Record<string, string> = { InventoryOperation: "재고 작업", ShippingRequest: "출하 요청", StockRequest: "재고 요청", HandoverDoc: "인수인계" };
const STATUS_LABELS: Record<string, string> = { PENDING: "대기", APPROVED: "승인", PREPARING: "준비 중", PREPARED: "준비 완료", COMPLETED: "완료", CANCELLED: "취소", REJECTED: "반려", RESERVED: "예약", CONSUMED: "사용 완료", RELEASED: "해제", DRAFT: "작성 중", CONFIRMED: "확인 완료", RECEIVED: "인수 완료" };

/** 상태별 변화가 상쇄되는 경우에도 차이 0으로 표시하지 않는다. */
export function observationHasDifference(line: InventoryObservationLine): boolean {
  return (Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).some((key) => line.beforeQuantities[key] !== line.afterQuantities[key]);
}

export function operationSummary(operation: InventoryOperation): string {
  if (operation.businessCorrection) return "업무 정정 · 수량 변동 없음";
  const observations = operation.matchingObservationLines?.length ? operation.matchingObservationLines : operation.observationLines ?? [];
  if (observations.length) return observations.some(observationHasDifference) ? "실사 관측 · 수량 반영" : "실사 관측 · 차이 0";
  if (operation.poolMovements?.length) return `상태 재고 기록 ${operation.poolMovements.length}건`;
  return operation.lines.length ? `수량 기록 ${operation.lines.length}건` : "업무 상태 기록";
}

/** 관측은 거래 로그를 만들지 않고 서버에 저장된 네 상태의 전후 값을 보여 준다. */
function ObservationTable({ line, department }: { line: InventoryObservationLine; department: string | null }): ReactElement {
  return (
    <section className="rounded-xl border p-3" style={{ borderColor: C.border }}>
      <h4 className="font-bold">
        {line.itemName ?? "품목"}{" "}
        <span className="text-xs font-normal" style={{ color: C.muted }}>{line.mesCode} · {line.scopeKey === "warehouse" ? "창고" : department ?? "부서"}</span>
      </h4>
      <p className="my-2 text-xs" style={{ color: C.muted }}>{observationHasDifference(line) ? "실사 관측 · 수량 반영" : "실사 관측 · 차이 0"}</p>
      <div className="overflow-x-auto">
        <table aria-label={`${line.itemName ?? "품목"} 실사 관측`} className="w-full text-right text-sm tabular-nums">
          <thead style={{ color: C.muted }}>
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
                  <td>{delta > 0 ? "+" : ""}{delta.toLocaleString()}</td>
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

/** 일반 수량 취소를 우회하지 않고 관측·정정과 원업무 증빙을 조회한다. */
export function InventoryOperationDetail({ operationId, onBack, onNavigate }: { operationId: string; onBack: () => void; onNavigate: (id: string) => void }): ReactElement {
  const query = useQuery({
    queryKey: ["transactions", "operations", "detail", operationId],
    queryFn: ({ signal }) => productionApi.getInventoryOperation(operationId, { signal }),
  });
  const operation = query.data;
  return <section aria-label="통합 작업 상세" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm" style={{ color: C.text }}>
    <div><Button variant="secondary" size="md" className="min-h-11" onClick={onBack}>목록으로</Button></div>
    {query.isLoading ? <LoadingSkeleton rows={4} /> : query.isError ? <LoadFailureCard prefix="작업 상세를 불러오지 못했습니다" message={query.error instanceof Error ? query.error.message : "다시 시도해 주세요."} retryLabel="다시 시도" onRetry={() => void query.refetch()} /> : operation && <>
      <header><h3 className="text-lg font-bold">{operation.displayLabel}</h3><p className="mt-1 text-xs" style={{ color: C.muted }}>{formatHistoryDate(operation.effectiveAt)} · {operation.actorName}{operation.department ? ` · ${operation.department}` : ""}</p></header>
      {operation.reason && <p className="whitespace-pre-wrap break-words">{operation.reason}</p>}
      {operation.effectiveStatus === "cancelled" && <p style={{ color: C.red }}>취소된 작업</p>}
      {operation.effectiveStatus === "cancellation" && <p>작업 취소 기록</p>}
      {operation.businessCorrection && <section className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.s2 }}>
        <h4 className="font-bold">업무 정정</h4><p className="my-2">현재 재고 수량 변동 없음</p>
        <p className="break-all text-xs" style={{ color: C.muted }}>{SOURCE_LABELS[operation.businessCorrection.sourceType] ?? "원문서"} · {operation.businessCorrection.sourceId}</p>
        <div className="mt-2 flex flex-wrap gap-2">{operation.businessCorrection.sourceOperationIds.map((id, index) => <Button key={id} variant="secondary" size="md" className="min-h-11" onClick={() => onNavigate(id)}>원업무 {index + 1} 보기</Button>)}</div>
      </section>}
      {operation.effects.some((effect) => effect.beforeState.status !== effect.afterState.status || effect.effectKind === "RESERVATION") && <section className="rounded-xl border p-3" style={{ borderColor: C.border }}>
        <h4 className="mb-2 font-bold">업무 상태 변화</h4>
        <ul className="space-y-2">{operation.effects.map((effect) => {
          if (effect.effectKind === "RESERVATION") {
            const before = effect.beforeState.reserved;
            const after = effect.afterState.reserved;
            return typeof before === "number" && typeof after === "number" ? <li key={effect.effectId}>예약 수량 {before.toLocaleString()} → {after.toLocaleString()}</li> : null;
          }
          const before = effect.beforeState.status;
          const after = effect.afterState.status;
          if (typeof before !== "string" || typeof after !== "string" || before === after) return null;
          return <li key={effect.effectId}><span className="text-xs" style={{ color: C.muted }}>{SOURCE_LABELS[effect.subjectType] ?? (effect.subjectType === "ShippingAllocation" ? "출하 배정" : "연결 업무")}</span><p>{STATUS_LABELS[before] ?? before} → {STATUS_LABELS[after] ?? after}</p></li>;
        })}</ul>
      </section>}
      {(operation.observationLines ?? []).map((line) => <ObservationTable key={`${line.applicationId}-${line.countId}`} line={line} department={operation.department} />)}
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
              <li key={movement.movementId} className="rounded-xl border p-3" style={{ borderColor: C.border }}>
                <p className="font-medium">{[itemName, mesCode, category, location].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 tabular-nums">{movement.beforeQuantity.toLocaleString()} → {movement.afterQuantity.toLocaleString()} (변화 {movement.delta > 0 ? "+" : ""}{movement.delta.toLocaleString()})</p>
                {movement.reason && <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: C.muted }}>{movement.reason}</p>}
              </li>
            ); })}
          </ul>
        </section>
      )}
      {!operation.observationLines?.length && operation.lines.length > 0 && <section><h4 className="mb-2 font-bold">수량 기록</h4><ul className="space-y-2">{operation.lines.map((line) => <li key={line.logId} className="rounded-xl border p-3" style={{ borderColor: C.border }}><p className="font-medium">{line.itemName ?? line.mesCode ?? "품목"}</p><p className="mt-1 tabular-nums">{line.quantityBefore == null ? "기록 없음" : line.quantityBefore.toLocaleString()} → {line.quantityAfter == null ? "기록 없음" : line.quantityAfter.toLocaleString()} <span style={{ color: C.muted }}>(변화 {line.quantityChange > 0 ? "+" : ""}{line.quantityChange.toLocaleString()})</span></p>{line.notes && <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: C.muted }}>{line.notes}</p>}</li>)}</ul></section>}
      <div className="flex flex-wrap gap-2">{operation.reversesOperationId && <Button variant="secondary" size="md" className="min-h-11" onClick={() => onNavigate(operation.reversesOperationId!)}>취소 전 작업 보기</Button>}{operation.reversalOperationId && <Button variant="secondary" size="md" className="min-h-11" onClick={() => onNavigate(operation.reversalOperationId!)}>취소 기록 보기</Button>}</div>
      {operation.cancelBlockers.length > 0 && <section className="rounded-xl border p-3" style={{ borderColor: C.border }}><h4 className="font-bold">수량 취소 제한</h4><ul className="mt-2 space-y-1">{operation.cancelBlockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></section>}
      {operation.canCancel && <p className="text-xs" style={{ color: C.muted }}>수량 취소는 수량 이력의 원거래 상세에서 진행할 수 있습니다.</p>}
    </>}
  </section>;
}
