# 품목 코드 규칙 기준 문서

> 이 문서가 품목 코드와 부서 필터의 최종 기준이다. AI, 사람, 코드 수정자는 아래 표를 우선한다.

## 공정 코드 기준표

`process_type_code`는 `{부서 계열 1글자}{단계 1글자}` 형식이다.

| 부서 | R 타입 | A 타입 | F 타입 |
|---|---|---|---|
| 튜브 | `TR` | `TA` | `TF` |
| 고압 | `HR` | `HA` | `HF` |
| 진공 | `VR` | `VA` | `VF` |
| 튜닝 | `NR` | `NA` | `NF` |
| 조립 | `AR` | `AA` | `AF` |
| 출하 | `PR` | `PA` | `PF` |

- 총 18개 코드다.
- 조립 A 타입은 반드시 `AA`다. (`BA`는 구형 오염 코드)
- 조립 F 타입은 반드시 `AF`다. (`BF`는 구형 오염 코드)

## 품목 코드 포맷

```text
{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]
```

예시:

```text
346-AF-0001
3-PA-0001-BG
34-TR-0023
```

## AI 금지 규칙

1. `BF`/`BA`를 조립 코드로 추가하지 않는다. 조립 A/F 타입은 `AA`/`AF`다.
2. `B-prefix` 구형 코드(`BA`, `BF`)로 부서를 추론하지 않는다. 현재 부서 판단은 `process_type_code`와 `department` 필드 기준이다.
3. 부서 필터는 `category`가 아니라 `process_type_code`와 `department` 응답 필드를 기준으로 만든다.
4. 코드 규칙을 수정할 때는 백엔드, 프론트, 문서를 함께 갱신한다.
5. “전체” 필터와 “모든 부서/모든 모델 개별 선택”은 같은 품목 수를 보여야 한다.

## 코드 위치

| 역할 | 파일 | 기준 위치 |
|---|---|---|
| process types 시드 | `backend/bootstrap_db.py` | `_PROCESS_TYPES` / `seed_reference_data()` |
| process types DB 테이블 | `backend/app/models.py` | `ProcessType` |
| 부서 매핑 백엔드 | `backend/app/routers/items.py` | `_PROCESS_TO_DEPT` |
| 공정 라벨 프론트 | `frontend/app/legacy/_components/_history_sections/historyShared.ts` | `PROCESS_TYPE_META` |
| 공정 선택 UI 상수 | `frontend/app/legacy/_components/_admin_sections/adminShared.ts` | `PROCESS_TYPE_OPTIONS` |
| API Item 타입 | `frontend/lib/api.ts` | `ProcessTypeCode`, `Item.process_type_code` |

## 최신 변경 메모

- 2026-04-23: `BF → AF`, `BA → AA` 전환. 조립 A/F 타입을 `AA`/`AF`로 확정.
- 2026-04-29: `Item.category` (`CategoryEnum` 11개) 완전 제거. `process_type_code` 18개 단일 기준으로 통일.
  - 백엔드: `CategoryEnum` 클래스, `Item.category` 컬럼, `_CATEGORY_TO_PROCESS` 매핑 제거.
  - 프론트: `Category` 타입, `CATEGORY_META`, `item.category` 참조 전체 제거. `PROCESS_TYPE_META` / `ProcessTypeCode`로 대체.
  - DB: 정리본 722건 기준으로 재생성. `sum(inventory.quantity) = 108,924`.
- `TR/TA/TF`, `HR/HA/HF`, `VR/VA/VF`, `NR/NA/NF`, `AR/AA/AF`, `PR/PA/PF` 18개 코드가 현재 기준이다.
