# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직, 구현 상태, 다음 우선순위를 빠르게 공유하기 위한 작업 지도입니다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-Ray 장비 제조 ERP 시스템
- 대표 사용자 화면: `/legacy`
- 목표:
  - 모바일에서는 `inventory_v2.html` 감성의 레거시 UX를 유지
  - 데스크톱에서는 같은 데이터를 더 넓고 직관적인 작업대로 제공

## 2. 핵심 비즈니스 로직
- 공장은 단순 조립이 아니라 11단계 제조 공정을 따른다.
- 모든 품목은 아래 카테고리 중 하나로 분류된다.
  - `RM`: 원자재
  - `TA`, `TF`: 튜브 공정
  - `HA`, `HF`: 고압 공정
  - `VA`, `VF`: 진공 공정
  - `BA`, `BF`: 조립 공정
  - `FG`: 완제품
  - `UK`: 미분류
- 주요 운영 흐름
  - 품목 마스터 관리
  - 재고 입고 / 출고 / 조정
  - 창고 ↔ 부서 이동
  - 출하 패키지 기반 출고
  - BOM 기반 생산입고 및 Backflush
  - 거래 이력 조회 및 비고 수정

## 3. 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite
  - 운영 DB: `backend/erp.db`
- 원본 데이터: `ERP_Master_DB.csv`

## 4. 작업 규칙
- 모든 파일은 반드시 UTF-8로 저장한다.
- 기능 단위가 끝날 때마다 `AI_HANDOVER.md`를 최신화한다.
- 기능 단위가 끝날 때마다 GitHub에 커밋과 푸시를 반영한다.
- PowerShell 콘솔에서 한글이 깨져 보여도 파일 자체 인코딩과 브라우저 표시 기준으로 최종 판단한다.

## 5. 현재 진행 상황

### 5-1. 데이터 시드 및 동기화
- [v] `backend/seed.py`를 SQLite 기준으로 정비
- [v] `ERP_Master_DB.csv`를 `backend/erp.db`로 적재
- [v] `backend/sync_excel_stock.py`로 엑셀 재고를 DB에 다시 반영
- [v] 적재 결과 확인
  - `items`: 971
  - `inventory`: 971

### 5-2. 백엔드
- [v] `items`, `inventory`, `bom`, `production`, `employees`, `ship-packages`, `settings` 라우터 구성
- [v] SQLite 경로를 `backend/erp.db` 기준으로 고정
- [v] 재고 입고 / 출고 / 조정 API 구현
- [v] 거래 이력 API 및 CSV 내보내기 구현
- [v] 직원 마스터 API 구현
- [v] 출하 패키지 API 구현
- [v] BOM CRUD 및 생산입고 / Backflush API 구현
- [v] `Item`에 레거시 메타 필드 7개 추가
  - `barcode`
  - `legacy_file_type`
  - `legacy_part`
  - `legacy_item_type`
  - `legacy_model`
  - `supplier`
  - `min_stock`
- [v] `/api/items`에서 레거시 필터와 바코드 검색 지원
- [v] `POST /api/settings/reset` 안전 초기화 API 구현

### 5-3. 기존 데스크톱 화면
- [v] 메인 대시보드
- [v] `/inventory` Zero-Modal Master-Detail 작업대
- [v] `/operations` 입출고 화면
- [v] `/history` 거래 이력 화면
- [v] `/bom` BOM / 생산 화면
- [v] `/admin` 관리자 화면

### 5-4. Legacy UI parity
- [v] `inventory_v2.html`, `app_final.js` 분석 완료
- [v] `/legacy` 경로 추가
- [v] 모바일 레거시 UI 재현
  - 재고 / 창고입출고 / 부서입출고 / 히스토리 / 관리자
  - 상단 헤더, 하단 탭, 바텀시트, 토스트, PIN 잠금
- [v] 레거시 메타 필드 기반 검색 / 필터 / 바코드 흐름 연결
- [v] 창고입출고와 부서입출고의 직원 선택 기반 처리 연결
- [v] 출하 패키지 출고 연결

### 5-5. Adaptive Legacy Workspace
- [v] `/legacy`를 모바일 / 데스크톱 적응형 엔트리로 구성
- [v] 모바일에서는 레거시 감성을 유지
- [v] 데스크톱에서는 좌측 탐색 / 중앙 작업대 / 우측 확인 패널 구조로 전환
- [v] 데스크톱 탭 구성
  - 재고
  - 창고입출고
  - 부서입출고
  - 관리자

### 5-6. 최근 프론트 정리
- [v] `/inventory`를 모달 없는 마스터-디테일 화면으로 개편
- [v] `/inventory`에 KPI 바, LOW 필터, 키보드 탐색 추가
- [v] `/bom` 검색 결과 12개 제한 해제
- [v] `/operations`를 정상 한국어 기준으로 재정리
- [v] `/operations`에 패키지 출하 / 개별 품목 출하 전환 추가
- [v] `/admin` PIN 잠금, 직원 관리, 패키지 관리, CSV 내보내기 화면 정리

### 5-7. Inventory Cockpit Update
- [v] `/inventory`를 Zero-Modal Master-Detail 작업대로 재구성
- [v] 상단 KPI 3종 추가
- [v] 좌측 마스터 패널에 검색, 카테고리 선택, LOW/ZERO 빠른 필터 추가
- [v] 테이블 내부 스크롤 및 행 선택 기반 상세 패널 구조 적용
- [v] ArrowUp / ArrowDown 키보드 탐색 지원
- [v] 우측 상세 패널에서 모달 없이 조정 / 입고 / 출고 처리 가능
- [v] 저장 결과를 우하단 3초 토스트로 표시

### 5-8. 안전재고 UX 개편
- [v] StockFilter를 하드코딩 수량 기준에서 안전재고 기준으로 정리
- [v] 발주 주의 상태를 품목별 `min_stock` 기준으로 표시
- [v] KPI와 테이블 상태 뱃지 문구를 안전재고 기준으로 수정
- [v] 상세 패널에서 안전재고를 바로 수정할 수 있게 구성
- [v] 공급처 정보 표시 추가

## 6. 검증 상태
- [ ] `python -m compileall backend`
- [ ] `cd frontend && npx tsc --noEmit`
- [ ] `cd frontend && npm run build`
- [ ] `/api/inventory/summary` 기준 `total_items = 971`

## 7. 가장 중요한 다음 TODO
1. 백엔드 Capacity API 추가
2. BOM Where-Used 역추적 API 추가
3. `/bom`에 Where-Used UI 연결
4. 거래처 테이블 및 출하 스펙 이력 추가
5. 커스텀 출하 폼 고도화
6. `/legacy` 모바일 문구 전수 점검

## 8. 실행 메모
- 시드 실행
  - `python backend/seed.py`
- 백엔드 실행
  - `cd backend`
  - `python -m uvicorn app.main:app --host 127.0.0.1 --port 8010`
- 프론트 실행
  - `cd frontend`
  - `npm run dev`
- 대표 화면
  - `http://localhost:3000/legacy`

## 9. 핵심 파일
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/items.py`
- `backend/app/routers/inventory.py`
- `backend/app/routers/bom.py`
- `backend/app/routers/settings.py`
- `backend/seed.py`
- `backend/sync_excel_stock.py`
- `frontend/app/legacy/page.tsx`
- `frontend/app/legacy/_components/*`
- `frontend/app/inventory/page.tsx`
- `frontend/app/operations/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/lib/api.ts`

## 10. 다음 작업 제안
- 1순위: 백엔드 Capacity API
- 2순위: BOM Where-Used API + `/bom` 연동
- 3순위: `/legacy` 모바일 문구와 행동 흐름 최종 다듬기
