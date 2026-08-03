# 핸드오프 — IoTargetPicker 표 스크롤 reset 미해결 (2026-05-14)

## 한 줄 요약

3단계 부품 선택 화면(`IoTargetPicker`)에서 BOM/낱개 버튼을 누르면 내부 표의 스크롤이 매번 맨 위로 튐. **첫 클릭과 그 이후 클릭 모두 동일하게 발생**. 추측 기반 fix 4번 시도했으나 사용자 환경에서 여전히 발생. 실제 환경 DOM 인스펙트가 필요.

## 환경

- branch: `feat/ui-redesign`
- 핵심 파일: `frontend/app/legacy/_components/_warehouse_v2/`
  - `IoTargetPicker.tsx` (표 + 결과 영역)
  - `IoComposeView.tsx` (step 1~5 위저드 부모, height 동적 조정)
- React 19 / Next.js 14
- 데스크탑 (`DesktopWarehouseView` 경유, 모바일 무관)

## 재현

1. 입출고 작성 (예: 작업타입 "생산", 부서 출고 등 `actionMode === "bom_or_single"` 케이스)
2. step 1 → 2 → 3 진입
3. 3단계 표를 아래로 스크롤
4. 임의 부품의 BOM 또는 낱개 버튼 클릭
5. → 표 스크롤이 맨 위로

## 스크롤 호스트 후보 (계층)

1. `DesktopWarehouseView` 의 `<div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4">` — **외부 페이지 스크롤**
2. `IoComposeView` 의 step wrapper 들(`stepRefs.current[1..5]`) — `useLayoutEffect` 가 동적 height 부여
3. step 3 wrapper 안의 `IoTargetPicker` 의 `<div data-keep-scroll className="scrollbar-hide min-h-0 flex-1 overflow-y-auto ...">` — **사용자가 reset 된다고 보고한 내부 표 스크롤**

사용자 보고: "표 안 스크롤" 이라 했으나 3번이 맞는지 1번 가능성도 배제 못 함. **첫 진단 시 DOM 으로 확인 필요**.

## 데이터/effect 흐름

```
사용자 클릭 → onAdd(item, sourceKind?)
  → IoComposeView.addItem (async)
    → api.previewTarget (await)
    → state.setBundles(prev => [...prev, ...])
  → 부모 IoComposeView 리렌더
    → 자식 IoTargetPicker / IoBundleCart 리렌더
      → 자식 useLayoutEffect (먼저 실행)
    → 부모 useLayoutEffect (deps [step, state.bundles.length])
    → paint
    → 자식 useEffect (deps [bundles])
    → 부모 useEffect
```

## 시도한 fix 4개 (모두 효과 없음 또는 미검증)

### Fix 1: `IoComposeView.useLayoutEffect` — target 외 wrapper 만 reset
[IoComposeView.tsx](frontend/app/legacy/_components/_warehouse_v2/IoComposeView.tsx) L382-L513
- 기존: 매 호출마다 **모든** wrapper 의 `style.height = ""` / `minHeight = ""` reset 후 newHeight set
- 변경: target step(현재 step) 외 wrapper 만 reset (target 은 곧 새 값으로 덮어쓰니 reset 불필요)
- 가설: reset→set 사이 step 3 wrapper 가 자연 높이로 잠시 줄어들어 내부 표 컨테이너 `maxScrollTop` 가 작아짐 → 브라우저가 `scrollTop` 을 clamp
- **결과: 사용자 환경에서 효과 없음**

### Fix 2: height set 값 동일하면 skip
- `if (wrapper.style.height !== next) wrapper.style.height = next;`
- `bundles.length` 가 1→2→3 처럼 변할 때는 newHeight 동일이라 DOM 변경 0
- **결과: 효과 없음**

### Fix 3: `[data-keep-scroll]` snapshot/restore (부모 useLayoutEffect 안)
- useLayoutEffect 진입 직후 자손 `[data-keep-scroll]` 노드의 `scrollTop` snapshot
- height 조정 후 마지막에 복원
- `IoTargetPicker` 결과 영역 div 에 `data-keep-scroll` 마커
- **결과: 효과 없음**

### Fix 4: `IoTargetPicker` 자체 useEffect 복원
[IoTargetPicker.tsx](frontend/app/legacy/_components/_warehouse_v2/IoTargetPicker.tsx)
- `tableContainerRef` + `scrollPosRef` + `onScroll` 핸들러
- `useEffect(() => { el.scrollTop = scrollPosRef.current; }, [bundles])`
- useEffect 가 paint 후 + 부모 useLayoutEffect 후에 실행되어 마지막 보정
- **결과: 미검증** (사용자가 검증 전에 코덱스 핸드오프 결정)

## 가설 (검증 필요)

### H1. 사용자가 본 reset 호스트가 외부 페이지인가, 내부 표인가
F12 → Elements → 두 컨테이너 모두에 `data-test-scrolltop` 같은 마커 두고 console 에서 비교, 또는 직접 `$0.scrollTop` 으로 확인. 외부면 step 변경 useEffect(L515) 가 의심.

### H2. 자동 advance 가 매번 trigger 되는지
`addItem` 후 어떤 조건에서 step 3 → 4 자동 advance 가 일어나면 L515 의 useEffect 가 외부 컨테이너 scroll 조정. `state.canAdvance` / `state.goNext` / `programmaticAdvanceRef` 흐름 확인. 첫 부품(bundles 0→1) 외에 자동 advance 가 일어날 이유 코드상 없어 보이나 확인 필요.

### H3. `IoTargetPicker` 가 unmount/remount 되는지
부모가 어떤 조건에서 IoTargetPicker 의 key 를 바꾸거나 conditional 렌더하면 `useState(displayLimit)` 가 reset 되며 표 contentHeight 줄어듦 → maxScrollTop clamp.
- `WizardStepCard` 의 `fill` prop 변경이 내부 자식을 unmount 시키는지 확인 필요.

### H4. 부모 useLayoutEffect snapshot 시점에 이미 scrollTop=0
- 자식 useLayoutEffect 또는 layout effect 가 부모보다 먼저 실행되면서 그 안에서 layout 흔듦 → maxScrollTop 줄어듦 → 브라우저 clamp → 부모 snapshot 시 이미 0
- 부모 restore=0 이라 의미 없음
- 검증: snapshot 직전 `console.log(el.scrollTop)`

### H5. scrollPosRef 가 0 상태로 유지되는 경우
- Fix 4 가 작동하려면 사용자가 직접 휠 스크롤 → `onScroll` 발화 → ref 갱신이 선행되어야 함
- 만약 표가 자동으로 스크롤 위치 변경되었거나 (예: programmatic) 사용자 휠 없이 위치 이동했다면 ref=0
- 검증: `onScroll` 안에 `console.log(scrollPosRef.current)` 추가

## 추천 다음 단계 (우선순위 순)

1. **DOM 인스펙트로 호스트 확정 (H1)** — 외부냐 내부냐가 진단의 분기점
2. **instrumentation** — 아래 코드 임시 삽입 후 사용자에게 console 로그 받기
   ```ts
   // IoComposeView useLayoutEffect 진입 시
   const allElems = [...stepRefs.current[3]?.querySelectorAll('[data-keep-scroll]') ?? []];
   console.log('[parent useLayoutEffect entry]', allElems.map(el => el.scrollTop));
   // 부모 useLayoutEffect 끝부분
   console.log('[parent useLayoutEffect exit]', allElems.map(el => el.scrollTop));
   // IoTargetPicker useEffect
   console.log('[child useEffect]', { stored: scrollPosRef.current, current: tableContainerRef.current?.scrollTop });
   // IoTargetPicker onScroll
   console.log('[onScroll]', e.currentTarget.scrollTop);
   ```
3. **최소 재현**: Fix 1,2,3 모두 롤백 후 Fix 4 만 남겨서 차이 비교
4. **근본 다른 접근**: 표 컨테이너의 자체 `overflow-y-auto` 제거하고 외부 페이지 스크롤로 통합. 헤더 sticky 등 시각 영향만 별도 검토.
5. **CSS 차원**: `overflow-anchor: none` 추가해서 브라우저 anchor 동작 차단도 실험 가치 있음

## 현재 코드 상태 (uncommitted)

`git status` 기준 (feat/ui-redesign 브랜치, main 과 diff):

### 직전 세션 작업 (커밋 안 됨)
- `IoBundleCard.tsx` — BOM 부모 라인을 헤더 스테퍼로 통합 + 자식 라인 접기/펼치기 (기본 접힘)
- `IoConfirmStep.tsx` — 묶음 단위 카드 + 1단 세로 레이아웃 + 단품은 한 줄 카드 + BOM 묶음 접기
- `IoTargetPicker.tsx` — 비-process(`bom_or_single`) 분기에 BOM/낱개 상호 잠금 추가
- `IoComposeView.tsx` — 직전 PR 의 위저드 카드 동적 높이 보정

### 이번 스크롤 이슈 시도 (커밋 안 됨, 위 4개 fix 모두)
- `IoComposeView.tsx` — Fix 1, 2, 3 적용
- `IoTargetPicker.tsx` — Fix 3 의 `data-keep-scroll` 마커 + Fix 4 의 ref/onScroll/useEffect

만약 코덱스가 깨끗한 베이스에서 시작하려면, 위 8개 변경(직전 세션 + 스크롤 fix) 을 별도 stash 또는 branch 로 분리하고 main 에서부터 다시 진단하는 게 빠를 수도 있음. 또는 현재 상태에서 instrumentation 부터 들어가도 됨.

## 참고

- 사용자 환경: Windows 11, Chrome (스크린샷 기준), 화면 해상도 추정 ~1920×1080
- 사용자 진단 능력: F12 DOM 인스펙트 가능. "스크롤이 맨 위로 돌아감" 보고한 경험 있음.
- 사용자 선호: 한국어, 결과 중심 짧은 보고, 변경 후 수동 확인
- 프로젝트 가이드: `CLAUDE.md` 참조 (`docs < live code`, "no auto commit" 등)
