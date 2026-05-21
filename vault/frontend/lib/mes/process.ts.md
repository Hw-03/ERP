---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/process.ts
tags: [vault, code-note, auto-generated, stub]
---

# process.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/process.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * MES 공정 (Process Stage) 모듈 — `@/lib/mes/process`.
 *
 * Round-10D (#5) 신설. 품목코드 2번째 segment (TR/TA/TF/HR/...) → 라벨 매핑.
 * Round-10E (#1) 추가: `PROCESS_TO_DEPT` + `itemCodeDept` + `itemCodeDeptBadge`
 * — 부서명 매핑은 품목코드 static 매핑이라 부서 정규화 충돌과 무관.
 */

/**
 * 품목코드 process stage 코드 → 한국어 라벨.
 *   - 첫 글자: 부서 (T=튜브, H=고압, V=진공, N=튜닝, A=조립, P=출하)
 *   - 두 번째 글자: 단계 (R=Raw, A=Assembly, F=Final)
 */
export const PROCESS_LABEL: Record<string, string> = {
  TR: "Tube Raw",
  TA: "Tube Ass'y",
  TF: "Tube Final",
  HR: "High-v Raw",
  HA: "High-v Ass'y",
  HF: "High-v Final",
  VR: "Vacuum Raw",
  VA: "Vacuum Ass'y",
  VF: "Vacuum Final",
  NR: "Neck Raw",
  NA: "Neck Ass'y",
  NF: "Neck Final",
  AR: "Assembly Raw",
  AA: "Assembly",
  AF: "Assembly Final",
  PR: "Pack Raw",
```
