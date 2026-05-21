---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/GLOSSARY.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# GLOSSARY.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/GLOSSARY.md]]

## 원본 첫 줄 (또는 메타)

```
# 용어 사전 (GLOSSARY)

이 문서는 MES 프로토타입에서 코드·UI·문서가 같은 의미로 쓰는 도메인 용어를 한 곳에 정리한다. 새로운 작업자/문서/기능은 여기 있는 단어를 그대로 사용한다.

## 부서 / 분류

| 한국어 | 코드 / 영문 | 설명 |
|---|---|---|
| 창고 | `WAREHOUSE` | 자재 보관 부서. 재고의 1차 위치. |
| 출하부 | `SHIPPING` | 출하 직전 재고를 모아 두는 부서. 출고는 항상 출하부에서. |
| 튜브 / 고압 / 진공 / 튜닝 / 조립 | (그대로) | 생산 부서. 카테고리 코드와 다름. |
| process_type_code | `process_type_code` | 품목 마스터의 부서 분류 (예: "조립", "고압"). |
| department | `Department` | 백엔드 enum. UI 부서 필터·이동/불량/반품에서 사용. |

부서 필터는 `process_type_code` 또는 `department` 둘 다로 동작 — "전체"와 "모든 부서/모델 개별 선택"은 동일한 결과여야 한다.

## 공정코드 (`process_type_code`)

품목 분류의 단일 기준. 18개. `{부서 계열 1글자}{단계 1글자}` 형식.

| 부서 | R (원자재) | A (조립체) | F (F타입) |
|---|---|---|---|
| 튜브 | `TR` | `TA` | `TF` |
| 고압 | `HR` | `HA` | `HF` |
| 진공 | `VR` | `VA` | `VF` |
```
