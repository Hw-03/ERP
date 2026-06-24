# MoreMenuRow.tsx

## 이 파일은 뭐예요?
"더보기(More)" 탭 화면에서 각 메뉴 항목을 표시하는 행 컴포넌트입니다. 아이콘·라벨·설명·뱃지·오른쪽 화살표를 가진 버튼 형태로, `MobileMoreScreen`에서 각 기능 진입점을 나열할 때 사용합니다.

## 언제 보나요?
- 모바일 "더보기" 탭에서 주간보고·인수인계·창고 관리 등 메뉴를 나열할 때
- 설정이나 보조 기능의 진입점 목록을 만들 때

## 중요한 내용
- `MoreMenuRow({ icon, label, description?, badge?, tone?, onClick, disabled?, className? })` — `icon`은 `LucideIcon`
- `tone` 미지정 시 `LEGACY_COLORS.blue`가 기본 accent 색상
- `badge`가 있으면 우측에 accent 색 배경의 pill 뱃지 표시
- 우측 끝에 `ChevronRight` 아이콘 고정
- `disabled=true`이면 opacity-40 + 버튼 비활성화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
