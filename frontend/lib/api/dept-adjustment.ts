import { fetcher, postJson, toApiUrl } from "../api-core";
import type {
  AdjLineTemplate,
  BomTemplateResponse,
  DeptAdjResult,
  DeptAdjSubType,
  DeptAdjSubmitPayload,
} from "./types/dept-adjustment";

export const deptAdjustmentApi = {
  getBomTemplate: (
    itemId: string,
    subType: DeptAdjSubType,
    quantity = 1,
  ): Promise<BomTemplateResponse> =>
    fetcher<BomTemplateResponse>(
      toApiUrl(
        `/api/dept-adjustment/bom-template?item_id=${itemId}&sub_type=${subType}&quantity=${quantity}`,
      ),
    ),

  expandComponent: (payload: {
    item_id: string;
    quantity: number;
    department: string;
    direction: "in" | "out";
  }): Promise<AdjLineTemplate[]> =>
    postJson<AdjLineTemplate[]>(
      toApiUrl("/api/dept-adjustment/expand-component"),
      payload,
    ),

  submitAdjustment: (payload: DeptAdjSubmitPayload): Promise<DeptAdjResult> =>
    postJson<DeptAdjResult>(
      toApiUrl("/api/dept-adjustment/submit"),
      payload,
    ),
};
