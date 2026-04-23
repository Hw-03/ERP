# AI Handover

이 문서는 Claude와 Codex가 같은 ERP 프로젝트를 이어서 작업할 때 보는 최신 인수인계 문서다.

## 현재 상태

- 프로젝트: DEXCOWIN 재고 관리/ERP 시스템
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 화면: `/legacy` 기반 데스크톱/모바일 레거시 UI
- 기준 데이터: 통합 품목 971건
- 현재 브랜치: `feat/font-size-increase`

## 반드시 지킬 기준

- 품목코드 기준 문서: `docs/ITEM_CODE_RULES.md`
- 조립 F 타입은 `AF`다.
- `BF`는 구형 오염 코드이며 신규 코드/필터/문서 기준에 추가하지 않는다.
- 부서 필터는 `category`가 아니라 `process_type_code` 또는 백엔드 응답의 `department`를 기준으로 한다.
- “전체” 필터와 “모든 부서/모든 모델 개별 선택”은 같은 품목 수를 보여야 한다.

## 최근 이슈와 결론

- 재고 API 로드 토스트는 971건인데 화면 조회 품목이 967건으로 표시되는 문제가 있었다.
- 원인은 모든 부서/모델 칩을 개별 선택했을 때 일부 품목이 부서 매핑에서 빠지는 것이었다.
- 조사 중 구형/오염 코드 `BF`가 조립 품목처럼 남아 있음을 확인했다.
- 최종 기준은 `AR/AA/AF -> 조립`이다.
- 클로드가 코드 쪽에서 `BF -> AF`, 18개 공정코드, 부서 매핑 정리를 진행 중이다.

## 최근 커밋 흐름

- `b890dc5 fix: 부서 필터 안전망 + 품절 행 부서 뱃지 표시`
- `7c47481 fix: 재고 필터링 근본 수정 - department 단일 소스 도입`
- `8850c6d feat: 창고 입출고 UI 개선, 로고 분리 스크립트 정리, DB 유틸 추가`
- `66e93cf chore: 아카이브 볼트 원본 제거, 재고뷰·로고 분리 스크립트 추가`
- `98fa3c1 docs: Obsidian vault 루트로 이동 및 프론트 UI 업데이트`

## 주요 화면 구조

- 데스크톱 레거시 셸의 활성 탭:
  - 재고: `frontend/app/legacy/_components/DesktopInventoryView.tsx`
  - 창고/입출고: `frontend/app/legacy/_components/DesktopWarehouseView.tsx`
  - 관리자: `frontend/app/legacy/_components/DesktopAdminView.tsx`
- 모바일 레거시 UI는 기존 컴포넌트 트리를 계속 사용한다.
- `_archive/`와 `frontend/_archive/`는 참고/보관 영역이며 일반 작업 대상이 아니다.

## 현재 주의할 작업

- 문서와 코드에서 `BF`를 조립 코드로 다시 추가하지 않는다.
- 클로드의 진행 중 변경이 많으므로 코드 파일을 수정할 때는 `git diff`로 현재 변경을 먼저 확인한다.
- `frontend/app/legacy/_components/DesktopInventoryView.tsx`에는 재고 필터 UX 수정이 진행 중이다.
- `docs/design/`은 디자인 참고 자료다. 업무 규칙 기준으로 사용하지 않는다.

## 검증 명령

```bash
python -m compileall backend
cd frontend
npx tsc --noEmit
npm run build
```

문서 정리 후에는 다음 검색으로 구형 표현 잔여 여부를 확인한다.

```powershell
Select-String -Path README.md,docs\*.md,schema.sql -Pattern '구형 코드 표현'
```
