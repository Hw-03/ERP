# DEXCOWIN MES

DEXCOWIN의 품목, 재고, BOM, 입출고를 관리하는 경량 MES 프로토타입.

## 현재 기준

- 품목 수 등 기준정보 수치: `python _attic/backend-scripts/facts.py` 로 확인 (문서에 박지 않음)
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/mes.db`)
- 프론트엔드: Next.js 16 + Tailwind CSS
- 주 사용 화면: `/mes` (데스크톱 셸의 현재 탭 구성은 `frontend/app/mes/README.md` 참조)
- 품목코드 기준 문서: `_attic/docs/ITEM_CODE_RULES.md`

## 빠른 시작 (Windows · 권장)

> **품질 감사/worktree 안전 범위:** 아래 일반 실행·중지·profile 명령은 운영자 또는 통합 checkout용이다. 격리된 코드 품질 작업에서는 `start.bat`, `stop.bat`, `bootstrap_db.py`, 직원 동기화·배포·작업 등록 명령을 실행하거나 development/employee URL·port·DB를 조회하지 않는다. 정적 검증은 [`verify_local.ps1`](scripts/dev/verify_local.ps1)의 plan/gate 계약을 따르고, 브라우저 회귀 실행이 별도로 승인된 때만 [합성 DB E2E 격리 계약](frontend/tests/e2e/README.md)을 따른다. 과거 실환경 관찰은 현재 상태로 재확인하지 않는다.

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
python -m uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload --workers 1 --no-proxy-headers
```

프론트엔드 (dev — `npm run dev` 가 PORT=3001 기본 사용):

```bash
cd frontend
npm run dev
```

프론트는 `scripts/next-server.js`의 raw socket 경계를 거쳐 기존 Next `/api` rewrite를 사용한다. 이 경계를 우회하는 직접 `next dev`/`next start` 실행은 client-IP 기반 PIN 시도 제한을 무력화하므로 사용하지 않는다.

개발·직원 프론트는 각 환경의 ignored `_attic/runtime/frontend-node-path.txt`에서 Node.js 20 실행 파일의 절대 경로를 읽는다. 설정이 없으면 PATH의 Node 20을 사용하며 다른 주 버전이면 실행 전에 중단한다. 공용 Node 설치와 전역 PATH는 변경하지 않는다.

직원 배포는 `scripts/dev/sync-to-employee.ps1 -PreflightOnly`로 정지 전 준비만 검증할 수 있다. 개발 runtime의 격리 폴더에서 같은 Node 배포본의 npm으로 잠금 파일 설치·production build·번들 검사와 직원 DB 온라인 복사본 검증을 수행한다. `SYNC_PREPARE_RESULT=READY`는 준비 완료이며 실제 반영 완료가 아니다. 예약 실행에서도 현재 소스와 산출물을 다시 확인하고 새 DB 스냅샷을 검증한다. 실패하면 직원 서버를 정지하지 않는다.

실제 배포에서 프런트 코드·의존성·빌드·Node 설정을 함께 전환하고, DB 마이그레이션 전 실패는 검증된 이전 구성을 복구한다. 마이그레이션 이후에는 자동으로 이전 DB나 코드로 되돌리지 않으며 `POST_STOP` 복구 안내를 따른다. 미완료 배포 기록이 있으면 다음 자동 동기화도 중단한다.

원장 활성화는 마이그레이션 이후 schema로 만든 전체 검증 백업을 사용한다. 정지 전 복사본 사전 검증에서도 전체 백업 검증과 활성화 dry-run을 수행한다. 마이그레이션 전 구조 전용 백업은 별도로 보존하며 활성화용 전체 백업으로 대체 사용하지 않는다.

직원→개발 데이터 동기화는 개발 DB의 정지 전 온라인 백업을 보존하고, 개발 서비스 정지 후 다시 만든 전체 검증 백업을 교체·복구 기준으로 사용한다. 정지 후 백업 실패나 그 이후 DB 변경 감지 시 교체하지 않고 개발 서비스를 재기동한다. `SYNC_DATA_BACKUP_BEFORE_STOP`은 보존용이며 `SYNC_DATA_BACKUP`은 정지 후 검증된 복구 기준이다. 양쪽 동기화와 서버 기동 시 백엔드 readiness는 전체 정합성 검사 시간을 고려해 요청당 10초·최대 6회 확인하며, 프런트는 `/mes`를 확인한다. 서버 감독자의 최초 readiness 확인은 1회이며 liveness·프런트 요청의 기존 2초 제한은 유지한다. 배포 변경 비교에서도 자동 생성 타입 파일과 로컬 캐시·환경 설정을 제외해 실제 배포 대상이 같으면 서버를 재시작하지 않는다.

매일 예약 동기화는 `powershell -NoProfile -ExecutionPolicy Bypass -File C:\ERP\scripts\dev\sync-employee-environments.ps1` 한 번으로 실행한다. 진입점이 코드 래퍼 성공(exit 0, `NO_CHANGES` 포함) 후에만 직원→개발 데이터 `-Apply`를 한 번 호출한다. `_attic/runtime/scheduled-sync/<실행 ID>/receipt.json`과 단계별 stdout/stderr를 보존하므로 도구 출력이 누락돼도 같은 실행의 파일에서 결과를 확인할 수 있다. 실행 중·실패·결과 불확실이면 명령을 다시 호출하지 않는다. 코드 또는 데이터 명령을 추가로 실행하지 않으며, 같은 진입점의 중복 실행은 차단한다.

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
├── frontend/             Next.js 16 · Tailwind
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

### 위험 기반 일괄 검증 (commit 전 권장)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -ChangeSet staged
```

`smart`는 변경 파일에 맞춰 관련 lint·증분 타입 검사·Vitest 또는 testmon pytest를 선택하고, 설정·DB 모델·검증 인프라처럼 위험한 변경은 영역 전체나 풀 게이트로 승격한다. 기본 `-ChangeSet auto`에서는 staged 변경이 없을 때 전체 작업 트리를 대상으로 하며, 명시한 `-ChangeSet staged`는 staged 변경만 영향 계획에 포함한다. 게이트 자체는 현재 working tree에서 실행되므로, 정확한 staged 스냅샷 검증이 필요하면 깨끗한 전용 worktree를 사용한다. `-PlanOnly`로 실행 계획만 확인할 수 있다.

문서 변경에는 Markdown 공백·유지 문서 링크 검사를 함께 실행한다. 검증 인프라 변경이나 전체 CI 수준 확인이 필요할 때는 `-Mode full`을 사용한다. GitHub CI는 backend pytest·OpenAPI drift와 frontend lint·tsc·coverage·build·bundle 검사를 항상 전체 범위로 실행하며 coverage threshold 75/75/75/75를 유지한다.

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
