---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/ITEM_CODE_RULES.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# ITEM_CODE_RULES.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/ITEM_CODE_RULES.md]]

## 원본 첫 줄 (또는 메타)

```
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
