---
type: file-explanation
source_path: "frontend/lib/api/weekly.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# weekly.ts — weekly.ts 설명

## 이 파일은 무엇을 책임지나

`weekly.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `weeklyApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/frontend/lib/api/types/weekly.ts]] — `weekly.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
import { fetcher, toApiUrl } from "../api-core";
import type { WeeklyProductionModelRow, WeeklyReportResponse } from "./types/weekly";

/**
 * production_matrix 숫자 필드 정규화.
 *
 * 백엔드 Pydantic Decimal 은 JSON 에서 문자열("2.0000")로 직렬화되는데 타입은
 * number 로 선언돼 있다. 그대로 두면 `reduce((s,r)=>s+r.total_qty, 0)` 가
 * `0 + "2.0000"` → 문자열 연결로 "총 022.00008.0000…개" 처럼 깨진다.
 * (IoComposeView 의 normalizeBundles 와 동일한 경계-정규화 관례.)
 */
function normalizeMatrix(rows: WeeklyProductionModelRow[]): WeeklyProductionModelRow[] {
  return rows.map((r) => ({
    ...r,
    tf_qty: Number(r.tf_qty) || 0,
    hf_qty: Number(r.hf_qty) || 0,
    vf_qty: Number(r.vf_qty) || 0,
    nf_qty: Number(r.nf_qty) || 0,
    af_qty: Number(r.af_qty) || 0,
    pf_qty: Number(r.pf_qty) || 0,
    total_qty: Number(r.total_qty) || 0,
  }));
}

export const weeklyApi = {
  getWeeklyReport: async (params: { week_start: string; week_end: string }) => {
    const url = toApiUrl(
      `/api/inventory/weekly-report?week_start=${params.week_start}&week_end=${params.week_end}`
    );
    const res = await fetcher<WeeklyReportResponse>(url);
    return { ...res, production_matrix: normalizeMatrix(res.production_matrix ?? []) };
  },
};
```
