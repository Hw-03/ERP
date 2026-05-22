---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-04-next-split-roadmap.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-04-next-split-roadmap.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-04-next-split-roadmap.md]]

## 원본 첫 줄 (또는 메타)

```
# 다음 분할 로드맵 — 2026-05-04

> **작업 ID:** W10 (Round-2 보완)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 없음 (로드맵 문서)

---

## 1. 목적

Round-1 (9건) + Round-2 (10건) 후 진행 중인 분할 작업이 여러 문서에 흩어져 있다. 본 문서는:

- API 도메인 분리 다음 단계
- DesktopAdminView 후속 컴포넌트 분리
- transactionLabel / transactionColor → mes-status 위임
- 관련 의존성 / 위험도 / PR 순서

를 한 곳에 모은다. PIN 마이그레이션은 별도 (`pin-security-migration-plan.md`).

---

## 2. 분할 트랙 3종

### 2-A. API 도메인 분리 (총 5 PR)
```
