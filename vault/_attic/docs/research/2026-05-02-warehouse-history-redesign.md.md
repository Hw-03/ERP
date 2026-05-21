---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-02-warehouse-history-redesign.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-02-warehouse-history-redesign.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-02-warehouse-history-redesign.md]]

## 원본 첫 줄 (또는 메타)

```
# 입출고·내역 화면 재설계 — 2026-05-02

> **작업 ID:** MES-WAREHOUSE-001~002, MES-HISTORY-001~002  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (설계 문서만)

---

## MES-WAREHOUSE-001 — 입출고 화면 동선 개선안

### 현재 WorkType → 50~60대 용어 매핑

| WorkType (코드) | 현재 레이블 | 개선 레이블 | 이유 |
|---|---|---|---|
| `raw-io` | 원자재 입출고 | **창고 입고 / 출고** | "원자재" 는 현장에서 안 씀 |
| `warehouse-io` | 창고 이동 | **창고 ↔ 부서 이동** | 방향 명확화 |
| `dept-io` | 부서 입출고 | **부서 입고 / 부서 출고** | 부서 기준임을 강조 |
| `package-out` | 패키지 출고 | **묶음 출고** | 더 짧고 직관적 |
| `defective-register` | 불량 등록 | **불량 격리** | 격리 행위 강조 |

### 개선된 위저드 흐름 (5단계 → 4단계)

```
현재:  [직원선택] → [작업유형] → [품목+수량] → [확인] → [완료]
```
