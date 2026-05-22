---
type: file-explanation
source_path: "_attic/docs/research/2026-05-04-department-naming-policy.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-04-department-naming-policy.md — 2026-05-04-department-naming-policy.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-04-department-naming-policy.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `부서명 정규화 정책 통일 가이드 — 2026-05-04`
- `1. 문제`
- `legacyUi.normalizeDepartment`
- `mes-department.normalizeDepartmentName`
- `2. 결과 비교`
- `3. 어느 동작이 옳은가?`
- `회사 PC 에서 확인 필요`
- `(확인 필요)`
- `4. 회사 PC 검증 단계`
- `4-1. DB 실데이터`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 부서명 정규화 정책 통일 가이드 — 2026-05-04

> **작업 ID:** R4-6 (보류 + 가이드)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 가이드만. 코드 변경 0.

---

## 1. 문제

`legacyUi.employeeColor` 를 `mes-department.getDepartmentFallbackColor` 의 wrapper 로 위임하려 했으나 (R4-6) 두 모듈의 부서명 정규화 정책이 충돌:

### legacyUi.normalizeDepartment

```ts
export const DEPARTMENT_LABELS: Record<string, string> = {
  "조립": "조립",
  ...
  "연구": "연구소",   // ← "연구" → "연구소" 변환
  ...
};

export function normalizeDepartment(value?: string | null) {
  if (!value) return "기타";
  return DEPARTMENT_LABELS[value] ?? value;
}
```

→ `normalizeDepartment("연구") = "연구소"`

### mes-department.normalizeDepartmentName

```ts
const DEPARTMENT_ALIAS: Record<string, string> = {
  "연구소": "연구",   // ← "연구소" → "연구" 변환 (반대 방향)
  "AS팀": "AS",
  "출하팀": "출하",
};
```

→ `normalizeDepartmentName("연구소") = "연구"`

---

## 2. 결과 비교

| 입력 | `legacyUi.employeeColor` (raw 본문) | wrapper (mes-department 위임) |
|---|---|---|
| `"연구"` | switch case "연구" — amber `#b45309` 인데, normalize 가 "연구소" 로 만들어버려 default slate `#475569` | normalize "연구" → "연구" → amber `#b45309` |
| `"연구소"` | normalize "연구소" → switch default → slate | alias "연구소" → "연구" → amber |
| `"조립"` | "조립" → blue | "조립" → blue |

**두 부서 ("연구", "연구소") 의 색이 wrapper 적용 시 달라짐** — 기존 화면이 갑자기 amber 로 바뀜.
```
