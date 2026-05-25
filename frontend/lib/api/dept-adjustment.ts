import { fetcher, postJson, toApiUrl, toNumber } from "../api-core";
import type {
  AdjLineTemplate,
  BomTemplateResponse,
  DeptAdjResult,
  DeptAdjSubType,
  DeptAdjSubmitPayload,
} from "./types/dept-adjustment";

/**
 * AdjLineTemplate 의 수치 필드(Decimal → string) 를 number 로 정규화.
 * 백엔드 Pydantic v2 가 Decimal 을 "2.00" 같은 string 으로 직렬화 → 프론트가 그대로 input value 에
 * 박으면 소수점이 노출되는 결함을 차단. 모든 응답 파싱 직후 강제 호출.
 */
function normalizeAdjLine(line: AdjLineTemplate): AdjLineTemplate {
  return {
    ...line,
    quantity: toNumber(line.quantity),
    bom_expected: line.bom_expected == null ? null : toNumber(line.bom_expected),
  };
}

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
    ).then((res) => ({ ...res, lines: res.lines.map(normalizeAdjLine) })),

  expandComponent: (payload: {
    item_id: string;
    quantity: number;
    department: string;
    direction: "in" | "out";
  }): Promise<AdjLineTemplate[]> =>
    postJson<AdjLineTemplate[]>(
      toApiUrl("/api/dept-adjustment/expand-component"),
      payload,
    ).then((arr) => arr.map(normalizeAdjLine)),

  submitAdjustment: (payload: DeptAdjSubmitPayload): Promise<DeptAdjResult> =>
    postJson<DeptAdjResult>(
      toApiUrl("/api/dept-adjustment/submit"),
      payload,
    ),
};
