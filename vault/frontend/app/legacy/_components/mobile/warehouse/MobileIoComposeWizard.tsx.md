---
tags:
  - layer/frontend
  - topic/mobile
  - audience/junior
aliases:
  - MobileIoComposeWizard
created: 2026-05-21
---

# MobileIoComposeWizard.tsx

> [!info] 한 줄 요약
> 입출고 작성 모바일 풀스크린 위저드 (5단계). `IoComposeView` 의 데스크탑 레이아웃을 버리고 한 번에 한 스텝만 풀스크린으로 보여준다. 상태·제출·BOM 로직은 데스크탑과 동일한 훅·순수함수 재사용.

## 1. 파일 위치

```
erp/frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx
```

## 2. 책임 (단일 목적)

- 5단계 위저드 진행 (작업유형 → 세부작업 → 대상선택 → 품목확인 → 제출확인)
- 700ms 자동 저장 (bundles 1개 이상 시)
- 제출 전 stale 초안 삭제 → 최종 submit
- 품목 추가(`previewTarget`) → BOM 전개 → normalizeBundles
- 모바일 393px 에서 잘림 없이 완료 가능한 UX

## 3. 5단계 스텝 메타

```ts
// erp/frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx (70-76)
const STEP_META = [
  { key: "1", label: "작업 유형" },
  { key: "2", label: "세부 작업" },
  { key: "3", label: "대상 선택" },
  { key: "4", label: "실제 반영" },
  { key: "5", label: "제출 확인" },
];
```

## 4. 위저드 흐름 다이어그램

```mermaid
flowchart LR
    S1["Step 1<br/>작업 유형 선택<br/>MobileWorkTypeStep"] -->|자동 advance| S2
    S2["Step 2<br/>세부 작업·부서<br/>MobileSubTypeStep"] -->|다음 단계 버튼| S3
    S3["Step 3<br/>대상 선택<br/>IoTargetPicker"] -->|bundles>0 advance| S4
    S4["Step 4<br/>품목 확인<br/>IoBundleCart"] -->|canAdvance[4]| S5
    S5["Step 5<br/>제출 확인<br/>IoConfirmStep"] -->|submit| Done["입출고 반영 완료"]
```

## 5. 자동 저장 로직

```ts
// erp/frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx (146-184)
useEffect(() => {
  if (!employeeId) return;
  if (state.bundles.length === 0) return;
  if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  autosaveTimerRef.current = setTimeout(async () => {
    try {
      const saved = await saveDraft({
        employeeId,
        workType: state.workType,
        ...
        bundles: state.bundles,
      });
      autosaveBatchIdRef.current = saved.batch_id;
      onStatusChange(`자동 저장됨 · ${hh}:${mm}`);
    } catch {
      onStatusChange("자동 저장 실패 — 잠시 후 재시도");
    }
  }, 700);
}, [state.bundles, state.notes, ...]);
```

debounce 700ms. 저장된 `batch_id` 는 submit 전 삭제에 사용.

## 6. Decimal 정규화 패턴

```ts
// erp/frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx (57-68)
function normalizeBundles(bundles: IoBundle[]): IoBundle[] {
  return bundles.map((bundle) => ({
    ...bundle,
    quantity: Number(bundle.quantity),
    lines: bundle.lines.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      shortage: Number(line.shortage),
      bom_expected: line.bom_expected == null ? null : Number(line.bom_expected),
    })),
  }));
}
```

Pydantic Decimal 은 JSON 에서 문자열("1.0000")로 직렬화 → 즉시 `Number()` 변환하지 않으면 stepper 합산이 string concat 으로 깨짐.

## 7. 제출 플로우

```ts
// submit 시작 전 stale 초안 삭제
if (autosaveBatchIdRef.current) {
  await api.deleteDraft(staleId, employeeId);
}
// 실제 submit
const response = await submit({ ... });
// 성공 처리: state.reset() + items 재로드
// 실패 처리: ApiError.isUnavailable 확인 후 메시지 분기
```

## 8. 데스크탑 공유 훅·컴포넌트

| 항목 | 공유 대상 |
|---|---|
| `useIoWorkState` | 작업유형·서브타입·부서·bundles 상태 |
| `useIoPreview` | 품목 → bundles 전개 |
| `useIoDraft` / `useIoSubmit` | 초안 저장 / 최종 제출 |
| `useIoDraftRestore` | 초안 복원 |
| `IoTargetPicker` | 대상 품목 선택 UI |
| `IoBundleCart` | 품목 확인 UI |
| `IoConfirmStep` | 제출 확인 UI |
| `applyBundleQuantityChange` 등 | 순수함수 (bomSync) |

## 9. 하단 고정 버튼 배치 전략

```
Step 1: 자동 advance (버튼 없음)
Step 2: StickyFooter — "다음 단계로 →"
Step 3: IoTargetPicker 내부 advance
Step 4: IoBundleCart 내부 버튼
Step 5: IoConfirmStep 내부 버튼
```

Step 3 은 이중 하단바 방지로 StickyFooter 제외.

## 10. 의존 관계

| 방향 | 대상 |
|---|---|
| 가져옴 | `useIoWorkState`, `useIoPreview`, `useIoDraft`, `useIoSubmit`, `useIoDraftRestore` |
| 가져옴 | `IoTargetPicker`, `IoBundleCart`, `IoConfirmStep`, `IoSubmitModals` (`_warehouse_v2/`) |
| 가져옴 | `MobileWorkTypeStep`, `MobileSubTypeStep` |
| 사용됨 | `MobileWarehouseScreen` → compose 탭 |

## 11. 관련 파일

- `[[erp/frontend/app/legacy/_components/mobile/screens/MobileWarehouseScreen.tsx]]`
- `[[erp/frontend/app/legacy/_components/_warehouse_v2/IoTargetPicker.tsx]]`
- `[[erp/frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts]]`
- `[[erp/backend/app/routers/io.py]]` — preview·submit API
