# DEXCOWIN ERP

정밀 X-ray 장비 제조사의 품목, 재고, BOM, 입출고를 관리하는 ERP 프로젝트다.

## 현재 기준

- 기준 품목 수: 971건
- 백엔드: FastAPI + SQLAlchemy + SQLite
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 사용 화면: `/legacy`
- 품목코드 기준 문서: `docs/ITEM_CODE_RULES.md`

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

## 실행

백엔드:

```bash
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8010
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

## 주요 경로

| 경로 | 역할 |
|---|---|
| `backend/` | FastAPI 백엔드 |
| `frontend/` | Next.js 프론트엔드 |
| `docs/` | 현재 기준 문서와 작업 인수인계 |
| `docs/design/` | UI 디자인 참고 자료 |
| `_archive/` | 실험/보관 자료 |

## 문서

- `docs/README.md`: 문서 목차
- `docs/ITEM_CODE_RULES.md`: 품목코드 최종 기준
- `docs/AI_HANDOVER.md`: AI 작업 인수인계
- `docs/CODEX_PROGRESS.md`: 큰 기능 단위 진행 기록

## 검증

```bash
python -m compileall backend
cd frontend
npx tsc --noEmit
npm run build
```
