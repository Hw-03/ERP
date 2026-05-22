---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/CODEX_HANDOFF_scroll_reset.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# CODEX_HANDOFF_scroll_reset.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/CODEX_HANDOFF_scroll_reset.md]]

## 원본 첫 줄 (또는 메타)

```
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

```
