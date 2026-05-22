---
type: file-explanation
source_path: "frontend/lib/mes/process.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# process.ts — process.ts 설명

## 이 파일은 무엇을 책임지나

`process.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `processStageLabel`
- `itemCodeDept`
- `itemCodeDeptBadge`
- `displayPart`
- `PROCESS_LABEL`
- `PROCESS_TO_DEPT`
- `LEGACY_PART_LABELS`

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
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
  PA: "Packaging",
  PF: "Pack Final",
};

/**
 * stage 코드 → 라벨 반환. 빈 입력은 "-", 미매핑 코드는 입력 그대로.
 */
export function processStageLabel(code?: string | null): string {
  if (!code) return "-";
  return PROCESS_LABEL[code] ?? code;
}

/**
 * 품목 코드 process stage 코드 → 부서명 매핑.
 * 첫 글자 (T/H/V/N/A/P) 가 부서를 결정.
 */
export const PROCESS_TO_DEPT: Record<string, string> = {
  TR: "튜브", TA: "튜브", TF: "튜브",
  HR: "고압", HA: "고압", HF: "고압",
  VR: "진공", VA: "진공", VF: "진공",
  NR: "튜닝", NA: "튜닝", NF: "튜닝",
  AR: "조립", AA: "조립", AF: "조립",
  PR: "출하", PA: "출하", PF: "출하",
};
```
