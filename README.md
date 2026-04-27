# DEXCOWIN ERP

정밀 X-ray 장비 제조사의 품목, 재고, BOM, 입출고를 관리하는 내부 ERP/MES 프로토타입.

## 현재 기준

- 기준 품목 수: 971건
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 사용 화면: `/legacy` (데스크톱 셸: 대시보드 / 입출고 / 입출고 내역 / 관리자)
- 품목코드 기준 문서: `docs/ITEM_CODE_RULES.md`

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

백엔드:

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
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
| `scripts/ops/backup_db.bat` | `backend/erp.db` 를 `backend/_backup/erp_YYYYMMDD_HHMMSS.db` 로 복사 |
| `scripts/ops/healthcheck.bat` | `GET /health/detailed` 호출 후 결과 출력 |
| `scripts/ops/reconcile_inventory.bat` | 정합성 1차 진단 + 자동 백업 |

자세한 운영 절차는 `docs/OPERATIONS.md` 참고.

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

ERP 코드 포맷:

```text
{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]
```

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
│   ├── erp.db            기준 스냅샷 (971 품목)
│   └── requirements.txt
├── frontend/             Next.js 14 · Tailwind
│   └── app/legacy/       현재 활성 셸 (대시보드/입출고/내역/관리자)
├── data/                 입력 자료 (xlsx · csv)
├── docs/                 기준 · 운영 · 구조 · 인수인계
│   └── research/         외부 연구 보고서
├── scripts/              보조 스크립트
│   ├── ops/              백업 · 헬스체크 · 재고 정합
│   ├── migrations/       DB 스키마 / 코드 정제
│   └── dev/              개발 보조 · 일회성 임포트
├── docker/               컨테이너 정의 (선택)
├── _archive/, _backup/   보관용 — 작업 대상 아님
├── start.bat             통합 실행 (Windows)
├── README.md             이 문서
└── CLAUDE.md             AI/개발자 작업 규칙
```

공용 UI 부품(EmptyState · LoadFailureCard · ConfirmModal · ResultModal · StatusPill · LoadingSkeleton) 은 `frontend/app/legacy/_components/common/` — 자세한 컴포넌트 위치·레이어는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참조.

## 문서 허브

| 문서 | 대상 | 내용 |
|---|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | 현장 사용자 | 화면별 사용법 (대시보드 / 입출고 / 내역 / 관리자) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 운영자 | 365일 운영, 시작·재시작, 포트 충돌, 백업, 1차 장애 대응 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 개발자 | 폴더 구조·레이어·재고 3-bucket 모델·wizard 흐름 |
| [docs/ERD.md](docs/ERD.md) | 개발자 | 엔티티 관계도(Mermaid) + 자재→재고→생산→출하 흐름 |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | 모두 | 도메인 용어 단일 소스 (부서·카테고리·재고 모델·에러코드) |
| [docs/ITEM_CODE_RULES.md](docs/ITEM_CODE_RULES.md) | 모두 | 품목코드 최종 기준 |
| [docs/AI_HANDOVER.md](docs/AI_HANDOVER.md) | AI 협업자 | 인수인계 (Phase 4·5 결과 포함) |
| [docs/CODEX_PROGRESS.md](docs/CODEX_PROGRESS.md) | 모두 | 큰 기능 단위 진행 기록 |
| [docs/BACKEND_REFACTOR_PLAN.md](docs/BACKEND_REFACTOR_PLAN.md) | 다음 작업 | 백엔드 개선 진행 / 보류 사유 |
| [docs/FRONTEND_HOOKS_PLAN.md](docs/FRONTEND_HOOKS_PLAN.md) | 다음 작업 | 프론트 hook·뷰 분할 진행 / 보류 사유 |
| [docs/research/MOBILE_BARCODE_ARCHITECTURE.md](docs/research/MOBILE_BARCODE_ARCHITECTURE.md) | 다음 작업 검토 | 모바일 바코드 스캐너 아키텍처 외부 연구 |

## 검증

```bash
# 백엔드
python -m compileall backend

# 프론트
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

수동 smoke (백엔드 기동 후):

```text
GET  /health
GET  /api/items
GET  /api/inventory/summary
GET  /api/production/capacity
```
