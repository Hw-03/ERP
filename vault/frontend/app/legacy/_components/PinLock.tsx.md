---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/PinLock.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - admin
  - security
aliases:
  - 핀락
  - 관리자 인증
---

# PinLock.tsx

> [!summary] 역할
> 관리자 탭 진입 시 표시되는 PIN 입력 화면. 올바른 핀을 입력해야 관리자 기능에 접근 가능하다.

> [!info] 주요 책임
> - 숫자 키패드 UI 제공
> - 핀 입력 상태 관리
> - `/api/settings/verify-pin` API 호출로 서버에서 검증
> - 검증 성공 시 관리자 화면으로 진입

> [!warning] 주의
> - 핀은 클라이언트에서 검증하지 않고, 반드시 서버에서 검증함
> - 기본 핀은 `backend/seed.py` 또는 설정에서 확인

---

## 쉬운 말로 설명

**4자리 숫자키패드 PIN 입력 화면**. 4자리 채우면 자동으로 `/api/settings/verify-pin` 호출 → 성공 시 `onUnlocked()` 콜백.

점 4개(`dots`)로 입력 상태 시각화: 아무것도 없음 → 보라색 점 → 파란색(확인 중) → 빨간색 점(틀림).

---

## Props

```typescript
{ onUnlocked: () => void }
```

## 주요 상호작용

```
사용자가 숫자 키 누름 → pin = pin + digit
pin.length === 4 → verify(pin) 자동 호출
  ↓
api.verifyAdminPin(pin)
  성공 → onUnlocked() 호출 (부모가 unlocked 상태 true)
  실패 → error=true, pin="" (다시 입력 대기)
```

`삭제` 버튼 = 마지막 자리 제거.

---

## 키패드 레이아웃 (`KEYS` 상수)

```
1  2  3
4  5  6
7  8  9
   0  삭제
```

(빈 문자열 slot 으로 2열에만 0 배치)

---

## FAQ

**Q. PIN 기본값은?**
`0000`. `main.py` 의 `ensure_reference_data()` 에서 `SystemSetting.admin_pin` 초기값.

**Q. 4자리 고정인가? 늘리려면?**
현재 `KEYS.length === 12` 이고 `pin.length >= 4` 체크 + `dots length=4`. 6자리 원하면 세 곳 모두 수정.

**Q. 서버가 내려가면?**
`api.verifyAdminPin` throws → `setError(true)`. 실제 네트워크 오류 메시지 구분 없이 "PIN이 올바르지 않습니다" 로 표시(개선 여지).

**Q. 입력 중 F5?**
PIN 초기화. 브라우저 메모리만이라 세션스토리지 캐시는 별도 구현 필요.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] — 부모
- [[backend/app/routers/settings.py.md]] — `/verify-pin` API
- [[backend/app/models.py.md]] — `SystemSetting`

Up: [[frontend/app/legacy/_components/_components]]
