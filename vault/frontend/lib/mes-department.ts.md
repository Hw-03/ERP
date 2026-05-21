---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes-department.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-department.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes-department.ts]]

## 원본 첫 줄

```
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
  "조립": "#1d4ed8", // blue-700
```
