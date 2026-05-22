---
type: file-explanation
source_path: "_attic/docs/research/2026-05-02-common-modules-design.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-02-common-modules-design.md — 2026-05-02-common-modules-design.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-02-common-modules-design.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `공통 모듈 설계 — 2026-05-02`
- `MES-COMP-002 — StatusPill / StatusBadge 통합 설계`
- `현재 두 컴포넌트 비교`
- `Tone 통합 매핑`
- `권장 신규 파일: `frontend/lib/mes-status.ts``
- `마이그레이션 절차`
- `MES-COMP-003 — 모달·바텀시트·Toast 산재 매핑`
- `현재 위치`
- `문제: Toast 산재 추정 위치`
- `확인 명령 (회사 PC에서)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 공통 모듈 설계 — 2026-05-02

> **작업 ID:** MES-COMP-002~005  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (설계 문서만, 실제 생성은 회사 PC)

---

## MES-COMP-002 — StatusPill / StatusBadge 통합 설계

### 현재 두 컴포넌트 비교

| 항목 | `common/StatusPill.tsx` | `mobile/primitives/StatusBadge.tsx` |
|---|---|---|
| Tone 타입 | `"info" \| "success" \| "warning" \| "danger" \| "neutral"` | `"ok" \| "warn" \| "danger" \| "info" \| "muted"` |
| 공통 | `info`, `danger` | `info`, `danger` |
| 차이 | `success`, `warning`, `neutral` | `ok`, `warn`, `muted` |
| 스타일 | Tailwind 클래스 내부 | Tailwind 클래스 내부 |
| 사용처 | 데스크톱 전반 | 모바일 전반 |

### Tone 통합 매핑

```ts
// 통합 타입 (mes-status.ts)
export type MesTone = "info" | "success" | "warning" | "danger" | "neutral" | "muted";

// 구버전 → 통합 매핑
const STATUSBADGE_MAP: Record<string, MesTone> = {
  ok:   "success",   // ok → success
  warn: "warning",   // warn → warning
  muted: "muted",    // muted → muted (신규 추가)
};
const STATUSPILL_MAP: Record<string, MesTone> = {
  success: "success",
  warning: "warning",
  neutral: "neutral",
};
// info, danger는 양쪽 동일
```

### 권장 신규 파일: `frontend/lib/mes-status.ts`

```ts
export type MesTone = "info" | "success" | "warning" | "danger" | "neutral" | "muted";

export const TONE_STYLES: Record<MesTone, { bg: string; text: string; dot?: string }> = {
  info:    { bg: "bg-blue-50",   text: "text-blue-700" },
  success: { bg: "bg-green-50",  text: "text-green-700" },
  warning: { bg: "bg-yellow-50", text: "text-yellow-700" },
  danger:  { bg: "bg-red-50",    text: "text-red-700" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600" },
  muted:   { bg: "bg-slate-50",  text: "text-slate-400" },
};
```
