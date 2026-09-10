/** 입출고 요청 유형 표시 라벨 — DraftCartItemRow / WarehouseQueueRow / MyRequestRow 공용.
 *  단일 사전은 `frontend/lib/io/glossary.ts` (P0-1). 본 파일은 backward-compat re-export. */
import type { StockRequestLine, StockRequestType } from "@/lib/api";
import { REQUEST_TYPE_LABEL as _GLOSSARY_REQUEST_TYPE_LABEL } from "@/lib/io/glossary";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";

export const REQUEST_TYPE_LABEL = _GLOSSARY_REQUEST_TYPE_LABEL;

/** 알 수 없는 backend enum은 표시하되 요청 command에는 사용하지 않는다. */
export function getRequestTypePresentation(requestType: string): {
  label: string;
  commandSafe: boolean;
} {
  const commandSafe = Object.prototype.hasOwnProperty.call(REQUEST_TYPE_LABEL, requestType);
  return {
    label: commandSafe
      ? REQUEST_TYPE_LABEL[requestType]
      : `알 수 없는 요청 (${requestType})`,
    commandSafe,
  };
}

export type RequestQuantityTone = "positive" | "negative" | "movement" | "neutral";

interface RequestStatusPresentation {
  label: string;
  color: string;
}

type RequestStatusPresentationTuple = readonly [label: string, color: string];

const REQUEST_STATUS_PRESENTATION: Record<string, RequestStatusPresentationTuple> = {
  draft: ["임시저장", LEGACY_COLORS.muted2],
  submitted: ["승인 대기", LEGACY_COLORS.yellow],
  reserved: ["승인 대기", LEGACY_COLORS.yellow],
  rejected: ["반려", LEGACY_COLORS.red],
  cancelled: ["취소", LEGACY_COLORS.muted2],
  completed: ["완료", LEGACY_COLORS.green],
  failed_approval: ["승인 실패", LEGACY_COLORS.red],
};

/** 내부 상태 코드는 유지하면서 요청 카드의 사용자용 상태 표현을 통일한다. */
export function getRequestStatusPresentation(status: string): RequestStatusPresentation {
  const presentation = REQUEST_STATUS_PRESENTATION[status];
  return presentation
    ? { label: presentation[0], color: presentation[1] }
    : { label: status, color: LEGACY_COLORS.muted2 };
}

/** 재고 전후값을 노출하지 않고 요청 라인의 입고·출고·이동 의미만 표현한다. */
export function getRequestQuantityPresentation(
  line: Pick<StockRequestLine, "quantity" | "from_bucket" | "to_bucket">,
): { text: string; tone: RequestQuantityTone } {
  const quantity = formatQty(line.quantity);
  const hasSource = line.from_bucket !== "none";
  const hasDestination = line.to_bucket !== "none";

  if (!hasSource && hasDestination) return { text: `+${quantity}개`, tone: "positive" };
  if (hasSource && !hasDestination) return { text: `-${quantity}개`, tone: "negative" };
  if (hasSource && hasDestination) return { text: `이동 ${quantity}개`, tone: "movement" };
  return { text: `${quantity}개`, tone: "neutral" };
}

const AUTOMATIC_DEPARTMENT_REQUEST_TYPES = new Set<StockRequestType>([
  "warehouse_to_dept",
  "dept_to_warehouse",
  "manual_adjustment",
]);

export function isAutomaticDepartmentRequest(requestType: StockRequestType): boolean {
  return AUTOMATIC_DEPARTMENT_REQUEST_TYPES.has(requestType);
}

/** 자동 부서 승인 요청의 라인별 실제 재고 경로. */
export function getRequestLineRouteLabel(
  requestType: StockRequestType | undefined,
  line: StockRequestLine,
): string | null {
  if (!requestType || !isAutomaticDepartmentRequest(requestType)) return null;
  if (requestType === "warehouse_to_dept" && line.to_department) {
    return `창고 → ${normalizeDepartment(line.to_department)}`;
  }
  if (requestType === "dept_to_warehouse" && line.from_department) {
    return `${normalizeDepartment(line.from_department)} → 창고`;
  }
  if (line.from_bucket === "none" && line.to_bucket === "production" && line.to_department) {
    return `${normalizeDepartment(line.to_department)} 입고`;
  }
  if (line.from_bucket === "production" && line.to_bucket === "none" && line.from_department) {
    return `${normalizeDepartment(line.from_department)} 출고`;
  }
  return null;
}

/** 요청 헤더의 실제 라인 경로. 여러 생산 부서가 섞이면 첫 라인을 대표로 쓰지 않는다. */
export function getRequestFlowLabel(
  requestType: StockRequestType,
  lines: StockRequestLine[],
): string | null {
  const productionDepartments = new Set<string>();
  for (const line of lines) {
    if (line.from_bucket === "production" && line.from_department) {
      productionDepartments.add(line.from_department);
    }
    if (line.to_bucket === "production" && line.to_department) {
      productionDepartments.add(line.to_department);
    }
  }
  if (isAutomaticDepartmentRequest(requestType) && productionDepartments.size > 1) {
    return "여러 부서";
  }

  const firstLine = lines[0];
  if (!firstLine) return null;
  const endpointLabel = (bucket: StockRequestLine["from_bucket"], department: string | null) =>
    bucket === "warehouse" ? "창고" : department ? normalizeDepartment(department) : null;
  const from = endpointLabel(firstLine.from_bucket, firstLine.from_department);
  const to = endpointLabel(firstLine.to_bucket, firstLine.to_department);
  return from && to ? `${from} → ${to}` : from ?? to;
}

/**
 * 비고(notes) 사용자 표시용 정리.
 * 일부 흐름(분해 등)은 구조화 JSON(child_decisions …)을 notes 에 저장한다.
 * 원시 JSON 을 그대로 노출하지 않고, 사람이 읽을 요약/메모만 반환. 없으면 null(숨김).
 * 일반 텍스트 메모는 그대로 반환.
 */
export function formatRequestNotes(notes: string | null | undefined): string | null {
  const raw = (notes ?? "").trim();
  if (!raw) return null;
  if (raw[0] !== "{" && raw[0] !== "[") return raw; // 일반 메모
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw; // JSON 아님 → 일반 메모로 취급
  }
  const memos: string[] = [];
  const collect = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(collect);
      return;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "reason_memo" || k === "memo") && typeof val === "string" && val.trim()) {
        memos.push(val.trim());
      } else if (val && typeof val === "object") {
        collect(val);
      }
    }
  };
  collect(parsed);
  const parts: string[] = [];
  const cd = (parsed as { child_decisions?: unknown }).child_decisions;
  if (Array.isArray(cd)) parts.push(`하위 분해 ${cd.length}건`);
  if (memos.length) parts.push(memos.join(" · "));
  return parts.length ? parts.join(" — ") : null;
}
