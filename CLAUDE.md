# CLAUDE.md

## 프로젝트 목적
이 프로젝트는 자재·재고·생산 흐름을 웹 기반으로 관리하는 ERP/MES 프로토타입이다.

## 프로젝트 구조
- Backend: `backend/`
- Frontend: `frontend/`
- Backend entry: `backend/app/main.py`
- Frontend는 route wrapper와 실제 구현 파일이 다를 수 있으므로, 수정 전 실제 import/render 경로를 먼저 확인할 것

## 루트 폴더
- `data/` : 엑셀/CSV 원본 + 통합 산출물
- `scripts/` : 파이썬 유틸 스크립트
- `docs/` : 핸드오버/리포트 문서
- `.dev/` : Playwright 스크린샷 도구
- `vault/` : Obsidian 인수인계 볼트 (커밋 대상)
- `_archive/`, `_backup/` : 수정 금지

## 작업 원칙
1. 사용자가 막지 않는 한 가능한 범위에서 스스로 진행한다.
2. 사소한 수정, 경로 탐색, 실행, 검증은 중간 확인 없이 진행한다.
3. 큰 구조 변경이나 파괴적 변경 전에는 짧게 이유를 설명한다.
4. 애매하면 질문보다 가장 보수적이고 안전한 방식을 선택한다.
5. 문서보다 현재 실제 코드 연결 구조를 우선한다.

## 수정 금지 경로
- `_archive/`
- `_backup/`
- `frontend/_archive/`

사용자가 명시적으로 요청한 경우만 예외로 한다.

## 기본 진행 순서
1. 관련 파일 찾기
2. 실제 활성 파일 확인
3. 바로 수정
4. 실행 또는 검증
5. 결과 요약

## 절대 주의
- `app` 라우트 파일만 보고 수정하지 말 것
- 실제 렌더링 컴포넌트, import 경로, API 연결 파일을 먼저 확인할 것
- 문서와 현재 코드가 다르면 현재 코드를 기준으로 판단할 것
- 샘플 데이터와 실제 운영 데이터를 혼동하지 말 것
- 사용자가 요청하지 않은 대규모 리팩토링, 폴더 이동, 파일명 변경은 하지 말 것

## 브랜치 원칙
- 회사에서 낮에 진행하는 확인 완료 작업은 `main` 기준으로 관리
- 저녁 작업, 실험, 전면 개편, 구조 변경은 별도 feature 브랜치에서 진행
- 성격이 다른 작업(예: mobile / backend / docs)은 한 브랜치에 섞지 않는 것을 우선
- 브랜치 작업 완료 후에는 `main` 반영 여부와 삭제 후보 여부를 같이 정리

## 브랜치 이름 규칙
- `feat/...`
- `fix/...`
- `refactor/...`
- `docs/...`

예:
- `feat/mobile-ux-overhaul`
- `feat/backend-hardening`
- `fix/inventory-sync-bug`

## 커밋 원칙
- 자동 커밋, 자동 푸시 금지
- 커밋은 사용자가 요청했을 때만 수행
- 다만 큰 수정 직전 백업 포인트가 필요하면 커밋을 제안할 수 있음
- 사소한 수정마다 무분별하게 커밋하지 말 것
- 커밋 전에는 현재 변경 범위를 짧게 요약할 것

## 커밋 메시지 형식
형식:
`YYYY-MM-DD 영역: 작업 내용`

예:
- `2026-04-24 mobile: 재고 탭 선택모드 강화`
- `2026-04-24 backend: stock_math로 재고 계산 통일`
- `2026-04-24 admin: 모바일 관리자 허브 추가`
- `2026-04-24 docs: vault 구조 정리`

규칙:
- 날짜는 반드시 맨 앞에 넣을 것
- 영역은 `mobile`, `desktop`, `backend`, `admin`, `docs`, `fix`, `refactor` 중 가장 가까운 것으로 쓸 것
- `test`, `fix`, `again`, `update` 같은 모호한 메시지는 사용하지 말 것

## main 반영 원칙
- feature 브랜치는 실행/검토 후에만 `main` 반영 제안
- `main` 반영은 커밋이 아니라 보통 merge라고 구분해서 설명
- 필요하면 merge 후 삭제 가능한 브랜치도 함께 정리

## 응답 스타일
- 한국어
- 두괄식
- 짧고 명확하게
- 비전공자 기준으로 설명
- 가능하면 `지금 된 것 / 안 된 것 / 다음 할 일 1개` 순서로 답변

## 보고 형식
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