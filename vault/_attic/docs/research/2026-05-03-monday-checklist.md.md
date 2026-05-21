---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-03-monday-checklist.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-03-monday-checklist.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-03-monday-checklist.md]]

## 원본 첫 줄 (또는 메타)

```
# 월요일 회사 PC 첫 진입 체크리스트 — 2026-05-03

> **작업 ID:** MES-QA-002
> **작성일:** 2026-05-03 (일)
> **대상:** 2026-05-04 (월요일) 회사 PC 첫 작업
> **기준 브랜치:** `feat/hardening-roadmap` (단일)
> **수정 여부:** 없음 (체크리스트만)

---

## 0. 출근 직후 5분 — 환경 동기화

```bash
cd C:/ERP

# 1) 원격 최신 가져오기
git fetch origin

# 2) 로컬 변경 없는지
git status

# 3) 작업 브랜치로 이동
git checkout feat/hardening-roadmap
git pull origin feat/hardening-roadmap

```
