# constants.ts

## 이 파일은 뭐예요?
작업자 식별 PIN의 자릿수(4자리)를 시스템 전역 상수로 선언합니다. 현재 `PIN_LENGTH = 4` 단 한 줄만 export합니다.

## 언제 보나요?
- PIN 입력 UI에서 자릿수 제한을 걸 때
- PIN 유효성 검사 로직에서 길이 기준을 참조할 때

## 중요한 내용
- `PIN_LENGTH = 4` — 전역 고정값, 이 값만 보고 PIN 길이를 판단하면 됩니다

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/auth/admin-session.tsx]] — PIN을 실제로 관리하는 세션 Provider
