# 2026-07-06 좌측 사이드바 탭 전환 flicker/버벅임 수정 핸드오프

## 문서 목적

사용자가 "탭에서 탭으로 이동할 때 화면이 반짝거리면서 랙 걸린다"고 보고해서 시작된 작업의 전체 기록. 근본 원인 조사 → 1차 수정 → 사용자 재검증("내 눈엔 개선 안 됐다") → 2차 범위 확장 → `/goal` 강제 검증 루프로 렌더 비용 자체까지 잡은 과정을 순서대로 남긴다. **작업은 커밋 `7b4db60f`(2026-07-06, origin/main에 푸시 완료)로 이미 반영돼 있다.**

## 배경 — 사용자가 처음 제기한 문제

데스크탑 좌측 사이드바에서 탭을 전환할 때 화면이 반짝이고 잠깐 랙 걸리는 것처럼 보인다는 신고였고, 사용자는 "코드가 무거워져서 그런가?"라는 가설을 제시했다.

## 원인 조사 결과 (번들 무게 가설은 기각)

- 모든 탭 뷰 컴포넌트는 `DesktopMesShell.tsx`에서 이미 최상위 동기 import 돼 있어(9-16행), 탭 전환마다 새로 다운로드/파싱되는 게 아니다 — "코드가 무거워서"라는 가설은 틀렸다.
- `DesktopMesShell.tsx:206-269`의 `content`는 activeTab에 따라 정확히 하나의 뷰만 조건부 렌더링한다. 탭을 바꾸면 컴포넌트 타입 자체가 바뀌므로 React가 이전 뷰를 무조건 언마운트하고 새 인스턴스를 마운트한다 — 이건 아키텍처 본질이라 고치는 대상이 아니다(사용자도 이 전제에 동의, 아래 "범위 밖" 참고).
- 실제 원인은 두 갈래였다:
  1. **데이터 캐싱 부재** — Dashboard/Warehouse/출하/입출고내역 4개 탭이 React Query 캐시 없이 `useState(true)` + `useEffect` + 저수준 API 호출 방식이라, 탭 전환마다(짧은 간격이어도) 매번 새로 fetch하고 로딩 텍스트/스켈레톤이 노출됐다.
  2. **렌더 비용 자체(Long Task)** — 캐싱을 고쳐도 Dashboard 탭은 매번 품목 100개(이미지·게이지·배지 포함, DOM 노드 2000개 이상)를 한 번에 마운트해서 50~90ms 메인스레드 차단이 남아 있었다. 사용자가 "내 눈엔 개선 안 됐다"고 직접 재확인을 요청하면서 이 부분이 드러났다.

## Phase 1 — Dashboard/Warehouse 데이터 캐싱 이관

- `frontend/app/mes/_components/_hooks/useInventoryData.ts` — 내부를 `useItemsQuery`(기존 React Query 훅, `frontend/lib/queries/useItemsQuery.ts`)로 교체. 반환 시그니처(`items, setItems, loading, error, loadItems`)는 그대로 유지해 `DesktopInventoryView.tsx` 등 호출부 무변경.
- `frontend/app/mes/_components/_warehouse_hooks/useWarehouseData.ts` — `items`는 `useItemsQuery`, `employees`는 `useEmployeesQuery`로 교체. `productModels`가 이미 `useModelsQuery`로 통합돼 있던 전례를 그대로 따름.
- `"items"` 커스텀 window 이벤트 리스너는 지우지 않고 핸들러 내용만 `queryClient.invalidateQueries({queryKey: queryKeys.items.all})`로 교체 — admin 품목 수정(`useAdminMasterItemsForm.ts`/`useAdminMasterItemsCommands.ts`, 무변경)이 여전히 Dashboard/Warehouse에 전파되게 함.
- `setItems`류 반환값은 `queryClient.setQueryData(...)`로 위임 — `WarehouseDraftPanelTabs.tsx`, `IoComposeView.tsx`의 기존 `setItems(...)` 호출부 4곳을 무변경으로 유지.
- 신규 테스트: `useInventoryData.test.tsx`, `useWarehouseData.test.tsx` (TDD RED→GREEN, 캐시 히트 시 재요청 없음을 검증하는 게 핵심 회귀 테스트).

## Phase 2 — 출하/입출고내역 데이터 캐싱 이관

Phase 1을 사용자가 직접 실측 재검증하면서, 애초에 조사 대상에서 빠졌던 출하·입출고내역 탭도 같은 문제(캐싱 없는 로딩 플래시)가 있는 걸 발견해서 확장한 범위.

- `frontend/lib/queries/keys.ts` — `shipping` 도메인 키 신규 추가.
- `frontend/lib/queries/useShippingQuery.ts` — 신규. `useShippingRequestsQuery()`. **주의**: `shippingApi`를 `@/lib/api/shipping`에서 직접 import하지 않고 `api`를 `@/lib/api`에서 import — 기존 `DesktopShippingView.test.tsx`가 `vi.mock("@/lib/api", ...)`로 37곳의 `render()`를 모킹하고 있어서, 관례대로 `shippingApi`를 직접 쓰면 그 mock 범위 밖이라 테스트가 실제 네트워크를 타서 깨진다(직접 검증으로 발견한 사항).
- `frontend/app/mes/_components/DesktopShippingView.tsx` — `requests`/`error`/`loading` 3개 `useState`를 훅 + `queryClient` 기반으로 교체. `setError`는 mutation 전용 로컬 state로 남겨서(alias) 기존 `setError(...)` 호출부 20여 곳을 무변경으로 유지.
- `frontend/app/mes/_components/_hooks/useHistoryData.ts` — 내부를 `queryClient.fetchQuery(...)` 기반으로 교체. 반환 시그니처(`logs, setLogs, loading, loadingMore, canLoadMore, loadMore`) 완전 유지 — Desktop/Mobile 양쪽 호출부 무변경. 페이지네이션(`loadMore`/`canLoadMore`)은 `useInfiniteQuery`로 전환하지 않고 로컬 누적 방식 그대로 유지(6개 필터 조합 캐시 무효화가 복잡해지고, 이번 목적(flicker 제거)에 비해 과한 변경이라 판단).
- **직접 검증 중 발견해서 고친 버그**: `useHistoryData`의 최초 구현은 `useEffect`가 항상 `loading:true`부터 시작해서, 캐시가 있어도 한 틱 동안 `loading:true`가 보였다. `useState` lazy init으로 마운트 시점에 캐시를 동기적으로 먼저 확인하도록 고쳐서 "0프레임 깜빡임"으로 만들었다.
- **부수적으로 발견, 이번 범위 밖으로 남긴 것**: 입출고내역 테이블에서 두 그룹이 같은 참조번호(`ref-SHIP-0f577762`)를 공유해 React 리스트 key 충돌 경고가 뜬다 — `HistoryTable.tsx`의 그룹핑 로직 문제, fetch 레이어와 무관, 별도 태스크로 스폰해둠(`task_f4e611e7`, 아직 시작 안 함 — 세션 열려 있으면 카드로 보임).

## Phase 3 — 렌더 비용(Long Task) 자체 최적화

`/goal` 커맨드로 "진짜 버벅임이 없어질 때까지"라는 조건이 걸려서, Phase 1·2로도 안 잡히던 실제 렌더 비용을 마저 잡은 단계.

- 이미 존재했지만 아무 데도 안 쓰이던 `frontend/app/mes/_components/_hooks/useChunkedRender.ts`(청크 단위 지연 렌더링 훅, 테스트만 있고 통합 안 돼 있었음)를 발견해서 재사용.
- `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx` — `displayLimit`(최대 100개)까지 다 그리지 않고 `useChunkedRender(displayedItems, 20)`로 초기 20개만 렌더, 스크롤 시 sentinel(IntersectionObserver)로 이어붙임.
- **직접 브라우저 실측 중 발견해서 고친 진짜 버그**: `filteredItems.slice(0, displayLimit)`를 `useMemo` 없이 넘겼더니, 매 렌더 새 배열 참조가 생겨서 `useChunkedRender`의 "items 참조 바뀌면 리셋" 이펙트가 스크롤로 chunk가 늘어날 때마다 즉시 20개로 되돌려버렸다(청크가 영원히 20개에서 멈춤). `useMemo(() => filteredItems.slice(0, displayLimit), [filteredItems, displayLimit])`로 참조를 고정해서 해결. 회귀 테스트(`InventoryItemsTable.chunked.test.tsx`의 "스크롤로 다음 chunk를 불러온 뒤 무관한 리렌더가 와도 20개로 되돌아가지 않는다")로 고정.
- **환경 한계 확인**: Claude Preview(이 브라우저 자동화 도구) 안에서는 `IntersectionObserver`가 아예 발동하지 않는다 — 화면에 명백히 보이는 요소로 독립 테스트해도 콜백이 안 옴. 실제 사용자 브라우저(Chrome/Edge 등)에서는 표준 API라 정상 동작할 것으로 판단하지만, 이 도구로는 "스크롤로 더 불러오기"의 실제 브라우저 동작을 직접 화면으로는 검증하지 못했다 — 대신 IntersectionObserver 콜백을 수동으로 트리거하는 단위 테스트로 그 로직만 확정했다.

## 검증 결과 (직접 브라우저 반복 측정 기준)

- Dashboard ↔ 다른 탭 전환: 청크 적용 전 100% 발생하던 50~90ms Long Task가, 청크(50→20 축소) + useMemo 버그 수정 후 **26/26회 연속 0건**.
- Warehouse·출하·입출고내역 탭 전환도 각 5회 이상 Long Task 0건(원래도 큰 리스트가 없어서 렌더 비용 자체는 문제 없었음 — Dashboard만 특이했음).
- 출하 탭 내부 "요청 목록" 서브 화면 진입도 확인.
- 전체 프론트 테스트 스위트 **811/811 통과**, TypeScript 클린.
- 과정 중 한 번 807개 중 1개 테스트가 (수동으로 지연시킨 Promise + polling wait 조합의) 시스템 부하성 flaky로 실패했다가 재실행 시 통과 — 결정적 회귀 아님으로 판단.
- 과정 중 `observer.getOptimisticResult is not a function` 런타임 에러를 브라우저에서 봤는데, 조사 결과 여러 번의 핫리로드로 생긴 Next.js Fast Refresh의 일시적 아티팩트였고 새로고침 후 재현 안 됨(실제 버그 아님).

## 커밋 상태

**이미 커밋·푸시 완료**: `7b4db60f` (2026-07-06 09:19:16, `2026-07-06 frontend: 탭 전환 캐시와 목록 렌더링 개선`), `origin/main`에 반영됨. 이 세션이 건드린 파일만 정확히 스코프돼 있다(13개 파일, +1032/-208) — 같은 시간대에 병행되던 다른 세션(품목 전환 관련 `IoComposeView.tsx`/`IoWorkTypeStep.tsx` 등)의 변경과는 섞이지 않았다.

## 다음 세션이 알아야 할 것 / 남은 일

1. **History 테이블 중복 React key 버그** — 위에서 스폰해둔 별도 작업(`task_f4e611e7`)이 아직 시작 전이면 이어서 처리할 것. `HistoryTable.tsx`의 `buildGroups` 그룹핑 로직이 원인 후보.
2. **Warehouse/Shipping/History의 렌더 비용은 확인만 하고 손대지 않음** — 측정상 문제 없었지만, 데이터가 늘어나면(예: 출하 요청이 지금보다 훨씬 많아지면) 같은 종류의 Long Task가 나타날 수 있다. 그때는 Dashboard와 동일하게 `useChunkedRender` 적용을 고려할 것.
3. **IntersectionObserver 기반 "스크롤로 더 불러오기"는 실제 브라우저에서 재확인 권장** — 이 세션에서는 도구 한계로 직접 화면 검증을 못 했다. 실사용자 브라우저(개발자도구 Performance 탭 등)로 한 번 확인해두면 좋다.
4. **재현/검증 방법**(다음에 비슷한 걸 다시 확인하고 싶을 때):
   - Claude Preview로 `frontend`(포트 3001) 띄우고 데스크탑 폭(1280px 이상)으로 고정.
   - `window.fetch` 래핑 + `PerformanceObserver({entryTypes:['longtask']})`로 계측 후 탭을 짧은 간격(300~500ms)으로 반복 전환.
   - 모바일/데스크톱 셸이 CSS로만 숨겨진 채 둘 다 DOM에 렌더되므로(`lg:hidden` 패턴), `querySelectorAll`로 요소를 찾을 땐 반드시 `!!el.offsetParent`로 보이는 것만 걸러야 한다 — 이 세션에서 이 함정에 여러 번 걸렸다.
