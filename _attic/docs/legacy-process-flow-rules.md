# (Legacy) 공정 흐름 규칙 — `process_flow_rules`

> 원래 `process_flow_rules` 테이블이었으나 사용되지 않아 2026-05-29 폐기. 향후 공정 흐름 자동 검증/추천 기능을 다시 만들 때 참고용.

2026-04-17 M1 커밋에서 도입된 마스터 데이터. 어떤 공정(`from_type`)에서 다른 공정(`to_type`)으로 넘어갈 때 소비해야 할 코드 셋(`consumes_codes`)을 정의했지만, 프론트엔드·백엔드 로직 어디에서도 이 표를 읽어 사용한 적이 없음 (GET 라우터만 존재).

## 공정 코드 (참고)

`process_types` 마스터 기준:

| 코드 | 의미 |
|---|---|
| TR/TA/TF | 튜브 원자재 / 중간공정 / 공정완료 |
| HR/HA/HF | 고압 원자재 / 중간공정 / 공정완료 |
| VR/VA/VF | 진공 원자재 / 중간공정 / 공정완료 |
| NR/NA/NF | 튜닝 원자재 / 중간공정 / 공정완료 |
| AR/AA/AF | 조립 원자재 / 중간공정 / 공정완료 |
| PR/PA/PF | 출하 원자재 / 중간공정 / 공정완료 |

## 17줄 규칙

라인별 단계 흐름 (12줄):

| rule_id | from_type | to_type | consumes_codes |
|---|---|---|---|
| 1 | TR | TA | TR |
| 2 | TA | TF | TR,TA |
| 3 | HR | HA | HR |
| 4 | HA | HF | HR,HA |
| 5 | VR | VA | VR |
| 6 | VA | VF | VR,VA |
| 7 | NR | NA | NR |
| 8 | NA | NF | NR,NA |
| 9 | AR | AA | AR |
| 10 | AA | AF | AR,AA |
| 11 | PR | PA | PR |
| 12 | PA | PF | PR,PA |

라인 간 전환 흐름 (5줄):

| rule_id | from_type | to_type | consumes_codes |
|---|---|---|---|
| 13 | TF | HA | HR |
| 14 | HF | VA | VR |
| 15 | VF | NA | NR |
| 16 | NF | AA | AR |
| 17 | AF | PA | PR |

## 다시 만들 때 메모

- 11단계 공정의 라인 내부 흐름은 `(stage_order 순서, prefix 동일)` 규칙으로 코드(상수)로 표현 가능. 굳이 DB 테이블로 두지 않아도 됨.
- 라인 간 전환 5줄만 별도 상수로 두면 마스터 테이블 없이 처리 가능 — 본격 자동 검증 도입 시 그때 다시 고민.
