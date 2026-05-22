---
type: file-explanation
source_path: "_attic/docs/research/2026-05-01-folder-classification.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-01-folder-classification.md — 2026-05-01-folder-classification.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-01-folder-classification.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `폴더 전체 분류표 — 2026-05-01`
- `분류 기준`
- `루트 직속`
- `frontend/`
- `frontend/app/legacy/_components/ 세부`
- `backend/`
- `scripts/`
- `docs/`
- `보존 폴더 명시 (MES-TREE-002)`
- `unused 후보 요약 (grep 확인 필요)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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

---

## 루트 직속

| 경로 | 분류 | 설명 |
|---|---|---|
| `_archive/` | 🔴 절대금지 | CLAUDE.md 명시. `reference/files/` 포함 |
| `backend/` | 🟢 활성 | FastAPI 서버 |
| `frontend/` | 🟢 활성 | Next.js 앱 |
| `data/` | 📦 보존 | CSV 소스 (`ERP_Master_DB.csv` 등) |
| `docker/` | 🟢 활성 | `docker-compose.yml`, `docker-compose.nas.yml` |
| `docs/` | 🟢 활성 | 운영 문서 |
| `scripts/` | 🟢 활성 | 운영/마이그레이션/개발 스크립트 |
| `outputs/` | 📦 보존 | 산출물 (`bom_planner/`, `inventory_cleanup/`) |
| `.dev/` | 📦 보존 | 개발 보조 도구 |
| `CLAUDE.md` | 🟢 활성 | 세션 규칙 |
| `README.md` | 🟢 활성 | 프로젝트 진입점 |
| `start.bat` | 🟢 활성 | 로컬 실행 스크립트 |

> 2026-05-08 정리: `MES_MOBILE_CLAUDE_CODE_EXECUTION_PLAN.md`(주말 플랜, 완료) 삭제, `deep-research-report.md` → `docs/research/2026-04-26-deep-research-report.md`로 이동, 루트 `backups/` → `d...

---

## frontend/

| 경로 | 분류 | 설명 |
|---|---|---|
| `frontend/_archive/` | 🔴 절대금지 | CLAUDE.md 명시 |
| `frontend/_archive/legacy-unused/` | 🔴 절대금지 | 폐기 코드 |
| `frontend/_archive/standalone-app-routes/` | 🔴 절대금지 | admin/bom/history/inventory/operations 구버전 |
```
