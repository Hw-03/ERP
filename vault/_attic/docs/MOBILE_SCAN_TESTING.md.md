---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/MOBILE_SCAN_TESTING.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# MOBILE_SCAN_TESTING.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/MOBILE_SCAN_TESTING.md]]

## 원본 첫 줄 (또는 메타)

```
# 모바일 바코드/QR 스캔 테스트 가이드

## 핵심 원칙

**모바일 카메라 테스트는 `http://192.168.x.x` 주소로 하지 않는다.**
반드시 `https://` 로 시작하는 URL 또는 `localhost` 에서 테스트한다.

---

## 왜 `http://192.168.x.x`에서 카메라가 안 되는가

브라우저의 카메라 API(`getUserMedia`, `BarcodeDetector`)는 **Secure Context** 에서만 동작한다.

| 접속 방법 | isSecureContext | 카메라 API |
|-----------|----------------|-----------|
| `https://` | true | 사용 가능 |
| `http://localhost` | true | 사용 가능 |
| `http://127.0.0.1` | true | 사용 가능 |
| `http://192.168.x.x:3000` | **false** | **차단됨** |
| `http://` (일반 도메인) | false | 차단됨 |

`BarcodeScannerModal`은 `window.isSecureContext`를 먼저 확인하고,
false이면 카메라 시도 없이 즉시 안내 메시지를 표시한다.

---
```
