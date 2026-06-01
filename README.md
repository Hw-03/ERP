# DEXCOWIN MES

DEXCOWIN의 품목, 재고, BOM, 입출고를 관리하는 경량 MES 프로토타입.

**현재 안정성 점수**: ~96/100 (Round-10A 완료, 2026-05-02). 세부 추적: `_attic/docs/CODEX_PROGRESS.md` *(보관 중 — 복귀 검토 대상)*

## 현재 기준

- 기준 품목 수: 722건
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/mes.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 사용 화면: `/legacy` (데스크톱 셸: 대시보드 / 입출고 / 입출고 내역 / 관리자)
- 품목코드 기준 문서: `_attic/docs/ITEM_CODE_RULES.md`

## 빠른 시작 (Windows · 권장)

루트의 `start.bat` 한 번 실행으로 백엔드·프론트가 함께 뜨고 LAN IP 기준 브라우저가 자동 실행된다.

```bat
start.bat
```

- 백엔드: `http://0.0.0.0:8010` (로컬 호출은 `http://127.0.0.1:8010`)
- 프론트엔드: `http://<LAN IP>:3000` 또는 `http://localhost:3000`
- 같은 사설망 안의 다른 PC에서도 `http://<LAN IP>:3000` 으로 접속 가능

처음 실행 시 `npm install` 과 `pip install -r backend/requirements.txt` 가 자동 수행된다.

## 수동 실행

백엔드 (canonical — 좀비 워커 자동 정리 + 헬스 확인):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
```

백엔드 (순수 uvicorn):

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

프론트엔드:

```bash
cd frontend
npm run dev
```

대표 접속:

```text
http://localhost:3000
```

## 운영 보조 스크립트

| 스크립트 | 역할 |
|---|---|
| `scripts/ops/backup_db.bat` | `backend/mes.db` 를 `backend/_backup/mes_YYYYMMDD_HHMMSS.db` 로 복사 |
| `scripts/ops/healthcheck.bat` | `GET /health/detailed` 호출 후 결과 출력 |
| `scripts/ops/reconcile_inventory.bat` | 정합성 1차 진단 + 자동 백업 |

자세한 운영 절차는 `_attic/docs/OPERATIONS.md` 참고.

## 품목코드 핵심 규칙

공정코드는 18개를 사용한다.

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
{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]
```

모델기호 목록:

| 기호 | 모델명 |
|---|---|
| `3` | DX3000 |
| `4` | ADX4000W |
| `6` | ADX6000FB |
| `7` | COCOON |
| `8` | SOLO |

예시:

```text
346-AF-0001
3-PA-0001-BG
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
│   ├── app/legacy/       현재 활성 셸 (대시보드/입출고/내역/관리자)
│   ├── features/mes/     MES feature 정본 (shared 부품 등) — 신규 import 대상
│   └── lib/
│       ├── api/          13 도메인 모듈 (admin/catalog/.../stock-requests)
│       │   └── types/    도메인별 type 정본 (Round-10A #2)
│       ├── api-core.ts   fetch 헬퍼 (postJson/putJson/deleteJson/parseError)
│       └── mes/          MES 디자인시스템 (color/format/status/...)
├── data/                 입력 자료 (xlsx · csv) + db_backups/ (DB 백업 단일 보관소)
├── _dev/baselines/       FastAPI OpenAPI baseline (CI drift 검사 기준)
│   └── openapi.json
├── scripts/              보조 스크립트
│   ├── ops/              백업 · 헬스체크 · 재고 정합
│   ├── migrations/       DB 스키마 / 코드 정제
│   └── dev/              verify_local.ps1 등 개발 보조
├── docker/               컨테이너 정의 (docker-compose.yml · docker-compose.nas.yml)
├── _attic/               강제 위치 없는 모든 자료의 보관소
│   ├── docs/             도메인 사전·가이드 (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS 등)
│   ├── backend-scripts/  1회성 backend 스크립트 (seed/sync/archive/backup)
│   ├── data/db_backups/  DB 백업 (로컬, .gitignore 매칭)
│   └── ONBOARDING.md     신규 합류자 가이드
├── _archive/             보관용 — 작업 대상 아님
├── start.bat             통합 실행 (Windows)
├── README.md             이 문서
└── CLAUDE.md             AI/개발자 작업 규칙
```

공용 UI 부품(EmptyState · LoadFailureCard · ConfirmModal · ResultModal · StatusPill · LoadingSkeleton) 은 `frontend/app/legacy/_components/common/` — 자세한 컴포넌트 위치·레이어는 [_attic/docs/ARCHITECTURE.md](_attic/docs/ARCHITECTURE.md) 참조.

## 문서 허브

2026-05-29 정리 후 모든 문서는 `_attic/docs/` 에 통합. 도구가 자동 참조하지 않는 자료는 모두 `_attic/` 보관소로 옮김 ([_attic/docs/ATTIC_POLICY.md](_attic/docs/ATTIC_POLICY.md)).

| 문서 | 대상 | 내용 |
|---|---|---|
| [_attic/docs/CONTEXT.md](_attic/docs/CONTEXT.md) | 신규 합류자 | 도메인 한눈 보기 (조직·품목·재고·BOM·입출고·결재) — 코드 보기 전 필독 |
| [_attic/docs/OPERATIONS.md](_attic/docs/OPERATIONS.md) | 운영자 | 365일 운영, 시작·재시작, 포트 충돌, 백업, 1차 장애 대응 |
| [_attic/docs/ARCHITECTURE.md](_attic/docs/ARCHITECTURE.md) | 개발자 | 폴더 구조·레이어·재고 3-bucket 모델 *(V2 흐름은 갱신 예정 — STALE 마커 참조)* |
| [_attic/docs/ERD.md](_attic/docs/ERD.md) | 개발자 | 엔티티 관계도(Mermaid) *(V2 IoBatch/IoBundle/IoLine 누락 — STALE 마커 참조)* |
| [_attic/docs/GLOSSARY.md](_attic/docs/GLOSSARY.md) | 모두 | 도메인 용어 단일 소스 (부서·공정코드·재고 모델·에러코드) |
| [_attic/docs/ITEM_CODE_RULES.md](_attic/docs/ITEM_CODE_RULES.md) | 모두 | 품목코드 최종 기준 |
| [_attic/docs/ATTIC_POLICY.md](_attic/docs/ATTIC_POLICY.md) | 유지보수 | `_attic/` 보관·삭제 정책 |
| [_attic/docs/adr/](_attic/docs/adr/) | 모두 | 아키텍처 결정 기록 (Architecture Decision Records) |
| [_attic/ONBOARDING.md](_attic/ONBOARDING.md) | 신규 합류자 | 처음 셋업·도구·관행 가이드 |

이외 자료: `_attic/docs/research/`, `_attic/docs/feedback/`, `_attic/docs/주간보고.md`, `_attic/docs/mobile-*`, `_attic/docs/db-normalization-plan.md` 등.

## 검증

### 5게이트 일괄 검증 (commit 전 권장)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

backend pytest / frontend lint:strict / tsc / vitest+coverage / next build / OpenAPI drift 를 CI 와 동일 기준으로 검사. coverage threshold 50/50/50/50.

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
