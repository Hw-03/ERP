# AI_HANDOVER

이 문서는 Codex와 Claude가 번갈아 작업할 때 프로젝트의 비즈니스 로직, 구현 상태, 다음 우선순위를 빠르게 공유하기 위한 공용 작전 지도다.

## 1. 프로젝트 개요
- 프로젝트명: 정밀 X-Ray 장비 제조 ERP 시스템
- 목표: 품목 마스터, 재고, 입출고, BOM, 생산, 출하 패키지, 거래 이력을 하나의 ERP로 통합 관리
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
  - `UK`: 미분류 또는 확인 필요
- 주요 운영 흐름
  - 품목 등록 및 카테고리 정리
  - 재고 입고 / 출고 / 조정 / 부서 이동
  - 생산 입고 시 BOM 기반 Backflush
  - 출하 패키지 기반 묶음 출고
  - 거래 이력 추적

## 3. 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite
  - 운영 기준 DB: `backend/erp.db`
- 원본 데이터
  - 통합 마스터 CSV: `ERP_Master_DB.csv`

## 4. 운영 규칙
- 모든 파일은 반드시 UTF-8 형식으로 저장한다.
- 단계가 끝날 때마다 이 문서를 최신 상태로 업데이트한다.
- 기능 단위가 끝날 때마다 GitHub에 푸시한다.
- PowerShell 출력 한글이 깨져 보일 수 있으므로 실제 판단은 파일 내용, 빌드 결과, API 응답 기준으로 한다.

## 5. 현재 진행 상황

### 5-1. 데이터 통합 / 시드
- [v] `ERP_Master_DB.csv` 기준 시드 적재 구조 정비
- [v] `backend/seed.py`를 SQLite 기준으로 정비
- [v] `ERP_Master_DB.csv`를 `backend/erp.db`로 적재 완료
- [v] 최신 적재 결과
  - CSV rows read: `971`
  - Items inserted: `971`
  - Inventory inserted: `971`
  - Default stock=100 applied: `969`

### 5-2. 백엔드
- [v] FastAPI와 `items`, `inventory`, `bom`, `production` 라우터 구성 완료
- [v] SQLite 경로를 `backend/erp.db` 기준으로 고정
- [v] `/api/items`, `/api/inventory/summary`, `/api/inventory/transactions` 동작 확인
- [v] 재고 조정 API 구현
- [v] 직접 입고 / 직접 출고 API 구현
- [v] 거래 이력 응답에 품목 코드, 품목명, 카테고리, 단위 포함
- [v] 직원 마스터 API 추가
- [v] 출하 패키지 API 추가
- [v] 패키지 단위 묶음 출고 API 추가

### 5-3. 프론트엔드
- [v] 메인 대시보드 UI 복구 및 정리
- [v] `/inventory` 품목 리스트 페이지 구현
- [v] 검색, 카테고리 필터, 재고 상태 필터 구현
- [v] 품목 상세 모달에서 최근 거래 이력 표시
- [v] 품목 상세 모달에서 재고 조정, 입고, 출고, 카테고리 변경 가능
- [v] `/history` 전체 거래 이력 페이지 구현
- [v] `/bom` BOM 관리 및 생산 입고 페이지 구현
- [v] `/operations` 창고 입출고 / 부서 입출고 전용 화면 구현
- [v] `/operations`에서 직원 선택 기반 처리 가능
- [v] `/operations`에서 출하 부서 패키지 출고 가능
- [v] `/admin` 직원 마스터 / 출하 패키지 관리 화면 구현

### 5-4. 레거시 기능 이식
- [v] `inventory_v2.html`, `app_final.js`의 검색 / 필터 / 재고 조정 흐름 이식
- [v] 직원 선택 기반 입출고 흐름 이식
- [v] 출하 묶음 패키지 관리 흐름 이식
- [v] 관리자 비밀번호 인증 / 변경 흐름 이식
- [v] `/legacy` 경로에 레거시 동형 모바일 UI 신규 구현 (섹션 10 참고)
- [v] Item 모델에 레거시 메타 필드 7개 추가 및 시드 적재
- [v] 바코드 텍스트 검색 지원 (카메라 QR은 추후)
- [v] 안전 초기화 API (`POST /api/settings/reset`) 추가

### 5-5. 검증 상태
- [v] `python -m compileall backend` 통과
- [v] `npm run build` 통과
- [v] `/api/inventory/summary` 기준 `total_items = 971` 확인
- [v] `/api/settings/verify-pin` 응답 확인
- [v] `/api/items/export.csv`, `/api/inventory/transactions/export.csv` 응답 확인
- [v] `/`, `/inventory`, `/history`, `/bom`, `/operations`, `/admin` 빌드 가능 확인

## 6. 우선순위 로드맵

### Phase 1. 데이터 가시성 확보
- [~] 남은 한글 인코딩 전수 복구
- [v] 품목 리스트 페이지 구현
- [v] 품목 상세 뷰 및 재고 수정 기능 구현
- [~] UK 품목 전용 분류 워크플로 강화

### Phase 2. BOM 및 생산 로직
- [v] BOM 관리 UI 구현
- [v] 생산 가능 여부 확인 UI 구현
- [v] 생산 입고 UI 구현
- [~] Backflush 검증 메시지와 예외 UX 보강 필요

### Phase 3. 입출고 관리 및 이력
- [v] 전용 입출고 화면 구현
- [v] 직원 선택 기능 구현
- [v] 출하 패키지 기반 묶음 출고 구현
- [v] 전체 거래 이력 화면 구현
- [v] CSV 내보내기 기능 추가

### Phase 4. 안정화
- [v] 관리자 비밀번호 기능 이식
- [ ] QR / 바코드 스캔 기능 이식
- [ ] 테스트 코드 보강
- [ ] 운영 문서 정리

## 7. 지금 가장 시급한 TODO
1. 남아 있는 한글 인코딩 깨짐 구간 복구
2. UK 품목 전용 분류 워크플로 강화
3. QR / 바코드 스캔 기능 이식
4. 남아 있는 인벤토리 / 이력 화면 한글 복구
5. 테스트 코드와 운영 문서 보강

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
- 시드 스크립트 실행 시 `items`, `inventory` 데이터는 재생성된다.
- 레거시 분석용 압축 해제 폴더 `_legacy_zip/`는 커밋 대상이 아니다.

## 10. Legacy UI Parity Initiative

### 목표
사용자 표면은 `inventory_v2.html` 모바일 앱과 거의 동일하게 재현하되, 내부 로직은 현재 FastAPI + SQLite 백엔드를 그대로 사용한다.

### 구현 상태
- [v] 새 대표 UI: `/legacy` 경로 (Next.js)
- [v] 하단 5탭 구조: 재고 / 창고입출고 / 부서입출고 / 히스토리 / 관리자
- [v] 430px 모바일 프레임, 고정 상단/하단 바, 바텀시트, 토스트
- [v] 재고 탭: fileType/part/model/KPI 필터 pills, 바코드 검색, 더보기, 그룹핑 토글, ItemDetailSheet
- [v] 창고입출고 탭: whin/wh2d/d2wh 모드, 직원 선택 필수, 확인 시트
- [v] 부서입출고 탭: 부서 선택, 직원 필수, 출하 패키지 연동
- [v] 히스토리 탭: 타입/기간 필터, 더보기
- [v] 관리자 탭: PIN 잠금, 상품/직원/출하묶음/설정 섹션
- [v] 설정 섹션: PIN 변경, CSV 내보내기, 안전 초기화 (PIN 재확인 후 재시드)
- [v] 기존 경로 (`/inventory`, `/operations`, `/history`, `/admin`, `/bom`) 유지

### Item 모델 확장 필드 (7개)
| 필드 | 설명 | 시드 출처 |
|------|------|----------|
| `barcode` | 바코드 | item_code 기본값 |
| `legacy_file_type` | 원자재/조립자재/발생부자재/완제품/미분류 | category_code 규칙 |
| `legacy_part` | 자재창고/조립출하/고압파트/진공파트/튜닝파트/출하 | category_code 규칙 |
| `legacy_item_type` | 세부 품목 유형 | CSV part_type |
| `legacy_model` | DX3000/ADX4000W/ADX6000/COCOON/SOLO/공용 | CSV model_ref |
| `supplier` | 공급사 | CSV supplier |
| `min_stock` | 안전재고 | CSV safety_stock |

### 신규 API 엔드포인트
- `GET /api/items?legacy_file_type=&legacy_part=&legacy_model=&barcode=` — 레거시 필터
- `POST /api/settings/reset` — PIN 인증 후 시드 재적재 (안전 초기화)

### 남은 작업
- [ ] 카메라 QR/바코드 스캔 (현재 텍스트 입력으로 대체됨)
- [ ] 히스토리 비고(notes) 인라인 편집
- [ ] BOM 관리를 관리자 탭 내 섹션으로 통합
- [ ] 날짜 직접 수정 기능
- [ ] 품목 그룹핑 시 동일 품목 재고 합산 표시
