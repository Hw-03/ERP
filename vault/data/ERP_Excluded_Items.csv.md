---
type: code-note
project: ERP
layer: data
source_path: data/ERP_Excluded_Items.csv
status: active
updated: 2026-04-27
source_sha: e5d553cd01f8
tags:
  - erp
  - data
  - data-asset
  - csv
---

# ERP_Excluded_Items.csv

> [!summary] 역할
> ERP 초기 데이터, 매칭 자료, 현장 엑셀/CSV 자료를 추적하기 위한 데이터 자산이다.

## 원본 위치

- Source: `data/ERP_Excluded_Items.csv`
- Layer: `data`
- Kind: `data-asset`
- Size: `679` bytes

## 연결

- Parent hub: [[data/data|data]]

## 읽는 포인트

- 데이터 파일은 현장 원본/매칭 결과의 기준 자료일 수 있다.
- 자동 처리 전 파일명과 컬럼 의미를 먼저 확인한다.

## 원본 발췌

````csv
﻿source_file,source_sheet,source_row,department,sub_class,model,original_name,reason
C,고압,201,구버전,6000S,A6CB(8핀),V1.1.1,inactive_department
C,고압,202,구버전,6000,A6CTR(6000 CTR),V1.5,inactive_department
C,고압,203,구버전,COCOON,COCB(핸들공용 이전),v2.20.5,inactive_department
C,고압,204,미사용,6000,"INNER_USB_BD
(6000 커넥터)",V2.1,inactive_department
C,고압,205,미사용,6000S,"CTR_to_GEN BD
(8핀 커넥터)",V2.0.0,inactive_department
C,고압,206,미사용,6000S,"AIM_LIGHT_DRIVER BD
(9핀 커넥터)",V1.0.0,inactive_department
C,고압,207,사용중,6000FB,"CTR_to_GEN BD
(10핀 커넥터)",V2.0.1,inactive_department
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
