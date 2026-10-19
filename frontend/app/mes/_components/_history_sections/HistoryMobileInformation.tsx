import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { getHistoryRowPresentation, getReferenceBatchPresentation, getReferenceBatchLinePresentation, isDepartmentCorrectionLog } from "./historyPresentation";
import { resolveStockSnapshot, StockSnapshotContent, getHistoryLogSignedQuantity, getNormalStockSnapshots } from "./historyTableHelpers";
import { toInventoryEffectRows } from "./historyInventoryEffect";
import { buildReworkItemSummaries } from "./reworkSummary";
import { buildHistoryDetailSummary, type HistoryDetailSummary } from "./historyDetailSummary";
import { formatHistoryDateTimeLong } from "./historyFormat";
import styles from "./HistoryMobileDetail.module.css";
import { HistoryItemStockCard } from "./HistoryItemStockCard";
import { isInitialStockOperation } from "./historyOperationSource";

/** PC의 요청 순 재고와 실제 영향을 거래별로 보존한다. */
export function HistoryMobileStockDetails({ logs, batch = null, onSelectLog }: {
  logs: TransactionLog[];
  batch?: IoBatch | null;
  onSelectLog: (log: TransactionLog) => void;
}) {
  const reference = getReferenceBatchPresentation(logs);
  const rework = logs.some((log) => log.reference_no?.startsWith("defect-disassemble:")
    || log.operation_role?.startsWith("REWORK_"));
  const results = rework ? buildReworkItemSummaries(logs.filter((log) => log.transaction_type !== "DISASSEMBLE"
    && !log.operation_role?.startsWith("REWORK_PARENT") && log.operation_role !== "REWORK_CHILD_DEFECTIVE")) : [];
  const shownResults = new Set<string>();
  return <section className="space-y-2" aria-label="재고 변화">
    <h3 className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>재고 변화</h3>
    {logs.map((log) => {
      const presentation = getHistoryRowPresentation(log, batch);
      const role = getReferenceBatchLinePresentation(log, reference.kind);
      const result = results.find((value) => value.itemId === log.item_id);
      const resultLabel = result?.excluded && !shownResults.has(log.item_id) ? "처리 제외" : null;
      if (resultLabel) shownResults.add(log.item_id);
      const roleLabel = reference.kind === "shipment" || log.operation_role === "CORRECTION" ? role.label
        : log.operation_role === "PRODUCT_OUTPUT" ? "완제품"
        : log.operation_role === "COMPONENT_INPUT" ? "부품 차감"
        : log.operation_role === "REWORK_CHILD_NORMAL" ? "정상 회수"
        : log.operation_role === "REWORK_CHILD_DEFECTIVE" ? "불량 회수"
        : log.operation_role === "REWORK_CHILD_SCRAP" ? "폐기"
        : log.operation_role?.startsWith("REWORK_PARENT") ? "재작업 대상" : presentation.operation.label;
      const stock = resolveStockSnapshot(log);
      const hasStockChange = (stock.status === "available" && (stock.warehouseBefore !== stock.warehouseAfter || stock.departmentBefore !== stock.departmentAfter))
        || toInventoryEffectRows(log.inventory_effect, {itemId:log.item_id,itemName:log.item_name,unit:log.item_unit}).length > 0;
      const missingStockQuantity = !hasStockChange ? log.quantity_change !== 0 ? getHistoryLogSignedQuantity(log).parts[0]?.label
        : log.transfer_qty ? `${formatQty(Math.abs(log.transfer_qty))} ${log.item_unit}` : null : null;
      return <HistoryItemStockCard key={log.log_id} itemName={log.item_name} mesCode={log.mes_code} role={roleLabel} cancelled={log.cancelled} onSelect={() => onSelectLog(log)} stock={<>
            {missingStockQuantity && <div className="text-sm font-bold" style={{color:LEGACY_COLORS.muted2}}>처리 수량 {missingStockQuantity}</div>}
            <HistoryMobileLogStock log={log} />
          </>}>
        {resultLabel && <span className="block text-xs font-medium" style={{color:LEGACY_COLORS.muted2}}>{resultLabel}</span>}
        {log.cancelled && <div className="mt-1 text-xs" style={{color:LEGACY_COLORS.red}}>취소됨{log.cancel_reason ? ` · ${log.cancel_reason}` : ""}</div>}
      </HistoryItemStockCard>;
    })}
  </section>;
}

/** 작업 상세는 실제 기록을 사용하고 기존 이력 화면은 요청 순 비교를 유지한다. */
export function HistoryMobileLogStock({ log, variant = "card", showRequestOrderStock = true }: { log: TransactionLog; variant?: "card" | "plain"; showRequestOrderStock?: boolean }) {
  const stockLog = showRequestOrderStock ? log : { ...log, request_order_stock: undefined };
  const snapshot = resolveStockSnapshot(stockLog);
  const actual = showRequestOrderStock ? buildHistoryDetailSummary([log], null).actualStock : null;
  const actualDiffers = actual && (snapshot.status !== "available"
    || actual.warehouseBefore !== snapshot.warehouseBefore || actual.warehouseAfter !== snapshot.warehouseAfter
    || actual.departmentBefore !== snapshot.departmentBefore || actual.departmentAfter !== snapshot.departmentAfter);
  const effects = toInventoryEffectRows(log.inventory_effect, {itemId:log.item_id,itemName:log.item_name,unit:log.item_unit});
  const normalDepartments = new Set(effects.filter((effect) => effect.scope === "location" && effect.status !== "DEFECTIVE").map((effect) => effect.department));
  const snapshotDepartments = new Set(effects.filter((effect) => effect.scope === "location" && effect.status === "PRODUCTION" && effect.department).map((effect) => effect.department));
  const snapshotDepartment = snapshotDepartments.size === 1 ? Array.from(snapshotDepartments)[0]
    : snapshotDepartments.size === 0 && log.department?.trim() && log.department.trim() !== "창고" ? log.department.trim() : "부서";
  const defectiveEffects = effects.filter((effect) => effect.status === "DEFECTIVE");
  const normalUnchanged = snapshot.status === "available" && snapshot.warehouseBefore === snapshot.warehouseAfter
    && snapshot.departmentBefore === snapshot.departmentAfter;
  // 재작업 폐기 구성품은 입고되지 않으며 quantity_before는 폐기량을 더한 가상 수량이다.
  const discardedBeforeReceipt = log.transaction_type === "DEFECT_SCRAP"
    && (log.operation_role === "REWORK_CHILD_SCRAP"
      || (log.reference_no?.startsWith("defect-disassemble:") && log.notes?.includes("[rework:scrap_child]")))
    && effects.length === 0 && normalUnchanged && !actualDiffers;
  if (discardedBeforeReceipt) {
    return <span className="text-sm font-medium" style={{color:LEGACY_COLORS.muted2}}>재입고 하지 않고 폐기</span>;
  }
  const showActual = actualDiffers || effects.some((effect) => {
    if (snapshot.status !== "available" || effect.scope === "warehouse_box") return true;
    if (effect.status === "DEFECTIVE") {
      if (!["MARK_DEFECTIVE", "UNMARK_DEFECTIVE", "SUPPLIER_RETURN"].includes(log.transaction_type)
        || defectiveEffects.length !== 1 || log.quantity_before == null || log.quantity_after == null) return true;
      const before = log.quantity_before - (log.warehouse_qty_before ?? snapshot.warehouseBefore) - (log.department_qty_before ?? snapshot.departmentBefore);
      const after = log.quantity_after - (log.warehouse_qty_after ?? snapshot.warehouseAfter) - (log.department_qty_after ?? snapshot.departmentAfter);
      return effect.delta !== after - before || (effect.quantityBefore != null && effect.quantityBefore !== before)
        || (effect.quantityAfter != null && effect.quantityAfter !== after);
    }
    const before = effect.scope === "warehouse" ? snapshot.warehouseBefore : snapshot.departmentBefore;
    const after = effect.scope === "warehouse" ? snapshot.warehouseAfter : snapshot.departmentAfter;
    return effect.delta !== after - before
      || (effect.quantityBefore != null && effect.quantityBefore !== before)
      || (effect.quantityAfter != null && effect.quantityAfter !== after)
      || (effect.scope === "location" && (normalDepartments.size > 1 || (effect.department && effect.department !== snapshotDepartment)));
  });
  const onlyActualChanges = showActual && normalUnchanged && !actualDiffers
    && !["MARK_DEFECTIVE", "UNMARK_DEFECTIVE", "SUPPLIER_RETURN"].includes(log.transaction_type);
  // 요청순 합계는 실제 처리순 위치 스냅샷으로 대체할 수 없다.
  // 실제 위치 효과는 아래 실제 처리 재고 영역에서 원본 그대로 보여준다.
  const requestOrderLog = showActual && stockLog.request_order_stock?.status === "available"
    ? { ...stockLog, inventory_effect: stockLog.inventory_effect?.filter((effect) => effect.scope !== "warehouse"
      && !(effect.scope === "location" && effect.status === "PRODUCTION")) }
    : stockLog;
  const actualLog = { ...log, request_order_stock: undefined };
  const actualSnapshot = resolveStockSnapshot(actualLog);
  const displayedActual = actualDiffers && actualSnapshot.status === "available" && !isDepartmentCorrectionLog(log)
    ? getNormalStockSnapshots(actualLog, actualSnapshot) : [];
  const additionalEffects = effects.filter((effect) => {
    if (effect.scope !== "warehouse" && !(effect.scope === "location" && effect.status === "PRODUCTION")) return true;
    return !displayedActual.some((shown) => shown.label === (effect.scope === "warehouse" ? "창고" : effect.department)
      && shown.before === effect.quantityBefore && shown.after === effect.quantityAfter
      && shown.after - shown.before === effect.delta);
  });
  return <div className={`space-y-2${variant === "plain" ? ` ${styles.plainStockDetails}` : ""}`}>
    {!onlyActualChanges && <div className={variant === "plain" ? "space-y-1" : styles.stockInformation}>
      {showActual && showRequestOrderStock && <span className="text-xs" style={{color:LEGACY_COLORS.muted2}}>요청 순 재고</span>}
      <StockSnapshotContent log={requestOrderLog} variant="panel" expandableUnavailableReason showUnit />
    </div>}
    {showActual && <div className={onlyActualChanges ? "space-y-1" : "space-y-1 border-t pt-2"} style={{borderColor:LEGACY_COLORS.border}}>
      {!onlyActualChanges && <div className="text-xs" style={{color:LEGACY_COLORS.muted2}}>{showRequestOrderStock ? "실제 처리 재고" : "상태별 재고 변화"}</div>}
      {actualDiffers && <StockSnapshotContent log={actualLog} variant="panel" showUnit />}
      {additionalEffects.map((effect) => <div key={effect.key} className={styles.effectRow}
        aria-label={`${effect.label} ${effect.quantityBefore != null ? `${formatQty(effect.quantityBefore)} ` : ""}${effect.deltaLabel}${effect.quantityAfter != null ? `→${formatQty(effect.quantityAfter)}` : ""}${effect.unit ? ` ${effect.unit}` : ""}`}>
        <span style={{color:LEGACY_COLORS.muted2}}>{effect.label}</span>
        <span className="font-bold tabular-nums">
          {effect.quantityBefore != null && <>{formatQty(effect.quantityBefore)} </>}
          <span style={{color:effect.delta > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red}}>{effect.deltaLabel}</span>
          {effect.quantityAfter != null && <> → {formatQty(effect.quantityAfter)}</>}
          {effect.unit && <> {effect.unit}</>}
        </span>
      </div>)}
    </div>}
  </div>;
}

/** 기존 헤더에 없는 초기 등록 위치·상태·참여자·품목 전환을 보완한다. */
export function HistoryMobileContext({ summary, operation, omitParticipantNames = [], omitCancelledStatus = false }: {
  summary: HistoryDetailSummary;
  operation?: Pick<TransactionLog, "operation_domain" | "operation_action">;
  omitParticipantNames?: string[];
  omitCancelledStatus?: boolean;
}) {
  const participants = (summary.participants ?? [summary.requester]).filter((person) => !omitParticipantNames.includes(person.name)
    || (person.label !== "승인자" && formatHistoryDateTimeLong(person.at) !== formatHistoryDateTimeLong(summary.requester.at)));
  return <div className="space-y-2">
    {operation && isInitialStockOperation(operation) && summary.flow && <div className="rounded-[16px] border p-3 text-sm" style={{ borderColor: LEGACY_COLORS.border }}>
      <div className="mb-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>재고 이동</div>
      <div className="break-words">{summary.flow.label}</div>
    </div>}
    {summary.status.label !== "완료" && !(omitCancelledStatus && summary.status.label === "취소됨") && <div className="text-sm font-bold" style={{color:summary.status.tone === "danger" ? LEGACY_COLORS.red : LEGACY_COLORS.yellow}}>
      {summary.status.label}{summary.status.reason && ` · ${summary.status.reason}`}
    </div>}
    {participants.length > 0 && <dl className={styles.metadata} style={{color:LEGACY_COLORS.muted2}}>
      {participants.map((person) => <div key={`${person.label}:${person.name}`} className="contents">
        <dt>{omitParticipantNames.includes(person.name) ? "처리 일시" : person.label}</dt><dd>
          {!omitParticipantNames.includes(person.name) && person.name}
          <span className="block text-xs font-medium">{formatHistoryDateTimeLong(person.at)}</span>
        </dd>
      </div>)}
    </dl>}
    {summary.conversion && <div className="rounded-[16px] border p-3 text-sm" style={{borderColor:LEGACY_COLORS.border}}>
      <div className="mb-1 text-xs" style={{color:LEGACY_COLORS.muted2}}>품목 전환</div>
      <div className="break-words">{summary.conversion.source.itemName} {summary.conversion.source.mesCode} → {summary.conversion.target.itemName} {summary.conversion.target.mesCode}</div>
    </div>}
  </div>;
}
