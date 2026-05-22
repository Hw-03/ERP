# defects.ts

## 이 파일은 뭐예요?

불량 처리 허브 API 클라이언트 모듈. 백엔드 `/api/defects/*` 엔드포인트와 1:1 대응하는
함수 4개를 `defectsApi` 객체로 묶어 제공한다. Phase 4 신규 추가.

## 언제 보나요?

- 불량 API 호출 함수를 추가하거나 수정할 때
- API URL이나 쿼리 파라미터를 바꿀 때
- 새 엔드포인트를 연결할 때

## 중요한 내용

### API 함수 목록

| 함수 | HTTP | 엔드포인트 | 설명 |
|---|---|---|---|
| `listDefects(department?)` | GET | `/api/defects/locations` | 부서별 격리 항목 목록. `department` 없으면 전체 |
| `getDefectKpi()` | GET | `/api/defects/kpi` | KPI 4개 카운트 반환 |
| `quarantine(payload)` | POST | `/api/defects/quarantine` | 즉시 격리 (결재 없음) |
| `unquarantine(payload)` | POST | `/api/defects/unquarantine` | 즉시 정상 복귀 (결재 없음) |

### 사용하는 유틸리티

- `fetcher<T>` — GET 요청 래퍼 (`@/lib/api/api-core`)
- `postJson<T>` — POST JSON 래퍼 (`@/lib/api/api-core`)
- `toApiUrl` — 상대 경로를 절대 URL로 변환

### 결재 필요 작업은 여기 없다

scrap / disassemble 등 결재가 필요한 불량 처리는 `stock-requests.ts`의
`stockRequestsApi.createStockRequest()`를 통해 요청한다.
즉시 처리(격리/복귀)만 이 모듈에 있다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/defects.ts]] — 이 모듈이 사용하는 모든 타입 정의
- [[ERP/backend/app/routers/defects.py]] — 대응하는 백엔드 라우터

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectHubPanel.tsx]] — `listDefects`, `getDefectKpi` 호출
> - [[ERP/frontend/app/legacy/_components/_defect_hub/AddQuarantineModal.tsx]] — `quarantine` 호출
> - [[ERP/frontend/app/legacy/_components/_defect_hub/PaPfDefectWizard.tsx]] — `unquarantine` 호출
> - [[ERP/frontend/app/legacy/_components/_defect_hub/RDefectActionModal.tsx]] — `unquarantine` 호출

## 핵심 발췌

```ts
export const defectsApi = {
  listDefects: (department?: string): Promise<DefectLocation[]> =>
    fetcher<DefectLocation[]>(
      toApiUrl(`/api/defects/locations${department ? `?department=${encodeURIComponent(department)}` : ""}`),
    ),

  getDefectKpi: (): Promise<DefectKpi> =>
    fetcher<DefectKpi>(toApiUrl("/api/defects/kpi")),

  quarantine: (payload: QuarantinePayload): Promise<void> =>
    postJson<void>(toApiUrl("/api/defects/quarantine"), payload),

  unquarantine: (payload: UnquarantinePayload): Promise<void> =>
    postJson<void>(toApiUrl("/api/defects/unquarantine"), payload),
};
```
