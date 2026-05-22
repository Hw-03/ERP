---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/frontend-route-boundary-report.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# frontend-route-boundary-report.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/frontend-route-boundary-report.md]]

## 원본 첫 줄 (또는 메타)

```
# 프론트엔드 라우트 경계 보고서 — 2026-05-04

> **작업 ID:** R3-8
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 분석만. 코드 변경 0.

---

## 1. 결론

10개 route 중:
- **메인 진입 1개** (`app/page.tsx` → `legacy/page.tsx`)
- **활성 sub route 4개** (alerts, counts, queue + legacy)
- **redirect-only 5개** (admin, inventory, history, bom, operations)

redirect-only 5개는 사용자가 옛 북마크 / 외부 링크로 접근 시 정상 안내. **이번 라운드는 삭제 금지** — 향후 외부 링크 갱신 후 별도 PR.

---

## 2. 라우트별 분류

### 2-A. 메인 진입

| 경로 | 본문 | 분류 |
```
