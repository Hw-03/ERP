---
type: index
project: ERP
layer: frontend
source_path: frontend/app/admin/
status: active
tags:
  - erp
  - frontend
  - route
  - admin
aliases:
  - 관리자 페이지 라우트
---

# frontend/app/admin

> [!summary] 역할
> `/admin` 경로 라우트. 관리자 기능(품목·직원·BOM·설정) 화면 진입점.

> [!warning] 주의
> - 실제 관리자 UI는 `legacy/_components/DesktopAdminView.tsx`에 구현됨
> - 진입 시 `PinLock` 화면이 먼저 표시됨

## 관련 문서

- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]]
- [[frontend/app/legacy/_components/PinLock.tsx.md]]

---

## 쉬운 말로 설명

`/admin` URL로 접속 시 관리자 모드 진입. 민감 기능(품목 삭제, 직원 관리, BOM 편집, DB 리셋 등)이 모여있어 **PIN 입력이 먼저 요구**된다.

### 흐름
```
/admin 접속 → PinLock 화면
    ↓ (올바른 PIN 입력)
DesktopAdminView
    ├─ 품목 관리 탭
    ├─ 직원 관리 탭
    ├─ BOM 관리 탭
    ├─ 코드 마스터 탭
    └─ 설정 탭 (PIN 변경, DB 리셋)
```

---

## FAQ

**Q. 기본 PIN은?**
`backend/app/routers/settings.py` 또는 초기 시드에서 확인. 운영 시 반드시 변경.

**Q. PIN 분실 시?**
DB 직접 접속해서 `settings` 테이블의 해시값을 재설정하거나, 서버 재시작하며 seed 재실행.

---

## 관련 문서

- [[backend/app/routers/settings.py.md]] — PIN 관리 API
- [[backend/app/routers/employees.py.md]]
- [[backend/app/routers/codes.py.md]]

Up: [[frontend/app/app]]
