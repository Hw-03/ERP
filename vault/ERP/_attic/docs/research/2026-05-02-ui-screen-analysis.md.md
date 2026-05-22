---
type: file-explanation
source_path: "_attic/docs/research/2026-05-02-ui-screen-analysis.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-02-ui-screen-analysis.md — 2026-05-02-ui-screen-analysis.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-02-ui-screen-analysis.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `UI 화면 분석 — 2026-05-02`
- `MES-UI-001 — DesktopAdminView 현재 구조`
- `현재 8개 섹션 (SECTIONS + SETTINGS_ENTRY)`
- `누락된 영역 (현재 관리자 화면 접근 불가)`
- `상태 공유 구조 (문제점)`
- `MES-UI-002 — 입출고 화면 현재 구조`
- `현재 5가지 WorkType`
- `역할별 접근 가능 WorkType`
- `현재 위저드 구조`
- `문제점`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# UI 화면 분석 — 2026-05-02

> **작업 ID:** MES-UI-001~005, MES-TREE-003  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (읽기 전용 분석)

---

## MES-UI-001 — DesktopAdminView 현재 구조

**파일:** `frontend/app/legacy/_components/DesktopAdminView.tsx` (31KB)

### 현재 8개 섹션 (SECTIONS + SETTINGS_ENTRY)

```ts
type AdminSection = "items" | "employees" | "models" | "bom" | "packages" | "export" | "settings" | "departments";

const SECTIONS = [
  { id: "models",      label: "모델",     description: "제품 모델 추가/삭제" },
  { id: "items",       label: "품목",     description: "품목 기본 정보 수정" },
  { id: "employees",   label: "직원",     description: "직원 활성 상태 관리" },
  { id: "departments", label: "부서",     description: "부서 추가/비활성화" },
  { id: "bom",         label: "BOM",      description: "부모-자식 자재 구성" },
  { id: "packages",    label: "출하묶음", description: "패키지 구성 관리" },
  { id: "export",      label: "내보내기", description: "엑셀 데이터 내보내기" },
];
const SETTINGS_ENTRY = { id: "settings", label: "설정", description: "PIN, CSV, 초기화" };
// + AdminDangerZone (별도 컴포넌트, 섹션 목록 외)
```

### 누락된 영역 (현재 관리자 화면 접근 불가)

| 누락 영역 | 현재 위치 | 문제 |
|---|---|---|
| 재고 기준값 (min_stock, 안전재고) | items 섹션 내 필드 1개 | 품목별 일괄 설정 불가 |
| 실사/강제조정 | `/counts` 별도 라우트 | 관리자 화면에서 접근 안 됨 |
| 손실/폐기/편차 | `/` 미연결 | 관리자 화면에서 접근 안 됨 |
| 권한/PIN 관리 | settings 섹션 일부 | 직원별 PIN 관리 미흡 |
| 감사 로그 | `admin_audit.py` API만 | 화면 없음 |
| 관리자 홈 (카드 그리드) | 없음 | 메뉴 평면 나열 |

### 상태 공유 구조 (문제점)

```
DesktopAdminView
  ├── useState: items, employees, packages, productModels, allBomRows, departments (6개 공유 상태)
  ├── useState: section, unlocked, adminPin, showRightPanel (UI 상태)
  └── 모든 섹션 컴포넌트에 props drilling
```
→ 거대 단일 컴포넌트 패턴. 섹션 추가 시 DesktopAdminView만 비대해짐.

---

## MES-UI-002 — 입출고 화면 현재 구조
```
