---
type: file-explanation
source_path: "_attic/docs/ITEM_CODE_RULES.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ITEM_CODE_RULES.md — ITEM_CODE_RULES.md 설명

## 이 파일은 무엇을 책임지나

`ITEM_CODE_RULES.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `품목 코드 규칙 기준 문서`
- `공정 코드 기준표`
- `품목 코드 포맷`
- `AI 금지 규칙`
- `코드 위치`
- `최신 변경 메모`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
```
