---
type: folder-note
source_path: "frontend/lib/queries"
importance: important
layer: frontend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# 📁 queries

## 이 폴더는 뭐예요?

화면이 서버 데이터를 가져오고 수정할 때 쓰는 **React Query 훅** 모음입니다.
도메인별로 쿼리(조회)와 뮤테이션(변경)을 분리해 캐시 관리와 재요청을 자동 처리합니다.

## 언제 여기를 보나요?

- 화면에 데이터가 안 뜰 때 (어떤 쿼리 훅이 실패하는지 확인)
- 저장·수정 후 화면이 갱신되지 않을 때 (뮤테이션 invalidateQueries 확인)
- 캐시 무효화 타이밍 문제를 디버깅할 때

## 주요 파일

| 파일 | 역할 |
|------|------|
| `client.tsx` | QueryClient 설정 및 Provider. 앱 전체 캐시의 루트 |
| `keys.ts` | 쿼리 키 상수. `invalidateQueries`와 반드시 일치해야 함 |
| `useInventoryQuery.ts` | 재고 현황·품목별 위치 재고 조회. 입고·조정·이동 뮤테이션 5개 |
| `useItemsQuery.ts` | 품목 목록 조회·CRUD. process_type_code 등 파라미터 위임 |
| `useStockRequestsQuery.ts` | 결재 큐(창고·부서) + 드래프트 작업. 인터페이스 6개 |
| `useNotificationsQuery.ts` | 알림 목록·읽음 처리 |
| `useDraftCartQuery.ts` | 입출고 임시저장 장바구니 |
| `useBomQuery.ts` | BOM 트리 조회 |
| `useMyItemOrderQuery.ts` | 직원별 품목 순서 커스터마이징 |
| 나머지 11개 | 직원·부서·모델·설정·생산·주간보고·인수인계·admin 등 |

## 건드릴 때 조심할 점

- `keys.ts`의 쿼리 키와 뮤테이션의 `invalidateQueries` 인수가 반드시 일치해야 합니다. 불일치하면 뮤테이션 성공 후에도 화면이 옛날 데이터를 계속 보여줍니다.
- QueryClient는 `client.tsx`에만 있습니다. 새로운 전역 캐시 설정이 필요하면 여기만 수정하면 됩니다.

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api/📁_api]] — 훅이 호출하는 실제 API 클라이언트 (도메인별)
- [[ERP/frontend/lib/api-core.ts]] — fetch wrapper 기반 (에러 파싱·URL 빌더)
- [[ERP/frontend/lib/api.ts]] — 도메인 API 통합 re-export 진입점
