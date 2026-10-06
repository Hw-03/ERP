import { describe, expect, it } from "vitest";
import type { Item, ShippingBomMatchResponse, ShippingRequest } from "@/lib/api";
import {
  buildShippingPayload,
  companionPayload,
  isValidPositiveInt,
  requestBomLines,
  requestCompanionDraft,
  sortShippingDraftLines,
  toPositiveInt,
  validateShippingFinalization,
  type DraftLine,
} from "../request-draft";

const item = (itemId: string, process: string, serialNo: number | null = null): Item => ({
  item_id: itemId,
  process_type_code: process,
  serial_no: serialNo,
  mes_code: itemId,
  unit: "EA",
} as Item);

const match = (overrides: Partial<ShippingBomMatchResponse> = {}): ShippingBomMatchResponse => ({
  base_pf_matches: false,
  pf_candidates: [],
  matched_pa_item_id: null,
  matched_pf_item_id: null,
  matched_pa_item_name: null,
  matched_pf_item_name: null,
  requires_pa_name: true,
  requires_pf_name: true,
  preview_pa_mes_code: null,
  preview_pf_mes_code: null,
  ...overrides,
});

describe("shipping request draft", () => {
  it("hydrates saved BOM and companion lines with stable editing keys", () => {
    const request = {
      bom_lines: [{ line_id: "bom-1", parent_stage: "PA", child_item_id: "af-1", quantity: 2, unit: "EA", included: false, origin: "CUSTOM" }],
      companion_lines: [{ line_id: "comp-1", item_id: "kit-1", quantity: 3, unit: "SET" }],
    } as ShippingRequest;

    expect(requestBomLines(request)).toEqual([{ key: "bom-1", parent_stage: "PA", child_item_id: "af-1", quantity: 2, unit: "EA", included: false, origin: "CUSTOM" }]);
    expect(requestCompanionDraft(request)).toEqual([{ key: "comp-1", item_id: "kit-1", quantity: 3, unit: "SET" }]);
  });

  it("sorts BOM by process department, stage, serial and draft key without mutating input", () => {
    const lines: DraftLine[] = [
      { key: "z", parent_stage: "PF", child_item_id: "v-2", quantity: 1, included: true, origin: "DEFAULT" },
      { key: "b", parent_stage: "PA", child_item_id: "t-2", quantity: 1, included: true, origin: "DEFAULT" },
      { key: "a", parent_stage: "PA", child_item_id: "t-2", quantity: 1, included: true, origin: "DEFAULT" },
      { key: "c", parent_stage: "PA", child_item_id: "t-1", quantity: 1, included: true, origin: "DEFAULT" },
    ];
    const items = new Map([item("v-2", "VA", 1), item("t-2", "TA", 2), item("t-1", "TF", 1)].map((entry) => [entry.item_id, entry]));

    expect(sortShippingDraftLines(lines, items).map((line) => line.key)).toEqual(["c", "a", "b", "z"]);
    expect(lines[0].key).toBe("z");
  });

  it("keeps desktop positive-integer coercion and validation separate", () => {
    expect(toPositiveInt("2.9")).toBe(2);
    expect(toPositiveInt("0")).toBe(1);
    expect(isValidPositiveInt("2.9")).toBe(false);
    expect(isValidPositiveInt("2")).toBe(true);
    expect(isValidPositiveInt(0)).toBe(false);
  });

  it("builds sorted, filtered payload with trimmed fields and fallback units", () => {
    const items = new Map([item("ta-1", "TA"), item("va-1", "VA"), item("kit-1", "PA")].map((entry) => [entry.item_id, entry]));
    const draftLines: DraftLine[] = [
      { key: "v", parent_stage: "PA", child_item_id: "va-1", quantity: 1.5, unit: "", included: true, origin: "DEFAULT" },
      { key: "t", parent_stage: "PA", child_item_id: "ta-1", quantity: 2, unit: "SET", included: false, origin: "CUSTOM" },
      { key: "empty", parent_stage: "PA", child_item_id: "", quantity: 2, unit: "EA", included: true, origin: "CUSTOM" },
    ];

    expect(buildShippingPayload({
      requestQuantity: "3.8",
      invoiceNumber: " INV-1 ",
      requestedBy: " Employee ",
      operatorName: " Operator ",
      isEditing: false,
      customPaName: " PA X ",
      customPfName: " ",
      notes: " note ",
      finalizationMode: "CREATE_NEW",
      reusePfItemId: null,
      companionDraft: [{ key: "c", item_id: "kit-1", quantity: 2.9, unit: "" }],
      draftLines,
      itemById: items,
    })).toEqual({
      request_quantity: 3,
      invoice_number: "INV-1",
      requested_by_name: "Operator",
      custom_pa_name: "PA X",
      custom_pf_name: null,
      notes: "note",
      finalization_mode: "CREATE_NEW",
      reuse_pf_item_id: null,
      companion_lines: [{ item_id: "kit-1", quantity: 2, unit: "EA" }],
      bom_lines: [
        { parent_stage: "PA", child_item_id: "ta-1", quantity: 2, unit: "SET", included: false, origin: "CUSTOM" },
        { parent_stage: "PA", child_item_id: "va-1", quantity: 1.5, unit: "EA", included: true, origin: "DEFAULT" },
      ],
    });
    expect(companionPayload([{ key: "bad", item_id: "kit-1", quantity: 0, unit: "EA" }], items)).toEqual([]);
  });

  it("requires a selected reuse candidate only when BOM does not match", () => {
    const result = validateShippingFinalization({
      matchResult: match({ pf_candidates: [{ pf_item_id: "pf-2", pa_item_id: "pa-2" } as ShippingBomMatchResponse["pf_candidates"][number]] }),
      finalizationMode: "REUSE_CANDIDATE",
      reusePfItemId: null,
      customPaName: "",
      customPfName: "",
    });
    expect(result).toEqual({ mode: "REUSE_CANDIDATE", error: "재사용할 기존 PF 후보를 다시 선택하세요." });
    expect(validateShippingFinalization({
      matchResult: match({ base_pf_matches: true }),
      finalizationMode: "CREATE_NEW",
      reusePfItemId: null,
      customPaName: "",
      customPfName: "",
    })).toEqual({ mode: "KEEP_BASE", error: null });
  });

  it("requires both new names for a newly created PA/PF", () => {
    expect(validateShippingFinalization({
      matchResult: match(),
      finalizationMode: "CREATE_NEW",
      reusePfItemId: null,
      customPaName: " PA ",
      customPfName: " ",
    })).toEqual({ mode: "CREATE_NEW", error: "동일 BOM 후보를 기준으로 새 PF 이름을 입력해야 출하 요청할 수 있습니다." });
  });
});
