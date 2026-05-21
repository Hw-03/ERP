---
type: guide
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-05-21
updated: 2026-05-21
tags: [vault, guide, faq, onboarding]
aliases:
  - FAQ 전체
  - 자주 묻는 질문
---

# ❓ FAQ — 자주 묻는 질문

> [!info] 이 문서는
> 신입 개발자(비전공, 경력 1년 2개월)가 인수인계 첫 주에 가장 자주 물을 법한 것들을 모았다.
> 모르면 물어보는 게 맞고, 여기서 못 찾으면 [[위험지대_지도]] → [[처음_읽는_사람]] 순서로 이어서 읽자.

> [!tip] 실제 코드가 기준이다
> 이 vault 와 코드가 다르면 **항상 코드를 믿는다**. CLAUDE.md 규칙: "If docs and live code disagree, trust the live code."

---

## 1. 시스템 일반

> [!question] "DEXCOWIN MES" 와 "ERP" 의 차이는?

이 시스템의 **공식 이름은 DEXCOWIN MES** 다. 코드 내 `xray-erp`, 폴더명 `ERP`, 내부 식별자 `erp_code` 처럼 "ERP" 라는 단어가 여기저기 남아 있지만, 화면·문서·발표 자료에서는 **DEXCOWIN MES 로만 표기한다**. `xray-erp` 같은 legacy 식별자는 CLAUDE.md 룰에 따라 명시적 요청 없이 rename 금지.

**관련**: [[용어사전#DEXCOWIN MES]], [[erp/CLAUDE.md]]

---

> [!question] 왜 이 시스템이 만들어졌나?

DEXCOWIN 의 품목(722건), 재고, BOM, 입출고를 관리하는 **경량 MES 프로토타입**이다. 기존 수작업(엑셀·종이) 대비 재고 정확도·결재 추적을 자동화하기 위해 **Claude Code / Codex 로 바이브 코딩** 하여 만들어졌다. 즉, 잘 돌아가는 것처럼 보이는 코드라도 **미묘한 가정 위에 서 있을 수 있다**. [[AI_생성_코드_읽는_법]] 을 꼭 읽자.

**관련**: [[바이브_코딩_컨텍스트]], [[처음_읽는_사람]]

---

> [!question] 어떤 화면이 실제 사용 중인가? `legacy` 폴더는 구버전 아닌가?

아니다. `erp/frontend/app/legacy/` 는 이름과 달리 **현재 운영 중인 메인 UI** 다. 대시보드 / 입출고탭 / 입출고 내역 / 관리자 화면이 모두 여기 있다. 헷갈리지 말 것.

진짜 옛 버전(실제 legacy)은 `erp/_attic/frontend/_archive/` 안에 격리돼 있다. 손대지 말 것.

**관련**: [[용어사전#legacy 폴더]], [[위험지대_지도#🟠 7. frontend legacy]]

---

> [!question] 백엔드와 프론트엔드 포트 번호가 뭔가?

- **백엔드**: `http://127.0.0.1:8010` (FastAPI + uvicorn)
- **프론트엔드**: `http://localhost:3000` (Next.js dev)
- LAN 내 다른 PC 접속: `http://<LAN IP>:3000`

가장 빠른 실행은 루트의 `start.bat` 한 번이다. 처음 실행 시 `npm install` 과 `pip install` 이 자동 수행된다.

**관련**: [[erp/docs/OPERATIONS.md]], [[erp/README.md]]

---

> [!question] 이 시스템에 테스트가 있나?

백엔드에는 `erp/backend/tests/` 아래 pytest 테스트가 있다. 프론트엔드는 vitest + coverage 를 쓴다. 커밋 전에는 반드시:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

이 스크립트가 backend pytest / frontend lint:strict / tsc / vitest+coverage / next build / OpenAPI drift 를 한 방에 검사한다. coverage threshold 는 50/50/50/50.

**관련**: [[erp/scripts/dev/verify_local.ps1]], [[용어사전#verify_local.ps1]]

---

> [!question] 시스템 안정성은 얼마나 되나? 믿어도 되나?

README 기준 **~96/100 (Round-10A 완료, 2026-05-02)**. 운영 데이터로 실제 사용 중이지만, 음수 재고 사건·9시간 오차 사건 등 **실제 버그가 있었고 수정된 이력**도 있다. "돌아가고 있으니 괜찮다"는 가정은 금물. [[위험지대_지도]] 를 읽고, 위험 영역은 체크리스트를 거쳐 가라.

**관련**: [[위험지대_지도]], [[erp/docs/CODEX_PROGRESS.md]]

---

## 2. 코드/구조

> [!question] 주석이 너무 적다. 어떻게 코드를 이해하나?

의도적 정책이다. 이 프로젝트는 주석 대신 **함수명·변수명·commit 메시지** 에 의도를 담는다. 코드를 읽을 때 이 순서로:

1. 코드 자체 (변수명/함수명)
2. `erp/plans/` — 작업 단위 의도
3. `erp/docs/` — 설계 결정·흐름도
4. `git log --oneline -n 30` — 언제·왜 그 라인이 들어왔는지
5. vault 노트 (이 문서)

[[AI_생성_코드_읽는_법]] 에 이 과정이 구체적인 예시와 함께 자세히 나와 있다.

**관련**: [[AI_생성_코드_읽는_법]], [[erp/CLAUDE.md]]

---

> [!question] 이 함수가 어디서 호출되는지 어떻게 찾나?

IDE "Find References" 가 제일 빠르다. 아니면:

```bash
git grep -n "함수명"
```

특히 백엔드 services 레이어는 `routers/` 에서 호출하고, routers 는 frontend `lib/api/<도메인>.ts` 가 호출하는 구조다. **`erp/frontend/lib/api.ts` 는 얇은 re-export 레이어**이므로 실제 함수는 `lib/api/<도메인>.ts` 안에 있다.

**관련**: [[AI_생성_코드_읽는_법#3. 3대 추적 동선]]

---

> [!question] frontend → backend → DB 흐름이 어떻게 되나?

```
사용자 클릭
  → frontend/app/legacy/_components/<Component>.tsx
  → frontend/lib/api/<도메인>.ts  (HTTP)
  → backend/app/routers/<도메인>.py
  → backend/app/services/<도메인>.py
  → backend/app/models.py
  → PostgreSQL / SQLite (mes.db)
```

화면에서 버그가 나오면 이 흐름 중 어디서든 원인일 수 있다. 흐름을 모르면 디버깅이 운이 된다. 각 레이어 역할: routers = 입출구, schemas.py = DTO, services = 도메인 로직, models.py = DB 정의.

**관련**: [[AI_생성_코드_읽는_법#3-1. 화면 변경 흐름]]

---

> [!question] 같은 일을 하는 함수가 두 개 보인다. 어느 게 맞나?

AI 코딩의 흔한 잔재다. 컨텍스트 윈도우가 유한해서 이미 있는 함수를 못 보고 다시 짤 때가 있다. **혼자 합치지 말 것**. CLAUDE.md: "Do not perform large refactors unless explicitly asked." 발견 → 사용자에게 보고 → 지시 받고 진행.

**관련**: [[AI_생성_코드_읽는_법#5. AI 코드의 흔한 함정 5가지]]

---

> [!question] 라우터가 15개라는데, 어떻게 구분하나?

`erp/backend/app/routers/` 에 기능별로 나뉘어 있다:

`admin_audit / admin_audit_csv / bom / codes / departments / dept_adjustment / employees / io / items / models / production / settings / stock_requests / variance`

그리고 `inventory/` 는 단일 파일이 아닌 **패키지(폴더)** 로 분리됐다 — `inventory/__init__.py` + `inventory/transactions.py` 등. "inventory.py 가 없어요" 하는 신입이 꼭 나온다.

**관련**: [[용어사전#라우터 router]]

---

> [!question] services 레이어는 어떻게 읽나?

AI 코드라도 services 레이어에선 의도가 비교적 정직하게 드러난다. 읽는 순서:

1. 모듈 docstring (도메인 규칙 요약)
2. dataclass / TypedDict 선언 (DTO 모양)
3. public 함수 시그니처만 훑기 (무엇을 외부에 노출하나)
4. private (`_` 접두사) 함수는 마지막

함수 본문은 디버깅할 때만 깊이 들어간다.

**관련**: [[AI_생성_코드_읽는_법#8-A. 보너스]]

---

## 3. 운영

> [!question] DB 초기화(재설치)는 어떻게 하나?

```bash
cd backend
python bootstrap_db.py --all
```

이 명령 하나로 setup + schema change + migration + seed 가 모두 처리된다. **서버 시작(`uvicorn`)은 DB 를 절대 바꾸지 않는다**. DB 를 건드리는 작업은 이 명령을 통해서만. 실행 전 반드시 백업 먼저.

**관련**: [[용어사전#bootstrap_db.py --all]], [[erp/backend/bootstrap_db.py]]

---

> [!question] `verify_local.ps1` 은 뭘 검사하나?

커밋/푸시 전 CI 와 동일한 기준으로 5-게이트를 한 번에 검사한다:

1. backend pytest
2. frontend lint:strict
3. tsc (TypeScript 타입 검사)
4. vitest + coverage (coverage threshold 50/50/50/50)
5. next build + OpenAPI drift (docs/openapi.json 일치 여부)

CI 실패를 로컬에서 먼저 잡는 용도. **커밋 전엔 반드시 통과** 시키고 올릴 것.

**관련**: [[용어사전#verify_local.ps1]], [[erp/scripts/dev/verify_local.ps1]]

---

> [!question] 백업은 어떻게 하고, 복구는 어떻게 하나?

**백업**:
```bat
scripts\ops\backup_db.bat
```
→ `backend/_backup/mes_YYYYMMDD_HHMMSS.db` 로 복사됨. SQLite online backup API 를 쓰므로 서버 가동 중에도 안전하게 실행 가능.

**복구** (백엔드 정지 후):
```bat
scripts\ops\restore_db.bat mes_20260426_101530.db
```
→ 현재 DB 를 `mes_PRE-RESTORE_TS.db` 로 보존 → 정합성 체크 → 교체.

**백업 검증**: `scripts\ops\verify_backup.bat` — 주 1회 권장.

> [!warning] 운영 DB 는 `backend/mes.db` 하나다. 루트에 `mes.db` 가 있어도 손대지 않는다.

**관련**: [[erp/docs/OPERATIONS.md]], [[erp/scripts/ops/ops]]

---

> [!question] 운영 중 화면이 안 뜨거나 데이터가 안 불러와지면?

1. `start.bat` 재실행 (대부분 해결)
2. `scripts\ops\healthcheck.bat` 실행 → `status: "ok"`, `database: "ok"` 확인
3. `inventory_mismatch_count > 0` 이면 DB 정합성 문제 — DB 백업 후 운영 담당에게 보고
4. 포트 충돌(`EADDRINUSE`): `netstat -ano | findstr :8010` → `taskkill /PID <PID> /F` → 재실행

자세한 1차 장애 대응표는 [[erp/docs/OPERATIONS.md]] 에 있다.

**관련**: [[erp/docs/OPERATIONS.md]]

---

> [!question] API 스키마를 수정했는데 CI 에서 OpenAPI drift 에러가 난다. 왜?

`docs/openapi.json` 이 변경 전 버전 그대로이기 때문이다. 백엔드 라우터/스키마를 수정하면 반드시 아래 명령으로 갱신하고 같은 커밋에 포함시킨다:

```bash
cd backend
python -c "from app.main import app; import json; \
  open('../docs/openapi.json','w',encoding='utf-8').write(\
  json.dumps(app.openapi(),indent=2,sort_keys=True,ensure_ascii=False)+chr(10))"
```

**관련**: [[erp/README.md#검증]], [[erp/docs/openapi.json]]

---

## 4. 도메인

> [!question] `ItemCode` 와 `ErpCode` 는 다른 건가?

같은 것을 가리키는 **두 이름**이다. commit `f1ff96c` 에서 도메인 이름을 `ErpCode → ItemCode` 로 rename 했다. 그래서:

- 코드 문서에서 말하는 **ItemCode** = 품목 고유 4파트 코드 (`346-AR-0001`)
- 코드 안의 변수명/함수명에 남은 **erp_code / ErpCode** = legacy 식별자 (보존, rename 금지)

헷갈리면: "이름은 두 개지만 가리키는 물건은 하나" 로 기억하면 된다.

**관련**: [[용어사전#ItemCode]], [[위험지대_지도#🟠 6. ItemCode 도메인]]

---

> [!question] 재고는 어떻게 계산하나? "3-bucket" 이 뭔가?

한 품목의 재고는 세 곳에 동시에 나뉘어 존재한다:

| 버킷 | 필드 | 의미 |
|---|---|---|
| 창고 재고 | `Inventory.warehouse_qty` | 중앙 창고 |
| 부서 정상 | `InventoryLocation.quantity (PRODUCTION)` | 각 부서 정상 풀 |
| 부서 불량 | `InventoryLocation.quantity (DEFECTIVE)` | 각 부서 격리 풀 |

불변식: `Inventory.quantity = warehouse_qty + Σ(InventoryLocation.quantity)` 이 항상 성립해야 한다. 이 불변식이 깨지면 음수 재고·재고 손실이 발생한다 (실제 사고 사례 있음).

**관련**: [[용어사전#재고 3계층]], [[위험지대_지도#🔴 1. 재고 수량 계산]]

---

> [!question] 불량 처리 흐름은 어떻게 되나?

불량 처리는 **4단계 트랜잭션**으로 이루어진다:

| 액션 | 트랜잭션 | 결재 | 대상 |
|---|---|---|---|
| 격리(MARK_DEFECTIVE) | 정상 → 불량 버킷 이동 | 없음(즉시) | 모든 유형 |
| 폐기(SCRAP) | 재고 영구 소멸 | 필요 | 격리 후 OR R 정상 직접 |
| 공급처 반품(SUPPLIER_RETURN) | 반품 처리 | 필요 | R 타입 한정 |
| 분해(DISASSEMBLE) | 본체 소멸, 자식 입고 | 필요 | PA/PF 격리 후만 |

> [!warning] SCRAP ≠ DISASSEMBLE. 분해는 자식이 살아남고, 폐기는 통째로 사라진다.

**관련**: [[용어사전#MARK_DEFECTIVE / SCRAP / SUPPLIER_RETURN / DISASSEMBLE]], [[위험지대_지도#🔴 5. 불량 처리 흐름]], [[erp/docs/defect-handling-redesign.md]]

---

> [!question] 부서 결재는 누가 할 수 있나? "라인 부서장" 이 결재하면 안 되나?

**라인(튜브/고압/진공/튜닝/조립/출하) 자체에는 결재자 풀이 비어 있다.** 라인에서 올라오는 결재는 항상 두 경로 중 하나:

1. **생산부장** (이필욱·김건호)
2. **창고장** (정/부)

"라인 부서장이 결재한다"는 가정으로 코드를 짜면 즉시 깨진다. 결재 권한 체크 함수(`can_approve` / `is_ancestor_department`)를 절대 우회하지 말 것.

**관련**: [[위험지대_지도#🔴 3. 부서 결재 라우팅]], [[erp/docs/defect-handling-redesign.md]]

---

> [!question] `TransactionLog` 를 수정해도 되나?

**절대 안 된다.** `TransactionLog` 는 입출고 흐름의 진실의 소스(Source of Truth)다. UPDATE / DELETE 하면 감사 추적이 끊기고 "왜 이 수량이 됐는지" 영원히 알 수 없게 된다.

내역 수정이 필요하면 → **새 행을 추가**(취소/보정 트랜잭션). 기존 행을 UPDATE 하는 건 어떤 상황에서도 ❌.

**관련**: [[위험지대_지도#🔴 2. Audit log / 입출고 내역]], [[erp/backend/app/models.py]]

---

> [!question] `BF` 공정코드가 보이는데, 써도 되나?

**사용 금지.** `BF` 는 구형 오염 코드다. 현재 기준 조립 F 타입은 `AF` 다. 옛 데이터에서 `BF` 가 보이면 무시하거나 마이그레이션 대상으로 보고만 할 것.

공정코드 18개 체계: 부서(T/H/V/N/A/P) × 단계(R/A/F).

**관련**: [[erp/docs/ITEM_CODE_RULES.md]], [[용어사전#공정 코드 process_type_code]]

---

## 5. 최근 3주치 변화

> [!question] `queue` / `alerts` / `counts` / `loss` 라우터가 코드에서 안 보인다. 삭제된 건가?

맞다. commit `7f73550` 에서 **죽은 라우터 5종이 삭제**됐다: `queue / alerts / counts / loss / ship_packages`. 옛 docs 나 vault 노트에 이 이름들이 언급돼 있어도 **무시하면 된다**. 현재 활성 라우터는 14개다.

> [!info] 이런 잔재가 또 나올 수 있다. "코드에 없으면 없는 것" 이 기준이다.

**관련**: [[용어사전#라우터 router]], [[AI_생성_코드_읽는_법#5. AI 코드의 흔한 함정 5가지]]

---

> [!question] 시간 데이터가 9시간 차이 난다. 왜 그랬고, 지금은 고쳐졌나?

DB 는 UTC 로 저장하지만 응답 스키마에서 timezone 정보가 누락되면서 프론트가 UTC 인지 KST 인지 모르는 상태가 됐었다. 결과: **모든 시간이 9시간 어긋나** 보임.

commit `4db421a` 에서 근본 수정 완료: **`UtcDatetime` 타입을 전체 응답 스키마로 확산** (F4b 완료). 이 커밋 이전 스키마 코드는 참고하지 말 것.

새 응답 스키마를 만들 때 `datetime` 타입을 그냥 쓰면 다시 재발한다. **반드시 `UtcDatetime` 으로 선언할 것**.

**관련**: [[용어사전#UtcDatetime]], [[위험지대_지도#🟠 4. UtcDatetime 변환]]

---

> [!question] `inventory.py` 라우터 파일이 없다. 패키지로 바뀐 건가?

맞다. `erp/backend/app/routers/inventory.py` 단일 파일이 `erp/backend/app/routers/inventory/` 패키지로 분리됐다. `inventory/__init__.py`, `inventory/transactions.py` 등이 있다. Glob 으로 먼저 찾아보자.

**관련**: [[erp/backend/app/routers/inventory/]]

---

> [!question] 최근에 ItemCode 도메인 rename 이 있었다고 하던데, 영향이 뭔가?

commit `f1ff96c`: `ErpCode → ItemCode` 도메인 rename + `items.item_code` 통합 완료. 주요 변화:

- 도메인 코드 안에서 `ItemCode` 라고 부름
- DB 컬럼 / legacy 함수명의 `erp_code / ErpCode` 는 그대로 보존
- 별도 테이블에 흩어진 옛 코드 참조는 이제 `items.item_code` 하나로 통합

이전 PR(`91a5a83 refactor: item_code → erp_code 전면 교체`) 처럼 이름 바꾸는 작업은 위험하다. 함부로 rename 하지 말 것.

**관련**: [[위험지대_지도#🟠 6. ItemCode 도메인]], [[용어사전#ItemCode]]

---

> [!question] 모바일 UI 는 언제 추가됐나? 어디에 있나?

2026-05-19 commit `17ef83e` 에서 **모바일 UI 전면 재설계** 가 들어갔다. Desktop\*View 를 재사용하는 패턴이라, **한 곳을 고치면 데스크탑·모바일 양쪽에 영향**이 간다.

위치: `erp/frontend/app/legacy/_components/mobile/io/MobileIoComposeWizard.tsx` 가 메인 위자드 진입점. 모바일만 고치다 데스크탑이 깨지는 경로를 항상 의식할 것.

**관련**: [[위험지대_지도#🟠 7. frontend legacy]], [[용어사전#모바일 wizard]]

---

## 6. 위험지대

> [!question] 어디를 손대면 가장 위험한가?

[[위험지대_지도]] 에 7개 위험지대가 자세히 나와 있다. 요약:

| 영역 | 위험도 | 한 줄 이유 |
|---|---|---|
| 재고 수량 계산 (`inventory.py`) | 🔴 HIGH | 락 없이 수량 바꾸면 음수 재고·race condition |
| Audit log (`TransactionLog`) | 🔴 HIGH | UPDATE/DELETE = 감사 추적 영구 손실 |
| 부서 결재 라우팅 (`dept_adjustment.py`) | 🔴 HIGH | 결재 우회 또는 결재 잠김 |
| 불량 처리 흐름 | 🔴 HIGH | 상태 머신 깨지면 재고 분류 오염 |
| UtcDatetime 변환 | 🟠 MEDIUM | 9시간 오차 재발 |
| ItemCode 도메인 (`codes.py`) | 🟠 MEDIUM | 잘못된 코드가 DB 에 들어감 |
| frontend legacy `_components` | 🟠 MEDIUM | props drilling 상태 공유가 조용히 깨짐 |

**관련**: [[위험지대_지도]]

---

> [!question] `_attic` 폴더는 뭔가? 왜 건드리면 안 되나?

`erp/_attic/` 은 **모든 격리 폴더의 통합 보관소**다. 옛 `_archive/`, `_backup/`, `frontend/_archive/` 가 모두 이 안으로 통합됐다. 운영 백업·이전 버전·옛 작업 노트 보존 영역이다.

여기 있는 코드가 라이브 코드로 보이면 → **라이브 코드의 import 경로가 잘못된 것**이다. `_attic` 을 수정하는 게 아니라 라이브 코드를 고쳐야 한다. **재구성도 금지** (`attic-quarantine-convention`).

**관련**: [[용어사전#_attic]], [[위험지대_지도#🚫 "묻고 손대라" 폴더]]

---

> [!question] `.obsidian` 폴더를 건드려도 되나?

**절대 안 된다.** `.obsidian/` 은 Obsidian 플러그인·워크스페이스 설정이다. 여기를 망치면 사용자 본인의 Vault 편집 환경이 깨진다. 건드리고 싶은 이유가 생겼다면 먼저 사용자에게 물어봐라.

**관련**: [[위험지대_지도#🚫 "묻고 손대라" 폴더]]

---

> [!question] `_archive` 폴더를 찾는데 없다. 어디 갔나?

`erp/_attic/_archive/` 안으로 들어갔다. 옛 루트 `_archive/`, `backend/_backup/`, `frontend/_archive/` 가 모두 `_attic/` 아래로 통합됐다. CLAUDE.md 의 옛 표기는 그대로 남아 있지만 실제 폴더 위치는 `_attic/` 이다.

> [!warning] 어디서 찾든 건드리지 않는 게 원칙이다. 읽기 전용으로 취급하라.

**관련**: [[용어사전#_attic]], [[위험지대_지도#🚫 "묻고 손대라" 폴더]]

---

> [!question] 재고 수량을 한 줄만 바꾸면 될 것 같은데, 직접 빼면 안 되나?

**안 된다.** 직접 `inv.warehouse_qty -= qty` 한 줄 쓰면 **락 없음 + 음수 가드 없음 + `_sync_total` 호출 없음**, 세 가지가 한꺼번에 빠진다. **항상 기존 헬퍼를 거칠 것**:

| 하지 말 것 | 대신 쓸 것 |
|---|---|
| `inv.warehouse_qty -= qty` | `consume_warehouse(db, item_id, qty)` |
| `loc.quantity -= qty` | `consume_from_department(db, item_id, qty, dept)` |
| `loc.status = DEFECTIVE` | `mark_defective(db, item_id, qty, ...)` |

**관련**: [[위험지대_지도#🧰 안전하게 손대는 3원칙]]

---

## 7. 옵시디언 / Vault

> [!question] 이 vault 와 main 브랜치의 관계는?

`vault/` 폴더는 **`vault-sync` 브랜치에서만** 추적된다. main 브랜치에는 vault 폴더가 없다(또는 다르게 관리됨). vault 문서를 수정하거나 새 노트를 만들 때는 `vault-sync` 브랜치에서 작업해야 한다.

> [!info] 두 브랜치의 코드 부분은 동일해야 한다. vault 는 설명 문서 레이어다.

**관련**: [[용어사전#vault-sync]]

---

> [!question] 노트를 새로 만들어도 되나? 어떻게 해야 하나?

`vault-sync` 브랜치 안에서는 OK. `vault/_vault/` 아래에 만들면 된다. Obsidian 에서 직접 새 파일 만들거나, 코드 에디터에서 `.md` 파일 생성 후 적절한 frontmatter 를 달아주면 된다.

단, main 브랜치에는 vault 노트가 들어가지 않는다. commit/push 할 때 브랜치를 잘 확인할 것.

**관련**: [[용어사전#vault-sync]]

---

> [!question] 노트 템플릿은 어디 있나?

`vault/_vault/templates/` 아래에 있다. Code Note, Guide Note, ADR 등의 템플릿이 있을 가능성이 높다. Obsidian 에서 "템플릿 삽입" 기능을 쓰거나, 직접 파일을 복사해서 frontmatter 를 맞춰 쓰면 된다.

**관련**: `erp/vault/_vault/templates/`

---

> [!question] vault 문서가 틀린 것 같다. 수정해야 하나?

코드와 vault 가 다르면 **항상 코드가 맞다**. vault 는 설명 레이어이므로 틀릴 수 있다. 발견했다면:

1. 코드가 실제로 어떻게 동작하는지 확인
2. vault 노트에서 틀린 부분 수정
3. `vault-sync` 브랜치에 커밋

단, "내가 잘못 이해한 것은 아닌가?" 먼저 의심하자. 확신이 없으면 사용자에게 물어봐라.

**관련**: [[erp/CLAUDE.md]]

---

> [!quote] 마지막 한 마디
> 모르는 게 있으면 혼자 추측해서 코드를 바꾸지 말고, **먼저 물어봐라.**
> "한 줄만 고치면 되겠지" 가 가장 위험한 생각이다.

---

Up: [[_vault/guides/_guides]]

`#layer/meta` `#topic/faq` `#audience/all`
