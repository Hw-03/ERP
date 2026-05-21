---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-03-static-verification.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-03-static-verification.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-03-static-verification.md]]

## 원본 첫 줄 (또는 메타)

```
# 정적 검증 명령 모음 — 2026-05-03

> **작업 ID:** MES-QA-001
> **작성일:** 2026-05-03 (일)
> **목적:** 회사 PC 첫 진입 시 코드 변경 없이 실행할 수 있는 검증 스크립트 모음
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (명령 목록만)

---

## 1. 사전 점검 (월요일 출근 직후 5분)

```bash
# 1) 브랜치 상태
cd /c/ERP && git status && git log --oneline -10

# 2) 원격 동기화 확인
git fetch origin && git log --oneline HEAD..origin/feat/hardening-roadmap

# 3) 작업 트리 깨끗한지
git diff --stat
```

**기대 결과:**
- 현재 브랜치 `feat/hardening-roadmap`
```
