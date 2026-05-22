---
type: file-explanation
source_path: "frontend/lib/api/admin.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# admin.ts — admin.ts 설명

## 이 파일은 무엇을 책임지나

`admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `adminApi`
- `AuditCsvFile`
- `AuditCsvBackfillResult`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Admin / Settings 도메인 API — `@/lib/api/admin`.
 *
 * Round-6 (R6-D3) 분리. 3 메소드:
 *   - verifyAdminPin / updateAdminPin / resetDatabase
 */

import { fetcher, postJson, putJson, toApiUrl } from "../api-core";

export interface AuditCsvFile {
  month: string;
  file_name: string;
  size_bytes: number;
  row_count: number;
}

export interface AuditCsvBackfillResult {
  total_rows: number;
  months: string[];
}

export const adminApi = {
  verifyAdminPin: (pin: string) =>
    postJson<{ message: string }>(toApiUrl("/api/settings/verify-pin"), { pin }),

  resetDatabase: (pin: string) =>
    postJson<{ message: string }>(toApiUrl("/api/settings/reset"), { pin }),

  updateAdminPin: (payload: { current_pin: string; new_pin: string }) =>
    putJson<{ message: string }>(toApiUrl("/api/settings/admin-pin"), payload),

  listAuditCsvFiles: () =>
    fetcher<AuditCsvFile[]>(toApiUrl("/api/admin/audit-csv/files")),

  auditCsvDownloadUrl: (month: string) =>
    toApiUrl(`/api/admin/audit-csv/${month}.csv`),

  auditXlsxDownloadUrl: (month: string) =>
    toApiUrl(`/api/admin/audit-csv/${month}.xlsx`),

  triggerAuditCsvBackfill: () =>
    postJson<AuditCsvBackfillResult>(toApiUrl("/api/admin/audit-csv/backfill")),
};
```
