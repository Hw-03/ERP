# 📁 __tests__

## 이 폴더는 뭐예요?
`frontend/app/mes/_components/common` 아래 공통 컴포넌트들의 단위 테스트를 모아두는 폴더. vitest + Testing Library 기반으로 렌더·이벤트·상태를 검증한다.

## 언제 여기를 보나요?
- 공통 UI 컴포넌트(`ConfirmModal` 등)의 동작을 수정하거나 버그를 추적할 때
- 새 공통 컴포넌트에 테스트를 추가할 위치를 찾을 때

## 주요 파일
- `ConfirmModal.test.tsx` — ConfirmModal의 open/busy prop·키보드 이벤트 7케이스 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/ui/ConfirmModal.tsx]] — 테스트 대상 컴포넌트 원본
- [[ERP/frontend/app/mes/_components/common/📁_common]] — 테스트가 커버하는 공통 컴포넌트 폴더
