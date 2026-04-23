---
type: moc
project: ERP
status: active
tags:
  - erp
  - moc
  - hub
aliases:
  - ERP 메인 허브
  - 프로젝트 시작점
---

# X-Ray ERP 시스템 — 메인 허브

> [!summary] 프로젝트 개요
> 정밀 X-Ray 장비를 제조하는 회사의 **자재·재고·생산 흐름**을 웹으로 관리하는 ERP/MES 내부 운영 시스템.
> FastAPI(백엔드) + Next.js(프론트엔드) 구조로, SQLite 데이터베이스를 사용한다.

---

## 쉬운 말로 한줄 설명

> 공장 창고에 자재가 들어오고, 부서로 옮겨지고, 생산에 쓰여서 완제품이 되고, 출하되는 과정을 **전부 숫자로 기록해주는 업무 시스템**.

회계/인사는 없고, **"지금 뭐가 얼마나 어디에 있는가"** + **"뭐가 얼마나 어디로 움직였는가"** 에 집중한다.

---

## 어디부터 읽으면 되나요?

| 목적 | 시작 문서 |
|------|-----------|
| **처음 인수인계 받기** | 처음 읽는 사람 ⭐ |
| **관제실 대시보드** | ERP Control Room ⭐ |
| 전체 구조 파악 | 이 문서 |
| **모르는 용어 찾기** | 용어 사전 ⭐ |
| **자주 묻는 질문/문제 해결** | FAQ 전체 ⭐ |
| 백엔드 API 이해 | `backend/app/` |
| 화면(UI) 이해 | `frontend/app/legacy/` |
| 데이터 흐름 이해 | `frontend/lib/api.ts` |
| 품목/재고 관리 | `backend/app/routers/` |
| 설계 문서 | `docs/` |
| 원본 데이터 파일 | `data/` |

---

## 주요 워크플로우 가이드

실제 시스템에서 벌어지는 일을 **단계별**로 풀어 쓴 문서들. 기능별로 어떤 흐름인지 궁금할 때 여기를 본다.

| 시나리오 | 내용 |
|---------|------|
| 품목 등록 시나리오 | 새 품목 추가 시 화면 → API → DB 전체 흐름 |
| 재고 입출고 시나리오 | 입고/출고/이동/불량등록 6가지 흐름 |
| 생산 배치 시나리오 | 생산 배치(PRODUCE) + BOM 백플러시 |
| 분해 반품 시나리오 | 분해(DISASSEMBLE)/반품(RETURN) 배치 |

---

## 폴더별 진입 링크

### 🔧 Backend
- `backend/` — FastAPI 백엔드 전체
  - `backend/app/` — 앱 핵심 모듈
  - `backend/app/routers/` — API 엔드포인트 14개
  - `backend/app/services/` — 비즈니스 로직
  - `backend/app/utils/` — 유틸리티 함수

### 🖥 Frontend
- `frontend/` — Next.js 프론트엔드 전체
  - `frontend/app/` — 라우트 페이지
  - `frontend/app/legacy/` — 실제 활성 UI (핵심!)
  - `frontend/app/legacy/_components/` — 화면 컴포넌트
  - `frontend/lib/` — API 클라이언트
  - `frontend/components/` — 공용 컴포넌트

### 📄 문서 & 데이터
- `docs/` — AI 핸드오버, 진행 현황
- `data/` — 엑셀/CSV 원본 데이터

### ⚙️ 인프라 & 스크립트
- `scripts/` — 데이터 통합·DB 마이그레이션 유틸 스크립트
- `docker-compose.yml` — 개발 환경 (PostgreSQL)
- `docker-compose.nas.yml` — 운영 환경 (SQLite, NAS)
- `start.bat` — 로컬 직접 실행
- `schema.sql` — PostgreSQL 이관용 스키마

### 📋 프로젝트 문서
- `README.md` — 프로젝트 개요
- `CLAUDE.md` — AI 작업 규칙

---

## 핵심 파일 바로가기

| 파일 | 역할 |
|------|------|
| `backend/app/main.py` | 백엔드 진입점, 라우터 등록, DB 초기화 |
| `backend/app/models.py` | DB 테이블 정의 (SQLAlchemy) |
| `backend/app/schemas.py` | API 입출력 데이터 형식 정의 |
| `frontend/lib/api.ts` | 프론트→백엔드 API 호출 전체 |
| `frontend/app/layout.tsx` | 앱 전체 레이아웃 설정 |
| `frontend/app/page.tsx` | 루트 페이지 (legacy로 리다이렉트) |
| `frontend/app/legacy/page.tsx` | 실제 메인 화면 진입점 |
| `frontend/app/legacy/_components/DesktopLegacyShell.tsx` | 데스크톱 전체 쉘 |

---

## 공정 카테고리 코드표

| 코드 | 명칭 | 설명 |
|------|------|------|
| RM | Raw Material | 원자재 |
| TA | Tube Ass'y | 튜브 반제품 |
| TF | Tube Final | 튜브 완제품 |
| HA | High-voltage Ass'y | 고압 반제품 |
| HF | High-voltage Final | 고압 완제품 |
| VA | Vacuum Ass'y | 진공 반제품 |
| VF | Vacuum Final | 진공 완제품 |
| BA | Body Ass'y | 조립 반제품 |
| BF | Body Final | 조립 완제품 |
| FG | Finished Good | 완제품 |
| UK | Unknown | 미분류 / 확인 필요 |

---

## 태그 요약

- `#erp` — 전체 프로젝트
- `#backend` — FastAPI 관련
- `#frontend` — Next.js 관련
- `#router` — API 라우터
- `#model` — DB 모델
- `#component` — UI 컴포넌트
- `#api-client` — 프론트엔드 API 호출
- `#legacy` — 현재 활성 레거시 UI
- `#docs` — 문서/핸드오버
- `#data` — 데이터 파일
- `#design` — UI 디자인 시안

---

## Vault 읽는 법 (비전공자용)

이 Obsidian Vault 는 프로젝트 전체를 **비전공자도 이해할 수 있게** 정리한 참고용 아카이브다.

### 추천 순서

0. **처음 읽는 사람** — 첫날 안내서. 이 Vault가 무엇이고 어디부터 읽어야 하는지 설명
1. **용어 사전** — 모르는 단어부터 찾기 (BOM, 백플러시, pending, ERP 코드 4파트 등)
2. **FAQ 전체** — 가장 자주 막히는 질문 20개
3. **시나리오 4종** — 실제 업무 흐름 단계별 스토리
   - 품목 등록 시나리오 / 재고 입출고 시나리오 / 생산 배치 시나리오 / 분해 반품 시나리오
4. **각 `_index.md`** — 관심 폴더의 역할·주요 파일 소개
5. **개별 `*.py.md` / `*.tsx.md`** — 특정 파일이 궁금할 때만

### 각 문서 공통 구조

모든 code-note 문서에는 다음 섹션이 들어가 있다:

- `역할` — 한 줄 요약
- `쉬운 말로 설명` — 비전공자용 풀이 (비유·일상 언어)
- `FAQ` — 헷갈리기 쉬운 질문 2-4개
- `관련 문서` — 이동 링크

### 실제 코드를 찾으려면?

이 Vault 는 **아카이브(참고용 스냅샷)** 이다. 실제 운영 코드는 `C:\Users\HW\Documents\GitHub\ERP\` 최상위 `backend/`, `frontend/` 에 있다. Vault 설명과 실제 코드가 다르면 **실제 코드가 우선**이다.

---

> [!info] Vault 보강 이력
> - 2026-04-22: 전체 127개 code-note 에 "쉬운 말로 설명 / FAQ / 관련 문서" 섹션 추가 완료.
> - 신규 가이드 6개 (`용어 사전`, `FAQ 전체`, `시나리오_*` 4개) 작성.
> - 업데이트 후 총 133개 md 문서.

Up: [[_guides]]
