# DesktopMesShell.tsx

## 이 파일은 뭐예요?
데스크톱 전체 레이아웃의 루트 컴포넌트입니다. 사이드바 + 상단바 + 탭별 콘텐츠 영역을 조합하고, 탭 전환·URL 동기화·상태바 메시지·생산 가능 수량 모달을 관리합니다.

## 언제 보나요?
- 화면 너비 `lg(1024px)` 이상에서 MES에 접근할 때 (`hidden lg:flex`로 모바일에선 숨김)

## 중요한 내용
- **탭 목록** (`DesktopTabId`): `dashboard`, `warehouse`, `warehouseMap`, `defect`, `history`, `weekly`, `admin`
- `activeTab` ↔ URL `?tab=` 양방향 동기화 (Next.js `useRouter` + `useSearchParams`)
- `DirtyGuardProvider` — 입출고·관리자 폼 수정 중 탭 이탈 시 확인 다이얼로그 (`useConfirmNavigation`)
- `handleStatusChange` — 상태바 메시지. 오류/경고는 3초 후 기본 메시지로 자동 복귀, 실패 키워드 포함 시 고정
- `refreshNonce` — 같은 탭 재클릭 시 리마운트 트리거 (admin 제외)
- `warehousePreselected / warehouseIntent` — 대시보드에서 품목 클릭 → 입출고 탭으로 품목 미리 선택 이동
- `?defect_dept=` 쿼리 파라미터 — 알림 클릭으로 불량 탭 특정 부서 필터 진입
- `content` — `useMemo`로 탭별 컴포넌트 최소 재렌더

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopSidebar.tsx]] — 탭 내비게이션 사이드바
- [[ERP/frontend/app/mes/_components/DesktopTopbar.tsx]] — 상단 타이틀·상태바·알림
- [[ERP/frontend/app/mes/_components/CapacityDetailModal.tsx]] — 생산 가능 수량 상세 모달
- [[ERP/frontend/lib/ui/dirty-guard.tsx]] — `DirtyGuardProvider`, `useConfirmNavigation`
