# IoSubmitModals.tsx

## 이 파일은 뭐예요?
입출고 제출 후 성공/실패 결과를 모달로 보여주는 컴포넌트입니다. 오류 메시지에 "박스 배치"가 포함된 경우(R5 차단) 창고 지도로 바로가기 버튼을 추가로 노출합니다.

## 언제 보나요?
- 입출고 위저드 Step 5 제출 완료 또는 실패 시
- 박스 배치 수량 부족(R5) 오류로 제출이 막혔을 때

## 중요한 내용
- `IoSubmitModals({ result, onClose, onGoToMap? })` — 단일 export
- `result: { kind: "success" | "error"; title; message } | null` — null이면 모달 닫힘
- R5 감지: `result.message.includes("박스 배치") && onGoToMap` 조건으로 "창고 지도에서 배치하기 →" 버튼 노출
- `export type { ResultState as IoSubmitResultState }` — 타입만 재 export

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — result 상태를 관리하고 이 모달을 마운트하는 최상위 위저드
- [[ERP/frontend/lib/ui/ConfirmModal.tsx]] — 내부에서 사용하는 기반 모달 컴포넌트
