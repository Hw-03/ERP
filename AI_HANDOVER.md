# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직, 기술 기준, 진행 상황을 공유하기 위한 공용 작전 지도다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-ray 장비 제조 ERP 시스템
- 목표: 자재 마스터, 재고, BOM, 생산입고, 출하 흐름을 하나의 웹 ERP로 통합 관리
- 핵심 도메인: 정밀 X-ray 장비 제조

## 2. 핵심 비즈니스 로직
- 공장은 단순 조립이 아니라 11단계 제조 공정을 따른다.
- 모든 품목은 아래 Category 체계 중 하나로 분류되어야 한다.
  - `RM`: 원자재
  - `TA` / `TF`: 튜브 공정
  - `HA` / `HF`: 고압 공정
  - `VA` / `VF`: 진공 공정
  - `BA` / `BF`: 조립 공정
  - `FG`: 완제품
  - `UK`: 미분류 / 확인 필요
- 향후 핵심 흐름
  - BOM 기반 생산입고
  - Backflush 기반 하위 자재 자동 차감
  - 출하 및 입출고 이력 관리

## 3. 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite
  - 운영 기준 DB: `backend/erp.db`
- 원본 데이터
  - 통합 마스터 CSV: `ERP_Master_DB.csv`
  - 엑셀 원본: 프로젝트 루트 보관

## 4. 운영 원칙
- 모든 파일은 반드시 UTF-8 형식으로 저장한다.
- 에러 발생 시 AI가 먼저 로그를 분석하고 수정한다.
- 단계 완료 시 이 문서를 즉시 업데이트한다.
- 레거시 기능 이식 시 현재 FastAPI + Next.js 구조에 맞게 재구성한다.

## 5. 현재 진행 상황

### 5-1. 데이터 통합
- [v] `erp_integration.py` 기반 통합 로직 확보
- [v] `ERP_Master_DB.csv` 생성 및 시드 데이터 원본 확보
- [v] 통합 결과 CSV / Markdown 보고서 루트 정리 완료

### 5-2. 백엔드
- [v] FastAPI 앱 골격 구성 완료
- [v] `items`, `inventory`, `bom`, `production` 라우터 연결 완료
- [v] SQLite 기본 DB 경로를 `backend/erp.db`로 고정
- [v] `/api/items`, `/api/inventory/summary`, `/api/inventory/transactions` 동작 확인
- [v] 재고 절대수량 조정을 위한 `/api/inventory/adjust` API 추가

### 5-3. 시드 데이터 적재
- [v] `backend/seed.py` 정비 완료
- [v] `ERP_Master_DB.csv` -> `backend/erp.db` 적재 완료
- [v] 적재 규칙 반영 완료
  - `category_code` -> `CategoryEnum`
  - `stock_current`가 비어 있거나 `0`이면 `100`
  - 기존 `items`, `inventory`는 삭제 후 재적재
- [v] 최근 적재 결과
  - CSV rows read: `971`
  - Items inserted: `971`
  - Inventory inserted: `971`
  - Default stock=100 applied: `969`

### 5-4. 프론트엔드
- [v] Next.js 14 대시보드 UI 구현 완료
- [v] 메인 대시보드와 API 연동 완료
- [v] `/inventory` 품목 리스트 페이지 구현 완료
- [v] 검색, 카테고리 필터, 상세 모달, 재고 조정 플로우 구현 완료
- [v] 이전 버전 기능 이식 완료
  - `inventory_v2.html`의 어두운 리스트 레이아웃 감성 반영
  - `app_final.js`의 검색/필터 흐름을 React 상태 기반으로 이식
  - 리스트에서 재고 수정 및 조정 사유 입력 기능을 현재 Inventory API와 연결

### 5-5. 현재 서비스 상태
- [v] 백엔드가 `backend/erp.db`를 기준으로 동작하도록 수정 완료
- [v] `/api/inventory/summary` 기준 `total_items = 971` 확인
- [v] 대시보드 0건 문제 해결 완료
- [v] `/inventory`에서 971개 품목 조회 가능 상태 확인

## 6. 우선순위 로드맵

### Phase 1. 데이터 가시성 확보
- [ ] 한글 인코딩 전수 복구
- [v] 품목 리스트 페이지 구현
- [v] 품목 상세 뷰 및 재고 조정 기능 구현
- [ ] UK 품목 분류 기능 구현

### Phase 2. BOM 및 생산 로직
- [ ] BOM 관리 API / UI 보강
- [ ] 생산입고 시 Backflush 자동 차감 검증 보강

### Phase 3. 입출고 및 이력 관리
- [ ] 전체 거래 이력 조회 화면
- [ ] 출하 흐름 및 입출고 관리 보강

### Phase 4. 데이터 활용 및 안정화
- [ ] 엑셀 내보내기 기능
- [ ] 남은 한글 문구 및 문서 정리
- [ ] 테스트 코드 보강

## 7. 가장 시급한 TODO
1. 한글 인코딩 복구
2. `seed.py` 실행을 통한 데이터 적재 검증 유지
3. UK 품목 분류 기능 구현

## 8. 실행 메모
- 시드 실행
  - `python backend/seed.py`
- 백엔드 실행
  - `cd backend`
  - `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- 프론트엔드 실행
  - `cd frontend`
  - `npm run dev`

## 9. 주의사항
- 모든 파일은 반드시 UTF-8 형식으로 저장해야 한다.
- 한글이 깨져 보이면 터미널 출력 인코딩과 파일 저장 인코딩을 모두 확인한다.
- 시드 스크립트 실행 시 `items`, `inventory` 데이터는 재생성된다.
