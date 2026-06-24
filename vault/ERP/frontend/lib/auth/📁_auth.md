---
type: folder-note
source_path: "frontend/lib/auth"
importance: important
layer: frontend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# 📁 auth

## 이 폴더는 뭐예요?

**관리자 PIN 세션** 관리 계층입니다. 새로고침하면 PIN을 다시 입력해야 하는 게 의도된 보안 설계입니다 — 서버 쿠키 없이 메모리(in-memory)에만 유지됩니다.

## 언제 여기를 보나요?

- 관리자 화면이 새로고침 후 PIN 재입력을 요구하는 동작을 파악할 때
- `X-Admin-Pin` 헤더가 API 요청에 안 붙는 문제를 디버깅할 때
- 관리자 세션 정책(타임아웃·저장소)을 변경할 때

## 주요 파일

| 파일 | 역할 |
|------|------|
| `admin-session.tsx` | `AdminSessionProvider`. mount 시 `api-core.registerAdminPinProvider` 콜백 등록 → 이후 모든 API 요청에 `X-Admin-Pin` 헤더 자동 주입 |
| `constants.ts` | 세션 관련 상수 |

## 흐름 설명

```
app/mes/page.tsx
  └─ AdminSessionProvider (마운트)
       └─ api-core.registerAdminPinProvider(콜백) 등록
            └─ 이후 모든 API 요청 → X-Admin-Pin 헤더 자동 첨부
```

백엔드 PIN 우선순위: `X-Admin-Pin` → `body.pin` → `query.pin`

## 건드릴 때 조심할 점

- 세션을 서버 측 쿠키로 바꾸려면 `api-core.ts`의 `registerAdminPinProvider` 계약까지 함께 변경해야 합니다.
- `AdminSessionProvider`는 `frontend/app/mes/page.tsx` 최상단에서 마운트됩니다. 일반 직원 PIN 로그인(`MesLoginGate`)과는 별개입니다.

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — `registerAdminPinProvider` 콜백 위치
- [[ERP/frontend/app/mes/_components/login/📁_login]] — 일반 직원 PIN 로그인 (MesLoginGate)
