# DEXCOWIN MES

DEXCOWIN의 품목, 재고, BOM, 입출고를 관리하는 경량 MES 프로토타입.

## 현재 기준

- 품목 수 등 기준정보 수치: `python _attic/backend-scripts/facts.py` 로 확인 (문서에 박지 않음)
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/mes.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 사용 화면: `/mes` (데스크톱 셸의 현재 탭 구성은 `frontend/app/mes/README.md` 참조)
- 품목코드 기준 문서: `_attic/docs/ITEM_CODE_RULES.md`

## 빠른 시작 (Windows · 권장)

루트의 `start.bat` 한 번 실행으로 백엔드·프론트가 background 프로세스로 함께 뜬다. 시작 후 표시된 URL을 브라우저에서 직접 연다.

```bat
start.bat
```

서버 실행/관제는 루트 배치파일 3개로 처리한다.

- `start.bat`: 백엔드와 프론트엔드 서버만 켠다.
- `watch.bat`: 서버를 건드리지 않고 좌우 분할 관제창만 연다.
- `stop.bat`: 백엔드와 프론트엔드 서버를 모두 끈다.

관제창은 서버 본체가 아니라 상태 화면이다. 관제창을 닫아도 서버는 계속 실행된다. Windows Terminal이 있으면 왼쪽 Backend, 오른쪽 Frontend 분할창으로 열린다.

- `start.bat`는 `scripts/dev/resolve-server-profile.ps1`가 결정한 현재 profile로 서버를 시작한다. `C:\ERP`와 그 worktree는 development (8011/3001), `C:\ERP-dev`는 employee (8010/3000)다.
- 현재 backend URL과 frontend port는 다음으로 확인한다.

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\resolve-server-profile.ps1
  ```
- 같은 사설망 안의 다른 PC는 profile 출력의 `FrontendPort`를 사용해 `http://<LAN IP>:<FrontendPort>`로 접속한다.

처음 실행 시 `npm install` 과 `pip install -r backend/requirements.txt` 가 자동 수행된다.
Python은 **3.11+**를 지원하며, `start.bat`의 자동 설치를 선택하면 Python 3.13을 설치한다.

## 수동 실행

백엔드 (canonical — 좀비 워커 자동 정리 + 헬스 확인):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
```

백엔드 (순수 uvicorn — dev 포트):

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload
```

프론트엔드 (dev — `npm run dev` 가 PORT=3001 기본 사용):

```bash
cd frontend
npm run dev
```

대표 접속 (dev):

```text
http://localhost:3001
```

## 운영 보조 스크립트

| 스크립트 | 역할 |
|---|---|
| `scripts/ops/backup_db.bat` | `backend/mes.db` 를 `_attic/runtime/backups/sqlite/mes_YYYYMMDD_HHMMSS.db` 로 온라인 백업·검증하고 정식 백업 최신 10개 유지 |
| `scripts/ops/healthcheck.bat` | `GET /health/detailed` 호출 후 결과 출력 |
| `scripts/ops/reconcile_inventory.bat` | 정합성 1차 진단 + 자동 백업 |

자세한 운영 절차는 `_attic/docs/OPERATIONS.md` 참고.

## 품목코드 핵심 규칙

공정코드의 현재 구성은 아래 기준표와 `python _attic/backend-scripts/facts.py`로 확인한다.

| 부서 | R 타입 | A 타입 | F 타입 |
|---|---|---|---|
| 튜브 | `TR` | `TA` | `TF` |
| 고압 | `HR` | `HA` | `HF` |
| 진공 | `VR` | `VA` | `VF` |
| 튜닝 | `NR` | `NA` | `NF` |
| 조립 | `AR` | `AA` | `AF` |
| 출하 | `PR` | `PA` | `PF` |

- 조립 F 타입은 `AF`다.
- `BF`는 구형 오염 코드이며 현재 기준에서 사용하지 않는다.
- 부서 필터는 `category`가 아니라 `process_type_code` 또는 백엔드 `department` 응답 기준으로 동작해야 한다.

품목 코드 포맷:

```text
{모델기호}-{process_type_code}-{일련번호:04d}
```

모델 슬롯·기호·이름은 변경 가능한 기준정보다. `python _attic/backend-scripts/facts.py` 또는 `GET /api/models`를 정본으로 확인한다.

예시:

```text
346-AF-0001
34-TR-0023
```

## 한눈에 보는 폴더 구조

```
ERP/
├── backend/              FastAPI · SQLAlchemy · SQLite
│   ├── app/              routers / services / models
│   ├── mes.db            활성 DB (품목 수 등은 `python _attic/backend-scripts/facts.py` 로 확인)
│   └── requirements.txt
├── frontend/             Next.js 14 · Tailwind
│   ├── app/mes/          현재 활성 MES 셸
│   └── lib/
│       ├── api/          도메인 API 모듈
│       │   └── types/    도메인별 type 정본 (Round-10A #2)
│       ├── api-core.ts   fetch 헬퍼 (postJson/putJson/deleteJson/parseError)
│       └── mes/          MES 디자인시스템 (color/format/status/...)
├── _dev/baselines/       FastAPI OpenAPI baseline (CI drift 검사 기준)
│   └── openapi.json
├── scripts/              보조 스크립트
│   ├── ops/              백업 · 헬스체크 · 재고 정합
│   ├── migrations/       DB 스키마 / 코드 정제
│   └── dev/              verify_local.ps1 등 개발 보조
├── docs/superpowers/     작업 스킬이 생성하는 계획·설계 문서 (도구 필수 경로)
├── docker/               컨테이너 정의 (docker-compose.yml · docker-compose.nas.yml)
├── _attic/               강제 위치 없는 모든 자료의 보관소
│   ├── docs/             도메인 사전·가이드 (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS 등)
│   ├── backend-scripts/  1회성 backend 스크립트 (seed/sync/archive/backup)
│   ├── runtime/          백업·로그·보고서 런타임 산출물 (로컬, .gitignore 매칭)
│   ├── ai/               공통 프롬프트 진입점·역사 AI 자료
│   ├── handoff/          활성 작업별 인수인계 위치
│   └── ONBOARDING.md     신규 합류자 가이드
├── start.bat             통합 실행 (Windows)
├── README.md             이 문서
└── CLAUDE.md             AI/개발자 작업 규칙
```

공용 UI 부품(EmptyState · LoadFailureCard · ConfirmModal · ResultModal · StatusPill · LoadingSkeleton) 은 `frontend/app/mes/_components/common/` — 자세한 컴포넌트 위치·레이어는 [_attic/docs/ARCHITECTURE.md](_attic/docs/ARCHITECTURE.md) 참조.

## 문서 허브

일반 문서와 완료 자료는 `_attic/docs/`에 통합한다. 작업 스킬이 자동 참조하는 계획·설계 문서만 `docs/superpowers/`에 둔다 ([_attic/docs/ATTIC_POLICY.md](_attic/docs/ATTIC_POLICY.md)).

| 문서 | 대상 | 내용 |
|---|---|---|
| [_attic/docs/CONTEXT.md](_attic/docs/CONTEXT.md) | 신규 합류자 | 도메인 한눈 보기 (조직·품목·재고·BOM·입출고·결재) — 코드 보기 전 필독 |
| [_attic/docs/OPERATIONS.md](_attic/docs/OPERATIONS.md) | 운영자 | 365일 운영, 시작·재시작, 포트 충돌, 백업, 1차 장애 대응 |
| [_attic/docs/ARCHITECTURE.md](_attic/docs/ARCHITECTURE.md) | 개발자 | 폴더 구조·레이어·재고 3-bucket 모델 *(V2 흐름은 갱신 예정 — STALE 마커 참조)* |
| [_attic/docs/ERD.md](_attic/docs/ERD.md) | 개발자 | 엔티티 관계도(Mermaid). 현재 모델·Alembic 기준의 유지 문서 |
| [_attic/docs/GLOSSARY.md](_attic/docs/GLOSSARY.md) | 모두 | 도메인 용어 단일 소스 (부서·공정코드·재고 모델·에러코드) |
| [_attic/docs/ITEM_CODE_RULES.md](_attic/docs/ITEM_CODE_RULES.md) | 모두 | 품목코드 최종 기준 |
| [_attic/docs/REPO_LAYOUT.md](_attic/docs/REPO_LAYOUT.md) | 모두 | 현재 저장소 구조와 이동된 파일 경로 안내 |
| [_attic/docs/ATTIC_POLICY.md](_attic/docs/ATTIC_POLICY.md) | 유지보수 | `_attic/` 보관·삭제 정책 |
| [_attic/docs/adr/](_attic/docs/adr/) | 모두 | 아키텍처 결정 기록 (Architecture Decision Records) |
| [_attic/ONBOARDING.md](_attic/ONBOARDING.md) | 신규 합류자 | 처음 셋업·도구·관행 가이드 |

이외 자료: `_attic/docs/research/`, `_attic/docs/feedback/`, `_attic/docs/주간보고.md`, `_attic/docs/mobile-*`, `_attic/docs/db-normalization-plan.md` 등.

## 검증

### 로컬 일괄 검증 (commit 전 권장)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

변경 범위에 따라 docs·frontend·backend 검증을 선택하며, 인프라 또는 범위를 알 수 없는 변경은 전체 게이트로 승격한다. frontend coverage 기준은 `frontend/vitest.config.mts`를 정본으로 확인한다.

### 개별 검증

```bash
# 백엔드
python -m compileall backend
cd backend && pytest -q

# 프론트
cd frontend
npm run lint:strict
npx tsc --noEmit
npm run test:coverage
npm run build
```

수동 smoke (백엔드 기동 후):

```text
GET  /health
GET  /api/items
GET  /api/inventory/summary
GET  /api/production/capacity
```

### API 변경 시 OpenAPI baseline 갱신

backend 라우터/스키마 수정 시 `_dev/baselines/openapi.json` 갱신 필수 (CI drift 검사 — `.github/workflows/ci.yml`):

```bash
cd backend
python -c "from app.main import app; import json; \
  open('../_dev/baselines/openapi.json','w',encoding='utf-8').write(\
  json.dumps(app.openapi(),indent=2,sort_keys=True,ensure_ascii=False)+chr(10))"
```

갱신본을 같은 commit 에 포함시켜야 CI 가 통과한다.
