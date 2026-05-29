# Attic / Backup 정책

`_attic/`, `_attic/_archive/`, `backend/_backup/` 같은 보관층의 운영 기준.
**본 문서는 정책만 명시한다. 실제 파일 이동·삭제는 사용자 결정 시점에 별도 PR로 한다.**

## 현황 (2026-05-29 기준)

| 위치 | 규모 | 내용 |
|---|---|---|
| `_attic/` | 약 924 파일 / ~197MB | 구버전 프론트엔드, 설계 문서, 발표 자료, 회귀 스크린샷 |
| `_attic/docs/` | 24 파일 | `ARCHITECTURE.md`, `ERD.md`, `GLOSSARY.md`, `ONBOARDING.md` 등 — 일부는 현 코드와 정합 |
| `_attic/_archive/` | 4 파일 | 이미지, BOM 가족 초안 등 |
| `backend/_backup/` | DB 백업 ~10개 / ~28MB | SQLite 스냅샷 (`mes_pre_*.db`) |

## 보관 (Keep)

다음 조건에 모두 해당하면 `_attic/` 에 둔다.
- 활성 코드 트리에서 더 이상 참조되지 않는다
- 과거 회의/감사/디버깅 맥락을 보존해야 한다
- 6개월 이내에 다시 열어볼 가능성이 있다

## 복귀 (Restore to `docs/`)

다음 중 하나라도 해당하면 활성 `docs/` 로 복귀시킨다.
- 현 코드의 실제 동작과 정합한다 (사람이 대조 검증)
- README 가 링크하고 있는데 깨져 있다
- 신규 개발자 온보딩에 필수다

복귀 시 outdated 섹션이 있으면 `> [STALE YYYY-MM-DD] 재검토 필요` 마커를 남긴다.

**우선 복귀 대상 (P1-1 에서 처리):**
- `_attic/docs/ARCHITECTURE.md` → `docs/ARCHITECTURE.md`
- `_attic/docs/ERD.md` → `docs/ERD.md`
- `_attic/docs/GLOSSARY.md` → `docs/GLOSSARY.md` (P0-1 / P0-2 결과 반영)

## 삭제 (Delete from repo)

다음에 해당하면 repo 에서 제거한다 (외부 스토리지로 이관 후).
- 바이너리 백업 (DB 파일, 이미지) 가 누적되어 repo 크기를 키운다
- 동일 내용의 더 최신 버전이 존재한다
- 6개월 이상 누구도 참조하지 않았다

**우선 삭제 검토 대상:**
- `backend/_backup/mes_pre_*.db` ~10개 / ~28MB — DB 스냅샷
  - 외부 NAS 또는 클라우드 스토리지로 이관 후 repo 에서 제거
  - 또는 Git LFS 도입 검토 (현재 미사용)
- `_attic/screenshots/`, `_attic/regression-2026-04-*` — 시기 지난 회귀 스크린샷

## 실행 규칙

1. **함부로 손대지 않는다** — CLAUDE.md L12 의 "casually edit 금지" 룰을 준수.
2. **단일 PR / 단일 카테고리** — "DB 백업 정리 PR", "구 회귀 스크린샷 정리 PR" 식으로 나눈다.
3. **삭제 전 백업** — 외부 스토리지 이관 확인 후에만 `git rm`.
4. **사용자 승인 필수** — 본 정책 문서는 가이드일 뿐, 실행은 사용자가 시점·범위를 지정한 PR 에서만.

## 관련 메모리

- [project_kwon_donghwan_requests](C:\Users\user\.claude\projects\c--ERP\memory\project_kwon_donghwan_requests.md) — `%TEMP%` 찌꺼기 정리 요청과 같은 맥락 (저장 공간 위생)
