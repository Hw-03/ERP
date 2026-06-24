# KpiCard.tsx

## 이 파일은 뭐예요?
모바일 화면의 KPI 지표 하나를 카드 형태로 표시하는 버튼형 컴포넌트입니다. 라벨·수치·컬러 하단 바로 구성되며, 활성화 시 해당 색상으로 배경·테두리를 강조합니다.

## 언제 보나요?
- 모바일 홈이나 대시보드에서 재고 수·요청 건수 등 KPI 지표를 필터 버튼 겸 요약으로 표시할 때
- (현재 실제 소비처 없음 — 모바일 디자인 시스템 예약 primitive)

## 중요한 내용
- `KpiCard({ label, value, color, active?, onClick?, className? })` — `active=true`이면 색상 배경(불투명도 1a) + 컬러 테두리
- `label`: 대문자+자간 1px 작은 캡션, `value`: 큰 숫자(TYPO.display) 굵게
- 하단 `h-[2px]` 가로 바 — 활성: 컬러, 비활성: 컬러 40% 투명
- 데스크톱 대응물 `common/KpiCard.tsx`와 의도적으로 분리 (통합 금지)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
