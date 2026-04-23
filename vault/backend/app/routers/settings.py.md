---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/settings.py
status: active
tags:
  - erp
  - backend
  - router
  - settings
  - admin
aliases:
  - 설정 라우터
  - 관리자 API
---

# settings.py

> [!summary] 역할
> 관리자 핀(PIN) 검증, 변경, DB 초기화 등 시스템 설정을 담당하는 API.

> [!info] 주요 책임
> - `POST /api/settings/verify-pin` — 관리자 핀 검증
> - `PUT /api/settings/admin-pin` — 관리자 핀 변경
> - `POST /api/settings/reset` — DB 초기화 (핀 인증 필요)

> [!warning] 주의
> - DB 초기화는 **되돌릴 수 없음**. 핀 검증 후에만 실행 가능.
> - 관리자 탭 진입 시 핀락(PinLock) 화면이 먼저 표시됨

---

## 쉬운 말로 설명

이 라우터는 **"관리자 전용 설정"** 엔드포인트 묶음. 주로 **PIN 관리**와 **DB 리셋**.

PIN은 `system_settings` 테이블에 평문 저장 (`admin_pin` 키). 초기값 `"0000"`. 4~32자 문자열.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/settings/verify-pin` | POST | PIN 검증 |
| `/api/settings/admin-pin` | PUT | PIN 변경 (현재 PIN 확인 필요) |
| `/api/settings/reset` | POST | DB 시드 재적재 (PIN 필요, 파괴적) |

### 요청 예시

**PIN 검증**:
```json
POST /api/settings/verify-pin
{ "pin": "0000" }
```
틀리면 403.

**PIN 변경**:
```json
PUT /api/settings/admin-pin
{ "current_pin": "0000", "new_pin": "1234" }
```
현재 PIN 틀리면 403. 같은 값이면 400.

**DB 리셋**:
```json
POST /api/settings/reset
{ "pin": "0000" }
```
→ `seed.py` 재로드 + `run_seed()` 호출. 실제 데이터가 모두 초기 시드로 교체됨.

---

## FAQ

**Q. PIN이 평문 저장이어도 되나?**
프로토타입 수준. 실운영 전환 시 해시화 필요 (`bcrypt` 등). `system_settings.setting_value`는 Text 컬럼.

**Q. PIN 잊어버리면?**
DB에서 직접 수정: `UPDATE system_settings SET setting_value='0000' WHERE setting_key='admin_pin';`

**Q. `/reset` 정확히 뭐가 일어나나?**
`backend/seed.py`의 `run_seed()` 실행. 기존 `items`/`inventory`/`transactions` 등 싹 지우고 샘플 데이터로 대체.

**Q. 운영 서버에서 `/reset` 호출하면?**
**실제 데이터 증발**. 반드시 백업 후. PIN도 보호막이라 공유 주의.

**Q. PIN은 세션 유지되나?**
NO. 매번 `verify-pin`. 프론트가 sessionStorage에 캐싱해 UX 개선.

---

## 관련 문서

- [[backend/app/models.py.md]] — `SystemSetting`
- [[backend/seed.py.md]] — `run_seed()` 내용
- [[frontend/app/legacy/_components/PinLock.tsx.md]]
- [[frontend/app/admin/admin]]

Up: [[backend/app/routers/routers]]
