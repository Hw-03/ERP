---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/ai/AI_HANDOVER.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# AI_HANDOVER.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/ai/AI_HANDOVER.md]]

## 원본 첫 줄 (또는 메타)

```
# AI Handover

이 문서는 Claude/Codex가 같은 MES 프로젝트를 이어서 작업할 때 보는 최신 인수인계 문서다.

## 2026-05-08 — 루트 정리 (참조 변경)

루트 가시 항목을 줄이기 위해 다음을 정리. **미래 AI 세션은 옛 경로 검색 시 다음 매핑으로 대체할 것.**

| 옛 경로 | 새 경로/상태 |
|---|---|
| `MES_MOBILE_CLAUDE_CODE_EXECUTION_PLAN.md` | **삭제** (모바일 작업 완료, commit `ee3c436`) |
| `deep-research-report.md` | `docs/research/2026-04-26-deep-research-report.md` |
| `backups/erp_before_*.db` | `data/db_backups/erp_before_*.db` |
| `verify_import_btn.png` | **삭제** (회귀 테스트 임시 산출물, gitignore 패턴) |
| 루트 `backups/` 폴더 | **제거** (DB 백업은 `data/db_backups/`로 단일화) |

`docker-compose.yml`은 항상 `docker/docker-compose.yml`(이동 없음, CLAUDE.md 참조 표기만 정확화).

정리 후 루트 가시 항목: 폴더 9개 (`_archive/`, `backend/`, `data/`, `docker/`, `docs/`, `frontend/`, `outputs/`, `scripts/`, `vault/`) + 파일 3개 (`CLAUDE.md`, `README.md`, `start.bat`).

## 현재 상태 (2026-05-03 Round-17 update)

- 프로젝트: DEXCOWIN 재고 관리 MES (경량 MES 프로토타입)
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
```
