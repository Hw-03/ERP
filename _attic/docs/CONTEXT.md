# DEXCOWIN MES — 도메인 컨텍스트

신규 개발자/AI 가 코드를 보기 전에 도메인을 머리에 넣을 수 있도록 한 문서.
상세 코드 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 용어는 [GLOSSARY.md](GLOSSARY.md),
결정 기록은 [adr/](adr/).

## 무엇을 만드는 회사인가

DEXCOWIN — 정밀 X-Ray 장비 제조사. 제조 흐름은 6개 부서 계열(튜브 → 고압 → 진공 → 튜닝 →
조립 → 출하) × R/A/F 3단계 = 18개 process_type_code(실사용 16종)로 분류한다.
(품목 수 등 변동 숫자는 문서에 적지 않는다 — `python _attic/backend-scripts/facts.py` 로 확인.)

## 조직

```
생산부 (parent)
 ├ 튜브 / 고압 / 진공 / 튜닝 / 조립 / 출하    ← "라인" (별도 부서장 없음)
영업부 / 연구부 / A/S부 / 기타 (단독)
창고 (= 자재창고. 부서 enum 에는 없음, Inventory.warehouse_qty 가 그 역할)
```

**주의 — 6라인엔 개별 부서장이 없다.**
- 생산부 정/부 (현재 시드: 이필욱 / 김건호) 두 사람이 6라인 결재를 모두 처리한다.
- "자기 부서 부서장" 가정 금지. 정상 결재 경로는 (a) 생산부장 (b) 창고장 두 가지.

## 품목 (Item)

모든 품목은 다음을 갖는다: (전체 품목 수는 `facts.py` 참조)
- `process_type_code` (2글자) — 부서 계열 + R/A/F 단계 (예: `TR`, `AA`, `PF`). R=원자재 / A=중간공정 / F=공정완료
- `model_symbol` / `model_slots` — 모델 기호 조합 (3=DX3000 · 7=COCOON · 8=SOLO · 4=ADX4000W · 6=ADX6000FB). 마스터는 `product_symbols`(slot↔symbol↔model_name)
- `item_code` — 모델기호+공정코드+일련번호 를 합친 품목코드(단일 기준). ※ `erp_code`/`mes_code` 컬럼은 **없음**(과거 개념, 이미 `item_code`로 통합). 'mes_code'로의 이름 변경은 계획 단계.

상세 규칙: [ITEM_CODE_RULES.md](ITEM_CODE_RULES.md), [GLOSSARY.md](GLOSSARY.md) "공정코드".

## 재고 (Inventory)

재고는 한 품목당 3개 bucket 으로 분해된다:
- **warehouse** — 자재창고 보관량 (`Inventory.warehouse_qty`)
- **production** — 부서별 PRODUCTION 상태 합계 (`InventoryLocation`)
- **defective** — 부서별 DEFECTIVE 상태 합계 (`InventoryLocation`)

총재고 = warehouse + production + defective. 이 불변식은 `services/integrity.py` 가
주기적으로 검증한다.

## BOM

품목 간 부모-자식 관계. 다단계 전개.
- 생산(produce) 시 BOM 자식들이 자동 차감(BACKFLUSH)
- 분해(disassemble) 시 BOM 자식들이 자동 회수
- where-used 역추적 가능 (`/api/bom/where-used/{item_id}`)

## 입출고 (Io) — V2

현재 활성 입력 UI: `frontend/app/legacy/_components/_warehouse_v2/IoComposeView.tsx`.

작업 분기는 4 work type:
1. **`receive`** — 원자재 입고 (창고 정/부만 가능)
2. **`warehouse_io`** — 창고 ↔ 부서 (결재 필요한 흐름)
3. **`process`** — 부서 내 작업 (생산/분해/수량보정)
4. **`defect`** — 불량 격리/해제/처리/공급사 반품

**출하(ship)는 별도 work type 이 아니다** — `warehouse_io` 중 PF 품목이 창고에서 외부로
나가는 케이스를 자동으로 "출하" 로 기록 ([ADR-0001](adr/ADR-0001-io-compose-v2-work-types.md)).

## 결재 워크플로

- `warehouse_to_dept`, `dept_to_warehouse` 같은 흐름은 즉시 반영되지 않고 `StockRequest`
  로 변환되어 결재 큐에 들어간다.
- 결재자는 (a) 생산부장 (b) 창고장 둘 중 적절한 쪽.
- 결재 완료 → 실제 재고 변경 + `TransactionLog` 기록.

## 모바일

`MobileIoComposeWizard` 는 데스크탑 V2 의 컴포넌트/hook 을 그대로 재사용한다
([ADR-0003](adr/ADR-0003-mobile-reuses-desktop-v2.md)). 비즈니스 규칙 drift 0.

## 화면 라벨 단일 소스

`frontend/lib/io/glossary.ts` — work/sub/transaction/request type 라벨이 한 곳에.
사람용 사전은 [GLOSSARY.md](GLOSSARY.md). drift 검사: `glossary.test.ts`
([ADR-0002](adr/ADR-0002-shared-io-glossary.md)).

## 동결 영역

- **주간보고 화면** — `_weekly_sections/`, `DesktopWeeklyReportView.tsx` (2026-05-24 동결)
- 주변 리팩터/전역 변경/이름 통일 작업에서 우회. 명시 요청 시에만 수정.

## 운영

- 백엔드: `scripts/dev/start-backend.ps1` (좀비 워커 정리 + /health/live 확인)
- 정합성 검사: `services/integrity.py` 의 mismatch 카운트 (`/health/detailed` 노출)
- 백업: `scripts/ops/backup_db.bat`

## 더 알고 싶다면

- 폴더·레이어: [ARCHITECTURE.md](ARCHITECTURE.md)
- 엔티티 관계: [ERD.md](ERD.md)
- 용어집: [GLOSSARY.md](GLOSSARY.md)
- 결정 기록: [adr/README.md](adr/README.md)
- 운영: [OPERATIONS.md](OPERATIONS.md)
