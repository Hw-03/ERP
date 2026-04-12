# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직, 현재 구현 상태, 다음 우선순위를 빠르게 공유하기 위한 작전 지도다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-Ray 장비 제조 ERP 시스템
- 대표 사용자 화면: `/legacy`
- 목표:
  - 모바일에서는 `inventory_v2.html` 감성의 레거시 UI 유지
  - 데스크톱에서는 같은 기능을 더 넓고 직관적인 ERP 작업대로 제공

## 2. 핵심 비즈니스 로직
- 공장은 단순 조립이 아니라 11단계 제조 공정을 따른다.
- 모든 품목은 아래 Category 중 하나로 분류한다.
  - `RM`: 원자재
  - `TA`, `TF`: 튜브 공정
  - `HA`, `HF`: 고압 공정
  - `VA`, `VF`: 진공 공정
  - `BA`, `BF`: 조립 공정
  - `FG`: 완제품
  - `UK`: 미분류
- 주요 운영 흐름
  - 품목 등록과 메타 관리
  - 재고 입고 / 출고 / 조정
  - 창고 ↔ 부서 이동
  - 출하 묶음 기반 패키지 출고
  - BOM 기반 생산입고와 Backflush
  - 거래 이력 조회와 내보내기

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
- PowerShell에서 한글이 깨져 보일 수 있으므로 최종 판단은 파일 내용, 브라우저 렌더, 빌드 결과 기준으로 한다.

## 5. 현재 진행 상황

### 5-1. 데이터와 시드
- [v] `backend/seed.py`를 SQLite 기준으로 정비
- [v] `ERP_Master_DB.csv`를 `backend/erp.db`로 적재
- [v] 적재 결과 확인
  - `items`: 971
  - `inventory`: 971
  - 빈 재고는 기본값 100 적용

### 5-2. 백엔드
- [v] `items`, `inventory`, `bom`, `production`, `employees`, `ship-packages`, `settings` 라우터 구성
- [v] SQLite 경로를 `backend/erp.db` 기준으로 고정
- [v] 재고 입고 / 출고 / 조정 API 구현
- [v] 거래 이력 API와 CSV 내보내기 구현
- [v] 직원 마스터 API 구현
- [v] 출하 패키지 API 구현
- [v] BOM CRUD와 생산입고 / Backflush API 구현
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
- [v] 모바일 레거시 UI 구조 재현
  - 재고 / 창고입출고 / 부서입출고 / 관리자
  - 상단 헤더, 하단 탭, 바텀시트, 토스트, PIN 잠금
- [v] 레거시 메타 필드 기반 검색 / 필터 / 바코드 흐름 연결
- [v] 창고입출고와 부서입출고의 직원 선택 기반 처리 연결
- [v] 출하 패키지 묶음 출고 연결
- [v] 관리자 PIN 인증 / 변경 / 초기화 연결

### 5-5. Adaptive Legacy Workspace
- [v] `/legacy`를 모바일 / 데스크톱 적응형 엔트리로 재구성
- [v] 모바일에서는 기존 레거시 감성을 유지
- [v] 데스크톱에서는 좌측 탐색 / 중앙 작업대 / 우측 확인 패널 구조로 전환
- [v] 데스크톱 탭 구성
  - 재고
  - 창고입출고
  - 부서입출고
  - 관리자
- [v] 데스크톱 상단바 추가
  - 통합 검색
  - 새로고침
  - 상태 문구
  - 입출고 이력 패널 토글

### 5-6. 90점대 UI 개선 작업
- [v] `/legacy` 공통 문구와 용어를 표준화
- [v] `legacyUi.ts`의 상태, 파일 구분, 부서 라벨을 UTF-8 기준으로 재정리
- [v] 데스크톱 `/legacy` 주요 화면을 ERP 작업대 방식으로 재구성
  - 재고: 필터 / 표 / 우측 상세 + 실행 패널
  - 창고입출고: 단계형 흐름과 실행 요약
  - 부서입출고: 부서 고정 라벨과 패키지 출고 분리
  - 관리자: 목록 + 편집 패널 중심 구조
- [v] 실행 전 요약, 예상 재고, 위험 액션 구분을 강화
- [v] `AI_HANDOVER.md` 자체를 UTF-8 기준으로 복구

## 6. 검증 상태
- [ ] `python -m compileall backend`
- [ ] `cd frontend && npx tsc --noEmit`
- [ ] `cd frontend && npm run build`
- [ ] `/api/inventory/summary` 기준 `total_items = 971`

## 7. 가장 중요한 TODO
1. 모바일 `/legacy` 탭들까지 남은 깨진 문구를 전수 정리
2. 카메라 기반 QR / 바코드 스캔 실연결
3. 거래 이력 notes 인라인 편집 API + UI
4. 데스크톱 `/legacy` 미세 간격, 표 행 밀도, 배지 크기 튜닝
5. 테스트 코드 보강

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
- 1순위: 모바일 `/legacy` 문구와 흐름도 같은 용어 체계로 정리
- 2순위: QR / 바코드 카메라 스캔 실연결
- 3순위: 거래 이력 note 수정 기능 추가
