---
type: file-explanation
source_path: "frontend/lib/api/defects.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# defects.ts — defects.ts 설명

## 이 파일은 무엇을 책임지나

`defects.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `defectsApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/defects.py]] — `defects.py`는 `defects` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/frontend/lib/api/types/defects.ts]] — `defects.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * 불량 처리 허브 API — `@/lib/api/defects`.
 * Phase 4 신규. Phase 2 백엔드 API 와 대응.
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type { DefectKpi, DefectLocation, QuarantinePayload, UnquarantinePayload } from "./types/defects";

export const defectsApi = {
  /**
   * 부서·아이템별 DEFECTIVE 목록.
   * @param department 부서 필터 (없으면 전체)
   */
  listDefects: (department?: string): Promise<DefectLocation[]> =>
    fetcher<DefectLocation[]>(
      toApiUrl(
        `/api/defects/locations${department ? `?department=${encodeURIComponent(department)}` : ""}`,
      ),
    ),

  /**
   * KPI 카드 4개 카운트.
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
};
```
