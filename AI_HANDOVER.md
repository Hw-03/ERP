# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 핵심 비즈니스 로직, 현재 구현 상태, 다음 우선순위를 빠르게 공유하기 위한 작전 지도다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-Ray 장비 제조 ERP 시스템
- 목표: 품목 마스터, 재고, 입출고, BOM, 생산, 출하 패키지, 거래 이력을 하나의 웹 ERP로 통합 관리
- 도메인: 정밀 X-Ray 장비 제조

## 2. 핵심 비즈니스 로직
- 공장은 단순 조립이 아니라 11단계 제조 공정을 따른다.
- 모든 품목은 아래 공정 카테고리 중 하나로 분류되어야 한다.
  - `RM`: 원자재
  - `TA` / `TF`: 튜브 공정
  - `HA` / `HF`: 고압 공정
  - `VA` / `VF`: 진공 공정
  - `BA` / `BF`: 조립 공정
  - `FG`: 완제품
  - `UK`: 미분류, 추가 정리 필요
- 주요 운영 흐름
  - 품목 등록 및 카테고리 관리
  - 재고 입고 / 출고 / 조정
  - 부서 간 이동
  - BOM 기반 생산입고 및 Backflush
  - 출하 패키지 기반 묶음 출고
  - 거래 이력 조회 및 추적

## 3. 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite
  - 운영 DB: `backend/erp.db`
- 원본 데이터: `ERP_Master_DB.csv`

## 4. 운영 규칙
- 모든 파일은 반드시 UTF-8 형식으로 저장한다.
- 기능 단위가 끝날 때마다 `AI_HANDOVER.md`를 최신화한다.
- 기능 단위가 끝날 때마다 GitHub에 커밋/푸시한다.
- PowerShell에서 한글이 깨져 보일 수 있으므로 실제 판단은 파일 내용, 빌드 결과, HTTP 응답 기준으로 한다.

## 5. 현재 진행 상황

### 5-1. 데이터 시드
- [v] `backend/seed.py`를 SQLite 기준으로 정리
- [v] `ERP_Master_DB.csv`를 `backend/erp.db`로 적재
- [v] 적재 결과 확인
  - `items`: 971
  - `inventory`: 971
  - 기본 재고 100 적용: 다수 공란 행 처리 완료

### 5-2. 백엔드
- [v] `items`, `inventory`, `bom`, `production`, `employees`, `ship-packages`, `settings` 라우터 구성
- [v] SQLite 경로를 `backend/erp.db` 기준으로 고정
- [v] 재고 입고 / 출고 / 조정 API 구현
- [v] 거래 이력 API 및 CSV 내보내기 구현
- [v] 직원 마스터 API 구현
- [v] 출하 패키지 API 구현
- [v] BOM CRUD 및 생산입고 / Backflush API 구현
- [v] `Item`에 레거시 UI용 메타 필드 7개 추가
  - `barcode`
  - `legacy_file_type`
  - `legacy_part`
  - `legacy_item_type`
  - `legacy_model`
  - `supplier`
  - `min_stock`
- [v] `/api/items` 응답에서 레거시 메타 필드 누락 문제 수정
- [v] `POST /api/settings/reset` 안전 초기화 API 구현

### 5-3. 프론트엔드 기존 화면
- [v] 메인 대시보드
- [v] `/inventory` 품목 리스트
- [v] `/operations` 입출고 화면
- [v] `/history` 거래 이력 화면
- [v] `/bom` BOM / 생산 화면
- [v] `/admin` 관리자 화면

### 5-4. 레거시 기능 이식
- [v] `inventory_v2.html`, `app_final.js` 분석 완료
- [v] `/legacy` 경로 추가
- [v] `Item` 레거시 메타 필드 기반 필터링 지원
- [v] 바코드 문자열 검색 지원
- [v] 직원 선택 기반 입출고 흐름 연결
- [v] 출하 패키지 기반 묶음 출고 연결
- [v] 관리자 PIN 인증 / 변경 / 초기화 연결

### 5-5. Legacy UI parity 재작업
- [v] `/legacy` 셸을 원본 430px 모바일 프레임에 가깝게 재구성
- [v] 하단 탭을 원본처럼 `재고 / 창고입출고 / 부서입출고 / 관리자` 4개 구조로 정리
- [v] `입출고 내역`은 원본처럼 각 화면 상단 버튼으로 진입하도록 변경
- [v] 레거시 색상 토큰, 바텀시트, 토스트, 상단 타이틀 구조 재정리
- [v] `재고` 탭을 원본 카드 / 배지 / KPI 스타일에 가깝게 재구성
- [v] `묶음 보기`에서 동일 품목 수량 합산 표시
- [v] `창고입출고` 탭을 원본 이동유형 카드 / 직원 칩 / 수량 버튼 구조로 재구성
- [v] `부서입출고` 탭을 원본 부서 버튼 / 직원 칩 / 패키지 흐름으로 재구성
- [v] `입출고 내역` 화면을 레거시 톤으로 재정리
- [v] `관리자` 탭을 `상품 / 직원 / BOM / 출하묶음 / 설정` 섹션으로 재구성

## 6. 검증 상태
- [v] `python -m compileall backend`
- [v] `cd frontend && npm run build`
- [v] `total_items = 971` 유지 확인

## 7. 남은 TODO
1. 카메라 기반 QR / 바코드 스캔 실제 연결
2. `/legacy`를 원본 HTML과 더 가깝게 미세 간격 / 아이콘 / 애니메이션 조정
3. 거래 이력 비고(notes) 인라인 편집 API + UI
4. 남아 있는 한글 깨짐 구간 추가 복구
5. 테스트 코드 보강

## 8. 실행 메모
- 시드 실행
  - `python backend/seed.py`
- 백엔드 실행
  - `cd backend`
  - `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- 프론트엔드 실행
  - `cd frontend`
  - `npm run dev`

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
- 1순위: `/legacy`의 카메라 스캔 기능 연결
- 2순위: 원본 `inventory_v2.html`과 픽셀 단위에 가까운 미세 조정
- 3순위: 거래 이력 note 수정 기능 추가
