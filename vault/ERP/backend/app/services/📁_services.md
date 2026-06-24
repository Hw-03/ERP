---
type: folder-note
source_path: "backend/app/services"
importance: important
layer: backend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 services

## 이 폴더는 무엇을 위한 곳인가

API 라우터 안에서 바로 처리하기 어려운 실제 업무 규칙을 모아 둔 곳입니다.

## 현장 업무와의 관계

재고 계산, 요청 승인, BOM, 감사 로그, PIN 인증 같은 회사 규칙이 이곳에서 실행됩니다.

## 언제 보면 좋나

- API는 맞는데 결과가 이상할 때
- 재고 계산이나 승인 상태 흐름을 검증할 때
- 운영 규칙을 바꿔야 할 때

## 먼저 볼 파일 5개

- [[ERP/backend/app/services/integrity.py]] — `integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.
- [[ERP/backend/app/services/__init__.py]] — `__init__.py`는 `__init__` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

> [!info]- 추가 파일
> - [[ERP/backend/app/services/_tx.py]] — 트랜잭션 헬퍼 (commit_and_refresh)
> - [[ERP/backend/app/services/audit.py]] — 마스터 변경 감사 로그
> - [[ERP/backend/app/services/audit_csv.py]] — CSV 세션 리스너
> - [[ERP/backend/app/services/bom.py]] — BOM 트리 전개·캐시
> - [[ERP/backend/app/services/codes.py]] — 제품기호·공정코드
> - [[ERP/backend/app/services/dept_adjustment.py]] — 부서 이동 기타 유형
> - [[ERP/backend/app/services/dept_hierarchy.py]] — 부서 계층·결재 권한
> - [[ERP/backend/app/services/export_helpers.py]] — CSV/XLSX 스트리밍
> - [[ERP/backend/app/services/io.py]] — 입출고 V2 오케스트레이션
> - [[ERP/backend/app/services/pin_auth.py]] — PIN 인증
> - [[ERP/backend/app/services/rate_limit.py]] — 요청 제한
> - [[ERP/backend/app/services/seed_cleanup.py]] — 데이터 정제
> - [[ERP/backend/app/services/inv_base.py]] — 재고 기반 헬퍼·부서 매핑 (🔴 위험)
> - [[ERP/backend/app/services/inv_calc.py]] — 재고 집계 계산 (🔴 위험)
> - [[ERP/backend/app/services/inv_defective.py]] — 불량 격리·복귀·폐기 (🔴 위험)
> - [[ERP/backend/app/services/inv_effect.py]] — 거래 재고 효과 캡처·역재생 (🔴 위험)
> - [[ERP/backend/app/services/inv_transfer.py]] — 재고 이동·입고·출고 (🔴 위험)
> - [[ERP/backend/app/services/io_dispatch.py]] — 제출 분기(창고/부서/즉시) (🔴 위험)
> - [[ERP/backend/app/services/io_draft.py]] — 입출고 임시저장 CRUD
> - [[ERP/backend/app/services/io_persist.py]] — 배치 영속화
> - [[ERP/backend/app/services/io_preview.py]] — 입출고 미리보기
> - [[ERP/backend/app/services/sr_draft.py]] — 결재 요청 드래프트
> - [[ERP/backend/app/services/sr_execution.py]] — 결재 실행·점유 해제 (🔴 위험)
> - [[ERP/backend/app/services/sr_validation.py]] — 결재 검증·preflight
> - [[ERP/backend/app/services/approval_rules.py]] — 결재 분기 규칙 원천 (🔴 위험)
> - [[ERP/backend/app/services/warehouse_map.py]] — 창고 지도 조립·재고 대조
> - [[ERP/backend/app/services/reorder.py]] — 정렬 순서 일괄 갱신

## 조심할 점

서비스는 DB를 직접 바꾸는 경우가 많습니다. 특히 inventory, stock_requests, stock_math는 테스트 없이 건드리면 안 됩니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/app/📁_app]]
