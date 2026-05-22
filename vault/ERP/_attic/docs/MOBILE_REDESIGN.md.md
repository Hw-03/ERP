---
type: file-explanation
source_path: "_attic/docs/MOBILE_REDESIGN.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MOBILE_REDESIGN.md — MOBILE_REDESIGN.md 설명

## 이 파일은 무엇을 책임지나

`MOBILE_REDESIGN.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `모바일 UI 전체 개편 계획`
- `Context`
- `작업 범위 및 파일 목록`
- `Phase 1 — 기반 너비 해제 (2개 파일)`
- `Phase 2 — 화면별 레이아웃 조정 (7개 파일)`
- `Phase 3 — 미구현 기능 완성 (3개 파일)`
- `에이전트 팀 구조`
- `정량적 평가 기준 (VALIDATION_CRITERIA)`
- `Padding 기준`
- `터치 타겟 기준`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 모바일 UI 전체 개편 계획

> 전체 계획 정본: 이 파일 (구현 기준)
> Claude가 goal-driven 방식으로 순서대로 실행하고 자율 검증합니다.

## Context

현재 MES 시스템은 이미 `MobileShell`이 구현되어 있고 (`lg:hidden` ↔ `DesktopLegacyShell lg:flex`로 분리), 대부분의 화면도 구현되어 있다. 하지만 두 가지 문제가 있다:

1. **화면 너비 미활용**: `MobileShell`에 `sm:max-w-[430px]` + `sm:bg-black` 제한이 걸려 있고, 각 화면이 `px-4` 패딩으로 가로 공간을 낭비함
2. **미구현 기능**: 불량 격리("데스크탑 사용" 토스트만), BOM Workbench(`PlaceholderScreen`)

목표: 화면 넓게 활용 + 미구현 기능 2개 완성

---

## 작업 범위 및 파일 목록

### Phase 1 — 기반 너비 해제 (2개 파일)

**변경 파일:**
- `frontend/app/legacy/_components/mobile/MobileShell.tsx`
- `frontend/lib/ui/BottomSheet.tsx`

**변경 내용:**

```
MobileShell.tsx:
  - 최상위 div: sm:bg-black sm:max-w-[430px] sm:shadow-[...] 제거
  - 결과: 어떤 화면 크기에서도 full-width

BottomSheet.tsx:
  - max-w-[430px] → max-w-full (또는 제거)
  - 결과: BottomSheet도 화면 전체 폭 사용
```

---

### Phase 2 — 화면별 레이아웃 조정 (7개 파일)

모든 화면에서 `px-4` → `px-3`, `gap-4` → `gap-3`, `gap-2` → `gap-1.5`로 밀도 향상. 로직 변경 없음.

#### 2-1. HomeScreen
파일: `frontend/app/legacy/_components/mobile/screens/HomeScreen.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 py-4` | `px-3 py-3` |
| `gap-4` (섹션 간) | `gap-3` |
| `QuickActionGrid columns={2}` | `grid-cols-2 sm:grid-cols-4` 반응형 |
| HistoryLogRow `px-4` | `px-3` |

#### 2-2. InventoryScreen
파일: `frontend/app/legacy/_components/mobile/screens/InventoryScreen.tsx`  
파일: `frontend/app/legacy/_components/mobile/screens/_inventory_parts/InventoryStickyHeader.tsx`
```
