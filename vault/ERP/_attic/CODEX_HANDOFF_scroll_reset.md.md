---
type: file-explanation
source_path: "_attic/CODEX_HANDOFF_scroll_reset.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CODEX_HANDOFF_scroll_reset.md — CODEX_HANDOFF_scroll_reset.md 설명

## 이 파일은 무엇을 책임지나

`CODEX_HANDOFF_scroll_reset.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `핸드오프 — IoTargetPicker 표 스크롤 reset 미해결 (2026-05-14)`
- `한 줄 요약`
- `환경`
- `재현`
- `스크롤 호스트 후보 (계층)`
- `데이터/effect 흐름`
- `시도한 fix 4개 (모두 효과 없음 또는 미검증)`
- `Fix 1: `IoComposeView.useLayoutEffect` — target 외 wrapper 만 reset`
- `Fix 2: height set 값 동일하면 skip`
- `Fix 3: `[data-keep-scroll]` snapshot/restore (부모 useLayoutEffect 안)`

## 연결되는 파일

- [[ERP/_attic/📁__attic]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
```
