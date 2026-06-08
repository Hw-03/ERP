"use client";

/**
 * 품목 선택기 공용 헬퍼 — IoTargetPicker(입출고)와 DefectItemPicker(불량 탭)가
 * 공유하는 순수 필터/정렬/렌더 유틸. IoTargetPicker.tsx 모듈 지역에 있던 것을
 * 동작 변경 없이 추출했다.
 */

import { formatQty } from "@/lib/mes/format";
import { PROD_DEPTS } from "../_warehouse_steps/_constants";
import { deptOf, stageOf, type DeptLetter } from "../_admin_sections/_bom_workbench/bomDept";
import type { Item } from "./types";

export const STAGE_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RAW", label: "원자재" },
  { value: "MID", label: "중간공정" },
  { value: "DONE", label: "공정완료" },
];

export const NAME_TO_LETTER: Record<string, DeptLetter> = {
  튜브: "T",
  고압: "H",
  진공: "V",
  튜닝: "N",
  조립: "A",
  출하: "P",
};

export function matchesDept(item: Item, dept: string) {
  if (dept === "ALL") return true;
  if (dept === "창고") return Number(item.warehouse_qty || 0) > 0;
  const letter = NAME_TO_LETTER[dept];
  if (!letter) return true;
  return deptOf(item.process_type_code) === letter;
}

export function matchesStage(item: Item, stage: string) {
  if (stage === "ALL") return true;
  const s = stageOf(item.process_type_code);
  if (!s) return false;
  if (stage === "RAW") return s === "R";
  if (stage === "MID") return s === "A";
  if (stage === "DONE") return s === "F";
  return true;
}

export function matchesModel(item: Item, selectedSlot: number | null | undefined) {
  if (selectedSlot === undefined) return true;
  if (selectedSlot === null) return item.model_slots.length === 0;
  return item.model_slots.includes(selectedSlot);
}

/**
 * mes_code 2번째 segment(공정코드, 2글자)의 끝글자가 R(원자재)인지.
 * 예: 3-AR-0014 → "AR" → 원자재. R 바로 폐기/반품 대상 필터.
 */
export function isRItem(mesCode: string | null | undefined): boolean {
  if (!mesCode) return false;
  const parts = mesCode.split("-");
  return parts.length >= 2 && parts[1].endsWith("R");
}

// PRODUCTION 위치만 부서별로 합산. 0 이하는 제외해 tooltip noise 방지.
export function getProdByDept(item: Item): Map<string, number> {
  const m = new Map<string, number>();
  for (const loc of item.locations) {
    if (loc.status !== "PRODUCTION") continue;
    const q = Number(loc.quantity) || 0;
    if (q <= 0) continue;
    m.set(loc.department, (m.get(loc.department) ?? 0) + q);
  }
  return m;
}

// PROD_DEPTS (튜브→고압→진공→튜닝→조립→출하) 순서 고정. 그 외(AS/기타) 는 그대로 뒤에 알파벳 순.
const DEPT_ORDER_INDEX = new Map<string, number>(PROD_DEPTS.map((d, i) => [d, i]));
export function renderDeptBreakdown(prodByDept: Map<string, number>) {
  const entries = Array.from(prodByDept.entries()).sort(([a], [b]) => {
    const ai = DEPT_ORDER_INDEX.get(a) ?? 100;
    const bi = DEPT_ORDER_INDEX.get(b) ?? 100;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([dept, qty]) => (
        <div key={dept} className="flex justify-between gap-3 tabular-nums">
          <span>{dept}</span>
          <span>{formatQty(qty)}</span>
        </div>
      ))}
    </div>
  );
}

export function keepCodeOnOneLine(code: string | null | undefined) {
  return code ? code.replace(/-/g, "‑") : "-";
}

/**
 * 대상 부서 → PROD 부서 순서 기준 letter→priority 맵.
 * 같은 부서 내에서는 호출부의 stable sort 로 서버 정렬 유지.
 */
export function buildDeptPriorityByLetter(
  targetDepartment: string | null | undefined,
): Map<string, number> {
  const base = [...PROD_DEPTS] as string[];
  const ordered =
    targetDepartment && base.includes(targetDepartment)
      ? [targetDepartment, ...base.filter((d) => d !== targetDepartment)]
      : base;
  const map = new Map<string, number>();
  ordered.forEach((name, idx) => {
    const letter = NAME_TO_LETTER[name];
    if (letter) map.set(letter, idx);
  });
  return map;
}

/** 담당 모델 slot 배열 → priority(0=상위) 맵. 배열 순서가 곧 priority. */
export function buildAssignedPriorityBySlot(slots: number[] | undefined): Map<number, number> {
  const m = new Map<number, number>();
  (slots ?? []).forEach((slot, idx) => m.set(slot, idx));
  return m;
}

/**
 * 직원 개인 품목 순서 항목 배열 → item_id → display_order 맵.
 * entries 없거나 빈 배열이면 빈 Map 반환 → 기존 부서순 그대로 동작.
 */
export function buildEmployeeOrderRank(
  entries?: { item_id: string; display_order: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  if (!entries || entries.length === 0) return m;
  for (const e of entries) {
    m.set(e.item_id, e.display_order);
  }
  return m;
}
