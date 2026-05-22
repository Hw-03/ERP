---
type: file-explanation
source_path: "frontend/scripts/dev.js"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# dev.js — dev.js 설명

## 이 파일은 무엇을 책임지나

`dev.js`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/scripts/dev.js` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/scripts/📁_scripts]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```js
// Custom dev server wrapper for Next.js
// - Prints a tidy banner with the real LAN IP
// - Suppresses Next's default "▲ Next.js / Local / Network / Environments" banner
// - Forwards stdout/stderr otherwise unchanged

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

function detectLanIp() {
  const skip = /vEthernet|WSL|VirtualBox|VMware|Loopback|Hyper-V|Bluetooth|Hamachi|Radmin/i;
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const iface of list || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (iface.address.startsWith("169.254.")) continue; // APIPA
      if (iface.address.startsWith("25.")) continue; // Hamachi
      candidates.push(iface.address);
    }
  }
  const isPrivate = (ip) =>
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
  return candidates.find(isPrivate) || candidates[0] || null;
}

const port = process.env.PORT || "3000";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const lanIp = detectLanIp();

function banner() {
  const out = process.stdout;
  const url = lanIp ? `http://${lanIp}:${port}` : `http://localhost:${port}`;
  out.write("\n");
  out.write(`  ${C.magenta}${C.bold}DEXCOWIN MES${C.reset}  ${C.gray}dev server${C.reset}\n`);
  out.write(`  ${C.gray}${"─".repeat(44)}${C.reset}\n`);
  out.write(`  ${C.dim}Network ${C.reset}  ${C.green}${url}${C.reset}\n`);
  out.write(`  ${C.gray}${"─".repeat(44)}${C.reset}\n\n`);
}

const SUPPRESS_PATTERNS = [
  /^\s*▲\s*Next\.js\s/,
  /^\s*-\s*Local:\s/,
```
