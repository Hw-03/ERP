---
type: file-explanation
source_path: "_attic/_archive/reference/files/app_final.js"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# app_final.js — app_final.js 설명

## 이 파일은 무엇을 책임지나

`app_final.js`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/_archive/reference/files/📁_files]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```js
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
  if (!DB.history)  DB.history  = [];
  if (!DB.adminPw)  DB.adminPw  = '0000';
  if (!DB.bom)        DB.bom        = {};
  if (!DB.shipPkgs)   DB.shipPkgs   = [];

  // minStock 마이그레이션: INIT_DB 기준으로 minStock이 0인 항목 업데이트
  var initMap = {};
  for (var i = 0; i < INIT_DB.products.length; i++) {
    initMap[INIT_DB.products[i].id] = INIT_DB.products[i].minStock || 0;
  }
  var migrated = false;
  for (var i = 0; i < DB.products.length; i++) {
    var p = DB.products[i];
    var initMin = initMap[p.id];
    if (initMin && (p.minStock === undefined || p.minStock === 0)) {
      p.minStock = initMin;
      migrated = true;
    }
  }
  if (migrated) saveDB();
}
function saveDB() {
  try { localStorage.setItem('inv12', JSON.stringify(DB)); } catch(e) {}
}

// ── 유틸 ──────────────────────────────────────────────────────────
function ge(id)    { return document.getElementById(id); }
function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pLbl(p)   { return PART_MAP[p] || p; }
function bdg(ft)   { return '<span class="badge '+(FT_MAP[ft]||'brm')+'">'+esc(FT_LBL[ft]||ft)+'</span>'; }
```
