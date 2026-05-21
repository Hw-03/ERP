---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/scripts/dev.js
status: active
updated: 2026-04-27
source_sha: feaea164f3fd
tags:
  - erp
  - frontend
  - source-file
  - js
---

# dev.js

> [!summary] 역할
> 원본 프로젝트의 `dev.js` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/scripts/dev.js`
- Layer: `frontend`
- Kind: `source-file`
- Size: `3131` bytes

## 연결

- Parent hub: [[frontend/scripts/scripts|frontend/scripts]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````js
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
# ... (이하 68줄 생략. 원본 참조)

````
