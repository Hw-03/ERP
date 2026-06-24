# historyTheme.ts

## 이 파일은 뭐예요?
입출고 내역 화면의 시각적 테마 상수를 정의합니다. 거래 타입별 행 배경 tint 함수와 공정 타입 코드(TR/TA/TF 등 18종)별 라벨·색·배경 맵이 들어있습니다.

## 언제 보나요?
- `HistoryDetailPanel`에서 `PROCESS_TYPE_META`로 공정 타입 배지 색을 결정할 때
- `rowTint`는 현재 직접 소비하는 컴포넌트 확인 필요 (historyShared에서 추출됐으며 레거시 경로)

## 중요한 내용
- `export function rowTint(type: string): string` — 거래 타입별 행 배경 rgba 색상 (RECEIVE/PRODUCE=초록, SHIP/BACKFLUSH=빨강, ADJUST=파랑, TRANSFER 계열=청록)
- `export const PROCESS_TYPE_META: Record<string, { label, color, bg }>` — 18종 공정 타입 코드(TR·TA·TF·HR·HA·HF·VR·VA·VF·NR·NA·NF·AR·AA·AF·PR·PA·PF)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx]] — `PROCESS_TYPE_META` 소비
