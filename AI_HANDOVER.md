# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직, 현재 구현 상태, 다음 우선순위를 빠르게 공유하기 위한 작전 지도다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-Ray 장비 제조 ERP 시스템
- 목표: 품목 마스터, 재고, 입출고, BOM, 생산, 출하 묶음, 거래 이력을 하나의 ERP로 통합 관리
- 대표 사용자 화면: `/legacy`
- 대표 UX 방향
  - 모바일: `inventory_v2.html` 감성의 레거시 UI 유지
  - 데스크톱: 같은 기능을 더 넓고 직관적인 작업대로 자동 전환

## 2. 핵심 비즈니스 로직
- 공장은 단순 조립이 아니라 11단계 제조 공정을 따른다.
- 모든 품목은 아래 카테고리 중 하나로 분류되어야 한다.
  - `RM`: 원자재
  - `TA`, `TF`: 튜브 공정
  - `HA`, `HF`: 고압 공정
  - `VA`, `VF`: 진공 공정
  - `BA`, `BF`: 조립 공정
  - `FG`: 완제품
  - `UK`: 미분류
- 주요 운영 흐름
  - 품목 등록 및 카테고리 관리
  - 재고 입고 / 출고 / 조정
  - 창고와 부서 간 이동
  - 출하 묶음 기반 패키지 출고
  - BOM 기반 생산입고 및 Backflush
  - 거래 이력 조회 및 추적

## 3. 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite
  - 운영 DB: `backend/erp.db`
- 원본 데이터: `ERP_Master_DB.csv`

## 4. 작업 규칙
- 모든 파일은 반드시 UTF-8로 저장
- 기능 단위가 끝날 때마다 `AI_HANDOVER.md` 최신화
- 기능 단위가 끝날 때마다 GitHub 커밋 및 푸시
- PowerShell에서 한글이 깨져 보여도 실제 판단은 파일 내용, 빌드 결과, HTTP 응답 기준으로 한다

## 5. 현재 진행 상황

### 5-1. 데이터 시드
- [v] `backend/seed.py`를 SQLite 기준으로 정비
- [v] `ERP_Master_DB.csv`를 `backend/erp.db`로 적재
- [v] 적재 결과 확인
  - `items`: 971
  - `inventory`: 971
  - 기본 재고 100 보정 적용 완료

### 5-2. 백엔드
- [v] `items`, `inventory`, `bom`, `production`, `employees`, `ship-packages`, `settings` 라우터 구성
- [v] SQLite 경로를 `backend/erp.db` 기준으로 고정
- [v] 재고 입고 / 출고 / 조정 API 구현
- [v] 거래 이력 API 및 CSV 내보내기 구현
- [v] 직원 마스터 API 구현
- [v] 출하 패키지 API 구현
- [v] BOM CRUD 및 생산입고 / Backflush API 구현
- [v] `Item`에 레거시 메타 필드 추가
  - `barcode`
  - `legacy_file_type`
  - `legacy_part`
  - `legacy_item_type`
  - `legacy_model`
  - `supplier`
  - `min_stock`
- [v] `/api/items`에서 레거시 필터와 바코드 검색 지원
- [v] `POST /api/settings/reset` 안전 초기화 API 구현

### 5-3. 기존 화면
- [v] 메인 대시보드
- [v] `/inventory` 품목 리스트
- [v] `/operations` 입출고 화면
- [v] `/history` 거래 이력 화면
- [v] `/bom` BOM / 생산 화면
- [v] `/admin` 관리자 화면

### 5-4. Legacy UI parity
- [v] `inventory_v2.html`, `app_final.js` 분석 완료
- [v] `/legacy` 경로 추가
- [v] 모바일 레거시 UI 구조 정리
  - 재고 / 창고입출고 / 부서입출고 / 관리자 4탭
  - 상단 헤더, 하단 탭, 바텀시트, 토스트, PIN 잠금
- [v] 레거시 메타 필드 기반 검색 / 필터 / 바코드 흐름 연결
- [v] 창고입출고와 부서입출고에 직원 선택 기반 처리 연결
- [v] 출하 패키지 묶음 출고 연결
- [v] 관리자 PIN 인증 / 변경 / 초기화 연결

### 5-5. Adaptive Legacy Workspace
- [v] `/legacy`를 모바일 / 데스크톱 적응형 엔트리로 재구성
- [v] 모바일에서는 기존 레거시 셸 유지
- [v] 데스크톱에서는 자동으로 작업대 레이아웃 전환
  - 좌측: 고정 네비게이션
  - 중앙: 현재 탭의 메인 작업 영역
  - 우측: 상세 / 실행 / 요약 패널
- [v] 데스크톱 탭 구성
  - 재고
  - 창고입출고
  - 부서입출고
  - 관리자
- [v] 데스크톱 상단바 추가
  - 공통 검색
  - 새로고침
  - 최근 동기화 상태
  - 입출고 내역 패널 토글
- [v] 데스크톱 재고 작업대 구현
  - fileType / part / model / KPI 필터
  - 같은 이름 그룹 보기
  - 고밀도 테이블
  - 우측 상세 / 재고 처리 / 최근 이력
- [v] 데스크톱 창고입출고 작업대 구현
  - 처리 방식 카드
  - 직원 선택
  - 품목 검색 / 선택
  - 예상 재고와 실행 패널
- [v] 데스크톱 부서입출고 작업대 구현
  - 부서 선택
  - 부서별 직원 선택
  - 개별 품목 / 출하 패키지 전환
  - 우측 실행 패널
- [v] 데스크톱 관리자 작업대 구현
  - 상품
  - 직원
  - BOM
  - 출하묶음
  - 설정

## 6. 검증 상태
- [v] `python -m compileall backend`
- [v] `cd frontend && npx tsc --noEmit`
- [v] `cd frontend && npm run build`
- [v] `/api/inventory/summary` 기준 `total_items = 971`

### 5-6. Desktop UI Density (ERP Parity)
- [v] Topbar 압축: 88px → 56px (`py-3` + `text-xl`)
- [v] Sidebar 압축: 250px → 220px, 아이콘/탭 크기 감소, 레이아웃 카드 → 시스템 상태 뱃지
- [v] InventoryView: flex 레이아웃, 필터 패널 290→195px, 테이블 행 `py-4`→`py-2`, `h-[calc]` → `min-h-0 flex-1`, 선택 행 하이라이트
- [v] WarehouseView: 동일 압축 패턴 적용
- [v] DeptView: 동일 압축 패턴 적용
- [v] RightPanel: 360px → 340px, 타이포그래피 압축
- [v] AdminView: 동일 압축 패턴 적용 (`rounded-2xl`, `py-2` 행, flex 높이, 선택 행 하이라이트)
- [v] 빌드 검증 통과 (`npm run build` ✓)

### 5-7. 거래 이력 Notes 인라인 편집
- [v] 백엔드: `PUT /api/inventory/transactions/{log_id}` — notes 필드 수정
- [v] `TransactionLogUpdate` 스키마 추가 (`backend/app/schemas.py`)
- [v] 프론트: `api.updateTransactionNotes()` 추가 (`frontend/lib/api.ts`)
- [v] 히스토리 패널 인라인 편집 UI — 클릭 → input 전환, Enter 저장, Esc 취소

### 5-8. 카메라 바코드 / QR 스캔
- [v] `BarcodeScannerModal.tsx` 신규 — BarcodeDetector API (Chrome/Edge 83+) 기반
  - `getUserMedia` 카메라 스트림 연결
  - `requestAnimationFrame` 루프로 프레임마다 감지
  - QR코드, Code128, EAN-13/8, UPC-A, DataMatrix 지원
  - 브라우저 미지원 시 안내 메시지 fallback
  - 인식 성공 시 600ms 시각 피드백 후 자동 닫힘
- [v] Topbar 검색창 우측 카메라 버튼 추가 — 스캔 값 → 전역 검색에 자동 입력
- [v] Tailwind에 `scan` 키프레임 추가 (스캔 라인 애니메이션)

## 7. 현재 가장 중요한 TODO
1. 남아 있는 한글 레이블 검토 (모바일 탭 컴포넌트)
2. 테스트 코드 보강
3. 모바일 탭에도 바코드 스캔 연결 (`InventoryTab`, `WarehouseIOTab`, `DeptIOTab`)
4. 거래 이력 `produced_by` 인라인 편집 (선택적 확장)

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
- `frontend/app/legacy/page.tsx`
- `frontend/app/legacy/_components/*`
- `frontend/lib/api.ts`

## 10. 다음 작업 제안
- 1순위: QR / 바코드 카메라 스캔 연결
- 2순위: 레거시 HTML과 1:1에 가까운 데스크톱 UI 미세 튜닝
- 3순위: 거래 이력 note 수정 기능 추가
