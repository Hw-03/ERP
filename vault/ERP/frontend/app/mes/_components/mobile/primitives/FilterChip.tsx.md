# FilterChip.tsx

## 이 파일은 뭐예요?
모바일 전용 필터 칩과 칩 행(row) 컨테이너 primitive입니다. 활성/비활성 상태를 색상으로 구분해 표시하며, 가로 스크롤 가능한 칩 목록을 배치할 때 `FilterChipRow`와 함께 사용합니다.

## 언제 보나요?
- 목록 화면에서 카테고리·상태·부서 등 필터를 탭으로 선택할 때
- 여러 필터 옵션을 가로 스크롤로 나열할 때

## 중요한 내용
- `FilterChip({ label, active, onClick, color?, className? })` — `active=true`이면 지정 색상(기본 `LEGACY_COLORS.blue`)으로 채워짐
- `FilterChipRow({ children, className? })` — `gap-2 overflow-x-auto scrollbar-hide` 가로 스크롤 컨테이너
- 데스크톱 대응물 `common/FilterChip.tsx`와 의도적으로 분리 유지 (통합 금지)
- 현재 실제 소비처는 없으나 모바일 디자인 시스템 예약 primitive

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
