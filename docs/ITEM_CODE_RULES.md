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
- 조립 F 타입은 반드시 `AF`다.
- `BF`는 구형 오염 코드이며 신규 규칙에서 사용하지 않는다.

## ERP 코드 포맷

```text
{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]
```

예시:

```text
346-AF-0001
3-PA-0001-BG
34-TR-0023
```

## category와 process_type_code 구분

| 필드 | 용도 | 예시 |
|---|---|---|
| `category` | 원본 엑셀/레거시 통합 단계에서 온 품목 원천 분류 | `RM`, `TA`, `TF`, `HA`, `HF`, `VA`, `VF`, `BA`, `AF`, `FG`, `UK` |
| `process_type_code` | ERP 코드 생성, 부서 필터, 공정 라벨의 기준 | `TR`, `TA`, `TF`, `HR`, `HA`, `HF`, `VR`, `VA`, `VF`, `NR`, `NA`, `NF`, `AR`, `AA`, `AF`, `PR`, `PA`, `PF` |

부서 필터와 ERP 코드 판정은 반드시 `process_type_code` 기준으로 한다. `category`만 보고 부서를 판단하면 전체 필터와 개별 전체 선택 결과가 달라질 수 있다.

## AI 금지 규칙

1. `BF`를 조립 코드로 추가하지 않는다. 조립 F 타입은 `AF`다.
2. `B-prefix`로 부서를 추론하지 않는다. `BA` 계열의 구형 네이밍으로 현재 부서를 판단하지 않는다.
3. 부서 필터는 `category`가 아니라 `process_type_code`와 `department` 응답 필드를 기준으로 만든다.
4. 코드 규칙을 수정할 때는 백엔드, 프론트, 문서를 함께 갱신한다.
5. “전체” 필터와 “모든 부서/모든 모델 개별 선택”은 같은 품목 수를 보여야 한다.

## 코드 위치

| 역할 | 파일 | 기준 위치 |
|---|---|---|
| process types 시드 | `backend/app/main.py` | `ensure_reference_data()` |
| 부서 매핑 백엔드 | `backend/app/routers/items.py` | `_PROCESS_TO_DEPT` |
| 카테고리 -> 공정코드 | `backend/app/utils/erp_code.py` | `_CATEGORY_TO_PROCESS` |
| 부서 매핑 프론트 | `frontend/app/legacy/_components/legacyUi.ts` | `PROCESS_TO_DEPT` |
| 공정 라벨 프론트 | `frontend/app/legacy/_components/legacyUi.ts` | `PROCESS_LABEL` |
| 카테고리 UI 메타 | `frontend/components/CategoryCard.tsx` | `CATEGORY_META` |
| API Item 타입 | `frontend/lib/api.ts` | `Item.department`, `process_type_code` |

## 최신 변경 메모

- 2026-04-23: 재고 필터 불일치 원인 추적 중 `BF`가 구형/오염 코드로 남아 있음을 확인했다.
- 기준을 `AR/AA/AF -> 조립`으로 확정했다.
- `TR/TA/TF`, `HR/HA/HF`, `VR/VA/VF`, `NR/NA/NF`, `AR/AA/AF`, `PR/PA/PF` 18개 코드가 현재 기준이다.
