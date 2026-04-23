---
type: code-note
project: ERP
layer: docs
source_path: docs/design/design-canvas.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
aliases:
  - 디자인 캔버스
---

# design-canvas.jsx

> [!summary] 역할
> ERP UI 리디자인의 **전체 화면 레이아웃**을 하나의 캔버스에 배치한 React 파일.
> 여러 화면을 한눈에 비교·검토하기 위한 디자인 리뷰 도구.

---

## 쉬운 말로 설명

**"포스터처럼 모든 화면을 한 페이지에 붙여놓은 파일"**. 대시보드·창고·이력·관리자·모바일 화면을 한 번에 펼쳐놓고 톤&매너가 일관된지 확인. 리뷰 미팅용이라 운영 배포는 X.

## FAQ

**Q. 실제 앱에서도 이 캔버스 열리나?**
아니다. 단독 프리뷰나 Figma 대체 용도로만 사용.

**Q. 화면을 추가하려면?**
`screens/` 폴더에 새 `.jsx` 시안을 추가하고 canvas 에 import 만 붙이면 된다.

---

## 관련 문서

- [[docs/design/ui.jsx.md]] — UI 컴포넌트
- [[docs/design/data.jsx.md]] — 가상 데이터
- [[docs/design/design]] — 디자인 폴더 전체

Up: [[docs/design/design]]
