# Attic 정책

## 정의 (2026-05-29 재정의)

**`_attic/` = 강제 위치 없는 모든 자료의 보관소.**

루트(`c:/ERP/`)와 큰 폴더(`backend/`, `frontend/`)에는 도구(Claude Code, npm, pytest, git, CI, docker)가 자동 참조하는 파일만 둔다. 그 외 모든 자료 — 도메인 사전·가이드, 1회성 backend 스크립트, DB 백업, ONBOARDING, 끝난 plan, 옛 발표 자료, 회귀 스크린샷 — 은 모두 `_attic/` 으로 통합.

(이전 정의 "6개월 이상 참조되지 않은 사본" 은 폐기 — 자주 참조하는 활성 사전도 attic 에 둔다. 위치가 본질이 아니라 정책이 본질.)

## 현재 구조

| 경로 | 내용 |
|---|---|
| `_attic/docs/` | 도메인 사전·가이드 (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS/ITEM_CODE_RULES/ATTIC_POLICY), 끝난 plan, 발표·연구 자료, feedback 메모 |
| `_attic/backend-scripts/` | 1회성 backend 스크립트 (seed/sync/archive/backup) — `cd backend && python ../_attic/backend-scripts/<f>.py` |
| `_attic/runtime/` | 로컬 영구 운영 산출물 루트(백업·로그·부하 테스트 보고서, git 추적 제외) |
| `backend/_backup/` | 새 운영 도구가 더는 쓰지 않는 기존 SQLite 백업 위치(기존 파일은 그대로 유지) |
| `_attic/ONBOARDING.md` | 신규 합류자 가이드 |
| `_attic/ai/` | 공통 프롬프트 진입점·역사 AI 자료 |
| `_attic/handoff/` | 활성 작업별 인수인계 위치 |
| `_attic/_archive/`, `_attic/frontend/`, `_attic/backend/`, `_attic/outputs/` | 옛 코드·자산 (참고용) |

## 보관 / 이동 기준

`_attic/` 에 둘 것:
- 도구가 강제하는 경로(npm 의 `package.json`, pytest 의 `pytest.ini`, git 의 `.gitignore`, Claude Code 의 `CLAUDE.md`, GitHub 의 `README.md`/`/.github/workflows/`, CI 가 읽는 `_dev/baselines/`, 사용자 매일 entry point 인 `start.bat`)가 아닌 모든 자료.

루트·`backend/`·`frontend/` 에 남길 것:
- 위 도구가 자동 참조하는 파일/폴더만.

## DB 백업 (특별 규정)

- 새 SQLite 백업: `_attic/runtime/backups/sqlite/`
- 새 PostgreSQL 백업: `_attic/runtime/backups/postgres/`
- 정식 백업(`mes_YYYYMMDD_HHMMSS.db/.sql`)은 종류별 최신 10개를 유지한다. `mes_PRE-*` 유지보수·복구 스냅샷은 정식 백업 개수에 포함하지 않는다.
- `MES_RUNTIME_ROOT`로 테스트·직원 서버의 전체 런타임 루트만 재정의할 수 있다. `MES_SQLITE_BACKUP_DIR`은 지원하지 않는다.
- `.gitignore` 매칭 (`_attic/runtime/`, 기존 `backend/_backup/`, `*.db.bak*`) — repo 추적 X, 로컬만.
- 기존 `backend/_backup/` 파일은 자동 이동·삭제하지 않는다.
- 장기 보관이 필요한 백업은 외부 NAS/스토리지로 별도 이관한다.

## 삭제 (Delete from repo)

다음에 해당하면 repo 에서 제거 (외부 스토리지로 이관 후).
- 바이너리 백업이 누적되어 repo 크기 압박.
- 동일 내용의 더 최신 버전이 존재.
- 6개월 이상 누구도 참조하지 않음 + 활성 코드에서도 참조 X.

## 실행 규칙

1. **함부로 손대지 않는다** — CLAUDE.md 의 "casually edit 금지" 룰 준수.
2. **단일 PR / 단일 카테고리** — "DB 백업 정리 PR", "옛 발표 자료 정리 PR" 식으로 나눈다.
3. **삭제 전 백업** — 외부 스토리지 이관 확인 후에만 `git rm`.
4. **사용자 승인 필수** — 본 정책은 가이드. 실행은 사용자가 시점·범위를 지정한 PR 에서만.

## 관련

- [project_kwon_donghwan_requests](C:\Users\user\.claude\projects\c--ERP\memory\project_kwon_donghwan_requests.md) — `%TEMP%` 찌꺼기 정리 요청과 같은 맥락 (저장 공간 위생)
- 2026-05-29 cleanup 커밋: `8dd5c9a9` (루트), `b4b1cf16` (backend), 이후 (안전망)
