---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/design/ERP Login/variants/v3-boot.jsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# v3-boot.jsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/design/ERP Login/variants/v3-boot.jsx]]

## 원본 첫 줄 (또는 메타)

```
/* global React */

/* ============================================================
   OPTION 3 — CINEMATIC INTRO (v2)
   3s boot sequence. Letters fly in from random directions,
   collide/snap into the wordmark position with a flash,
   then the form rises.
   Skip button always visible.
   Letter images are used at their ORIGINAL pixel widths with
   zero gap — which is how the source logo is composed — so the
   reconstructed wordmark matches the real Dexcowin logo 1:1.
   ============================================================ */
function LoginBoot(){
  const { useState, useEffect, useRef } = React;
  const [done, setDone] = useState(false);    // wordmark shrinks to header
  const [formIn, setFormIn] = useState(false); // form fades in (delayed after done)
  const [key, setKey] = useState(0);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const canSubmit = id.length>0 && pw.length>0;

  // Total intro: letters land by ~1.3s → HOLD logo centered → recede + form at ~2.4s
  useEffect(()=>{
    setDone(false); setFormIn(false);
    const t1 = setTimeout(()=> setDone(true), 2400);    // wordmark scales down in place
```
