# useIoPreview.ts

## 이 파일은 뭐ععو?
품목을 카트에 추가하기 전 백엔드의 `/io/preview` API를 호출해 BOM 전개 결과(IoBundle)를 미리 받아오는 훅입니다. 호출 중에는 `previewing: true`를 반환합니다.

## 언제 보나요?
- Step 3 피커에서 BOM 또는 낱개 버튼을 눌러 카트에 묶음이 추가될 때
- preview 응답을 기반으로 bundle 상태를 초기화하는 흐름을 추적할 때

## 중요한 내용
- `useIoPreview()` — `{ previewing, previewTarget }` 반환
- `previewTarget(options)` — `api.preview` 래퍼. 단일 target을 배열로 감싸 전송

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — `addItem` 핸들러 안에서 이 훅의 `previewTarget`을 호출하는 최상위 위저드
