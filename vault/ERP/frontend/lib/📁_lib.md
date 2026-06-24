---
type: folder-note
source_path: "frontend/lib"
importance: important
layer: frontend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# 📁 lib

## 이 폴더는 무엇을 위한 곳인가

프론트 화면이 공통으로 쓰는 API 호출, 포맷, 상태/색상 규칙, UI 보조 로직입니다.

## 현장 업무와의 관계

여기 규칙이 바뀌면 여러 화면의 표시와 서버 호출 방식이 동시에 바뀝니다.

## 언제 보면 좋나

- API 호출 실패 처리나 공통 표시 규칙을 볼 때
- 여러 화면이 같이 쓰는 타입/포맷을 확인할 때

## 주요 하위 폴더

- [[ERP/frontend/lib/api/📁_api]] — 도메인별 API 클라이언트 (11개+ 도메인)
- [[ERP/frontend/lib/queries/📁_queries]] — React Query 훅 모음 (20개 훅). 화면 데이터 페칭의 핵심
- [[ERP/frontend/lib/auth/📁_auth]] — 관리자 PIN 세션 관리 (X-Admin-Pin 헤더 자동 주입)
- [[ERP/frontend/lib/io/📁_io]] — 입출고 라벨 사전 (glossary.ts)
- [[ERP/frontend/lib/mes/📁_mes]] — MES 공용 포맷·상태·부서 헬퍼
- [[ERP/frontend/lib/ui/📁_ui]] — 공용 UI 컴포넌트 (5개)
- [[ERP/frontend/lib/__tests__/📁___tests__]] — lib 단위 테스트

## 먼저 볼 파일 5개

- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/frontend/lib/mes-department.ts]] — `mes-department.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.
- [[ERP/frontend/lib/mes-format.ts]] — `mes-format.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.
- [[ERP/frontend/lib/mes-status.ts]] — `mes-status.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.
- [[ERP/frontend/lib/api.ts]] — `api.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/api.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

공용 라이브러리라 한 줄 수정이 여러 화면에 번집니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/📁_frontend]]
