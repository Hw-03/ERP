# 📁 warehouse

## 이 폴더는 뭐예요?
모바일 입출고 화면을 구성하는 컴포넌트 모음입니다. 데스크톱 `_warehouse_v2/`와 데이터·권한 로직은 공유하되, 레이아웃은 모바일 전용으로 별도 구현되어 있습니다.

## 언제 여기를 보나요?
- 모바일 입출고 위저드(작업 유형 선택 → 품목 담기 → 제출) 동작이 이상할 때
- 단품 입출고 인라인 폼 UI를 수정해야 할 때
- 이탈 방지 시트(임시저장 확인)를 수정해야 할 때

## 주요 파일
- `MobileIoComposeWizard.tsx` — 모바일 입출고 전체 위저드 컨테이너 (메인 진입점)
- `MobileWorkTypeStep.tsx` — Step 1(작업 유형) + Step 2(세부 작업·부서) UI
- `MobileSingleAdjustForm.tsx` — 단품 입출고 전용 인라인 빠른 폼
- `MobileDirtyLeaveSheet.tsx` — 작성 중 화면 이탈 시 임시저장 확인 바텀시트

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/📁__warehouse_v2]] — 데스크톱 입출고 컴포넌트 (데이터·권한 로직 원본)
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 모바일 네비게이션 셸 (동결)
