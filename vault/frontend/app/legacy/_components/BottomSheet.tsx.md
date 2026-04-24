---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/BottomSheet.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - mobile
  - ui
aliases:
  - 바텀시트 모달
---

# BottomSheet.tsx

> [!summary] 역할
> 화면 하단에서 슬라이드 업으로 나타나는 **모바일용 모달 컴포넌트**.
> 품목 상세, 편집 폼 등 다양한 컨텐츠를 담는 범용 컨테이너 역할을 한다.

> [!info] 주요 동작
> - `open` prop이 `true`일 때만 렌더링
> - 배경(오버레이) 클릭 시 `onClose` 콜백 호출
> - 열려 있을 때 `body` 스크롤 잠금 (`overflow: hidden`)
> - 제목(`title`) prop은 선택 사항

## Props

| Prop | 타입 | 설명 |
|------|------|------|
| `open` | boolean | 열림/닫힘 상태 |
| `onClose` | function | 닫기 콜백 |
| `title` | string? | 상단 제목 (선택) |
| `children` | ReactNode | 내부 컨텐츠 |

---

## 쉬운 말로 설명

**화면 하단에서 미끄러져 올라오는 범용 모달**. 모바일 UX 패턴(iOS/Android 앱의 액션 시트). 폭 430px 고정으로 디자인.

오버레이(검정 60% 불투명) 클릭 → `onClose`. 내부 클릭 → 전파 중단(모달 유지).

열릴 때:
- body 스크롤 잠금 (`overflow: hidden`)
- `sheetUp` 애니메이션(0.25초, cubic-bezier)

닫힐 때:
- `null` 반환 (DOM 에서 완전히 제거)
- body 스크롤 복원

`env(safe-area-inset-bottom)` 사용 → 아이폰 노치/홈버튼 영역 대응.

---

## FAQ

**Q. 닫기 애니메이션이 없음?**
현재는 열기만 애니메이션. 닫힐 땐 바로 언마운트. 부드러운 slide-down 원하면 exit 상태 + `setTimeout` 필요.

**Q. 오버레이 클릭 방지?**
`onClose` 를 빈 함수로 넘기고 내부에 명시적 닫기 버튼 배치.

**Q. 여러 모달 중첩?**
`z-[200]` 고정이라 같은 깊이면 겹침. 복수 바텀시트 필요하면 props 로 z-index 조정하도록 개선.

---

## 관련 문서

- [[frontend/app/legacy/_components/ItemDetailSheet.tsx.md]] — 품목 상세 바텀시트
- [[frontend/app/legacy/_components/AdminTab.tsx.md]] — 관리자 탭 (바텀시트 사용)
- [[frontend/app/legacy/_components/LegacyLayout.tsx.md]] — 모바일 레이아웃

Up: [[frontend/app/legacy/_components/_components]]
