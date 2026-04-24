---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/BarcodeScannerModal.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - barcode
aliases:
  - 바코드 스캐너
---

# BarcodeScannerModal.tsx

> [!summary] 역할
> 바코드를 스캔해 품목을 검색하는 모달 컴포넌트. 카메라 또는 USB 바코드 리더기를 지원한다.

> [!info] 주요 책임
> - 바코드 입력(스캔 또는 직접 입력) 처리
> - 바코드로 품목 검색 후 선택 상태로 전달

---

## 쉬운 말로 설명

**웹 카메라로 바코드를 읽는 모달**. Chrome/Edge 83+ 또는 Safari 17+ 의 `BarcodeDetector` API 사용. 지원 안 되는 브라우저에선 에러 메시지 표시.

바코드 감지 → `onDetected(rawValue)` 콜백 → 모달 닫힘. 부모 컴포넌트가 해당 값으로 품목 검색.

## Props

```typescript
{
  onDetected: (value: string) => void;
  onClose: () => void;
}
```

---

## 브라우저 요구사항

- `BarcodeDetector` Web API 필요 (Chrome 83+, Edge 83+, Safari 17+)
- `navigator.mediaDevices.getUserMedia` — HTTPS 또는 localhost 만
- 카메라 권한 승인 필요 (첫 사용 시 팝업)

지원 포맷: code_128, code_39, code_93, ean_13, ean_8, qr_code 등 브라우저가 지원하는 대부분.

---

## 내부 동작

```
1. window.BarcodeDetector 존재 체크 → 없으면 에러
2. navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }})
   → 후면 카메라 우선 (모바일)
3. <video> 에 스트림 연결 + 재생
4. requestAnimationFrame 루프:
   detector.detect(video) → 감지되면 onDetected() 호출 + 중단
5. 모달 닫힘 시 stream.getTracks().forEach(t => t.stop())
```

---

## FAQ

**Q. 데스크톱에서도 되나?**
웹캠 있으면 동작. `facingMode: "environment"` 는 힌트일 뿐, 데스크톱은 유일한 카메라 사용.

**Q. USB 바코드 리더기는?**
이 모달은 카메라 전용. USB 스캐너는 키보드처럼 인식되므로 일반 input 박스에 포커스 → 스캔하면 자동 입력 + Enter. 별도 UI 필요.

**Q. 느린가?**
requestAnimationFrame 루프 + BarcodeDetector 는 꽤 빠름(~60fps 시도). 조명 나쁘면 인식률 떨어짐.

**Q. 배터리?**
카메라 + 연속 프레임 처리라 배터리 소모 많음. 모달 닫히면 즉시 stream 종료.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 바코드로 품목 검색
- [[backend/app/routers/items.py.md]] — `barcode` 필터

Up: [[frontend/app/legacy/_components/_components]]
