---
type: file-explanation
source_path: "_attic/docs/research/MOBILE_BARCODE_ARCHITECTURE.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MOBILE_BARCODE_ARCHITECTURE.md — MOBILE_BARCODE_ARCHITECTURE.md 설명

## 이 파일은 무엇을 책임지나

`MOBILE_BARCODE_ARCHITECTURE.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `모바일 바코드 스캔 아키텍처 조사 보고서`
- `Executive summary`
- `Repository findings`
- `Web platform constraints`
- `Scanner option comparison`
- `Deployment paths for mobile camera access`
- `Recommended architecture`
- `Migration plan and testing checklist`
- `Next.js HTTPS 개발 서버`
- `ngrok`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 모바일 바코드 스캔 아키텍처 조사 보고서

## Executive summary

현재 `Hw-03/ERP`의 모바일 스캐너는 **공유 모달 하나가 네이티브 `BarcodeDetector`와 `getUserMedia()`에 직접 의존**하는 구조이고, **소프트웨어 디코더 fallback이 없으며**, **보안 컨텍스트(`window.isSecureContext`)를 사전에 확인하지 않습니다**....

모바일에서 `http://192.168.x.x:3000`로 접속하는 현재 개발 패턴은 카메라 스캔과 매우 상극입니다. `getUserMedia()`와 `BarcodeDetector`는 모두 **secure context 전용**이고, 브라우저가 예외적으로 신뢰하는 것은 `localhost`·`127.0.0.1` 같은...

iOS 쪽은 더 보수적으로 봐야 합니다. Apple은 iOS/iPadOS 17.4+ EU에서만 별도 entitlement로 **alternative browser engine**을 허용하고 있으므로, 일반적인 실무 환경에서는 Safari/Chrome/Edge on iOS가 대체로 같은 WebKit 제약을 공유합니다....

따라서 현 시점의 최종 권장안은 명확합니다. **운영·개발 접속을 HTTPS로 바꾸고**, 스캐너 엔진은 **`BarcodeDetector`를 “있으면 쓰는 fast-path”로만 두고**, 실제 신뢰 경로는 **`@zxing/browser` 동적 로딩 fallback + 수동 입력/붙여넣기/파일 스캔 fallbac...

## Repository findings

먼저 현재 저장소에서 “카메라/바코드 스캔 관련 활성 코드”를 확인하면, 스캔 엔진은 사실상 한 파일에 집중되어 있고, 나머지 화면은 그 모달을 호출만 하는 구조입니다. fileciteturn12file0L1-L1 fileciteturn13file0L1-L1 fileciteturn14file0L1...

| 파일 경로 | 역할 | 현재 동작과 문제점 |
|---|---|---|
| `frontend/app/legacy/_components/BarcodeScannerModal.tsx` | 공용 모바일 스캔 모달 | `supported`를 `!!window.BarcodeDetector`로만 판단하고, 성공 시 바로 `navigator.mediaDevices.getUserMedia()`를 호출합...
| `frontend/app/legacy/_components/mobile/io/warehouse/WarehouseWizardSteps.tsx` | 창고 입출고 모바일 품목 선택 단계 | 스캔 버튼으로 `BarcodeScannerModal`을 열고, 스캔된 값은 `barcode`, `erp_code`, `0 제거한 ...
| `frontend/app/legacy/_components/mobile/io/dept/DeptWizardSteps.tsx` | 부서 입출고 모바일 품목 선택 단계 | 위와 동일하게 공용 모달에 의존합니다. 품목 매칭도 거의 같은 방식이라, **창고/부서 화면이 동시에 같은 취약점을 공유**합니다. filecit...
| `frontend/package.json` | 프런트 의존성 정의 | 현재 의존성에는 `@zxing/browser`, `html5-qrcode`, `quagga`, `dynamsoft`가 없습니다. 즉 **네이티브 API 실패 시 사용할 소프트웨어 디코더 경로가 애초에 설치되어 있지 않습니다**. filecit...

이 저장소 관점에서 가장 중요한 해석은 두 가지입니다. 첫째, 스캔 문제는 화면 여러 개를 각각 고칠 일이 아니라 **`BarcodeScannerModal.tsx` 한 곳에서 엔진 추상화 계층을 만들면 대부분 해결**됩니다. 둘째, 현재 설계는 안드로이드 Chromium 계열의 “잘 되는 환경”을 전제로 한 구현이라...

## Web platform constraints

`getUserMedia()`는 카메라 접근의 출발점인데, MDN은 이 API를 **secure context 전용**이라고 명시합니다. 보안이 확보되지 않은 문서에서는 `navigator.mediaDevices`가 `undefined`가 될 수 있고, 카메라 권한 요청 자체가 막힐 수 있습니다. 같은 문서에서 `l...

`BarcodeDetector`도 마찬가지로 secure context 전용이며, MDN은 이 API를 **experimental**·**not Baseline**으로 분류합니다. 다시 말해 “브라우저에 있으면 빠르게 쓰기 좋은 API”이지, 단독으로 믿고 운영할 수준의 호환성 보증 수단은 아닙니다. 또한 정적 메서...

iOS에서는 브라우저 브랜드보다 엔진 제약이 더 중요합니다. Apple 문서상 iOS/iPadOS에서 alternative browser engines는 **EU, iOS 17.4+**, 그리고 별도 entitlement 조건에서만 허용됩니다. 즉 대부분의 기업·현장 배포 환경에서는 Chrome on iOS도 Saf...

PWA도 만능 해법이 아닙니다. web.dev는 iOS/iPadOS 홈스크린 웹앱이 브라우저 탭과 별도 `Web.app`로 동작하고, Safari 탭과 저장소를 공유하지 않는다고 설명합니다. 동시에 WebKit 버그 트래커에는 iOS 홈스크린 PWA에서 카메라가 얼어붙거나, `history.pushState()` 같...

반대로 Android Chrome은 웹 경로 중 가장 유리합니다. Chrome 개발 문서는 **Barcode detection이 Chrome 83에서 launch**되었다고 설명하고, `getUserM
...
```
