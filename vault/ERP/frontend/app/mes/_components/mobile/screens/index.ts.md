# index.ts

## 이 파일은 뭐예요?
`screens/` 폴더의 공개 export 배럴 파일. `MobileDashboardScreen`, `MobileWarehouseScreen`, `MobileDefectScreen`, `MobileHistoryScreen`, `MobileWeeklyScreen`, `MobileWarehouseMapScreen`, `MobileMoreScreen` 7개 화면 컴포넌트를 단일 진입점으로 re-export한다.

## 언제 보나요?
- `MobileShell`이나 다른 상위 컴포넌트가 모바일 화면을 import할 때

## 중요한 내용
- 7개 화면 컴포넌트가 모두 named export로 노출됨
- `MobileDefectCartFlow`, `MobileDefectProcessPanel`은 이 배럴에서 export되지 않음(각 파일 직접 import 필요)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 배럴을 소비하는 셸
