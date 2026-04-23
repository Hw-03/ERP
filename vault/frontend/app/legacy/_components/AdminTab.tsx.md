---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/AdminTab.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - admin
  - mobile
aliases:
  - 관리자 탭 (모바일)
---

# AdminTab.tsx

> [!summary] 역할
> 모바일 화면에서 사용하는 **관리자 탭** 컴포넌트.
> 핀 인증 후 품목·직원·BOM·출하묶음·설정 5개 섹션을 탭 형태로 관리한다.

> [!info] 5개 섹션 구성
> | 섹션 ID | 라벨 | 내용 |
> |---------|------|------|
> | `items` | 상품 | 품목 목록/수정 |
> | `employees` | 직원 | 직원 목록/수정 |
> | `bom` | BOM | BOM 등록/수정 |
> | `packages` | 출하묶음 | 패키지 관리 |
> | `settings` | 설정 | 시스템 설정 |

> [!info] 동작 방식
> - 진입 시 `PinLock` 컴포넌트로 핀 인증 필요
> - 인증 후 탭 전환으로 섹션 이동
> - `BottomSheet` 를 활용해 편집 폼을 슬라이드 업 표시
> - `legacyUi.ts`의 색상/유틸 함수 사용

---

## 쉬운 말로 설명

**모바일 관리자 탭**. 데스크톱 `DesktopAdminView` 의 축약 모바일 버전. 핀 4자리 입력 → 5개 관리 섹션 탭 전환. 편집 시 하단에서 `BottomSheet` 슬라이드업.

전형적 흐름:
1. 관리 탭 진입 → `PinLock` 화면 (4자리 핀 입력)
2. 인증 성공 → 섹션 탭바 표시 (상품/직원/BOM/출하묶음/설정)
3. 예: "상품" 탭 → 품목 리스트 → 특정 row 탭 → 바텀시트로 수정 폼

## 섹션별 기능

### items (상품)
- 품목 목록 + 검색
- row 탭 → BottomSheet 로 이름/단가/분류 수정
- 신규 품목 추가 (ERP 코드 자동 생성)

### employees (직원)
- 이름 / 부서 / 상태(active/inactive)
- 부서 변경 시 `employeeColor()` 로 아바타 색상 재계산

### bom (BOM)
- 상위 품목 선택 → 하위 자재 + 수량 추가
- 재귀 허용 (Assembly 안에 Sub-Assembly)

### packages (출하묶음)
- 여러 품목을 하나의 "출하 묶음" 으로 그룹화
- 예: "DX3000 완성품 세트 = 본체1 + 리모컨1 + 매뉴얼1"

### settings (설정)
- 조직 정보, 알림 임계치 등

## FAQ

**Q. 핀 잊어버리면?**
백엔드 `settings` 테이블의 `admin_pin` 직접 재설정 필요. UI 에선 복구 버튼 없음.

**Q. 데스크톱 관리자와 같은 API?**
동일. 둘 다 `/items`, `/employees`, `/boms`, `/packages`, `/settings` 사용.

**Q. 모바일에서 엑셀 내보내기?**
현재 없음 — 데스크톱 전용. 모바일은 브라우저에서 파일 다운로드 UX 제약 때문.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] — 데스크탑 관리자 뷰
- [[frontend/app/legacy/_components/PinLock.tsx.md]] — 핀 인증 컴포넌트
- [[frontend/app/legacy/_components/BottomSheet.tsx.md]] — 바텀시트 모달
- [[backend/app/routers/employees.py.md]], [[backend/app/routers/bom.py.md]], [[backend/app/routers/settings.py.md]]

Up: [[frontend/app/legacy/_components/_components]]
