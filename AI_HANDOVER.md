# AI_HANDOVER

## 프로젝트 개요
- 프로젝트명: X-ray 정밀 제조 ERP 시스템
- 핵심 도메인: 정밀 X-ray 장비 제조 ERP
- 목적: 자재 마스터, 재고, BOM, 생산입고, 출하 흐름을 하나의 ERP로 관리

## 핵심 비즈니스 로직
- 이 공장은 단순 조립이 아니라 다단계 제조 공정을 따름
- 모든 품목은 아래 11단계 공정 카테고리 중 하나로 분류되어야 함
  - `RM`: 원자재
  - `TA` / `TF`: 튜브 공정
  - `HA` / `HF`: 고압 공정
  - `VA` / `VF`: 진공 공정
  - `BA` / `BF`: 조립 공정
  - `FG`: 완제품
  - `UK`: 미분류 / 알 수 없음
- 향후 핵심 운영 흐름
  - BOM 기반 생산입고
  - Backflush를 통한 하위 부품 자동 차감
  - 출하 및 입출고 이력 관리

## 기술 스택
- 백엔드: FastAPI + SQLAlchemy
- 프론트엔드: Next.js 14 + Tailwind CSS
- 데이터베이스: SQLite (`erp.db`)
- 데이터 소스: 프로젝트 루트의 `ERP_Master_DB.csv` 및 원본 엑셀 파일

## 현재 진행 상황

### 1. 데이터 통합
- 원본 엑셀 파일 매핑 및 통합 스크립트가 존재함: `erp_integration.py`
- 통합 결과물 `ERP_Master_DB.csv` 생성 완료 상태
- 통합 리포트 및 보조 CSV 산출물도 루트에 정리되어 있음

### 2. 백엔드
- FastAPI 기반 API 골격 구현 완료
- 주요 라우터 존재
  - 품목 관리: `items`
  - 재고 요약 / 입고 / 거래이력: `inventory`
  - BOM 관리: `bom`
  - 생산입고 / Backflush: `production`
- PostgreSQL 중심 구조에서 SQLite 호환 구조로 전환 완료
- `backend/app/database.py` 기준 기본 DB는 SQLite를 사용하도록 구성됨

### 3. 프론트엔드
- Next.js 14 기반 대시보드 UI 구현 완료
- BoxHero 스타일의 메인 대시보드가 존재함
- 카테고리별 재고 현황, KPI 카드, 최근 거래 이력 UI가 구현되어 있음
- `UK` 품목 경고 UI도 구현되어 있음

### 4. 시드 데이터 적재
- `backend/seed.py`를 SQLite 기준으로 정비 완료
- `ERP_Master_DB.csv` -> 루트 `erp.db` 적재 로직 구현 완료
- 현재 적재 규칙
  - `category_code` -> `CategoryEnum` 매핑
  - `stock_current`가 비어 있거나 무효값이면 `100`으로 채움
  - 기존 `items`, `inventory` 데이터는 재실행 시 전량 삭제 후 다시 적재
- 최근 실행 결과
  - CSV rows read: `971`
  - Items inserted: `971`
  - Inventory inserted: `971`
  - Default stock=100 applied: `967`

### 5. Git / 협업 상태
- GitHub 레포와 로컬 레포 연결 완료
- Codex가 직접 `main` 브랜치까지 푸시 가능한 상태 확인 완료
- 이 문서는 Claude와 Codex가 번갈아 작업할 때 기준 문서로 사용

## 가장 시급한 TODO
- [ ] 한글 인코딩 복구
- [x] `seed.py` 실행을 통한 데이터 적재
- [ ] `UK` 품목 분류 기능 구현

## 다음 작업 권장 순서
1. 프론트/백엔드 전반의 한글 인코딩 깨짐 복구
2. `UK` 품목 목록 조회 및 카테고리 수정 기능 구현
3. 대시보드에서 품목 관리 화면으로 이동할 수 있게 연결
4. BOM / 생산입고 / 출하 흐름의 실제 UI 보강

## 주의사항
- **모든 파일은 반드시 UTF-8 형식으로 저장해야 함**
- **한글이 포함된 문서, 코드, CSV 처리 시 인코딩 깨짐 여부를 항상 먼저 확인할 것**
- SQLite DB 파일은 루트의 `erp.db`를 기준으로 사용
- 시드 스크립트 실행 전후로 `items`, `inventory` 데이터가 재생성될 수 있으므로 주의

## 메모
- 현재 가장 눈에 띄는 품질 이슈는 한글 인코딩 깨짐
- 현재 백엔드 핵심 로직은 존재하지만, 사용자 업무 흐름 기준 UI는 아직 초기 단계
- `production` 라우터에 BOM explosion / Backflush 로직이 이미 일부 구현되어 있으므로, 이후 Phase 3에서는 기존 로직을 확장하는 방향이 적합함
