import type {
  Item,
  ShippingBomLineInput,
  ShippingBomMatchResponse,
  ShippingCompanionLineInput,
  ShippingFinalizationMode,
  ShippingRequest,
  ShippingRequestUpdatePayload,
} from "@/lib/api";

export type DraftLine = ShippingBomLineInput & { key: string; included: boolean; origin: "DEFAULT" | "CUSTOM"; initialQuantity?: number };
export type CompanionDraftLine = { key: string; item_id: string; quantity: number; unit: string };

export interface ShippingPayloadInput {
  requestQuantity: string | number;
  invoiceNumber: string;
  requestedBy: string;
  operatorName?: string | null;
  isEditing: boolean;
  customPaName: string;
  customPfName: string;
  notes: string;
  finalizationMode: ShippingFinalizationMode;
  reusePfItemId: string | null;
  companionDraft: CompanionDraftLine[];
  draftLines: DraftLine[];
  itemById: Map<string, Item>;
}

export type ShippingDraftPayload = ShippingRequestUpdatePayload & {
  bom_lines: ShippingBomLineInput[];
  companion_lines: ShippingCompanionLineInput[];
};

export interface ShippingFinalizationInput {
  matchResult: ShippingBomMatchResponse;
  finalizationMode: ShippingFinalizationMode;
  reusePfItemId: string | null;
  customPaName: string;
  customPfName: string;
}

export interface ShippingFinalizationValidation {
  mode: ShippingFinalizationMode;
  error: string | null;
}

export function lineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toPositiveInt(value: string | number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 1 ? number : 1;
}

export function isValidPositiveInt(value: string | number): boolean {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1;
}

const SHIPPING_BOM_DEPARTMENT_ORDER: Record<string, number> = { T: 0, H: 1, V: 2, N: 3, A: 4, P: 5 };
const SHIPPING_BOM_STAGE_ORDER: Record<string, number> = { F: 0, A: 1, R: 2 };

function compareShippingBomItems(left: Item | undefined, right: Item | undefined): number {
  const leftProcess = left?.process_type_code ?? "";
  const rightProcess = right?.process_type_code ?? "";
  const department = (SHIPPING_BOM_DEPARTMENT_ORDER[leftProcess[0]] ?? Object.keys(SHIPPING_BOM_DEPARTMENT_ORDER).length)
    - (SHIPPING_BOM_DEPARTMENT_ORDER[rightProcess[0]] ?? Object.keys(SHIPPING_BOM_DEPARTMENT_ORDER).length);
  if (department !== 0) return department;

  const stage = (SHIPPING_BOM_STAGE_ORDER[leftProcess[1]] ?? Object.keys(SHIPPING_BOM_STAGE_ORDER).length)
    - (SHIPPING_BOM_STAGE_ORDER[rightProcess[1]] ?? Object.keys(SHIPPING_BOM_STAGE_ORDER).length);
  if (stage !== 0) return stage;

  const leftSerial = left?.serial_no;
  const rightSerial = right?.serial_no;
  if (leftSerial === null || leftSerial === undefined) {
    if (rightSerial !== null && rightSerial !== undefined) return 1;
  } else if (rightSerial === null || rightSerial === undefined) {
    return -1;
  } else if (leftSerial !== rightSerial) {
    return leftSerial - rightSerial;
  }

  const leftCode = left?.mes_code;
  const rightCode = right?.mes_code;
  if (!leftCode && rightCode) return 1;
  if (leftCode && !rightCode) return -1;
  if (leftCode && rightCode) {
    const code = leftCode.localeCompare(rightCode);
    if (code !== 0) return code;
  }
  return (left?.item_id ?? "").localeCompare(right?.item_id ?? "");
}

export function sortShippingDraftLines(lines: DraftLine[], itemById: Map<string, Item>): DraftLine[] {
  return [...lines].sort((left, right) => {
    const itemOrder = compareShippingBomItems(itemById.get(left.child_item_id), itemById.get(right.child_item_id));
    if (itemOrder !== 0) return itemOrder;
    return left.key.localeCompare(right.key);
  });
}

export function requestBomLines(request: ShippingRequest): DraftLine[] {
  return request.bom_lines.map((line) => ({
    key: line.line_id,
    parent_stage: line.parent_stage,
    child_item_id: line.child_item_id,
    quantity: line.quantity,
    unit: line.unit,
    included: line.included,
    origin: line.origin,
  }));
}

export function requestCompanionDraft(request: ShippingRequest): CompanionDraftLine[] {
  return request.companion_lines.map((line) => ({
    key: line.line_id ?? `companion-${line.item_id}`,
    item_id: line.item_id,
    quantity: line.quantity,
    unit: line.unit,
  }));
}

export function companionPayload(lines: CompanionDraftLine[], itemById: Map<string, Item>): ShippingCompanionLineInput[] {
  return lines
    .filter((line) => line.item_id && Number(line.quantity) > 0)
    .map((line) => ({
      item_id: line.item_id,
      quantity: toPositiveInt(line.quantity),
      unit: line.unit || itemById.get(line.item_id)?.unit || "EA",
    }));
}

export function buildShippingPayload(input: ShippingPayloadInput): ShippingDraftPayload {
  return {
    request_quantity: toPositiveInt(input.requestQuantity),
    invoice_number: input.invoiceNumber.trim() || null,
    requested_by_name: (input.isEditing ? input.requestedBy.trim() : input.operatorName?.trim() || input.requestedBy.trim()) || null,
    custom_pa_name: input.customPaName.trim() || null,
    custom_pf_name: input.customPfName.trim() || null,
    notes: input.notes.trim() || null,
    finalization_mode: input.finalizationMode,
    reuse_pf_item_id: input.reusePfItemId,
    companion_lines: companionPayload(input.companionDraft, input.itemById),
    bom_lines: sortShippingDraftLines(input.draftLines, input.itemById)
      .filter((line) => line.child_item_id && Number(line.quantity) > 0)
      .map((line) => ({
        parent_stage: line.parent_stage,
        child_item_id: line.child_item_id,
        quantity: Number(line.quantity),
        unit: line.unit || input.itemById.get(line.child_item_id)?.unit || "EA",
        included: line.included,
        origin: line.origin,
      })),
  };
}

export function validateShippingFinalization(input: ShippingFinalizationInput): ShippingFinalizationValidation {
  const { matchResult, finalizationMode, reusePfItemId, customPaName, customPfName } = input;
  const usesCandidateSelection = matchResult.base_pf_matches !== undefined;
  const mode = matchResult.base_pf_matches ? "KEEP_BASE" : finalizationMode;
  const selectedCandidate = matchResult.pf_candidates?.find((candidate) => candidate.pf_item_id === reusePfItemId);
  if (usesCandidateSelection && !matchResult.base_pf_matches && mode === "REUSE_CANDIDATE" && !selectedCandidate) {
    return { mode, error: "재사용할 기존 PF 후보를 다시 선택하세요." };
  }

  const missingPaName = usesCandidateSelection
    ? !matchResult.base_pf_matches && mode === "CREATE_NEW" && !customPaName.trim()
    : matchResult.requires_pa_name && !customPaName.trim();
  const missingPfName = usesCandidateSelection
    ? !matchResult.base_pf_matches && mode === "CREATE_NEW" && !customPfName.trim()
    : matchResult.requires_pf_name && !customPfName.trim();
  if (missingPaName || missingPfName) {
    const required = [missingPaName ? "PA" : null, missingPfName ? "PF" : null].filter(Boolean).join("/");
    return { mode, error: `동일 BOM 후보를 기준으로 새 ${required} 이름을 입력해야 출하 요청할 수 있습니다.` };
  }
  return { mode, error: null };
}
