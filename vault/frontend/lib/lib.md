---
type: index
project: ERP
layer: frontend
source_path: frontend/lib/
status: active
tags:
  - erp
  - frontend
  - api-client
aliases:
  - 프론트엔드 라이브러리
---

# frontend/lib

> [!summary] 역할
> 프론트엔드에서 사용하는 공유 라이브러리 폴더.
> 현재는 API 클라이언트(`api.ts`) 하나가 핵심이다.

## 하위 문서

- [[frontend/lib/api.ts.md]] — 전체 API 호출 함수 및 TypeScript 타입 정의

---

## 쉬운 말로 설명

이 폴더는 **프론트엔드의 "전화기"** 역할. 백엔드(API 서버)와 통신하는 함수들이 모여있다.

현재는 `api.ts` 파일 하나가 전체를 담당. 여기에 모든 API 호출(`api.getItems()`, `api.receiveInventory()` 등) 함수가 정의되어 있다.

컴포넌트는 이 `api` 객체의 메서드를 직접 호출하는 식으로 쓴다.

---

## 사용 예시

```typescript
import { api } from '@/lib/api'

// 재고 요약 가져오기
const summary = await api.getInventorySummary()

// 품목 생성
const newItem = await api.createItem({
  name: "튜브 A타입",
  category: "TR",
  ...
})
```

---

## FAQ

**Q. 왜 `lib/` 에 `api.ts` 하나뿐인가?**
프로토타입이라 구조 단순화. 커지면 `lib/hooks/`, `lib/utils/` 등 분리 예정.

**Q. API 주소는 어디서 설정?**
`.env.local` 의 `NEXT_PUBLIC_API_BASE_URL` 환경변수. `api.ts` 상단에서 참조.

**Q. 에러 처리는 어디서?**
기본적으로 각 호출부에서 `try/catch`. 공통 에러 핸들러는 최소.

---

## 관련 문서

- [[frontend/lib/api.ts.md]] ⭐
- [[frontend/frontend]] (상위)
- [[backend/app/routers/routers]] — 이 api 가 호출하는 서버 측 라우터
- 품목 등록 시나리오, 재고 입출고 시나리오

Up: [[frontend/frontend]]
