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
- 백엔드: FastAPI + SQLAlchemy 2.0 (sync)
- 프론트엔드: Next.js 14 App Router + Tailwind CSS
- 데이터베이스: **SQLite** (`backend/erp.db`) — PostgreSQL 전환 가능
- 데이터 소스: 프로젝트 루트의 `ERP_Master_DB.csv` (971개 품목)

## 현재 진행 상황

### 1. 데이터 통합
- 원본 엑셀 파일 매핑 및 통합 스크립트: `erp_integration.py`
- 통합 결과물 `ERP_Master_DB.csv` 생성 완료
- 통합 리포트 및 보조 CSV 산출물도 루트에 정리

### 2. 백엔드
- FastAPI 기반 API 구현 완료
- 주요 라우터
  - 품목 관리: `backend/app/routers/items.py`
  - 재고 요약 / 입고 / 거래이력: `backend/app/routers/inventory.py`
  - BOM 관리: `backend/app/routers/bom.py`
  - 생산입고 / Backflush: `backend/app/routers/production.py`
- **SQLite 호환 구조** (PostgreSQL도 지원):
  - `database.py`: `DATABASE_URL` 기본값 `sqlite:///./erp.db`, WAL 모드, FK ON
  - `models.py`: `GUID` TypeDecorator (SQLite=CHAR36 / PG=native UUID), `native_enum=False`
  - `requirements.txt`: `psycopg2-binary` 제외 (로컬 SQLite 전용 시 불필요)
  - `production.py`: `with_for_update()` 제거 (SQLite 미지원)
- 실행: `cd backend && uvicorn app.main:app --reload --port 8000`

### 3. 프론트엔드
- Next.js 14 기반 대시보드 UI 구현 완료
- BoxHero 스타일의 메인 대시보드 (`frontend/app/page.tsx`)
- 카테고리별 재고 현황 카드, KPI 카드, 최근 거래 이력 UI
- `UK` 품목 경고 배너 구현 (`frontend/components/UKAlert.tsx`)
- 실행: `cd frontend && npm run dev` → http://localhost:3000

### 4. 시드 데이터 적재
- `backend/seed.py`를 SQLite 기준으로 정비 완료
- 실행: `cd backend && python seed.py`
- 적재 규칙
  - `category_code` → `CategoryEnum` 매핑
  - `stock_current` 빈 값이면 `stock_prev` → 그래도 없으면 기본값 **100**
  - 기존 `items`, `inventory` 데이터는 재실행 시 전량 삭제 후 재적재
- 최근 실행 결과
  - CSV rows: 971개
  - 적재 완료: 971건 (기본재고=100 적용: 967건)

### 5. Git / 협업 상태
- 브랜치: `claude/erp-inventory-system-BeeIm`
- GitHub 레포: `hw-03/erp`
- 이 문서는 Claude와 Codex가 번갈아 작업할 때 기준 문서로 사용

## 주의사항 (Codex / 다음 AI에게)
- **절대로 `psycopg2-binary`를 `requirements.txt`에 추가하지 말 것** — PostgreSQL 미설치 환경에서 `pip install` 실패
- **절대로 `with_for_update()`를 `production.py`에 추가하지 말 것** — SQLite 미지원
- **`models.py`에서 `from sqlalchemy.dialects.postgresql import UUID` 직접 사용 금지** — `GUID` TypeDecorator 사용
- **`SAEnum`은 반드시 `create_type=False, native_enum=False`** — SQLite에서 `CREATE TYPE` 실행 불가
- **`database.py` 기본 DB URL은 반드시 `sqlite:///./erp.db`** — PostgreSQL URL로 변경 금지
- **`__pycache__/`, `*.pyc` 파일을 커밋하지 말 것** — `.gitignore`에 이미 등록됨

## 다음 작업 권장 순서
1. `UK` 품목 목록 조회 및 카테고리 수정 기능 구현
2. 대시보드에서 품목 관리 화면으로 이동할 수 있게 연결
3. BOM / 생산입고 / 출하 흐름의 실제 UI 보강
4. (선택) PostgreSQL 마이그레이션 시 `requirements.txt`에 `psycopg2-binary` 추가 및 `DATABASE_URL` 환경변수 설정

## 메모
- 현재 백엔드 핵심 로직(BOM explosion + Backflush)은 완전히 구현됨
- 프론트엔드 대시보드는 기능하지만 품목 관리 UI는 초기 단계
- SQLite DB 파일 위치: `backend/erp.db` (gitignore에 등록되어 커밋 제외)
