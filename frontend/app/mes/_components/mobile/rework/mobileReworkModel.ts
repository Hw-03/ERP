import type { AdjLineTemplate } from "@/lib/api/types/dept-adjustment";
import type { ChildDecision } from "../../_defect_hub/DisassembleTree";

/** 표시 정보는 모바일에만 보관한다. 서버 변환은 기존 ChildDecision 계약을 사용한다. */
export interface MobileReworkDecision extends ChildDecision {
  unit?: string;
  department?: string;
  children: MobileReworkDecision[] | null;
}

export type ReworkPath = number[];
export interface ReworkRow {
  path: ReworkPath;
  node: MobileReworkDecision;
  ancestors: MobileReworkDecision[];
}

export function fromTemplate(line: AdjLineTemplate): MobileReworkDecision {
  const qty = Number(line.quantity);
  return {
    item_id: line.item_id, item_name: line.item_name, mes_code: line.mes_code ?? "",
    qty, normal_qty: qty, defective_qty: 0, scrap_qty: 0, keep_qty: qty,
    reason_memo: "", bom_auto_token: line.bom_auto_token,
    has_bom: line.has_children, children: null, manuallySet: false,
    unit: line.unit, department: line.department,
  };
}

export function bounded(raw: number, max: number): number {
  return Math.max(0, Math.min(max, Number.isFinite(raw) ? raw : 0));
}

/** PC와 동일하게 정상 수정 시 잔량을 격리로, 격리·폐기 수정 시 잔량을 정상으로 배분한다. */
export function setPart(node: MobileReworkDecision, part: "normal_qty" | "defective_qty" | "scrap_qty", raw: number): MobileReworkDecision {
  const next = { ...node, [part]: bounded(raw, node.qty), manuallySet: true };
  if (part === "normal_qty") {
    next.scrap_qty = bounded(next.scrap_qty, node.qty - next.normal_qty);
    next.defective_qty = node.qty - next.normal_qty - next.scrap_qty;
  } else {
    next.defective_qty = bounded(next.defective_qty, node.qty);
    next.scrap_qty = bounded(next.scrap_qty, node.qty - next.defective_qty);
    next.normal_qty = node.qty - next.defective_qty - next.scrap_qty;
  }
  next.keep_qty = next.normal_qty;
  return next;
}

/** 기존 기본 정상 배분의 반올림과 수동 수정 보호 규칙을 유지한다. */
export function allocateNormal(nodes: MobileReworkDecision[], normal: number, total: number): MobileReworkDecision[] {
  if (total <= 0) return nodes;
  return nodes.map((node) => {
    if (node.manuallySet) return node;
    const qty = Math.min(node.qty, Math.round(bounded(normal, total) / total * node.qty));
    return { ...node, normal_qty: qty, defective_qty: node.qty - qty, scrap_qty: 0, keep_qty: qty,
      children: node.children ? allocateNormal(node.children, qty, node.qty) : null };
  });
}

/** BOM 내 동일 품목의 여러 출현을 배열 경로로 구분한다. */
export function getNode(nodes: MobileReworkDecision[], path: ReworkPath): MobileReworkDecision | undefined {
  let current: MobileReworkDecision | undefined;
  let level = nodes;
  for (const index of path) {
    current = level[index];
    if (!current) return undefined;
    level = current.children ?? [];
  }
  return current;
}

export function updateNode(nodes: MobileReworkDecision[], path: ReworkPath, update: (node: MobileReworkDecision) => MobileReworkDecision): MobileReworkDecision[] {
  const [index, ...rest] = path;
  return nodes.map((node, i) => i !== index ? node : rest.length === 0 ? update(node)
    : { ...node, children: updateNode(node.children ?? [], rest, update) });
}

export function isSplit(node: MobileReworkDecision): boolean {
  return node.nodeMode === "split" && Boolean(node.children?.length);
}

export function hasChanges(node: MobileReworkDecision): boolean {
  return isSplit(node) || node.defective_qty > 0 || node.scrap_qty > 0 || Boolean(node.reason_memo);
}

/** toServerDecision과 동일한 분기만 펼쳐 검토와 제출의 대상을 일치시킨다. */
export function effectiveRows(nodes: MobileReworkDecision[], path: ReworkPath = [], ancestors: MobileReworkDecision[] = []): ReworkRow[] {
  return nodes.flatMap((node, index) => {
    const nextPath = [...path, index];
    return isSplit(node) ? effectiveRows(node.children!, nextPath, [...ancestors, node])
      : [{ path: nextPath, node, ancestors }];
  });
}

/** 활성 분해 경로만 부모 우선으로 펼친다. 보관된 비활성 하위 입력은 제외한다. */
export function activeRows(nodes: MobileReworkDecision[], path: ReworkPath = [], ancestors: MobileReworkDecision[] = []): ReworkRow[] {
  return nodes.flatMap((node, index) => {
    const nextPath = [...path, index];
    return [{ node, path: nextPath, ancestors }, ...(isSplit(node) ? activeRows(node.children!, nextPath, [...ancestors, node]) : [])];
  });
}

/** 필터는 일치 행과 조상을 표시하며 사용자의 접힘 기록을 변경하지 않는다. */
export function visibleRows(rows: ReworkRow[], expanded: Record<string, boolean>, search: string, changedOnly: boolean, focusedPath?: string): ReworkRow[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query && !changedOnly) return rows.filter(({ path }) => path.slice(0, -1).every((_, index) => expanded[path.slice(0, index + 1).join("/")] !== false));
  const visible = new Set<string>();
  for (const { node, path } of rows) {
    if (path.join("/") !== focusedPath && !((!changedOnly || hasChanges(node)) && `${node.item_name} ${node.mes_code} ${node.department ?? ""}`.toLocaleLowerCase().includes(query))) continue;
    path.forEach((_, index) => visible.add(path.slice(0, index + 1).join("/")));
  }
  return rows.filter(({ path }) => visible.has(path.join("/")));
}
