---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/_archive/reference/files/app_final.js
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# app_final.js

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/_archive/reference/files/app_final.js]]

## 원본 첫 줄 (또는 메타)

```
// ── 상수 ──────────────────────────────────────────────────────────
var DEPT_COLOR = {
  조립:'#4f8ef7', 고압:'#f4b942', 진공:'#9b72f8', 튜닝:'#06b6d4',
  튜브:'#1fd17a', AS:'#e879f9', 연구소:'#f97316', 기타:'#5a5f75', 영업:'#f25f5c'
};
var PART_MAP    = {'자재창고':'창고','조립/출하':'조립','고압파트':'고압','진공파트':'진공','튜닝파트':'튜닝','출하':'출하','데모':'데모'};
var FT_MAP      = {'원자재':'brm','조립자재':'bas','발생부자재':'bgp','완제품':'bfg','데모/테스트장비':'bdm'};
var FT_LBL      = {'원자재':'원자재','조립자재':'조립','발생부자재':'발생부','완제품':'완제품','데모/테스트장비':'데모'};
var MODELS      = ['DX3000','ADX4000W','ADX6000','COCOON','SOLO','공용'];
var PROD_PARTS  = ['조립/출하','고압파트','진공파트','튜닝파트','출하'];
var DEPT_PARTS  = {'조립':'조립/출하','고압':'고압파트','진공':'진공파트','튜닝':'튜닝파트','튜브':'튜닝파트','출하':'출하'};
var HIST_MODELS = ['DX3000','ADX4000W','ADX6000','COCOON','SOLO','공용'];

// ── DB ────────────────────────────────────────────────────────────
var DB = null;
function loadDB() {
  try { DB = JSON.parse(localStorage.getItem('inv12')); } catch(e) {}
  if (!DB || !DB.products || DB.products.length < 10) {
    DB = {
      employees: JSON.parse(JSON.stringify(INIT_DB.employees)),
      products:  JSON.parse(JSON.stringify(INIT_DB.products)),
      history:   [],
      adminPw:   '0000'
    };
  }
```
