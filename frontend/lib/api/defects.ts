/**
 * 불량 처리 허브 API — `@/lib/api/defects`.
 * Phase 4 신규. Phase 2 백엔드 API 와 대응.
 */

import { fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  DefectKpi,
  DefectLocation,
  DefectMemoRevision,
  DefectMemoUpdatePayload,
  DefectMemoUpdateResult,
  QuarantinePayload,
  UnquarantinePayload,
} from "./types/defects";

export const defectsApi = {
  /**
   * 남은 수량이 있는 건별 격리 기록 목록.
   * @param department 부서 필터 (없으면 전체)
   */
  listDefects: (department?: string): Promise<DefectLocation[]> =>
    fetcher<DefectLocation[]>(
      toApiUrl(
        `/api/defects/locations${department ? `?department=${encodeURIComponent(department)}` : ""}`,
      ),
    ),

  /**
   * 격리 기록 KPI 카드 2개 카운트.
   */
  getDefectKpi: (): Promise<DefectKpi> =>
    fetcher<DefectKpi>(toApiUrl("/api/defects/kpi")),

  /**
   * 즉시 격리 (결재 없음).
   */
  quarantine: (payload: QuarantinePayload): Promise<void> =>
    postJson<void>(toApiUrl("/api/defects/quarantine"), payload),

  /**
   * 즉시 정상 복귀 (결재 없음).
   */
  unquarantine: (payload: UnquarantinePayload): Promise<void> =>
    postJson<void>(toApiUrl("/api/defects/unquarantine"), payload),

  updateMemo: (recordId: string, payload: DefectMemoUpdatePayload) =>
    putJson<DefectMemoUpdateResult>(
      toApiUrl(`/api/defects/records/${recordId}/memo`),
      payload,
    ),

  getMemoHistory: (recordId: string) =>
    fetcher<DefectMemoRevision[]>(
      toApiUrl(`/api/defects/records/${recordId}/memo-history`),
    ),
};
