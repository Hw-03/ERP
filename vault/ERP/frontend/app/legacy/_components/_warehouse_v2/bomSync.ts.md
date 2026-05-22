---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/bomSync.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bomSync.ts — bomSync.ts 설명

## 이 파일은 무엇을 책임지나

`bomSync.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `applyToggleLine`
- `applyLineQuantityChange`
- `applyBundleQuantityChange`
- `GetAvailable`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
/**
 * 입출고 BOM 비례 동기화 — 순수 함수.
 *
 * IoComposeView 의 IoBundleCart 핸들러(onToggleLine/onQuantityChange/
 * onBundleQuantityChange)에 인라인되어 있던 bundles 재계산 로직을 그대로
 * 추출한 것. 알고리즘은 원본과 바이트 동일하며 부수효과가 없다.
 *
 * getAvailable 은 IoComposeView 클로저(현재 items 의존)이므로 인자로 주입한다.
 */
import type { IoBundle, IoLine, IoSubType } from "./types";
import { exclusionNoteFor, isBomForced } from "./ioWorkType";

type GetAvailable = (line: IoLine) => number | null;

/**
 * 라인 체크 토글. 부모(direct) 토글이면 같은 묶음의 활성 bom_auto 자식도 함께 토글.
 * (IoComposeView onToggleLine 의 setBundles updater 원본)
 */
export function applyToggleLine(
  bundles: IoBundle[],
  bundleId: string,
  lineId: string,
  subType: IoSubType,
  getAvailable: GetAvailable,
): IoBundle[] {
  return bundles.map((bundle) => {
    if (bundle.bundle_id !== bundleId) return bundle;
    const target = bundle.lines.find((l) => l.line_id === lineId);
    if (!target) return bundle;
    const isParentToggle = target.origin === "direct";
    const newIncluded = !target.included;
    return {
      ...bundle,
      lines: bundle.lines.map((line) => {
        const shouldSync =
          line.line_id === lineId ||
          (isParentToggle &&
            line.origin === "bom_auto" &&
            line.bom_expected != null &&
            Number(line.bom_expected) > 0);
        if (!shouldSync) return line;
        const avail = getAvailable(line);
        return {
          ...line,
          included: newIncluded,
          shortage: newIncluded
            ? Math.max(0, line.quantity - (avail ?? line.quantity))
            : 0,
          exclusion_note: exclusionNoteFor(subType, line.origin, newIncluded),
        };
      }),
    };
  });
}
```
