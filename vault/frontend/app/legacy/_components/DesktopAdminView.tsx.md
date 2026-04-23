---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopAdminView.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - admin
aliases:
  - 관리자 화면
  - 어드민 뷰
---

# DesktopAdminView.tsx

> [!summary] 역할
> 관리자 탭의 메인 화면. 품목 마스터 관리, 직원 관리, BOM 관리, 출하 패키지, 시스템 설정을 제공한다.

> [!info] 주요 책임
> - 서브 탭 전환: 품목 / 직원 / BOM / 패키지 / 설정
> - 품목 추가·수정, ERP 코드 표시
> - 직원 추가·수정·삭제
> - BOM 등록·수정·삭제
> - 출하 패키지 구성
> - 시스템 설정 (관리자 핀 변경, DB 리셋)

> [!warning] 주의
> - 이 화면은 `PinLock`을 통과해야 진입 가능
> - DB 리셋은 이 화면에서만 가능하며 되돌릴 수 없음

---

## 쉬운 말로 설명

**관리자 탭**. PinLock 통과 후 6개 서브섹션으로 들어감:

| Section | 용도 |
|---------|------|
| `items` | 품목 마스터 (추가/수정/ERP코드 확인) |
| `employees` | 직원 관리 (부서/레벨/활성상태) |
| `bom` | 부모 품목 + 자식 구성품 설정 |
| `packages` | 출하 패키지 템플릿 구성 |
| `export` | 엑셀 내보내기 버튼 |
| `settings` | PIN 변경 + DB 초기화 |

---

## 주요 상태 (매우 많음)

- `unlocked` (bool) — PIN 통과 여부. false면 `PinLock` 렌더.
- `section` — 현재 서브 섹션.
- `items`/`employees`/`packages` — 목록 캐시.
- `addMode` / `empAddMode` — 추가 폼 토글.
- `addForm` — 품목 추가 입력값 (item_name, category, model_slots, option_code, ...).
- `pinForm` / `resetPin` — 설정 섹션 입력값.

---

## 품목 추가 폼 필드

```typescript
{
  item_name: string;
  category: Category;        // RM/TA/HA/VA/BA/FG/UK (축약된 선택지)
  spec: string;
  unit: string;              // "EA" 기본, 다른 값: SET/kg/m/mm/L/box
  model_slots: number[];     // 복수 선택 가능 (공유 자재)
  option_code: string;       // BG/WM/SV 등
  legacy_item_type: string;
  supplier: string;
  min_stock: string;         // 안전재고 기준
  initial_quantity: string;  // 초기 재고
}
```

폼 제출 → `api.createItem()` → ERP 코드 자동 부여 후 응답.

---

## BOM 관리 특징

- 부모 품목 선택 → 자식 품목 추가 형식.
- 자식 수량/단위 수정 가능 (`editingBomId` 로 인라인 편집).
- 자식이 또 BOM 가지면 트리가 생김 → 폭파 시 재귀.

---

## 설정 섹션 보안

- PIN 변경: `current_pin` + `new_pin` + 확인. 현재 PIN 틀리면 403.
- DB 초기화: PIN 재입력 → `/api/settings/reset`. **되돌릴 수 없음** 경고.

---

## FAQ

**Q. PIN 초기값은?**
`0000`. `/api/settings/admin-pin` 으로 변경 가능.

**Q. 품목 삭제는 어디?**
현재 UI에선 지원 안 함(안전). 삭제가 필요하면 DB 직접 수정 또는 `is_active=false` 토글 추가 필요.

**Q. BOM 계층이 깊어지면?**
최대 10단(`MAX_DEPTH`). 실사용은 3~5단 수준. 순환 참조는 visited로 차단.

**Q. 엑셀 내보내기는 뭘 주나?**
`GET /api/items/export.xlsx` 로 전체 품목. 필터(카테고리/검색) 적용 가능.

**Q. 관리자 화면 탈출은?**
다른 탭 클릭 → 재진입 시 PIN 재요구. sessionStorage 에 캐시하는 구현은 있음.

---

## 관련 문서

- [[frontend/app/legacy/_components/PinLock.tsx.md]]
- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]]
- [[backend/app/routers/settings.py.md]]
- [[backend/app/routers/employees.py.md]]
- [[backend/app/routers/bom.py.md]]
- [[backend/app/routers/items.py.md]]
- [[backend/app/routers/ship_packages.py.md]]
- 품목 등록 시나리오

Up: [[frontend/app/legacy/_components/_components]]
