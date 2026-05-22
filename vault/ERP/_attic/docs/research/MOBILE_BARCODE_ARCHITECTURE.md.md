---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/MOBILE_BARCODE_ARCHITECTURE.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# MOBILE_BARCODE_ARCHITECTURE.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/MOBILE_BARCODE_ARCHITECTURE.md]]

## 원본 첫 줄 (또는 메타)

```
# 모바일 바코드 스캔 아키텍처 조사 보고서

## Executive summary

현재 `Hw-03/ERP`의 모바일 스캐너는 **공유 모달 하나가 네이티브 `BarcodeDetector`와 `getUserMedia()`에 직접 의존**하는 구조이고, **소프트웨어 디코더 fallback이 없으며**, **보안 컨텍스트(`window.isSecureContext`)를 사전에 확인하지 않습니다**. 실제 호출부는 창고 입출고/부서 입출고 두 개의 모바일 위저드에서 이 모달을 그대로 재사용합니다. `frontend/package.json`에도 `@zxing/browser`, `html5-qrcode`, `quagga`, `dynamsoft` 같은 대체 스캐너 의존성이 없습니다. 즉, 지금 실패하면 바로 “스캔 불가”로 끝나는 구조입니다. fileciteturn12file0L1-L1 fileciteturn13file0L1-L1 fileciteturn14file0L1-L1 fileciteturn15file0L1-L1

모바일에서 `http://192.168.x.x:3000`로 접속하는 현재 개발 패턴은 카메라 스캔과 매우 상극입니다. `getUserMedia()`와 `BarcodeDetector`는 모두 **secure context 전용**이고, 브라우저가 예외적으로 신뢰하는 것은 `localhost`·`127.0.0.1` 같은 로컬 루프백뿐입니다. 휴대폰에서 같은 LAN IP로 여는 `http://192.168.x.x`는 이 예외에 포함되지 않으므로, “사파리도 안 되고 크롬도 안 되는” 현상은 개별 브라우저의 문제가 아니라 **배포 경로 자체가 카메라 API 요구조건을 만족하지 못하는 구조적 문제**로 보는 것이 맞습니다. citeturn22search1turn1search2turn22search3turn22search4

iOS 쪽은 더 보수적으로 봐야 합니다. Apple은 iOS/iPadOS 17.4+ EU에서만 별도 entitlement로 **alternative browser engine**을 허용하고 있으므로, 일반적인 실무 환경에서는 Safari/Chrome/Edge on iOS가 대체로 같은 WebKit 제약을 공유합니다. 그래서 iPhone에서 “사파리 대신 크롬으로 바꿔보자”는 해결책이 되지 않는 경우가 많습니다. 게다가 iOS 홈스크린 PWA는 브라우저 탭과 다른 `Web.app` 프로세스/저장소로 동작하고, WebKit에는 홈스크린 PWA나 SPA 라우팅 중 카메라가 얼거나 끊기는 회귀 이슈가 실제로 보고되어 있습니다. citeturn3search1turn7search0turn18search0turn2search5turn2search8

따라서 현 시점의 최종 권장안은 명확합니다. **운영·개발 접속을 HTTPS로 바꾸고**, 스캐너 엔진은 **`BarcodeDetector`를 “있으면 쓰는 fast-path”로만 두고**, 실제 신뢰 경로는 **`@zxing/browser` 동적 로딩 fallback + 수동 입력/붙여넣기/파일 스캔 fallback**으로 재설계해야 합니다. 오프라인·현장 안정성·사내 배포 요구가 커지면 그때 **Capacitor/React Native 네이티브 브리지**를 별도 트랙으로 검토하는 것이 비용 대비 효율이 가장 좋습니다. citeturn19search0turn22search5turn9search0turn9search1turn24search0turn15search0turn16search0

## Repository findings

먼저 현재 저장소에서 “카메라/바코드 스캔 관련 활성 코드”를 확인하면, 스캔 엔진은 사실상 한 파일에 집중되어 있고, 나머지 화면은 그 모달을 호출만 하는 구조입니다. fileciteturn12file0L1-L1 fileciteturn13file0L1-L1 fileciteturn14file0L1-L1

| 파일 경로 | 역할 | 현재 동작과 문제점 |
|---|---|---|
| `frontend/app/legacy/_components/BarcodeScannerModal.tsx` | 공용 모바일 스캔 모달 | `supported`를 `!!window.BarcodeDetector`로만 판단하고, 성공 시 바로 `navigator.mediaDevices.getUserMedia()`를 호출합니다. 즉 **네이티브 API 의존 구조**입니다. `window.isSecureContext`, `navigator.mediaDevices` 존재 여부, `BarcodeDetector.getSupportedFormats()` 확인이 없고, unsupported UI는 “Chrome 또는 Edge 최신 버전”을 안내해 **iOS Chrome이 WebKit 제약을 공유한다는 현실과도 어긋납니다**. 장점은 언마운트 시 `stream?.getTracks().forEach(stop)` cleanup은 이미 들어 있다는 점입니다. fileciteturn12file0L1-L1 |
| `frontend/app/legacy/_components/mobile/io/warehouse/WarehouseWizardSteps.tsx` | 창고 입출고 모바일 품목 선택 단계 | 스캔 버튼으로 `BarcodeScannerModal`을 열고, 스캔된 값은 `barcode`, `erp_code`, `0 제거한 erp_code`와 매칭합니다. 즉 **업무 로직은 괜찮지만 스캔 엔진 실패 시 전체 UX가 막히는 구조**입니다. fileciteturn13file0L1-L1 |
| `frontend/app/legacy/_components/mobile/io/dept/DeptWizardSteps.tsx` | 부서 입출고 모바일 품목 선택 단계 | 위와 동일하게 공용 모달에 의존합니다. 품목 매칭도 거의 같은 방식이라, **창고/부서 화면이 동시에 같은 취약점을 공유**합니다. fileciteturn14file0L1-L1 |
| `frontend/package.json` | 프런트 의존성 정의 | 현재 의존성에는 `@zxing/browser`, `html5-qrcode`, `quagga`, `dynamsoft`가 없습니다. 즉 **네이티브 API 실패 시 사용할 소프트웨어 디코더 경로가 애초에 설치되어 있지 않습니다**. fileciteturn15file0L1-L1 |

이 저장소 관점에서 가장 중요한 해석은 두 가지입니다. 첫째, 스캔 문제는 화면 여러 개를 각각 고칠 일이 아니라 **`BarcodeScannerModal.tsx` 한 곳에서 엔진 추상화 계층을 만들면 대부분 해결**됩니다. 둘째, 현재 설계는 안드로이드 Chromium 계열의 “잘 되는 환경”을 전제로 한 구현이라서, iOS/WebKit/비보안 접속 같은 **현장 편차를 흡수하는 레이어가 비어 있습니다**. fileciteturn12file0L1-L1 fileciteturn13file0L1-L1 fileciteturn14file0L1-L1

```
