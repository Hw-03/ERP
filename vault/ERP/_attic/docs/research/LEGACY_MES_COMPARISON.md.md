---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/LEGACY_MES_COMPARISON.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# LEGACY_MES_COMPARISON.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/LEGACY_MES_COMPARISON.md]]

## 원본 첫 줄 (또는 메타)

```
# 기존 MES vs 현재 MES 비교 분석 보고서

> **작성일**: 2026-04-27
> **목적**: 참고용 인지 자료 (현 프로젝트에 즉시 반영 X)
> **분석 대상**:
> - **기존 MES**: 덱스코윈 SF-TI3 MES (V1.1, 2022-02-21 매뉴얼 기준)
> - **현재 MES**: 본 프로젝트 (FastAPI + Next.js, 2026-04 시점)
> **출처 자료**: `data/MES  관련/12.SF-TI3_매뉴얼_사용자설명서_덱스코윈_V1.1_20220221.pptx` (114 슬라이드)

---

## 0. Executive Summary (한 페이지 요약)

### 0.1 종합 점수

| 시스템 | 점수 | 비율 |
|---|---|---|
| 기존 MES (2022) | **275 / 390** | **71%** |
| 현재 MES (2026-04) | **179 / 390** | **46%** |

**해석**: 현재 MES는 MES 기능 폭의 65% 수준만 커버. 단, "기능 폭"만 비교한 수치이고 **아키텍처·UX 관점은 완전히 역전**된다.

### 0.2 한 줄 요약

> **"MES는 넓고 낡았고, 현재 MES는 좁고 새것."**
```
