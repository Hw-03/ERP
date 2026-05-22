---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-02-execution-queue-draft.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-02-execution-queue-draft.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-02-execution-queue-draft.md]]

## 원본 첫 줄 (또는 메타)

```
# 실행 큐 초안 (35개 백로그 우선순위 재정렬) — 2026-05-02

> **작업 ID:** MES-SAT-06 / P-SAT-06
> **작성일:** 2026-05-02 (토)
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (계획 문서만)

---

## 1. 분류 기준

### 위험도

- **A**: 모바일/문서 — 실수해도 회복 쉬움
- **B**: 프론트 코드 — diff 첨부 필요
- **C**: 백엔드/스키마/프론트+백 동시 — 서버 검증 필요
- **D**: DB 마이그레이션 / PIN / 배포 — 회사 PC 한정

### 임팩트

- **高**: 50~60대 사용자 즉시 체감 / 데이터 무결성 / 인증
- **中**: UI 일관성 / 유지보수성
- **低**: 문서 정합성 / 죽은 코드 정리

### 의존성
```
