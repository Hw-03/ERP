---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-02-ui-screen-analysis.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-02-ui-screen-analysis.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-02-ui-screen-analysis.md]]

## 원본 첫 줄 (또는 메타)

```
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
```
