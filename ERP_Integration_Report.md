# ERP 자재 마스터 DB 통합 리포트

- **생성 시각**: 2026-04-10T21:26:09
- **총 마스터 항목 수**: 983

## 입력 파일

| 파일 | 시트 | 유효 행 수 |
|---|---|---|
| A (`F704-03`) | 26.03월 | 649 |
| B (`조립,출하파트`) | 조립 자재 | 515 |
| C (`고압,진공,튜닝파트`) | 고압 | 164 |

## 파일 A 매칭 결과

- 매칭 성공: **537 / 649** (82.7%)
- 매칭 실패(A 단독): **112**

## 카테고리 분포

| 코드 | 설명 | 개수 |
|---|---|---|
| `RM` | 원자재 (Raw Material) | 649 |
| `BA` | 조립 반제품 (Assembly Sub-Assembly) | 145 |
| `BF` | 조립 완제품 (Assembly Finished) | 71 |
| `HA` | 고압 반제품 (High-voltage Sub-Assembly) | 45 |
| `HF` | 고압 완제품 (High-voltage Finished) | 0 |
| `VA` | 진공 반제품 (Vacuum Sub-Assembly) | 73 |
| `VF` | 진공 완제품 (Vacuum Finished) | 0 |
| `FG` | 최종 완제품 (Final Goods) | 0 |

## 매핑 상태 분포

| 상태 | 개수 |
|---|---|
| `mapped` | 537 |
| `assy_only` | 334 |
| `raw_only` | 112 |

## 샘플: 매핑 성공 (상위 20건)

| item_id | category | std_name | 파일A 원본 | 파일B/C 원본 |
|---|---|---|---|---|
| `RM-000020` | RM | TUBE 60KV D-081B | TUBE | 캐논튜브 [ D-081B ] _ 60KV  |
| `RM-000021` | RM | TUBE 70KV D-041 | TUBE | 캐논튜브 [ D-041 ] _ 70KV  |
| `RM-000022` | RM | TUBE 70KV DXDR-070 | TUBE | 세라믹튜브 [DXDR-070] _ 70KV |
| `RM-000023` | RM | TUBE 80KV D-0813 | TUBE | 캐논튜브 [ D-0813 ] _ 80KV  |
| `RM-000024` | RM | TUBE 90kV OX / 70-1.0 | TUBE | CEI튜브 [OX-70] _ 90KV |
| `RM-000025` | RM | TUBE 100Kv DXDR-100 | TUBE | 세라믹튜브 [DXDR-100] _ 100KV |
| `RM-000026` | RM | 튜브 하우징 파이프 베이클라이트 | 튜브 하우징 파이프 | 베이클라이트 하우징 파이프 |
| `RM-000027` | RM | 튜브 하우징 파이프 HDPE | 튜브 하우징 파이프 | 70KV 튜브 하우징용 파이프 |
| `RM-000028` | RM | 튜브 하우징 파이프 HDPE | 튜브 하우징 파이프 | 70KV 튜브 하우징용 파이프 |
| `RM-000029` | RM | 네온램프 NEON-5T.5*13 red | 네온램프 | 네온램프(NEON-5T) |
| `RM-000030` | RM | 고압 다이오드 2CL77 (20KV, 5mA) | 고압 다이오드 | 고압다이오드 2CL77 [20KV, 5mA] |
| `RM-000031` | RM | 고압 다이오드 DL1500 | 고압 다이오드 | DL1500(다이오드) |
| `RM-000032` | RM | 고압 다이오드 DD1800 | 고압 다이오드 | DD1800 (신규 다이오드) |
| `RM-000033` | RM | 15㏀ 고압용 저항 15㏀±1％, DIP-1/4W | 15㏀ 고압용 저항 | 고압용 (15㏀±1％, DIP) - 1/4W |
| `RM-000034` | RM | 30㏀ 고압용 저항 30㏀±1％, DIP-1/4W | 30㏀ 고압용 저항 | 고압용 (30㏀) |
| `RM-000035` | RM | 500Ω 고압용 저항 500Ω±1％, DIP-1/4W | 500Ω 고압용 저항 | 고압용 (500Ω±1％, DIP) - 1/4W |
| `RM-000036` | RM | 1.7W,10kV 시멘트저항 짧은 것 RK92-11XD 307J (1.7W,10kV,±5%,300ppm,Flat) | 1.7W,10kV 시멘트저항 짧은 것 | RK92-11XD307J (시멘트 저항) |
| `RM-000037` | RM | 2.7W,15kV 시멘트저항 긴 것 RK92-18XD 307J (2.7W,15kV,±5%,300ppm,Flat) | 2.7W,15kV 시멘트저항 긴 것 | RK92-18XD 307J 시멘트저항 긴 것 |
| `RM-000038` | RM | 47k Surge 저항 HPC-2C 47k/Surge | 47k Surge 저항 | HPC-2C 47k/Surge |
| `RM-000039` | RM | 100nF 칩세라믹 콘덴서 3216B 100nF | 100nF 칩세라믹 콘덴서 | 3216 B 100nF |

## 샘플: Ass'y 단독 (B 5건 + C 5건)

| item_id | category | std_name | 소스 | department | model_ref |
|---|---|---|---|---|---|
| `BA-000001` | BA | POWER LED | B | 조립 | DX3000 |
| `BA-000002` | BA | FRONT COVER (듀얼 슬라이드) | B | 조립 | DX3000 화이트 |
| `BA-000003` | BA | REAR COVER | B | 조립 | DX3000 화이트 |
| `BA-000004` | BA | LCD LED | B | 조립 | DX3000 |
| `BA-000005` | BA | EX LED (왼쪽) | B | 조립 | DX3000 |
| `HA-000001` | HA | 고압용(세라믹103) | C | 고압 | DX3000, ADX4000W, ADX6000 |
| `HA-000002` | HA | 15k/Surge | C | 고압 | ADX6000 |
| `VA-000001` | VA | 0.8T 알루미늄 필터 | C | 진공 | DX3000, ADX4000W, ADX6000, COCOON |
| `HA-000003` | HA | T 코어 (히터트랜스용) | C | 고압 | SOLO |
| `HA-000004` | HA | 히터트랜스포머 24턴 | C | 고압 | DX3000, ADX4000W |

## 파일 A 미매핑 목록 (raw_only)

총 112건. (별도 CSV: `ERP_Unmatched_A_Items.csv`)
