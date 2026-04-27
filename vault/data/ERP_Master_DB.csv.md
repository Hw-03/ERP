---
type: code-note
project: ERP
layer: data
source_path: data/ERP_Master_DB.csv
status: active
updated: 2026-04-27
source_sha: 31d028d3a0ac
tags:
  - erp
  - data
  - data-asset
  - csv
---

# ERP_Master_DB.csv

> [!summary] 역할
> ERP 초기 데이터, 매칭 자료, 현장 엑셀/CSV 자료를 추적하기 위한 데이터 자산이다.

## 원본 위치

- Source: `data/ERP_Master_DB.csv`
- Layer: `data`
- Kind: `data-asset`
- Size: `233648` bytes

## 연결

- Parent hub: [[data/data|data]]

## 읽는 포인트

- 데이터 파일은 현장 원본/매칭 결과의 기준 자료일 수 있다.
- 자동 처리 전 파일명과 컬럼 의미를 먼저 확인한다.

## 원본 내용

대형 lock/generated 성격 파일이라 전체 내용은 노트에 복사하지 않는다. 실제 비교는 원본 파일과 git diff를 기준으로 한다.

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
