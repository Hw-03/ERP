---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/MOBILE_REDESIGN.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# MOBILE_REDESIGN.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/MOBILE_REDESIGN.md]]

## 원본 첫 줄 (또는 메타)

```
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
