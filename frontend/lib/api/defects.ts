/**
 * 불량 처리 허브 API — `@/lib/api/defects`.
 * Phase 4 신규. Phase 2 백엔드 API 와 대응.
 */

import { fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  DefectKpi,
  DefectListQuery,
  DefectLocation,
  DefectManagementCategoryRevision,
  DefectManagementCategoryUpdatePayload,
  DefectMemoRevision,
  DefectMemoUpdatePayload,
  DefectMemoUpdateResult,
  DefectStatisticsQuery,
  DefectStatisticsResponse,
  BulkUnquarantinePayload,
  BulkUnquarantineResult,
  QuarantinePayload,
  UnquarantinePayload,
} from "./types/defects";

export const defectsApi = {
  /**
   * 남은 수량이 있는 건별 격리 기록 목록.
   * @param department 부서 필터 (없으면 전체)
   */
  listDefects: (departmentOrQuery?: string | DefectListQuery): Promise<DefectLocation[]> => {
    const params = new URLSearchParams();
    if (typeof departmentOrQuery === "string") params.set("department", departmentOrQuery);
    else if (departmentOrQuery?.management_category) params.set("management_category", departmentOrQuery.management_category);
    const query = params.toString();
    return fetcher<DefectLocation[]>(
      toApiUrl(`/api/defects/locations${query ? `?${query}` : ""}`),
    );
  },

  /**
   * 격리 기록 KPI 카드 2개 카운트.
   */
  getDefectKpi: (query?: DefectListQuery): Promise<DefectKpi> =>
    fetcher<DefectKpi>(toApiUrl(`/api/defects/kpi${query?.management_category ? `?management_category=${query.management_category}` : ""}`)),

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

  unquarantineBulk: (payload: BulkUnquarantinePayload): Promise<BulkUnquarantineResult> =>
    postJson<BulkUnquarantineResult>(toApiUrl("/api/defects/unquarantine/bulk"), payload),

  updateMemo: (recordId: string, payload: DefectMemoUpdatePayload) =>
    putJson<DefectMemoUpdateResult>(
      toApiUrl(`/api/defects/records/${recordId}/memo`),
      payload,
    ),

  getMemoHistory: (recordId: string) =>
    fetcher<DefectMemoRevision[]>(
      toApiUrl(`/api/defects/records/${recordId}/memo-history`),
    ),

  updateManagementCategory: (recordId: string, payload: DefectManagementCategoryUpdatePayload) =>
    putJson<void>(
      toApiUrl(`/api/defects/records/${recordId}/management-category`),
      payload,
    ),

  getManagementCategoryHistory: (recordId: string) =>
    fetcher<DefectManagementCategoryRevision[]>(
      toApiUrl(`/api/defects/records/${recordId}/management-category-history`),
    ),

  getStatistics: (query: DefectStatisticsQuery): Promise<DefectStatisticsResponse> => {
    const params = new URLSearchParams({ period: query.period, anchor: query.anchor });
    query.departments.forEach((value) => params.append("department", value));
    query.models.forEach((value) => params.append("model", value));
    query.process_steps.forEach((value) => params.append("process_step", value));
    return fetcher<DefectStatisticsResponse>(
      toApiUrl(`/api/defects/statistics?${params.toString()}`),
    );
  },
};
