---
type: file-explanation
source_path: "_attic/docs/MOBILE_SCAN_TESTING.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MOBILE_SCAN_TESTING.md — MOBILE_SCAN_TESTING.md 설명

## 이 파일은 무엇을 책임지나

`MOBILE_SCAN_TESTING.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `모바일 바코드/QR 스캔 테스트 가이드`
- `핵심 원칙`
- `왜 `http://192.168.x.x`에서 카메라가 안 되는가`
- `iPhone Safari / iPhone Chrome의 공통 제약`
- `HTTPS 개발 서버 실행 방법`
- `1순위: ngrok (권장)`
- `설치 (https://ngrok.com/download)`
- `macOS: brew install ngrok`
- `Windows: https://ngrok.com/download 에서 다운로드`
- `터미널 1 - LAN 접속 허용으로 dev 서버 시작`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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

## iPhone Safari / iPhone Chrome의 공통 제약

iPhone은 Safari, Chrome, Edge 모두 **WebKit 엔진**을 강제 사용한다 (Apple 정책).

- `BarcodeDetector` API: iOS 17+ Safari만 제한적 지원, Chrome/Edge는 미지원
- 따라서 iPhone에서는 **ZXing(JS 디코더) 경로**로 동작한다
- "iPhone에서 Chrome으로 열면 된다"는 해결책이 아님 — 동일 엔진

스캔 엔진 선택 로직:
```
접속
 ├─ isSecureContext = false → HTTPS 안내 메시지 + 수동입력
 ├─ getUserMedia 없음 → 카메라 API 불가 메시지 + 수동입력
 ├─ BarcodeDetector 있고 포맷 지원 OK → Native 스캔 (Android Chrome 등)
 ├─ BarcodeDetector 있지만 포맷 미지원 → ZXing 스캔
 └─ BarcodeDetector 없음 → ZXing 스캔 (iPhone 전체)
```

---

## HTTPS 개발 서버 실행 방법

### 1순위: ngrok (권장)

ngrok은 로컬 포트를 HTTPS URL로 터널링한다.

```bash
# 설치 (https://ngrok.com/download)
# macOS: brew install ngrok
```
