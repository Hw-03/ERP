---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-02-admin-redesign.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-02-admin-redesign.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-02-admin-redesign.md]]

## 원본 첫 줄 (또는 메타)

```
# 관리자 모드 재설계 — 2026-05-02

> **작업 ID:** MES-ADMIN-001~002  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (설계 문서만)

---

## 1. 현재 vs 재설계 매핑

| 재설계 영역 | 현재 파일 | 현재 섹션 ID | 누락/문제 |
|---|---|---|---|
| 1. 관리자 홈 | 없음 | — | 홈 없이 items 섹션으로 바로 진입 |
| 2. 품목·자재 마스터 | `AdminMasterItemsSection.tsx` | `items` | process_type_code 수정 불가 버그 |
| 3. 공정·옵션·제품기호 | `AdminModelsSection.tsx` | `models` | 코드 마스터 3종이 한 섹션에 혼재 |
| 4. 부서·직원 | `AdminDepartmentsSection.tsx` + `AdminEmployeesSection.tsx` | `departments` + `employees` | 분리됨, 색상 5곳 중복 |
| 5. 재고 기준값 | items 내 `min_stock` 필드 | — | 전용 화면 없음 |
| 6. 실사·강제조정 | `/counts` 별도 라우트 | — | 관리자 메뉴 미연결 |
| 7. 손실·폐기·편차 | `/loss`, `/scrap`, `/variance` 개별 API | — | 관리자 화면 없음 |
| 8. 시스템 설정 | `settings.py` (PIN, CSV, 초기화) | `settings` | PIN은 SHA-256, DEFAULT 0000 취약 |
| 9. 권한·PIN | `pin_auth.py`, `employees.py` | settings 일부 | 직원별 PIN 관리 불명확 |
| 10. 감사 로그 | `admin_audit.py` | — | 화면 없음, API만 존재 |

---
```
