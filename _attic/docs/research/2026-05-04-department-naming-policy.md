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

---

## 3. 어느 동작이 옳은가?

DB / API 에서 반환되는 실제 부서명은 무엇일까?

```bash
# 회사 PC 에서 확인 필요
sqlite3 backend/erp.db "SELECT DISTINCT name FROM departments;"
```

만약:
- DB 가 `"연구"` 로 저장 → mes-department 의 amber 가 정답 (legacyUi 가 버그)
- DB 가 `"연구소"` 로 저장 → legacyUi 의 slate 가 의도된 default 또는 누락 case

`backend/app/models.py` 의 `DepartmentEnum` 확인:

```python
# (확인 필요)
RESEARCH = "연구"  # 또는 "연구소"
```

---

## 4. 회사 PC 검증 단계

### 4-1. DB 실데이터

```sql
SELECT department_id, name FROM departments;
SELECT DISTINCT department FROM employees;
```

### 4-2. 백엔드 enum

```bash
grep -A 20 "class DepartmentEnum" backend/app/models.py
```

### 4-3. 화면 확인

- 관리자 → 부서 목록에서 "연구" 로 표시되는지 "연구소" 로 표시되는지
- 직원 카드의 부서 색상 배지가 amber 인지 slate 인지

---

## 5. 정합화 옵션 (회사 PC 검증 후 별도 PR)

### 옵션 A — 백엔드 정본 + mes-department 정본 (권장)

DB 가 `"연구"` 라면:
- `legacyUi.DEPARTMENT_LABELS` 의 `"연구": "연구소"` 매핑 제거 (`"연구": "연구"`)
- 화면 라벨을 별도 `LABEL_FOR_DISPLAY` 로 분리 (정규화와 표시 라벨 분리)
- mes-department 의 별칭은 그대로 ("연구소" 입력도 흡수)
- `employeeColor` wrapper 위임 가능

### 옵션 B — legacyUi 정본 유지 + mes-department 별칭 제거

DB 가 `"연구소"` 라면:
- mes-department `DEPARTMENT_ALIAS` 에서 `"연구소": "연구"` 제거
- mes-department `MES_DEPARTMENT_COLORS` 키를 `"연구소"` 로 변경
- 또는 두 키 모두 등록

### 옵션 C — 본 라운드 보류

부서명 표시 정책이 추가 컨텍스트 필요. wrapper 위임 미진행. employeeColor 본문 유지.
**현재 선택지.**

---

## 6. 다음 작업자 가이드

1. 회사 PC 에서 4-1, 4-2 검증
2. 옵션 A/B 결정
3. 별도 PR 로 적용:
   - 본문 변경 (`legacyUi` 또는 `mes-department`)
   - `employeeColor` 의 wrapper 위임 (R4-6 마무리)
   - 단위 테스트 갱신
   - 화면 시각 검증 (관리자 / 직원 카드 / BOM)
4. 영향 컴포넌트 grep:
   ```bash
   rg -n "normalizeDepartment\|employeeColor\|DEPARTMENT_LABELS" frontend/ --glob "!_archive"
   ```

---

## 7. 본 PR 미수정 사항

- `legacyUi.ts::employeeColor` 본문 그대로 (스위치 11 case)
- `mes-department.ts::DEPARTMENT_ALIAS` 그대로 ("연구소" → "연구" 별칭 유지)
- `legacyUi.ts::DEPARTMENT_LABELS` 그대로 ("연구" → "연구소" 매핑 유지)

본 라운드는 가이드만. 정합화는 회사 PC 데이터 확인 후 별도 PR.

---

## 8. 관련 작업

- `2026-05-04-legacy-wrapper-deprecation-plan.md` — wrapper 정책
- `frontend-100-score-refactor-plan.md` — Round-3 진단
- W2 (`ee82f4d`) — 처음 충돌 발견
- Round-5 후보 — 본 가이드 적용
