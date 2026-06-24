# BarcodeScannerModal.tsx

## 이 파일은 뭐예요?
카메라로 바코드/QR을 스캔하거나 직접 입력해서 값을 인식하는 전역 오버레이 모달입니다. 인식 성공 시 `onDetected` 콜백으로 값을 전달하고 닫힙니다.

## 언제 보나요?
- 입출고 화면 등에서 바코드 스캔 버튼을 눌렀을 때 전체화면 오버레이로 표시됨

## 중요한 내용
- **props**: `onDetected(value: string)` — 인식된 값 전달, `onClose` — 닫기
- **모드 분기**: `useBarcodeScanner` 훅이 반환하는 `mode` 값으로 분기
  - `"unsupported"` — 브라우저 BarcodeDetector API 미지원
  - `"insecure"` — HTTPS/localhost 아닌 환경 (카메라 권한 불가)
  - 정상 — `<video>` + 스캔 프레임 오버레이 + 애니메이션 스캔라인
- **수동 입력**: 카메라 인식 전 언제나 직접 입력란 + 적용 버튼 병용 가능
- `detected` 상태가 생기면 0.6초 딜레이 후 `onDetected` + `onClose` 호출
- 지원 포맷: QR, Code128, EAN-13, EAN-8, UPC-A, DataMatrix

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useBarcodeScanner.ts]] — 실제 카메라 스트림·BarcodeDetector 로직 전담
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 토큰 (색상 참조)
