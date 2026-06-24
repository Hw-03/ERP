---
type: file-explanation
source_path: "frontend/lib/mes-department.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-department.ts — mes-department.ts 설명

## 이 파일은 무엇을 책임지나

`mes-department.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `normalizeDepartmentName`
- `getDepartmentFallbackColor`
- `getDepartmentInitial`
- `normalizeDepartment`
- `MES_DEPARTMENT_COLORS`
- `DEPARTMENT_LABELS`
- `DEPARTMENT_ICONS`

## 연결되는 파일

- [[ERP/frontend/lib/📁_lib]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * DEXCOWIN MES 부서 디자인 시스템
 *
 * 우선순위 원칙 (절대 위반 금지):
 *   1. DB 의 `departments.color_hex` 가 있으면 **그것을 우선** 사용한다.
 *   2. color_hex 가 null/undefined/공백일 때만 본 모듈의 fallback 을 사용한다.
 *   3. 본 모듈은 부서 이름만 가지고 색을 결정한다 — DB 호출이나 캐시 없음.
 *
 * Round-10F (#1) 정책 통일:
 *   - DB DepartmentEnum.value 와 화면 표기 모두 "연구" 단일.
 *     기존 legacyUi.DEPARTMENT_LABELS["연구"]="연구소" 는 본 라운드에서 폐기.
 *   - DEPARTMENT_LABELS / DEPARTMENT_ICONS 정본을 본 모듈에 흡수.
 *   - normalizeDepartment (legacyUi 호환) 는 본 모듈에서 제공.
 */

const FALLBACK_COLOR = "#475569"; // slate-600 — 미정의 부서 기본
const FALLBACK_INITIAL = "기"; // "기타"

const DEPARTMENT_ALIAS: Record<string, string> = {
  "연구소": "연구",
  "AS팀": "AS",
  "출하팀": "출하",
};

/**
 * 부서별 fallback 색상 (DB color_hex 부재 시에만 사용).
 * 키는 정규화된 부서 이름.
 */
export const MES_DEPARTMENT_COLORS: Record<string, string> = {
  "조립": "#3b82f6", // blue-500 — 가시성 개선 (라이트/다크 양쪽 mid-tone)
  "고압": "#d97706", // amber-600 — 가시성 개선
  "튜브": "#16a34a", // green-600 — 가시성 개선
  "진공": "#6d28d9", // violet-700
  "튜닝": "#0e7490", // cyan-700
  "서비스": "#047857", // emerald-700
  "AS": "#be185d", // pink-700
  "연구": "#b45309", // amber-700
  "영업": "#b91c1c", // red-700
  "출하": "#0f766e", // teal-700
  "기타": FALLBACK_COLOR,
};

/**
 * 부서 이니셜 (한 글자, 카드/배지에 사용).
 */
const MES_DEPARTMENT_INITIALS: Record<string, string> = {
  "조립": "조",
  "고압": "고",
  "진공": "진",
  "튜닝": "튜",
  "튜브": "튜",
  "서비스": "서",
  "AS": "A",
  "연구": "연",
  "영업": "영",
```
