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
# Windows: https://ngrok.com/download 에서 다운로드

# 터미널 1 - LAN 접속 허용으로 dev 서버 시작
cd frontend
npm run dev:lan

# 터미널 2 - ngrok 터널 시작
ngrok http 3000
```

ngrok이 출력하는 `https://xxxx.ngrok-free.app` URL을 모바일에서 열면 된다.

> **주의**: 무료 계정은 세션마다 URL이 바뀐다. 테스트할 때마다 URL을 확인한다.

---

### 2순위: Cloudflare Tunnel

```bash
# 설치: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# 터미널 1
cd frontend
npm run dev:lan

# 터미널 2
cloudflared tunnel --url http://localhost:3000
```

출력된 `https://xxxx.trycloudflare.com` URL을 사용한다.

---

### 3순위: Next.js experimental HTTPS (localhost만)

PC에서 localhost로 테스트할 때만 유효. 모바일 실기기 테스트에는 사용 불가.

```bash
cd frontend
next dev --experimental-https
```

---

## 실기기 테스트 체크리스트

### iPhone Safari
- [ ] ngrok HTTPS URL로 접속
- [ ] `window.isSecureContext === true` (브라우저 콘솔 확인)
- [ ] 카메라 권한 요청 팝업 표시
- [ ] 권한 허용 시 ZXing 스캔 시작
- [ ] QR 코드 인식
- [ ] Code128 바코드 인식
- [ ] 모달 닫기 후 카메라 꺼짐 (스트림 정리)
- [ ] 여러 번 열고 닫아도 카메라가 꼬이지 않음

### iPhone Chrome
- [ ] 위 iPhone Safari 항목과 동일 (동일 WebKit 엔진)

### Android Chrome
- [ ] ngrok HTTPS URL로 접속
- [ ] `BarcodeDetector` Native 경로로 동작 (콘솔에서 mode 확인 가능)
- [ ] QR 코드 인식
- [ ] EAN-13 바코드 인식
- [ ] 모달 닫기 후 카메라 꺼짐

### 비보안 접속 확인
- [ ] `http://192.168.x.x:3000` 접속 시 "카메라 스캔은 HTTPS 또는 localhost 환경에서만 사용할 수 있습니다..." 안내 메시지 표시
- [ ] 안내 메시지 표시 상태에서도 수동 입력란이 보임

---

## 카메라 권한 거부 시 처리

카메라 권한을 거부하면 `getUserMedia`가 `NotAllowedError`를 던지고,
모달은 에러 메시지를 표시한다:

> "카메라 스캔을 시작하지 못했습니다. 카메라 권한을 허용했는지 확인해 주세요."

이 상태에서도 **수동 입력란은 항상 표시**되므로 바코드 번호를 직접 입력할 수 있다.

권한을 다시 허용하려면:
- iPhone Safari: 설정 > Safari > 카메라 > 허용
- Android Chrome: 사이트 설정 > 카메라 > 허용

---

## 수동 입력 Fallback 사용법

카메라 스캔이 불가능한 모든 상황(비보안 접속, 권한 거부, 카메라 없음)에서
모달 하단의 입력란에 바코드 번호를 직접 입력 후 **적용** 버튼을 누르거나 Enter를 누른다.

- 붙여넣기 가능 (`Ctrl+V` / `Cmd+V`)
- 스캔과 동일한 `onDetected` 콜백이 호출된다
- 성공 오버레이("인식 완료") 표시 후 모달 자동 닫힘

---

## 참고 명령

```bash
# LAN 접속 허용 dev 서버 (ngrok과 함께 사용)
cd frontend
npm run dev:lan

# 일반 dev 서버 (localhost 전용)
npm run dev
```
