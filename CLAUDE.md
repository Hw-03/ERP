# CLAUDE.md

## 프로젝트 목적
이 프로젝트는 자재·재고·생산 흐름을 웹 기반으로 관리하는 ERP/MES 프로토타입이다.

## 프로젝트 구조
- Backend: `backend/`
- Frontend: `frontend/`
- Backend entry: `backend/app/main.py`
- Frontend는 route wrapper와 실제 구현 파일이 다를 수 있으므로, 수정 전 실제 import/render 경로를 먼저 확인할 것

## 루트 폴더 배치
- `data/` : 엑셀/CSV 원본 + 통합 산출물 (xlsx 3개, csv 4개)
- `scripts/` : 파이썬 유틸 스크립트 (예: `erp_integration.py`)
- `docs/` : 핸드오버/리포트 문서
- `.dev/` : Playwright 스크린샷 도구 (개발 전용)
- `vault/` : Obsidian 인수인계 볼트 (커밋 대상)
- `_archive/`, `_backup/` : 수정 금지

## 최우선 작업 원칙
1. 사용자가 막지 않는 한, 가능한 범위에서 **스스로 진행**한다.
2. 사소한 수정, 경로 탐색, 실행, 검증은 **중간 확인 없이 진행**한다.
3. 큰 구조 변경이나 파괴적 변경 전에는 짧게 이유를 설명한 뒤 진행한다.
4. 애매하면 질문보다 **가장 보수적이고 안전한 방식**을 선택한다.
5. 문서보다 **현재 실제 코드 연결 구조**를 우선한다.

## 수정 금지 경로
기본적으로 아래 경로는 수정하지 말 것.
- `_archive/`
- `_backup/`
- `frontend/_archive/`

사용자가 명시적으로 요청한 경우만 예외로 한다.

## 기본 행동 규칙
사용자 요청을 받으면 아래 순서로 진행한다.

1. 관련 파일 찾기
2. 실제 활성 파일 확인
3. 바로 수정 가능한 범위면 곧바로 수정
4. 실행 또는 검증
5. 결과 요약

사용자가 별도 요청하지 않으면, 사소한 단계 확인은 생략하고 진행한다.

## 절대 주의
- `app` 라우트 파일만 보고 수정하지 말 것
- 실제 렌더링 컴포넌트, import 경로, API 연결 파일을 먼저 확인할 것
- 문서/핸드오버 내용이 현재 코드와 다르면 현재 코드를 기준으로 판단할 것
- 샘플 데이터와 실제 운영 데이터를 혼동하지 말 것
- 사용자가 요청하지 않은 대규모 리팩토링, 폴더 이동, 파일명 변경은 하지 말 것

## 응답 스타일
- 한국어
- 두괄식
- 짧고 명확하게
- 사용자는 비전공자이므로 어려운 설명 최소화
- 가능하면 "지금 된 것 / 안 된 것 / 다음 할 일 1개" 순서로 답할 것

## 보고 형식
작업 후에는 가능하면 아래 형식으로 짧게 보고한다.

- 한 일
- 수정 파일
- 확인 결과
- 남은 이슈
- 다음 할 일

## 우선 참고 파일
- `README.md`
- `docs/AI_HANDOVER.md`
- `docs/CODEX_PROGRESS.md`
- `start.bat`
- `docker-compose.yml`
- `backend/app/main.py`
- `frontend/package.json`

## 실행 기본
### backend
```bash
cd backend
python -m uvicorn app.main:app --reload