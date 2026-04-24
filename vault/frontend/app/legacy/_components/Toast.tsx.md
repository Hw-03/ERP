---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/Toast.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - ui
  - notification
aliases:
  - 토스트 알림
---

# Toast.tsx

> [!summary] 역할
> 작업 성공/실패/정보를 화면 하단에 잠깐 표시하는 **토스트 알림 컴포넌트**.
> 2.8초 후 자동으로 사라진다.

> [!info] 알림 유형
> | 타입 | 색상 | 사용 예 |
> |------|------|---------|
> | `success` | 초록 | 저장 완료, 입출고 성공 |
> | `error` | 빨강 | API 오류, 유효성 실패 |
> | `info` | 파랑 | 안내 메시지 |

> [!info] 사용 방식
> ```typescript
> // 부모 컴포넌트에서 ToastState 관리
> const [toast, setToast] = useState<ToastState | null>(null);
> setToast({ message: "저장 완료", type: "success" });
> ```
> `toast`가 `null`이면 렌더링 안 됨.

---

## 쉬운 말로 설명

**화면 상단에 떴다가 2.8초 후 사라지는 메시지 박스**. 좌측 테두리 3px 로 타입(성공/오류/정보) 구분.

실제로는 `위에서 54px 아래` (safe-area 고려) 에 중앙 배치. `pointer-events: none` 이라 클릭 통과.

---

## FAQ

**Q. 여러 토스트가 한 번에?**
현재는 1개만 지원. 새 토스트 뜨면 이전 timer 리셋 후 덮어씀. 스택 원하면 배열 상태 + 개별 타이머 필요.

**Q. 표시 시간 변경?**
`2800` 상수 수정 (ms 단위).

**Q. 사용자가 직접 닫기?**
X 버튼 없음. 필요 시 `onClose` 수동 호출 가능한 버튼 추가.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] — 토스트 상태 관리 주체
- [[frontend/app/legacy/_components/legacyUi.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
