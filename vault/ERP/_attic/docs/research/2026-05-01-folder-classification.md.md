---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-01-folder-classification.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-01-folder-classification.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-01-folder-classification.md]]

## 원본 첫 줄 (또는 메타)

```
# 폴더 전체 분류표 — 2026-05-01

> **작업 ID:** MES-TREE-001 / MES-TREE-002  
> **작성일:** 2026-05-01 (금)  
> **기준 브랜치:** `feat/hardening-roadmap`  
> (초기 분석은 `claude/analyze-dexcowin-mes-tGZNI` 에서 시작했으나 fast-forward 머지 후 통일. 이 브랜치는 폐기됨.)  
> **수정 여부:** 없음 (읽기 전용 분석)  
> **탐색 깊이:** 루트 기준 4단계  
> **갱신:** 2026-05-08 — 루트 정리 적용 (MES플랜 삭제, deep-research 이동, backups 통합). 자세한 내역: `docs/AI_HANDOVER.md` "2026-05-08 — 루트 정리" 섹션

---

## 분류 기준

| 기호 | 분류 | 설명 |
|---|---|---|
| 🟢 활성 | 현재 사용 중인 주요 경로 | 건드리면 화면/서버 영향 |
| 🔵 wrapper | re-export 또는 redirect 전용 | 실제 구현 없음 |
| 🟡 legacy | 의도적으로 보존된 구식 코드 | 참조 목적 |
| 🔴 절대금지 | CLAUDE.md "Do Not Edit" 명시 | 수정 절대 불가 |
| ⚫ unused 후보 | 활성 코드에서 사용처 미확인 | 제거 전 grep 필수 |
| 🟠 중복 후보 | 같은 기능이 2곳 이상 구현됨 | 통합 설계 필요 |
| 🔷 MES 전환 후보 | 시스템명 ERP 잔재 있음 | UI 라벨만 변경 대상 |
| 📦 보존 | 운영 데이터/산출물/히스토리 | 삭제 금지 |

```
