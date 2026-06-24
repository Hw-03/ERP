# BomSearchInput.tsx

## 이 파일은 뭐예요?
BOM 워크벤치 내 검색 입력 필드. 돋보기 아이콘과 "품목명 / 코드 검색" placeholder를 가진 단순 text input으로, BomParentList와 BomChildAddBox 양쪽에서 재사용된다.

## 언제 보나요?
- 검색 필드의 스타일·placeholder를 수정할 때
- 배경색(bg prop)을 컨테이너에 맞게 조정할 때

## 중요한 내용
- Props: `value`, `onChange`, `placeholder?` (기본: "품목명 / 코드 검색"), `bg?` (기본: `LEGACY_COLORS.s2`)
- controlled input — 상태는 사용처(BomParentList, BomChildAddBox)가 소유

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomParentList.tsx]] — 사용처 1
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx]] — 사용처 2
