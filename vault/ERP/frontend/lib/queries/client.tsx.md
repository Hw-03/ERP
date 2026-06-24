# client.tsx

## 이 파일은 뭐예요?
전역 단일 `QueryClient`를 생성하고 `QueryClientProvider`로 감싸는 `QueryProvider` 컴포넌트와, 도메인별 캐시 신선도 상수(`STALE_TIME`)를 정의하는 파일입니다.

## 언제 보나요?
- 전역 캐시 설정(staleTime, gcTime, retry, refetchOnWindowFocus)을 바꿀 때
- 훅에서 `STALE_TIME.VOLATILE` / `STALE_TIME.MASTER`를 쓰는 이유를 확인할 때
- `QueryProvider` 마운트 위치(app/mes 최상위)를 파악할 때

## 중요한 내용
- `STALE_TIME.VOLATILE = 30초` — 재고·요청·알림 등 자주 바뀌는 운영 데이터
- `STALE_TIME.MASTER = 30분` — 부서·모델·직원 등 거의 안 바뀌는 마스터 데이터
- 전역 기본 staleTime은 5분, gcTime 30분, retry 1, refetchOnWindowFocus false
- mutation의 기본 retry는 0 (멱등성 미보장 이유)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
