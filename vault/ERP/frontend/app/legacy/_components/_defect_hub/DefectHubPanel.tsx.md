# DefectHubPanel.tsx

## 이 파일은 뭐예요?

불량 처리 허브의 최상위 컨테이너 컴포넌트. KPI 카드, 퀵 액션, 필터 바, 부서별 격리 목록을
하나의 패널에 통합하고, [처리] 버튼 클릭 시 품목 종류에 따라 `PaPfDefectWizard` 또는
`RDefectActionModal`로 분기한다. 격리 추가(`AddQuarantineModal`)도 여기서 관리한다.

## 언제 보나요?

- 불량 처리 허브 전체 레이아웃/동작을 파악할 때
- KPI 카드 클릭 필터가 목록에 반영 안 될 때
- 모달 분기 로직(PA/PF vs R)을 수정할 때
- 데이터 로드 시점이나 새로고침(`reloadNonce`) 타이밍을 바꿀 때

## 중요한 내용

### Props

```ts
interface Props {
  defectDeptFilter?: string | null; // 특정 부서만 강제 필터 (창고뷰 등에서 주입)
  currentEmployee: DefectHubEmployee; // { employee_id, name, department }
}
```

### 주요 상태

| 상태 | 타입 | 설명 |
|---|---|---|
| `kpi` | `DefectKpi` | KPI 4개 카운트 |
| `locations` | `DefectLocation[]` | 전체 격리 목록 (서버에서 받은 원본) |
| `scope` | `DefectScope` | `"my"` / `"production"` / `"all"` |
| `sort` | `DefectSort` | `"oldest"` / `"newest"` |
| `kpiFilter` | `DefectKpiKind \| null` | KPI 카드 클릭 시 활성화, 재클릭 시 해제 |
| `processingLocation` | `DefectLocation \| null` | [처리] 버튼 클릭된 항목 |
| `reloadNonce` | `number` | 증가 시 KPI + 목록 재로드 트리거 |

### 핵심 로직

**초기 scope 결정:**
- `defectDeptFilter` 있으면 → `"my"`
- 생산 라인 소속이면 → `"my"`, 그 외 → `"all"`

**목록 필터링 (`useMemo`):**
1. scope에 따라 부서 필터 (`my` → 내 부서, `production` → 6개 라인 전체)
2. KPI 필터 — `over_one_year`만 목록 레벨에서 적용 가능 (나머지 3개는 카운트만 표시)
3. `oldest`/`newest` 정렬

**PA/PF 판별:**
```ts
function isPaPfItem(itemCode: string | null | undefined): boolean {
  const parts = itemCode.split("-");
  return parts[1] === "PA" || parts[1] === "PF";
}
```

**데이터 로드:** `reloadNonce` 변경마다 KPI + 목록을 `Promise.all`로 동시 호출.
처리/격리 완료 후 `reloadNonce`를 +1 하여 자동 갱신.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api/defects.ts]] — `defectsApi.getDefectKpi()`, `defectsApi.listDefects()` 호출
- [[ERP/frontend/app/legacy/_components/_defect_hub/PaPfDefectWizard.tsx]] — PA/PF 처리 위자드
- [[ERP/frontend/app/legacy/_components/_defect_hub/RDefectActionModal.tsx]] — R 타입 처리 모달
- [[ERP/frontend/app/legacy/_components/_defect_hub/AddQuarantineModal.tsx]] — 새 격리 추가 모달

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectKpiCards.tsx]] — KPI 카드 UI
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectQuickActions.tsx]] — 퀵 액션 버튼
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectFilterBar.tsx]] — 범위/정렬 필터
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectDepartmentList.tsx]] — 격리 목록

## 핵심 발췌

```tsx
// 처리 모달 — 품목 종류(R / PA·PF)에 따라 분기
{processingLocation && isPaPfItem(processingLocation.item_code) ? (
  <PaPfDefectWizard
    open
    onClose={() => setProcessingLocation(null)}
    location={processingLocation}
    currentEmployee={currentEmployee}
    onSubmitted={handleModalSubmitted}
  />
) : processingLocation ? (
  <RDefectActionModal
    open
    onClose={() => setProcessingLocation(null)}
    location={processingLocation}
    currentEmployee={currentEmployee}
    onSubmitted={handleModalSubmitted}
  />
) : null}
```
