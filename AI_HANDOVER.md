# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직, 기술 기준, 현재 진행 상황을 공유하기 위한 공용 작전 지도다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-ray 장비 제조 ERP 시스템
- 목표: 품목 마스터, 재고, BOM, 생산 입고, 거래 이력을 하나의 웹 ERP로 통합 관리
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
  - `UK`: 미분류 또는 확인 필요
- 향후 핵심 흐름
  - BOM 기반 생산 입고
  - Backflush 기반 하위 자재 자동 차감
  - 출하 및 입출고 이력 관리

## 3. 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite
  - 운영 기준 DB: `backend/erp.db`
- 원본 데이터
  - 통합 마스터 CSV: `ERP_Master_DB.csv`

## 4. 운영 원칙
- 모든 파일은 반드시 UTF-8 형식으로 저장한다.
- 에러가 나면 AI가 로그를 먼저 분석하고 수정한다.
- 단계가 끝날 때마다 이 문서를 최신화한다.
- 중간 체크포인트마다 GitHub `main` 또는 작업 브랜치에 푸시해 변경을 남긴다.

## 5. 현재 진행 상황

### 5-1. 데이터 통합 / 시드
- [v] `ERP_Master_DB.csv`를 기준으로 시드 적재 구조 정리
- [v] `backend/seed.py`를 SQLite 기준으로 정비
- [v] `ERP_Master_DB.csv` → `backend/erp.db` 적재 완료
- [v] 최근 적재 결과
  - CSV rows read: `971`
  - Items inserted: `971`
  - Inventory inserted: `971`
  - Default stock=100 applied: `969`

### 5-2. 백엔드
- [v] FastAPI 앱과 `items`, `inventory`, `bom`, `production` 라우터 구성 완료
- [v] SQLite 경로를 `backend/erp.db` 기준으로 고정
- [v] `/api/items`, `/api/inventory/summary`, `/api/inventory/transactions` 동작 확인
- [v] 재고 절대값 조정 API 구현
- [v] 재고 직접 입고 API 구현
- [v] 재고 직접 출고 API 구현
- [v] 거래 이력 응답에 품목 코드, 품목명, 카테고리, 단위 포함되도록 보강

### 5-3. 프론트엔드
- [v] 메인 대시보드 UI 복구 및 정리
- [v] `/inventory` 품목 리스트 페이지 구현
- [v] 검색, 카테고리 필터, 재고 상태 필터 구현
- [v] 품목 상세 모달에서 최근 거래 이력 표시
- [v] 품목 상세 모달에서 절대값 조정, 입고, 출고, 카테고리 변경 가능
- [v] `/history` 전체 거래 이력 페이지 구현
- [v] `/bom` BOM 관리 및 생산 입고 페이지 구현
- [v] 레거시 `inventory_v2.html`, `app_final.js`의 핵심 검색/필터/재고 조정 흐름을 현재 구조로 이식

### 5-4. 검증 상태
- [v] `python -m compileall backend` 통과
- [v] `npm run build` 통과
- [v] 대시보드 요약 API 기준 `total_items = 971` 확인
- [v] `/`, `/inventory`, `/history`, `/bom` 페이지 빌드 가능 상태 확인

## 6. 우선순위 로드맵

### Phase 1. 데이터 가시성 확보
- [~] 한글 인코딩 전수 복구 진행 중
- [v] 품목 리스트 페이지 구현
- [v] 품목 상세 뷰 및 재고 조정 기능 구현
- [~] UK 품목 분류 기능 진행 중
  - 현재: `/inventory?category=UK`로 조회 후 카테고리 변경 가능
  - 다음: 전용 분류 워크플로우 강화

### Phase 2. BOM 및 생산 로직
- [v] BOM 관리 UI 초안 구현
- [v] 생산 가능 여부 확인 UI 구현
- [v] 생산 입고 실행 UI 구현
- [~] Backflush 검증과 오류 메시지 UX 보강 필요

### Phase 3. 입출고 및 이력 관리
- [v] 전체 거래 이력 화면 구현
- [~] 출하 전용 흐름과 참조번호 관리 보강 필요
- [ ] 엑셀/CSV 내보내기 기능 추가

### Phase 4. 안정화
- [ ] 남아 있는 한글 깨짐 전수 복구
- [ ] 테스트 코드 보강
- [ ] 문서 정리와 운영 가이드 보강

## 7. 지금 가장 시급한 TODO
1. 한글 인코딩 잔여 구간 복구
2. UK 품목 전용 분류 워크플로우 강화
3. 생산 / Backflush 예외 처리 메시지와 검증 UX 보강
4. 엑셀/CSV 내보내기 추가

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
- PowerShell 출력 인코딩 때문에 터미널에서 한글이 깨져 보일 수 있으므로, 실제 파일 내용은 Git diff, 에디터, 빌드 결과 기준으로 확인한다.
- 시드 스크립트 실행 시 `items`, `inventory` 데이터는 재생성된다.
