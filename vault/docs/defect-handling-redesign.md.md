---
layer: docs
---

# defect-handling-redesign.md — 불량 처리 흐름 개선

> [!summary] 설계 합의 완료(2026-05-21). 불량 상태 2개(PRODUCTION/DEFECTIVE). 부서 계층. 격리 = 재작업 대기

## 1. 역할
PRODUCTION/DEFECTIVE 2상태. 부서 계층(생산부+6라인). 권한(생산부장 OR 창고장). 격리/정상복귀 즉시. 폐기/반품 결재. R 처리 4버튼. 사유 필수. UI(입출고탭 → 불량 처리 허브).

## 2. 실제 원본 위치
erp/docs/defect-handling-redesign.md

## 3. 관련 형제 파일
- [[OPERATIONS.md|운영 매뉴얼]]
- [[operations/CONCURRENT_LOCAL_OPERATION.md|30명 동시 운영]]
