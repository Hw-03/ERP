# useBarcodeScanner.ts

## 이 파일은 뭐예요?
`BarcodeScannerModal`에서 카메라를 열고 바코드/QR코드를 인식하는 라이프사이클 훅입니다. 브라우저 네이티브 `BarcodeDetector` API를 우선 사용하고, 미지원 환경에서는 ZXing 라이브러리로 자동 폴백합니다.

## 언제 보나요?
- 바코드 스캐너 모달 동작이 이상할 때 (카메라 안 열림, 스캔 미인식 등)
- HTTP 환경(비보안 컨텍스트)에서 카메라가 차단되는 이유를 확인할 때
- 지원 포맷(QR, Code128, EAN-13 등) 목록을 변경하고 싶을 때

## 중요한 내용
- `ScannerMode`: `"native" | "zxing" | "insecure" | "unsupported"` — 현재 스캐너 동작 경로
- `UseBarcodeScannerResult`: `videoRef`, `mode`, `error`, `detected`, `setDetected` 반환
- `useBarcodeScanner(onDetected, onClose)`: 인식 성공 600ms 뒤 `onDetected`와 `onClose` 자동 호출
- `isSecureContext` 체크: HTTP 접속 시 `"insecure"` 모드로 즉시 차단
- 포맷 호환성 검사: 네이티브 BarcodeDetector가 `qr_code`, `code_128`, `ean_13` 모두 지원 안 하면 ZXing으로 강등

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/📁__inventory_sections]] — BarcodeScannerModal이 위치하는 인벤토리 섹션
