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
function empColor(emp) { return DEPT_COLOR[(emp && emp.category) || '기타'] || '#5a5f75'; }
function sColor(p) {
  var s = +p.stock, m = +(p.minStock||0);
  return s === 0 ? 'var(--red)' : (m > 0 && s < m) ? 'var(--yellow)' : 'var(--green)';
}
function qMatch(p, kw) {
  if (!kw) return true;
  var w = kw.toLowerCase();
  var fields = ['name','model','supplier','id','itemType'];
  for (var i = 0; i < fields.length; i++) {
    if ((p[fields[i]]||'').toLowerCase().indexOf(w) >= 0) return true;
  }
  return false;
}
function getMods(prods) {
  var seen = {};
  for (var i = 0; i < prods.length; i++) {
    for (var j = 0; j < MODELS.length; j++) {
      if ((prods[i].model||'').indexOf(MODELS[j]) >= 0) seen[MODELS[j]] = 1;
    }
  }
  return MODELS.filter(function(m){ return seen[m]; });
}
function toast(msg, t) {
  var d = document.createElement('div');
  d.className = 'toast' + (t === 'err' ? ' terr' : t === 'warn' ? ' twarn' : '');
  d.textContent = msg;
  ge('toasts').appendChild(d);
  setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); }, 2800);
}
function bigToast(icon, msg) {
  // 기존 팝업 제거
  var old = document.getElementById('bt-popup');
  if (old) old.parentNode.removeChild(old);
  clearTimeout(bigToast._t);

  // 새 팝업 생성 - body에 직접 붙임
  var el = document.createElement('div');
  el.id = 'bt-popup';
  el.style.cssText = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    'z-index:99999',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:10px',
    'width:220px',
    'min-height:120px',
    'background:rgba(16,18,26,.96)',
    'border:1px solid rgba(255,255,255,.12)',
    'border-radius:22px',
    'padding:24px 20px',
    'pointer-events:none',
    'backdrop-filter:blur(12px)',
    '-webkit-backdrop-filter:blur(12px)',
    'font-family:-apple-system,Helvetica,sans-serif',
    'animation:btpop .2s ease',
    'text-align:center'
  ].join(';');

  var ico = document.createElement('div');
  ico.style.cssText = 'font-size:44px;line-height:1';
  ico.textContent = icon;

  var txt = document.createElement('div');
  txt.style.cssText = 'font-size:15px;font-weight:900;color:#eef0f8;word-break:keep-all;line-height:1.4';
  txt.textContent = msg;

  el.appendChild(ico);
  el.appendChild(txt);
  document.body.appendChild(el);

  bigToast._t = setTimeout(function(){
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 2000);
}
function now() { return new Date().toLocaleString('ko-KR'); }
function kpi(l, v, cls) {
  return '<div class="kpi '+cls+'"><div class="kl">'+l+'</div><div class="kv">'+v.toLocaleString()+'</div></div>';
}
function oSheet(id) { ge(id).classList.add('on'); ge('sbg').classList.add('on'); ge('sbg').dataset.s = id; }
function cSheet(id) { if (id) ge(id).classList.remove('on'); ge('sbg').classList.remove('on'); }

// ── 엑셀 연동 ─────────────────────────────────────────────────────
function callExcel(name, qty, mode, part) {
  if (!EXCEL_ENABLED || !EXCEL_SERVER) return;
  var fk = PART_MAP[part] || '';
  if (!fk) return;
  fetch(EXCEL_SERVER + '/api/io', {
    method:  'POST',
    headers: {'Content-Type': 'application/json'},
    body:    JSON.stringify({name: name, qty: qty, mode: mode, file: fk})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){ if (d.status !== 'success') console.warn('엑셀 동기화 경고:', d.msg); })
  .catch(function(e){ console.warn('엑셀 서버 연결 실패:', e); });
}

function syncFromExcel() {
  if (!EXCEL_ENABLED || !EXCEL_SERVER) return;
  fetch(EXCEL_SERVER + '/api/stock/all')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.status !== 'ok' || !d.stocks) return;
      var stocks  = d.stocks;
      var changed = false;
      for (var i = 0; i < DB.products.length; i++) {
        var p = DB.products[i];
        if (stocks[p.name] !== undefined && stocks[p.name] !== +p.stock) {
          p.stock  = stocks[p.name];
          changed  = true;
        }
      }
      if (changed) {
        saveDB();
        if (S.pg === 'prod') renderProd();
      }
    })
    .catch(function(){});
}

function checkStockMismatch() {
  if (!EXCEL_ENABLED || !EXCEL_SERVER) return;
  var items = [], seen = {};
  for (var i = 0; i < DB.products.length; i++) {
    var p = DB.products[i];
    if (!p.part || !PART_MAP[p.part]) continue;
    if (seen[p.name]) continue;
    seen[p.name] = 1;
    items.push({name: p.name, stock: p.stock, part: p.part});
    if (items.length >= 50) break;
  }
  if (!items.length) return;
  fetch(EXCEL_SERVER + '/api/stock/compare?stocks=' + encodeURIComponent(JSON.stringify(items)))
    .then(function(r){ return r.json(); })
    .then(function(d){
      var bar = ge('mismatch-bar');
      if (d.status !== 'ok' || !d.mismatches || !d.mismatches.length) {
        bar.style.display = 'none';
        return;
      }
      var detail = d.mismatches.slice(0, 3).map(function(m){
        return esc(m.name) + '(앱:' + m.app + ' 엑셀:' + m.excel + ')';
      }).join(' / ');
      if (d.mismatches.length > 3) detail += ' 외 ' + (d.mismatches.length - 3) + '건';
      bar.style.display = '';
      bar.innerHTML =
        '<span>⚠️ 엑셀 불일치 ' + d.mismatches.length + '건 '
        + '<span style="font-size:11px;opacity:.8">' + detail + '</span></span>'
        + '<button id="mismatch-close" style="background:none;border:none;color:inherit;font-size:16px;cursor:pointer;float:right">✕</button>';
    })
    .catch(function(){ ge('mismatch-bar').style.display = 'none'; });
}

// ── 상태 ──────────────────────────────────────────────────────────
var S = {
  pg:'io', pkw:'', pft:'', pmd:'', pss:'', passy:false, hf:'all', hd:'month',
  apft:'', apmd:'', appassy:false,
  apft:'', apmd:'', appassy:false,
  hemp:'', hprod:'', mv:'wh2d', empId:null, prodId:null, deptPid:null,
  editProd:null, editEmp:null, admin:false, pin:'',
  pShow:100, pOrder:[], pGroups:{}, sortMode:false
};
var DIO = { dept:null, mt:'in', prodId:null, empId:null, md:'', passy:false, bomQtys:{}, pkgId:null };

// ── 네비 ──────────────────────────────────────────────────────────
function go(pg) {
  S.pg = pg;
  var pages = ['prod','io','dio','hist','adm'];
  for (var i = 0; i < pages.length; i++) {
    var el = ge('pg-' + pages[i]);
    if (el) el.style.display = pages[i] === pg ? '' : 'none';
  }
  var tabs = document.querySelectorAll('.tab');
  for (var j = 0; j < tabs.length; j++) {
    tabs[j].className = tabs[j].getAttribute('data-p') === pg ? 'tab on' : 'tab';
  }
  var T = {prod:['Inventory','재고'], io:['Warehouse','창고 입출고'],
           dio:['Department','부서 입출고'], hist:['Logbook','내역'], adm:['Admin','관리자']};
  var t = T[pg] || ['',''];
  ge('top-sub').textContent = t[0];
  ge('top-ttl').textContent = t[1];
  ge('io-bottom').style.display  = pg === 'io'  ? '' : 'none';
  ge('dio-bottom').style.display = pg === 'dio' ? '' : 'none';
  ge('scroll').scrollTop = 0;
  var fn = {prod:rProd, io:rIO, dio:rDIO, hist:rHist, adm:rAdm};
  if (fn[pg]) fn[pg]();
  if (pg !== 'adm') setTimeout(syncFromExcel, 300);
}

// ── 재고 탭 ───────────────────────────────────────────────────────
function matchFt(p, key) {
  if (!key) return true;
  if (key.indexOf('ft:') === 0) return p.fileType === key.slice(3);
  if (key.indexOf('pt:') === 0) return p.part === key.slice(3);
  return true;
}

function rProd() {
  S.pShow = 100;
  var P = DB.products, zero = 0, low = 0;
  for (var i = 0; i < P.length; i++) {
    var s = +P[i].stock, m = +(P[i].minStock||0);  // 단일 품목 비교
    if (s === 0) zero++; else if (m > 0 && s < m) low++;
  }
  var kpiHtml = function(l, v, cls, ss) {
    var active = S.pss === ss ? ';outline:2px solid currentColor;outline-offset:2px' : '';
    return '<div class="kpi '+cls+'" data-ss="'+ss+'" style="cursor:pointer'+active+'"><div class="kl">'+l+'</div><div class="kv">'+v.toLocaleString()+'</div></div>';
  };
  ge('d-kpi').innerHTML =
    kpiHtml('전체', P.length,              'kb', '') +
    kpiHtml('정상', P.length - zero - low, 'kg', 'ok') +
    kpiHtml('부족', low,                   'ky', 'low') +
    kpiHtml('품절', zero,                  'kr', 'zero');

  var ft = S.pft, md = S.pmd, kw = S.pkw;
  var filtFt = DB.products.filter(function(p){ return matchFt(p, ft); });
  rPills('pft', ft, filtFt, 'ft');
  rPills('pmd', md, filtFt, 'md');

  var filtered = DB.products.filter(function(p){
    return matchFt(p, ft) && (!md || (p.model||'').indexOf(md) >= 0) && qMatch(p, kw)
      && (!S.passy || (p.itemType||'').toUpperCase().indexOf('ASS') >= 0);
  });

  var groups = {}, order = [];
  for (var i = 0; i < filtered.length; i++) {
    var key = filtered[i].name;
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(filtered[i]);
  }

  if (S.pss) {
    order = order.filter(function(nm){
      var tot = groups[nm].reduce(function(a,p){ return a + +p.stock; }, 0);
      var min = groups[nm].reduce(function(a,p){ return Math.max(a, +(p.minStock||0)); }, 0);
      if (S.pss === 'zero') return tot === 0;
      if (S.pss === 'low')  return tot > 0 && min > 0 && tot < min;
      if (S.pss === 'ok')   return !(tot === 0) && !(min > 0 && tot < min);
      return true;
    });
  }

  S.pGroups = groups;
  S.pOrder  = order;
  ge('pcnt').textContent = order.length.toLocaleString() + '개 품목';
  renderProd();
  checkStockMismatch();
}

function renderProd() {
  var order = S.pOrder, groups = S.pGroups, show = S.pShow, html = '';
  var BC = {'창고':'var(--green)','조립':'var(--blue)','고압':'var(--yellow)',
            '진공':'var(--purple)','튜닝':'var(--cyan)','출하':'var(--blue)','데모':'var(--muted2)'};

  for (var i = 0; i < Math.min(show, order.length); i++) {
    var nm    = order[i];
    var items = groups[nm];
    var tot   = items.reduce(function(a,p){ return a + +p.stock; }, 0);
    var minT  = items.reduce(function(a,p){ return Math.max(a, +(p.minStock||0)); }, 0);
    var sk    = tot === 0
      ? {k:'zero', l:'품절', c:'szero'}
      : (minT > 0 && tot < minT)
        ? {k:'low', l:'부족', c:'slow'}
        : {k:'ok',  l:'정상', c:'sok'};
    var col  = sk.k === 'zero' ? 'var(--red)' : sk.k === 'low' ? 'var(--yellow)' : 'var(--green)';
    var rep  = items[0], lblMap = {}, lblOrd = [];

    for (var j = 0; j < items.length; j++) {
      var lb = pLbl(items[j].part);
      if (lblMap[lb] === undefined) { lblMap[lb] = 0; lblOrd.push(lb); }
      lblMap[lb] += +items[j].stock;
    }

    var tags = lblOrd.map(function(lb){
      var v = lblMap[lb];
      var c = v === 0 ? 'var(--red)' : lb === '창고' ? 'var(--green)' : 'var(--blue)';
      return '<span class="ptag muted">' + lb + '</span>'
           + '<span class="ptag" style="color:'+c+';font-weight:700">'+v+'</span>';
    }).join('<span class="ptag sep">│</span>');

    var bar = lblOrd.map(function(lb){
      var v = lblMap[lb];
      if (!tot || !v) return '';
      return '<div style="height:4px;width:'+Math.round(v/tot*100)+'%;background:'+(BC[lb]||'var(--muted2)')+'"></div>';
    }).join('');

    html +=
      '<div class="row col" data-nm="'+esc(nm)+'">'
      +'<div style="display:flex;align-items:center;gap:10px">'
        +'<div class="rb"><div class="rt">'+esc(nm)+'</div>'
        +'<div class="rs">'+esc([rep.model,rep.itemType,rep.supplier].filter(Boolean).join(' · '))+'</div></div>'
        +'<div style="display:flex;align-items:center;gap:5px;flex-shrink:0">'
          +bdg(rep.fileType)
          +'<span class="badge '+sk.c+'">'+sk.l+'</span>'
          +'<span style="font-family:var(--mono);font-size:15px;font-weight:900;color:'+col+'">'+tot+'</span>'
        +'</div>'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">'+tags+'</div>'
      +'<div style="display:flex;overflow:hidden;border-radius:99px;height:4px;background:var(--s3);margin-top:4px">'+bar+'</div>'
      +'</div>';
  }

  if (order.length > show) {
    html += '<div class="more" id="more-btn">+ '+(order.length-show).toLocaleString()+'개 더 보기</div>';
  }
  ge('plist').innerHTML = html;
  ge('plist').onclick = function(ev){
    var t = ev.target;
    while (t && t !== ge('plist')) {
      if (t.id === 'more-btn')  { S.pShow += 100; renderProd(); return; }
      if (t.dataset.nm)         { detGroup(t.dataset.nm); return; }
      t = t.parentNode;
    }
  };
}

function rPills(eid, cur, prods, type) {
  var entries;
  if (type === 'ft') {
    entries = [
      ['','전체'],
      ['ft:원자재','원자재'],
      ['pt:조립/출하','조립'],
      ['pt:진공파트','진공'],
      ['pt:고압파트','고압'],
      ['pt:튜닝파트','튜닝'],
      ['ft:발생부자재','발생부'],
      ['ft:완제품','완제품'],
      ['ft:데모/테스트장비','데모']
    ];
  } else {
    var mods = getMods(prods);
    entries  = [['','전체']];
    for (var i = 0; i < mods.length; i++) entries.push([mods[i], mods[i]]);
  }
  var h = '';
  for (var i = 0; i < entries.length; i++) {
    var k = entries[i][0], l = entries[i][1];
    h += '<div class="pill'+(cur===k?' on':'')+'" data-k="'+esc(k)+'" data-pt="'+type+'">'+esc(l)+'</div>';
    // pmd 줄: 전체 바로 뒤에 Ass'y 삽입
    if (type === 'md' && i === 0) {
      h += '<div class="pill' + (S.passy ? ' on' : '') + '" id="passy-btn" data-passy="1">Ass&#39;y</div>';
    }
  }
  var wrap = ge(eid);
  wrap.innerHTML = h;
  wrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== wrap && !t.dataset.pt && !t.dataset.passy) t = t.parentNode;
    if (!t || t === wrap) return;
    if (t.dataset.passy) { S.passy = !S.passy; rProd(); return; }
    if (t.dataset.pt === 'ft') { S.pft = t.dataset.k; S.pmd = ''; rProd(); }
    else                        { S.pmd = t.dataset.k; rProd(); }
  };
}



function detGroup(nm) {
  var items = DB.products.filter(function(p){ return p.name === nm; });
  if (!items.length) return;
  var tot  = items.reduce(function(a,p){ return a + +p.stock; }, 0);
  var minT = items.reduce(function(a,p){ return Math.max(a, +(p.minStock||0)); }, 0);
  var sk   = tot === 0 ? {k:'zero',l:'품절',c:'szero'} : (minT > 0 && tot < minT) ? {k:'low',l:'부족',c:'slow'} : {k:'ok',l:'정상',c:'sok'};
  var col  = sk.k === 'zero' ? 'var(--red)' : sk.k === 'low' ? 'var(--yellow)' : 'var(--green)';
  var rep  = items[0], lblMap = {}, lblOrd = [];
  for (var i = 0; i < items.length; i++) {
    var lb = pLbl(items[i].part);
    if (lblMap[lb] === undefined) { lblMap[lb] = 0; lblOrd.push(lb); }
    lblMap[lb] += +items[i].stock;
  }
  var BC = {'창고':'var(--green)','조립':'var(--blue)','고압':'var(--yellow)','진공':'var(--purple)','튜닝':'var(--cyan)'};
  var stockRows = lblOrd.map(function(lb){
    var v = lblMap[lb];
    var c = v === 0 ? 'var(--red)' : lb === '창고' ? 'var(--green)' : 'var(--blue)';
    return '<div class="dr"><span class="dl">'+(lb==='창고'?'🏭 ':'')+lb+'</span>'
          +'<span class="dv" style="font-family:var(--mono);font-weight:700;color:'+c+'">'+v+'개</span></div>';
  }).join('');
  var bar = lblOrd.map(function(lb){
    var v = lblMap[lb];
    if (!tot || !v) return '';
    return '<div style="height:6px;width:'+Math.round(v/tot*100)+'%;background:'+(BC[lb]||'var(--muted2)')+'"></div>';
  }).join('');
  var infoRows = [['itemType','분류'],['model','모델'],['supplier','공급처'],['spec','규격']].map(function(f){
    return rep[f[0]] ? '<div class="dr"><span class="dl">'+f[1]+'</span><span class="dv">'+esc(rep[f[0]])+'</span></div>' : '';
  }).join('');

  ge('det-body').innerHTML =
    '<div style="padding:0 20px"><div style="font-size:20px;font-weight:900;margin-bottom:10px">'+esc(nm)+'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'+bdg(rep.fileType)+'<span class="badge '+sk.c+'">'+sk.l+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">'
      +'<span style="font-size:12px;color:var(--muted2)">전체 합계</span>'
      +'<span style="font-family:var(--mono);font-size:32px;font-weight:900;color:'+col+'">'+tot+'<small style="font-size:13px"> 개</small></span>'
    +'</div>'
    +'<div style="display:flex;overflow:hidden;border-radius:99px;height:6px;background:var(--s3);margin-bottom:4px">'+bar+'</div>'
    +'<div style="font-size:10px;color:var(--muted2);margin-bottom:14px">안전재고 '+(minT||0)+'</div>'
    +'<div class="slbl">📦 부서별 재고</div>'
    +'<div class="card" style="padding:4px 14px;margin-bottom:14px">'+stockRows+'</div>'
    +(infoRows ? '<div class="slbl">ℹ️ 정보</div><div class="card" style="padding:4px 14px;margin-bottom:14px">'+infoRows+'</div>' : '')
    +(function(){
      // 최근 입출고 내역 (해당 품목, 최대 10건)
      var hist = DB.history.filter(function(h){ return h.name === nm; })
        .slice().reverse().slice(0, 10);
      if (!hist.length) return '';
      var rows = hist.map(function(h){
        var isIn = h.type === '입고';
        var col = isIn ? 'var(--green)' : 'var(--red)';
        return '<div class="dr" style="padding:8px 14px;gap:8px">'          +'<span class="htag '+(isIn?'hin':'hout')+'" style="font-size:10px;padding:2px 6px">'+h.type+'</span>'          +'<div class="rb" style="flex:1"><div style="font-size:12px;color:var(--muted2)">'+esc(h.date)+'</div>'          +(h.emp ? '<div style="font-size:11px;color:var(--muted)">👤 '+esc(h.emp)+'</div>' : '')          +(h.note ? '<div style="font-size:11px;color:var(--muted)">'+esc(h.note)+'</div>' : '')          +'</div>'          +'<div style="text-align:right;flex-shrink:0">'            +'<div style="font-family:var(--mono);font-weight:700;color:'+col+'">'+(isIn?'+':'-')+h.qty+'</div>'            +'<div style="font-size:10px;color:var(--muted2)">→'+h.stockAfter+'</div>'          +'</div>'          +'</div>';
      }).join('');
      return '<div class="slbl">📋 최근 입출고</div><div class="card" style="padding:0;margin-bottom:14px">'+rows+'</div>';
    })()
    +'</div>';
  oSheet('s-det');
}

// ── 직원 칩 렌더 ──────────────────────────────────────────────────
function renderEmps(wrapId, selId, filter, onSelect) {
  var emps = DB.employees.filter(filter);
  var wrap = ge(wrapId);
  wrap.innerHTML = emps.map(function(emp){
    return '<div class="echip'+(selId===emp.id?' on':'')+'" data-eid="'+esc(emp.id)+'">'
          +'<div class="eav" style="background:'+empColor(emp)+'">'+esc(emp.name.slice(1))+'</div>'
          +'<div class="enm">'+esc(emp.name)+'</div>'
          +'</div>';
  }).join('');
  wrap.className = 'empsel' + (selId ? ' has-sel' : '');
  wrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== wrap && !t.dataset.eid) t = t.parentNode;
    if (t && t.dataset.eid) onSelect(t.dataset.eid);
  };
}

// ── 창고 입출고 ───────────────────────────────────────────────────
function rIO() {
  var filter = function(e){ return e.category !== '영업' && e.category !== '기타' && e.category !== '연구소'; };
  renderEmps('empsel', S.empId, filter, function(eid){
    S.empId = S.empId === eid ? null : eid;
    rIOEmps();
  });
  var mvBtns = document.querySelectorAll('#mvgrid .mvbtn');
  for (var i = 0; i < mvBtns.length; i++) {
    mvBtns[i].className = mvBtns[i].getAttribute('data-mv') === S.mv ? 'mvbtn on' : 'mvbtn';
  }
  ge('io-flow').style.display = 'none';
  ge('iosrch').value = '';
  ge('iolist').innerHTML = '';
  if (!S.prodId) { ge('iosel').style.display = 'none'; ge('ioqty').value = ''; ge('ioprev').style.display = 'none'; }
  ge('ionote').value = '';
  var btnTxt = {'wh2d':'📤 출고', 'd2wh':'📥 입고', 'whin':'📥 창고 입고'};
  var btnCls = {'wh2d':'btn br', 'd2wh':'btn bf', 'whin':'btn bb'};
  ge('io-btn').textContent = btnTxt[S.mv] || '처리';
  ge('io-btn').className   = btnCls[S.mv] || 'btn bb';
  if (!S.prodId) S.deptPid = null;
}
function rIOEmps() {
  var filter = function(e){ return e.category !== '영업' && e.category !== '기타' && e.category !== '연구소'; };
  renderEmps('empsel', S.empId, filter, function(eid){
    S.empId = S.empId === eid ? null : eid;
    rIOEmps();
  });
}
function setMv(mv) { S.mv = mv; rIO(); }

function ioSearch() {
  var kw = ge('iosrch').value.trim();
  if (!kw) { ge('iolist').innerHTML = ''; return; }
  var pool = S.mv === 'd2wh'
    ? DB.products.filter(function(p){ return PROD_PARTS.indexOf(p.part) >= 0; })
    : DB.products.filter(function(p){ return p.part === '자재창고'; });
  var list = pool.filter(function(p){ return qMatch(p, kw); }).slice(0, 20);
  var wrap = ge('iolist');
  wrap.innerHTML = list.length
    ? list.map(function(p){
        return '<div class="row" data-id="'+esc(p.id)+'">'
              +'<div class="rb"><div class="rt">'+esc(p.name)+'</div>'
              +'<div class="rs">'+esc([p.model,p.supplier].filter(Boolean).join(' · '))+'</div></div>'
              +'<span style="font-family:var(--mono);font-weight:700;color:'+sColor(p)+'">'+p.stock+'</span>'
              +'</div>';
      }).join('')
    : '<div class="esm">검색 결과 없음</div>';
  wrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== wrap && !t.dataset.id) t = t.parentNode;
    if (t && t.dataset.id) selProd(t.dataset.id);
  };
}

function selProd(id) {
  var p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === id) { p = DB.products[i]; break; }
  if (!p) return;
  S.prodId = id;

  var mv = S.mv, matched = null;
  if (mv === 'wh2d') {
    for (var i = 0; i < DB.products.length; i++) {
      if (PROD_PARTS.indexOf(DB.products[i].part) >= 0 && DB.products[i].name === p.name) { matched = DB.products[i]; break; }
    }
  } else if (mv === 'd2wh') {
    for (var i = 0; i < DB.products.length; i++) {
      if (DB.products[i].part === '자재창고' && DB.products[i].name === p.name) { matched = DB.products[i]; break; }
    }
  }
  S.deptPid = matched ? matched.id : null;

  ge('io-flow').style.display = 'none';
  ge('io-sn').textContent = p.name;
  ge('io-ss').textContent = [p.model, p.supplier].filter(Boolean).join(' · ');
  ge('io-fl').textContent = (mv === 'whin' || mv === 'wh2d') ? '창고 재고' : pLbl(p.part) + ' 재고';
  ge('io-fs').textContent = p.stock;
  ge('io-fs').style.color = sColor(p);

  if (mv === 'wh2d' || mv === 'd2wh') {
    ge('io-tw').style.display = '';
    ge('io-tl').textContent   = mv === 'wh2d' ? (matched ? pLbl(matched.part) : '생산부') + ' 재고' : '창고 재고';
    ge('io-ts').textContent   = matched ? matched.stock : '없음';
    ge('io-ts').style.color   = matched ? sColor(matched) : 'var(--muted2)';
  } else {
    ge('io-tw').style.display = 'none';
  }

  ge('iosel').style.display = '';
  ge('iolist').innerHTML    = '';
  ge('iosrch').value        = '';
  ioPrev();

  // 출하 이동 + 완제품이면 BOM 미리보기
  var ioBomWrap = ge('io-bom-preview');
  if (ioBomWrap) {
    var p2 = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === S.prodId) { p2 = DB.products[i]; break; }
    var isIoBom = p2 && S.mv === 'wh2d' && p2.fileType === '완제품' && DB.bom && DB.bom[p2.id] && DB.bom[p2.id].length > 0;
    if (isIoBom) { rIOBomPreview(p2); ioBomWrap.style.display = ''; }
    else { ioBomWrap.style.display = 'none'; ioBomWrap.innerHTML = ''; }
  }

  ge('iosel-cancel').onclick = function(){
    S.prodId = null; S.deptPid = null;
    ge('iosel').style.display  = 'none';
    ge('ioprev').style.display = 'none';
    ge('ioqty').value          = '';
    ge('io-flow').style.display = 'none';
    var w = ge('io-bom-preview');
    if (w) { w.style.display = 'none'; w.innerHTML = ''; }
  };
}

function rIOBomPreview(p) {
  var wrap = ge('io-bom-preview');
  if (!wrap) return;
  var bom = (DB.bom || {})[p.id] || [];
  if (!bom.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--yellow);padding:8px 0">⚠️ BOM 미등록 — 관리자 탭에서 구성품을 등록하세요</div>';
    return;
  }
  var qty = parseInt(ge('ioqty').value) || 1;
  var rows = bom.map(function(item) {
    var cp = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
    if (!cp) return '';
    var realQty = item.qty * qty;
    var c = sColor(cp);
    return '<div class="dr" style="padding:8px 14px;align-items:center">'
      +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(cp.name)+'</div>'
      +'<div style="font-size:10px;color:'+c+';margin-top:1px">재고 '+cp.stock+'개</div></div>'
      +'<span style="font-family:var(--mono);font-size:13px;color:var(--muted2);flex-shrink:0">×'+realQty+'</span>'
      +'</div>';
  }).join('');
  wrap.innerHTML = '<div class="slbl" style="margin-top:10px">📦 출하 구성품</div>'
    +'<div class="card" style="padding:0;margin-bottom:0">'+rows+'</div>';
}

function qStep(d) { ge('ioqty').value = Math.max(0, (parseInt(ge('ioqty').value)||0) + d); ioPrev(); }

function ioPrev() {
  if (!S.prodId) return;
  var fp = null, tp = null;
  for (var i = 0; i < DB.products.length; i++) {
    if (DB.products[i].id === S.prodId)   fp = DB.products[i];
    if (S.deptPid && DB.products[i].id === S.deptPid) tp = DB.products[i];
  }
  if (!fp) return;
  var qty = parseInt(ge('ioqty').value) || 0;
  if (!qty) { ge('ioprev').style.display = 'none'; return; }
  var mv = S.mv, inner = '';

  if (mv === 'wh2d' || mv === 'd2wh') {
    var fa = +fp.stock - qty;
    var ta = tp ? +tp.stock + qty : null;
    var fl = mv === 'wh2d' ? '창고' : pLbl(fp.part);
    var tl = mv === 'wh2d' ? (tp ? pLbl(tp.part) : '생산부') : '창고';
    inner =
      '<div style="display:flex;align-items:center;gap:8px">'
      +'<div style="flex:1;text-align:center"><div style="font-size:9px;color:var(--muted2)">'+fl+' 출고 후</div>'
      +'<div style="font-family:var(--mono);font-size:20px;font-weight:900;color:'+(fa<0?'var(--red)':'var(--green)')+'">'+fa+'</div></div>'
      +'<div style="font-size:20px;color:var(--blue)">→</div>'
      +'<div style="flex:1;text-align:center"><div style="font-size:9px;color:var(--muted2)">'+tl+' 입고 후</div>'
      +'<div style="font-family:var(--mono);font-size:20px;font-weight:900;color:var(--green)">'+(ta!==null?ta:'—')+'</div></div>'
      +'</div>';
    if (fa < 0) inner += '<div style="text-align:center;color:var(--red);font-size:11px;margin-top:6px;font-weight:700">⚠️ 재고 부족!</div>';
    if (!tp)    inner += '<div style="text-align:center;color:var(--yellow);font-size:11px;margin-top:4px">⚠️ 생산부 미매칭</div>';
  } else {
    var af = +fp.stock + qty;
    inner =
      '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">'
      +'<span style="color:var(--muted2)">현재 창고재고</span><span style="font-family:var(--mono)">'+fp.stock+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;border-top:1px solid var(--bd);padding-top:8px;margin-top:6px">'
      +'<span>입고 후</span><span style="font-family:var(--mono);color:var(--green)">'+af+'</span></div>';
  }
  ge('pvd').innerHTML = inner;
  ge('ioprev').style.display = '';
}

function doIO() {
  var ioNoEmp  = DB.employees.length > 0 && !S.empId;
  var ioNoProd = !S.prodId;
  var ioQty    = parseInt(ge('ioqty').value) || 0;
  var ioNoQty  = ioQty <= 0;
  var qty = ioQty;

  var note = ge('ionote').value.trim(), mv = S.mv;
  var emp  = '';
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === S.empId) { emp = DB.employees[i].name; break; }
  var fp = null, tp = null;
  for (var i = 0; i < DB.products.length; i++) {
    if (DB.products[i].id === S.prodId)   fp = DB.products[i];
    if (S.deptPid && DB.products[i].id === S.deptPid) tp = DB.products[i];
  }
  // 재고 부족 1순위 (품목·수량이 입력된 경우에 한해)
  if (fp && qty > 0 && mv !== 'whin' && +fp.stock < qty) { bigToast('⚠️', '재고 부족 (현재 '+fp.stock+'개)'); return; }
  if (ioNoEmp)  { bigToast('⚠️', '담당 직원을 선택하세요'); return; }
  if (ioNoProd) { bigToast('⚠️', '품목을 선택하세요'); return; }
  if (ioNoQty)  { bigToast('⚠️', '수량을 입력하세요'); return; }
  if (!fp) return;

  var afterFrom = mv === 'whin' ? +fp.stock + qty : +fp.stock - qty;
  var afterTo   = tp ? +tp.stock + qty : null;
  var mvLabel   = {'wh2d':'창고 → 생산부 이동', 'd2wh':'생산부 → 창고 반납', 'whin':'창고 입고'};
  var mvIcon    = {'wh2d':'📤', 'd2wh':'📥', 'whin':'📥'};

  ge('cfm-title').textContent = mvIcon[mv] + ' ' + mvLabel[mv];
  ge('cfm-body').innerHTML =
    '<div class="dr"><span class="dl">품목</span><span class="dv" style="font-weight:700">'+esc(fp.name)+'</span></div>'
    +'<div class="dr"><span class="dl">담당자</span><span class="dv">'+esc(emp||'미선택')+'</span></div>'
    +'<div class="dr"><span class="dl">수량</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:'+(mv==='whin'?'var(--green)':'var(--red)')+'">'+qty+'개</span></div>'
    +(mv !== 'whin' ? '<div class="dr"><span class="dl">'+(mv==='wh2d'?'창고':'생산부')+' 후</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:'+(afterFrom<0?'var(--red)':'var(--text)')+'">'+afterFrom+'개</span></div>' : '')
    +(afterTo !== null ? '<div class="dr"><span class="dl">'+(mv==='wh2d'?(tp?pLbl(tp.part):'생산부'):'창고')+' 후</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:var(--green)">'+afterTo+'개</span></div>' : '')
    +(mv === 'whin' ? '<div class="dr"><span class="dl">창고 후</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:var(--green)">'+afterFrom+'개</span></div>' : '')
    +(note ? '<div class="dr"><span class="dl">비고</span><span class="dv">'+esc(note)+'</span></div>' : '');

  ge('cfm-btn').className   = mv === 'wh2d' ? 'btn br' : 'btn bf';
  ge('cfm-btn').textContent = mvIcon[mv] + ' ' + mvLabel[mv];
  ge('cfm-btn').onclick     = confirmIO;
  oSheet('s-cfm');
}

function confirmIO() {
  // 재고 부족 1순위 체크 (sheet 닫기 전)
  var _qty = parseInt(ge('ioqty').value) || 0;
  var _fp = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === S.prodId) { _fp = DB.products[i]; break; }
  if (_fp && _qty > 0 && S.mv !== 'whin' && +_fp.stock < _qty) {
    cSheet('s-cfm');
    bigToast('⚠️', '재고 부족 (현재 '+_fp.stock+'개)');
    return;
  }
  cSheet('s-cfm');
  if (!S.prodId) return;
  var qty  = parseInt(ge('ioqty').value) || 0;
  var note = ge('ionote').value.trim(), mv = S.mv;
  var emp  = '';
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === S.empId) { emp = DB.employees[i].name; break; }
  var fp = null, tp = null;
  for (var i = 0; i < DB.products.length; i++) {
    if (DB.products[i].id === S.prodId)   fp = DB.products[i];
    if (S.deptPid && DB.products[i].id === S.deptPid) tp = DB.products[i];
  }
  if (!fp) return;
  var dt = now();
  function log(p, type, nt){ DB.history.push({date:dt,type:type,code:p.id,name:p.name,qty:qty,stockAfter:p.stock,note:nt,emp:emp}); }

  if (mv === 'wh2d') {
    fp.stock = +fp.stock - qty; fp.monthOut = (+(fp.monthOut||0)) + qty;
    log(fp, '출고', '→ '+(tp?pLbl(tp.part):'생산부')+(note?' / '+note:''));
    if (tp) { tp.stock = +tp.stock + qty; tp.monthIn = (+(tp.monthIn||0)) + qty; log(tp, '입고', '← 창고'+(note?' / '+note:'')); }
    callExcel(fp.name, qty, 'out', fp.part);
    // 완제품 출하 BOM 처리
    if (fp.fileType === '완제품' && DB.bom && DB.bom[fp.id] && DB.bom[fp.id].length > 0) {
      DB.bom[fp.id].forEach(function(item) {
        var cp = null;
        for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
        if (!cp) return;
        var cqty = item.qty * qty;
        cp.stock = +cp.stock - cqty; cp.monthOut = (+(cp.monthOut||0)) + cqty;
        DB.history.push({date:dt,type:'출고',code:cp.id,name:cp.name,qty:cqty,stockAfter:cp.stock,note:'[출하묶음] '+fp.name+(note?' / '+note:''),emp:emp});
      });
      bigToast('📤','출하 완료'); toast('✅ 출하 완료 (묶음 '+DB.bom[fp.id].length+'종)');
    } else {
      bigToast('📤','출고 완료'); toast('✅ 이동 완료'+(tp?'':' (생산부 미매칭)'));
    }
  } else if (mv === 'd2wh') {
    var fpLbl = pLbl(fp.part);
    fp.stock = +fp.stock - qty; fp.monthOut = (+(fp.monthOut||0)) + qty;
    log(fp, '출고', fpLbl+' 반납'+(note?' / '+note:''));
    if (tp) { tp.stock = +tp.stock + qty; tp.monthIn = (+(tp.monthIn||0)) + qty; log(tp, '입고', fpLbl+'에서 반납'+(note?' / '+note:'')); }
    callExcel(fp.name, qty, 'out', fp.part);
    bigToast('📥','반납 완료'); toast('✅ 반납 완료');
  } else {
    fp.stock = +fp.stock + qty; fp.monthIn = (+(fp.monthIn||0)) + qty;
    log(fp, '입고', '외부구매'+(note?' / '+note:''));
    callExcel(fp.name, qty, 'in', fp.part);
    bigToast('📥','입고 완료'); toast('📥 창고 입고 완료');
  }
  saveDB(); S.empId = null; S.prodId = null; S.deptPid = null; rIO();
}

// ── 부서 입출고 ───────────────────────────────────────────────────
function rDIO() {
  var filter = function(e){ return e.category !== '영업' && e.category !== '기타' && e.category !== '연구소'; };
  renderEmps('dioempsel', DIO.empId, filter, function(eid){
    var wasSelected = DIO.empId === eid;
    DIO.empId = wasSelected ? null : eid;
    // 직원 선택 시 해당 부서로 자동 전환 (품목 선택은 유지)
    if (!wasSelected) {
      var sel = null;
      for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === eid) { sel = DB.employees[i]; break; }
      if (sel && DEPT_PARTS[sel.category]) DIO.dept = sel.category;
    }
    rDIO();
  });

  // 부서 버튼 하이라이트 (null이면 아무것도 on 안 됨)
  var dBtns = ge('diodeptrow').querySelectorAll('.mvbtn');
  for (var i = 0; i < dBtns.length; i++) {
    dBtns[i].className = dBtns[i].getAttribute('data-dept') === DIO.dept ? 'mvbtn on' : 'mvbtn';
  }

  // 하단 버튼: 항상 고정 색상 (입고=초록, 출고=빨강)
  ge('dio-btn-in').className  = 'btn bf';
  ge('dio-btn-out').className = 'btn br';

  // 선택된 품목이 있으면 선택 패널 유지, 없으면 숨김
  // 모델 필터 렌더링
  renderDIOMdPills();

  if (DIO.prodId) {
    // 품목 선택 상태 → 검색창·목록 닫고 선택 패널만 유지
    ge('diosrch').value     = '';
    ge('diolist').innerHTML = '';
  } else {
    // 품목 미선택 → 선택 패널 숨기고 목록 표시
    ge('diosel').style.display  = 'none';
    ge('dioqty').value          = '';
    ge('dioprev').style.display = 'none';
    ge('diosrch').value         = '';
    dioSearch();
  }
}

function renderDIOMdPills() {
  var wrap = ge('diomd');
  if (!wrap) return;

  var part = DIO.dept ? (DEPT_PARTS[DIO.dept] || DIO.dept) : null;
  var pool = part ? DB.products.filter(function(p){ return p.part === part; }) : DB.products;
  var mods = getMods(pool);

  var h = '<div class="pill' + (DIO.md === '' ? ' on' : '') + '" data-diok="">전체</div>';
  // Ass'y를 전체 바로 뒤에 삽입
  h += '<div class="pill' + (DIO.passy ? ' on' : '') + '" data-diopassy="1">Ass&#39;y</div>';
  mods.forEach(function(m) {
    h += '<div class="pill' + (DIO.md === m ? ' on' : '') + '" data-diok="' + esc(m) + '">' + esc(m) + '</div>';
  });
  wrap.innerHTML = h;

  wrap.onclick = function(ev) {
    var t = ev.target;
    while (t && t !== wrap && t.dataset.diok === undefined && !t.dataset.diopassy) t = t.parentNode;
    if (!t || t === wrap) return;
    if (t.dataset.diopassy) {
      DIO.passy = !DIO.passy;
    } else {
      DIO.md = t.dataset.diok;
    }
    DIO.prodId = null;
    ge('diosel').style.display = 'none';
    ge('dioprev').style.display = 'none';
    ge('dioqty').value = '';
    renderDIOMdPills();
    dioSearch();
  };
}

function dioSearch() {
  var kw   = ge('diosrch').value.trim();
  var wrap = ge('diolist');

  // 출하 부서: 패키지 목록 표시
  if (DIO.dept === '출하' && !kw) {
    var pkgs = DB.shipPkgs || [];
    if (!pkgs.length) {
      wrap.innerHTML = '<div class="esm">출하묶음 없음 (관리자 탭에서 등록)</div>';
      wrap.onclick = null;
      return;
    }
    wrap.innerHTML = pkgs.map(function(pkg){
      return '<div class="row" data-pkgid="'+esc(pkg.id)+'">'
        +'<div class="rb"><div class="rt">'+esc(pkg.name)+'</div>'
        +'<div class="rs">구성품 '+pkg.items.length+'종</div></div>'
        +'<span style="font-size:12px;color:var(--muted2)">🚚</span>'
        +'</div>';
    }).join('');
    wrap.onclick = function(ev){
      var t = ev.target;
      while (t && t !== wrap && !t.dataset.pkgid) t = t.parentNode;
      if (t && t.dataset.pkgid) dioSelShipPkg(t.dataset.pkgid);
    };
    return;
  }

  // 부서 미선택 + 키워드 없음 → 완전히 비움
  if (!DIO.dept && !kw) {
    wrap.innerHTML = '';
    wrap.onclick   = null;
    return;
  }

  var list;
  if (kw) {
    list = DB.products.filter(function(p){
      return PROD_PARTS.indexOf(p.part) >= 0 && qMatch(p, kw)
        && (!DIO.md || (p.model||'').indexOf(DIO.md) >= 0)
        && (!DIO.passy || (p.itemType||'').toUpperCase().indexOf('ASS') >= 0);
    }).slice(0, 50);
  } else {
    var part = DEPT_PARTS[DIO.dept] || DIO.dept;
    list = DB.products.filter(function(p){
      return p.part === part
        && (!DIO.md || (p.model||'').indexOf(DIO.md) >= 0)
        && (!DIO.passy || (p.itemType||'').toUpperCase().indexOf('ASS') >= 0);
    }).slice(0, 50);
  }

  wrap.innerHTML = list.length
    ? list.map(function(p){
        // 검색 시 소속 부서 표시
        var partLabel = kw ? '<span style="font-size:9px;color:var(--muted2);margin-left:4px">['+pLbl(p.part)+']</span>' : '';
        return '<div class="row" data-id="'+esc(p.id)+'">'
              +'<div class="rb"><div class="rt">'+esc(p.name)+partLabel+'</div>'
              +'<div class="rs">'+esc([p.model,p.supplier].filter(Boolean).join(' · '))+'</div></div>'
              +'<span style="font-family:var(--mono);font-weight:700;color:'+sColor(p)+'">'+p.stock+'</span>'
              +'</div>';
      }).join('')
    : '<div class="esm">'+(kw ? '검색 결과 없음' : '해당 부서 품목 없음')+'</div>';

  wrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== wrap && !t.dataset.id) t = t.parentNode;
    if (t && t.dataset.id) dioSelProd(t.dataset.id);
  };
}

function dioSelProd(id) {
  var p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === id) { p = DB.products[i]; break; }
  if (!p) return;
  DIO.prodId = id;
  ge('dio-sn').textContent = p.name;
  ge('dio-ss').textContent = [p.model, p.supplier].filter(Boolean).join(' · ');
  ge('dio-sl').textContent = pLbl(p.part) + ' 재고';
  ge('dio-sv').textContent = p.stock;
  ge('dio-sv').style.color = sColor(p);
  ge('diosel').style.display = '';
  ge('diolist').innerHTML    = '';
  ge('diosrch').value        = '';
  // 조립부서 + Ass'y 품목이면 BOM 미리보기 표시
  var bomWrap = ge('dio-bom-preview');
  // 출하 패키지면 미리보기 갱신
  if (DIO.pkgId) {
    var pkg = null;
    for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === DIO.pkgId) { pkg = DB.shipPkgs[i]; break; }
    if (pkg) rDIOShipPkgPreview(pkg);
    // 패키지는 dioprev 별도 표시 안 함
    ge('dioprev').style.display = 'none';
    return;
  }
  var isAssy = DIO.dept === '조립' && (p.itemType||'').toUpperCase().indexOf('ASS') >= 0;
  if (bomWrap) {
    if (isAssy) { rDIOBomPreview(p); bomWrap.style.display = ''; }
    else { bomWrap.style.display = 'none'; bomWrap.innerHTML = ''; }
  }
  dioPrev();
  ge('diosel-cancel').onclick = function(){
    if (DIO.prodId) delete DIO.bomQtys[DIO.prodId];
    DIO.prodId = null;
    ge('diosel').style.display  = 'none';
    ge('dioprev').style.display = 'none';
    ge('dioqty').value          = '';
    if (bomWrap) { bomWrap.style.display = 'none'; bomWrap.innerHTML = ''; }
    dioSearch();
  };
}

// BOM 미리보기 렌더링

function dioSelShipPkg(pkgId) {
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  if (!pkg) return;
  DIO.prodId  = 'PKG:'+pkgId; // 특수 prefix로 패키지임을 표시
  DIO.pkgId   = pkgId;

  ge('dio-sn').textContent = pkg.name;
  ge('dio-ss').textContent = '구성품 '+pkg.items.length+'종';
  ge('dio-sl').textContent = '출하 패키지';
  ge('dio-sv').textContent = '-';
  ge('dio-sv').style.color = 'var(--muted2)';
  ge('diosel').style.display = '';
  ge('diolist').innerHTML    = '';
  ge('diosrch').value        = '';

  // 구성품 미리보기
  var bomWrap = ge('dio-bom-preview');
  if (bomWrap) { rDIOShipPkgPreview(pkg); bomWrap.style.display = ''; }

  ge('diosel-cancel').onclick = function(){
    DIO.prodId = null; DIO.pkgId  = null;
    ge('diosel').style.display  = 'none';
    ge('dioprev').style.display = 'none';
    ge('dioqty').value          = '';
    if (bomWrap) { bomWrap.style.display = 'none'; bomWrap.innerHTML = ''; }
    dioSearch();
  };
}

function rDIOShipPkgPreview(pkg) {
  var wrap = ge('dio-bom-preview');
  if (!wrap) return;
  var qty = parseInt(ge('dioqty').value) || 1;
  if (!pkg.items.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--yellow);padding:8px 0">⚠️ 구성품 없음</div>';
    return;
  }
  var rows = pkg.items.map(function(item){
    var p = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { p = DB.products[i]; break; }
    if (!p) return '';
    var realQty = item.qty * qty;
    var c = sColor(p);
    return '<div class="dr" style="padding:8px 14px;align-items:center">'
      +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</div>'
      +'<div style="font-size:10px;color:'+c+';margin-top:1px">재고 '+p.stock+'개</div></div>'
      +'<span style="font-family:var(--mono);font-size:13px;color:var(--muted2);flex-shrink:0">×'+realQty+'</span>'
      +'</div>';
  }).join('');
  wrap.innerHTML = '<div class="slbl" style="margin-top:10px">🚚 출하 구성품 (수량×'+qty+')</div>'
    +'<div class="card" style="padding:0;margin-bottom:0">'+rows+'</div>';
}


function dioQStep(d) { ge('dioqty').value = Math.max(0, (parseInt(ge('dioqty').value)||0) + d); dioPrev(); }

function dioPrev() {
  if (!DIO.prodId) return;
  var p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === DIO.prodId) { p = DB.products[i]; break; }
  if (!p) return;
  var qty     = parseInt(ge('dioqty').value) || 0;
  if (!qty) { ge('dioprev').style.display = 'none'; return; }
  // Ass'y면 BOM 수량 재계산 (수량 변경 시)
  var isAssy = DIO.dept === '조립' && (p.itemType||'').toUpperCase().indexOf('ASS') >= 0;
  if (isAssy && DB.bom && DB.bom[p.id]) {
    DIO.bomQtys[p.id] = {};
    DB.bom[p.id].forEach(function(item){ DIO.bomQtys[p.id][item.id] = item.qty * qty; });
    var bomWrap = ge('dio-bom-preview');
    if (bomWrap && bomWrap.style.display !== 'none') rDIOBomPreview(p);
  }
  var afterIn  = +p.stock + qty;
  var afterOut = +p.stock - qty;
  ge('diopvd').innerHTML =
    '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;margin-bottom:8px">'
    +'<span style="color:var(--muted2)">현재 재고</span><span style="font-family:var(--mono);font-weight:700">'+p.stock+'</span></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;border-top:1px solid var(--bd);padding-top:10px">'
      +'<div style="text-align:center;background:rgba(31,209,122,.08);border-radius:10px;padding:10px 6px">'
        +'<div style="font-size:10px;color:var(--muted2);margin-bottom:6px">입고 후</div>'
        +'<div style="font-family:var(--mono);font-size:22px;font-weight:900;color:var(--green)">'+afterIn+'</div>'
      +'</div>'
      +'<div style="text-align:center;background:rgba(242,95,92,.08);border-radius:10px;padding:10px 6px">'
        +'<div style="font-size:10px;color:var(--muted2);margin-bottom:6px">출고 후</div>'
        +'<div style="font-family:var(--mono);font-size:22px;font-weight:900;color:var(--red)">'+afterOut+'</div>'
      +'</div>'
    +'</div>'
    +(afterOut < 0 ? '<div style="text-align:center;color:var(--red);font-size:11px;margin-top:8px;font-weight:700">⚠️ 출고 시 재고 부족!</div>' : '');
  ge('dioprev').style.display = '';
}

function doDIO(mt) {
  DIO.mt = mt || DIO.mt;
  var noEmp  = DB.employees.length > 0 && !DIO.empId;
  var noProd = !DIO.prodId;
  var qty    = parseInt(ge('dioqty').value) || 0;
  var noQty  = qty <= 0;

  if (noEmp)  { bigToast('⚠️', '담당 직원을 선택하세요'); return; }
  if (noProd) { bigToast('⚠️', '품목을 선택하세요'); return; }
  if (noQty)  { bigToast('⚠️', '수량을 입력하세요'); return; }

  // 출하 패키지 처리
  if (DIO.pkgId && DIO.mt === 'out') {
    var pkg = null;
    for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === DIO.pkgId) { pkg = DB.shipPkgs[i]; break; }
    if (pkg) {
      var emp2 = '';
      for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === DIO.empId) { emp2 = DB.employees[i].name; break; }
      var shipRows = pkg.items.map(function(item){
        var cp = null;
        for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
        if (!cp) return '';
        var realQty = item.qty * qty;
        var col = 'var(--red)';
        return '<div class="dr"><span class="dl" style="font-size:12px">'+esc(cp.name)+'</span>'
          +'<span class="dv" style="font-family:var(--mono);font-size:12px;color:'+col+'">×'+realQty+'</span></div>';
      }).join('');
      ge('cfm-title').textContent = '📤 출하 확인';
      ge('cfm-body').innerHTML =
        '<div class="dr"><span class="dl">패키지</span><span class="dv" style="font-weight:700">'+esc(pkg.name)+'</span></div>'
        +'<div class="dr"><span class="dl">수량</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:var(--red)">'+qty+'세트</span></div>'
        +'<div class="dr"><span class="dl">담당자</span><span class="dv">'+esc(emp2||'미선택')+'</span></div>'
        +'<div class="slbl" style="margin-top:8px">🚚 구성품</div>'
        +'<div class="card" style="padding:4px 14px">'+shipRows+'</div>';
      ge('cfm-btn').className   = 'btn br';
      ge('cfm-btn').textContent = '📤 출하 처리';
      ge('cfm-btn').onclick     = confirmShipPkg;
      oSheet('s-cfm');
    }
    return;
  }

  var p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === DIO.prodId) { p = DB.products[i]; break; }
  // 재고 부족 1순위
  if (p && qty > 0 && DIO.mt === 'out' && +p.stock < qty) { bigToast('⚠️', '재고 부족 (현재 '+p.stock+'개)'); return; }
  if (!p) return;

  var note      = ge('dionote').value.trim();
  var emp       = '';
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === DIO.empId) { emp = DB.employees[i].name; break; }
  var after     = DIO.mt === 'out' ? +p.stock - qty : +p.stock + qty;
  var typeLabel = DIO.mt === 'out' ? '출고' : '입고';

  ge('cfm-title').textContent = (DIO.mt==='out'?'📤':'📥') + ' ' + typeLabel + ' 확인';
  ge('cfm-body').innerHTML =
    '<div class="dr"><span class="dl">품목</span><span class="dv" style="font-weight:700">'+esc(p.name)+'</span></div>'
    +'<div class="dr"><span class="dl">부서</span><span class="dv">'+esc(DIO.dept)+'</span></div>'
    +'<div class="dr"><span class="dl">담당자</span><span class="dv">'+esc(emp||'미선택')+'</span></div>'
    +'<div class="dr"><span class="dl">수량</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:'+(DIO.mt==='out'?'var(--red)':'var(--green)')+'">'+typeLabel+' '+qty+'개</span></div>'
    +'<div class="dr"><span class="dl">처리 후</span><span class="dv" style="font-family:var(--mono);font-weight:700;color:'+(after<0?'var(--red)':'var(--text)')+'">'+after+'개</span></div>'
    +(note ? '<div class="dr"><span class="dl">비고</span><span class="dv">'+esc(note)+'</span></div>' : '');

  // Ass'y BOM 처리 여부 확인
  var isAssyBom = DIO.dept === '조립'
    && (p.itemType||'').toUpperCase().indexOf('ASS') >= 0
    && DB.bom && DB.bom[p.id] && DB.bom[p.id].length > 0;

  if (isAssyBom) {
    var bom = DB.bom[p.id];
    var bomRows = bom.map(function(item) {
      var cp = null;
      for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
      if (!cp) return '';
      var realQty = (DIO.bomQtys[p.id] && DIO.bomQtys[p.id][item.id] !== undefined) ? DIO.bomQtys[p.id][item.id] : item.qty * qty;
      var col = DIO.mt === 'out' ? 'var(--red)' : 'var(--green)';
      return '<div class="dr"><span class="dl" style="font-size:12px">'+esc(cp.name)+'</span>'
        +'<span class="dv" style="font-family:var(--mono);font-size:12px;color:'+col+'">×'+realQty+'</span></div>';
    }).join('');
    ge('cfm-body').innerHTML +=
      '<div class="slbl" style="margin-top:8px">🔩 BOM 구성품 일괄 '+typeLabel+'</div>'
      +'<div class="card" style="padding:4px 14px">'+bomRows+'</div>';
  }

  ge('cfm-btn').className   = DIO.mt === 'out' ? 'btn br' : 'btn bf';
  ge('cfm-btn').textContent = (DIO.mt==='out'?'📤':'📥') + ' ' + typeLabel + ' 처리';
  ge('cfm-btn').onclick     = confirmDIO;
  oSheet('s-cfm');
}

function confirmShipPkg() {
  cSheet('s-cfm');
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === DIO.pkgId) { pkg = DB.shipPkgs[i]; break; }
  if (!pkg) return;
  var qty  = parseInt(ge('dioqty').value) || 0;
  var note = ge('dionote').value.trim();
  var emp  = '';
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === DIO.empId) { emp = DB.employees[i].name; break; }
  var dt = now();
  pkg.items.forEach(function(item){
    var cp = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
    if (!cp) return;
    var cqty = item.qty * qty;
    if (cqty <= 0) return;
    cp.stock = +cp.stock - cqty; cp.monthOut = (+(cp.monthOut||0)) + cqty;
    DB.history.push({date:dt,type:'출고',code:cp.id,name:cp.name,qty:cqty,stockAfter:cp.stock,
      note:'[출하] '+pkg.name+' '+qty+'세트'+(note?' / '+note:''),emp:emp});
  });
  saveDB();
  DIO.bomQtys = {}; DIO.prodId = null; DIO.empId = null; DIO.pkgId = null;
  bigToast('📤','출하 완료');
  toast('📤 '+pkg.name+' '+qty+'세트 출하 완료');
  rDIO();
}


function confirmDIO() {
  // 재고 부족 1순위 체크 (sheet 닫기 전)
  var _qty = parseInt(ge('dioqty').value) || 0;
  var _p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === DIO.prodId) { _p = DB.products[i]; break; }
  if (_p && _qty > 0 && DIO.mt === 'out' && +_p.stock < _qty) {
    cSheet('s-cfm');
    bigToast('⚠️', '재고 부족 (현재 '+_p.stock+'개)');
    return;
  }
  cSheet('s-cfm');
  if (!DIO.prodId) return;
  var qty = parseInt(ge('dioqty').value) || 0;
  var p   = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === DIO.prodId) { p = DB.products[i]; break; }
  if (!p) return;
  var note = ge('dionote').value.trim();
  var emp  = '';
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === DIO.empId) { emp = DB.employees[i].name; break; }
  var dt = now();
  var isAssyBom = DIO.dept === '조립'
    && (p.itemType||'').toUpperCase().indexOf('ASS') >= 0
    && DB.bom && DB.bom[p.id] && DB.bom[p.id].length > 0;

  if (DIO.mt === 'out') {
    p.stock = +p.stock - qty; p.monthOut = (+(p.monthOut||0)) + qty;
    DB.history.push({date:dt,type:'출고',code:p.id,name:p.name,qty:qty,stockAfter:p.stock,note:DIO.dept+' 소모'+(note?' / '+note:''),emp:emp});
    callExcel(p.name, qty, 'out', p.part);
    // BOM 구성품 일괄 출고
    if (isAssyBom) {
      DB.bom[p.id].forEach(function(item) {
        var cp = null;
        for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
        if (!cp) return;
        var cqty = (DIO.bomQtys[p.id] && DIO.bomQtys[p.id][item.id] !== undefined)
          ? DIO.bomQtys[p.id][item.id] : item.qty * qty;
        if (cqty <= 0) return;
        cp.stock = +cp.stock - cqty; cp.monthOut = (+(cp.monthOut||0)) + cqty;
        DB.history.push({date:dt,type:'출고',code:cp.id,name:cp.name,qty:cqty,stockAfter:cp.stock,note:'[BOM] '+p.name+' '+qty+'개'+(note?' / '+note:''),emp:emp});
      });
    }
    bigToast('📤','출고 완료'); toast('📤 '+DIO.dept+' 출고'+(isAssyBom?' (BOM '+DB.bom[p.id].length+'종)':''));
  } else {
    p.stock = +p.stock + qty; p.monthIn = (+(p.monthIn||0)) + qty;
    DB.history.push({date:dt,type:'입고',code:p.id,name:p.name,qty:qty,stockAfter:p.stock,note:DIO.dept+' 입고'+(note?' / '+note:''),emp:emp});
    callExcel(p.name, qty, 'in', p.part);
    // BOM 구성품 일괄 입고
    if (isAssyBom) {
      DB.bom[p.id].forEach(function(item) {
        var cp = null;
        for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { cp = DB.products[i]; break; }
        if (!cp) return;
        var cqty = (DIO.bomQtys[p.id] && DIO.bomQtys[p.id][item.id] !== undefined)
          ? DIO.bomQtys[p.id][item.id] : item.qty * qty;
        if (cqty <= 0) return;
        cp.stock = +cp.stock + cqty; cp.monthIn = (+(cp.monthIn||0)) + cqty;
        DB.history.push({date:dt,type:'입고',code:cp.id,name:cp.name,qty:cqty,stockAfter:cp.stock,note:'[BOM] '+p.name+' '+qty+'개'+(note?' / '+note:''),emp:emp});
      });
    }
    bigToast('📥','입고 완료'); toast('📥 '+DIO.dept+' 입고'+(isAssyBom?' (BOM '+DB.bom[p.id].length+'종)':''));
  }
  DIO.bomQtys = {}; saveDB(); DIO.prodId = null; DIO.empId = null; rDIO();
}

// ── 내역 탭 ───────────────────────────────────────────────────────
function getHistFiltered() {
  var now2 = new Date(), list = DB.history.slice().reverse();
  if (S.hd !== 'all') {
    list = list.filter(function(h){
      try {
        var parts = h.date.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
        if (!parts) return true;
        var hDate = new Date(parseInt(parts[1]), parseInt(parts[2])-1, parseInt(parts[3]));
        if (S.hd === 'today') {
          var t = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
          return hDate >= t;
        }
        if (S.hd === 'week') {
          var t2 = new Date(now2); t2.setDate(now2.getDate()-7); t2.setHours(0,0,0,0);
          return hDate >= t2;
        }
        if (S.hd === 'month') {
          var t3 = new Date(now2.getFullYear(), now2.getMonth(), 1);
          return hDate >= t3;
        }
      } catch(e) { return true; }
      return true;
    });
  }
  if (S.hf !== 'all') list = list.filter(function(h){ return h.type === S.hf; });
  if (S.hemp) list = list.filter(function(h){ return (h.emp||'').indexOf(S.hemp) >= 0; });
  if (S.hprod) {
    list = list.filter(function(h){
      var p = null;
      for (var i = 0; i < DB.products.length; i++) if (DB.products[i].name === h.name) { p = DB.products[i]; break; }
      if (!p) return false;
      var pm = p.model || '';
      if (S.hprod === 'ADX6000')  return pm.indexOf('ADX6000') >= 0 || pm.indexOf('6000S') >= 0 || pm.indexOf('6000FB') >= 0;
      if (S.hprod === 'ADX4000W') return pm.indexOf('ADX4000') >= 0;
      if (S.hprod === 'DX3000')   return pm.indexOf('DX3000') >= 0;
      return pm.indexOf(S.hprod) >= 0;
    });
  }
  return list;
}

function renderHistFilters() {
  // 직원 칩
  var empWrap = ge('hEmpSel');
  var emps = DB.employees.filter(function(e){ return e.category !== '영업' && e.category !== '기타' && e.category !== '연구소'; });
  empWrap.innerHTML =
    '<div class="echip'+(S.hemp===''?' on':'')+'" data-en=""><div class="eav" style="background:var(--muted);font-size:11px">전체</div><div class="enm">전체</div></div>'
    + emps.map(function(emp){
        return '<div class="echip'+(S.hemp===emp.name?' on':'')+'" data-en="'+esc(emp.name)+'"><div class="eav" style="background:'+empColor(emp)+'">'+esc(emp.name.slice(1))+'</div><div class="enm">'+esc(emp.name)+'</div></div>';
      }).join('');
  empWrap.className = 'empsel' + (S.hemp ? ' has-sel' : '');
  empWrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== empWrap && t.dataset.en === undefined) t = t.parentNode;
    if (t && t.dataset.en !== undefined) { S.hemp = t.dataset.en; renderHistFilters(); rHist(); }
  };
  // 모델 칩
  var MC = {
    'DX3000':{c:'#4f8ef7',s:'3000'}, 'ADX4000W':{c:'#f4b942',s:'4000'},
    'ADX6000':{c:'#9b72f8',s:'6000'}, 'COCOON':{c:'#06b6d4',s:'COCO'},
    'SOLO':{c:'#1fd17a',s:'SOLO'}, '공용':{c:'#5a5f75',s:'공용'}
  };
  var mdWrap = ge('hProdSel');
  mdWrap.innerHTML =
    '<div class="echip'+(S.hprod===''?' on':'')+'" data-mn=""><div class="eav" style="background:var(--muted);font-size:10px;font-weight:700">전체</div><div class="enm">전체</div></div>'
    + HIST_MODELS.map(function(m){
        var mc = MC[m] || {c:'#5a5f75', s:m.slice(0,4)};
        return '<div class="echip'+(S.hprod===m?' on':'')+'" data-mn="'+esc(m)+'"><div class="eav" style="background:'+mc.c+';font-size:10px;font-weight:800">'+mc.s+'</div><div class="enm">'+m+'</div></div>';
      }).join('');
  mdWrap.className = 'empsel' + (S.hprod ? ' has-sel' : '');
  mdWrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== mdWrap && t.dataset.mn === undefined) t = t.parentNode;
    if (t && t.dataset.mn !== undefined) { S.hprod = t.dataset.mn; renderHistFilters(); rHist(); }
  };
}

function rHist() {
  renderHistFilters();
  var dp = ge('hdatepills');
  if (dp) {
    var pills = dp.querySelectorAll('.pill');
    for (var i = 0; i < pills.length; i++) {
      pills[i].className = pills[i].getAttribute('data-hd') === S.hd ? 'pill on' : 'pill';
    }
  }
  var list = getHistFiltered();
  if (ge('hcnt')) ge('hcnt').textContent = list.length.toLocaleString() + '건';
  var wrap = ge('hlist');
  wrap.innerHTML = list.length
    ? list.map(function(h, idx){
        return '<div class="row" data-hidx="'+idx+'">'
              +'<span class="htag '+(h.type==='입고'?'hin':'hout')+'">'+h.type+'</span>'
              +'<div class="rb"><div class="rt">'+esc(h.name)+'</div>'
              +'<div class="rs">'+esc([h.date, h.emp?'👤 '+h.emp:''].filter(Boolean).join(' · '))+'</div></div>'
              +'<div style="text-align:right">'
                +'<div style="font-family:var(--mono);font-weight:700;color:'+(h.type==='입고'?'var(--green)':'var(--red)')+'">'
                  +(h.type==='입고'?'+':'-')+h.qty+'</div>'
                +'<div style="font-size:10px;color:var(--muted2)">→'+h.stockAfter+'</div>'
              +'</div>'
              +'</div>';
      }).join('')
    : '<div class="empty">📭 내역 없음</div>';

  wrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== wrap && t.dataset.hidx === undefined) t = t.parentNode;
    if (t && t.dataset.hidx !== undefined) showHistDetail(list[parseInt(t.dataset.hidx)], parseInt(t.dataset.hidx));
  };
}

function showHistDetail(h, hidx) {
  if (!h) return;
  var realIdx = -1;
  var filtered = getHistFiltered();
  if (hidx !== undefined && filtered[hidx]) {
    var fh = filtered[hidx];
    // code+name+qty로 먼저 찾고, 없으면 date+name+qty로 폴백
    for (var i = 0; i < DB.history.length; i++) {
      var hi = DB.history[i];
      if (fh.code && hi.code === fh.code && hi.name === fh.name && hi.qty === fh.qty && hi.date === fh.date) {
        realIdx = i; break;
      }
    }
    if (realIdx < 0) {
      for (var i = 0; i < DB.history.length; i++) {
        var hi = DB.history[i];
        if (hi.name === fh.name && hi.qty === fh.qty && hi.stockAfter === fh.stockAfter) {
          realIdx = i; break;
        }
      }
    }
  }
  var dateLabel = h.date + (h.dateEdited ? ' <span style="font-size:10px;color:var(--yellow)">(수정됨)</span>' : '');
  ge('det-body').innerHTML =
    '<div style="padding:0 20px"><div style="font-size:18px;font-weight:900;margin-bottom:14px">'+esc(h.name)+'</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:16px">'
      +'<span class="htag '+(h.type==='입고'?'hin':'hout')+'" style="font-size:12px;padding:4px 10px">'+h.type+'</span>'
      +'<span style="font-family:var(--mono);font-size:22px;font-weight:900;color:'+(h.type==='입고'?'var(--green)':'var(--red)')+'">'
        +(h.type==='입고'?'+':'-')+h.qty+'개</span>'
    +'</div>'
    +'<div class="card" style="padding:4px 14px;margin-bottom:14px">'
      +'<div class="dr"><span class="dl">일시</span><span class="dv" style="font-size:12px">'+dateLabel+'</span></div>'
      +(h.emp ? '<div class="dr"><span class="dl">담당자</span><span class="dv">👤 '+esc(h.emp)+'</span></div>' : '')
      +'<div class="dr"><span class="dl">처리 후</span><span class="dv" style="font-family:var(--mono);font-weight:700">'+h.stockAfter+'개</span></div>'
      +(h.code ? '<div class="dr"><span class="dl">코드</span><span class="dv" style="font-family:var(--mono);color:var(--muted2)">'+esc(h.code)+'</span></div>' : '')
    +'</div>'
    +(realIdx >= 0 ?
      '<div class="slbl">📅 일시</div>'
      +'<div class="fg"><input class="fc" type="text" id="hdate-edit" placeholder="예) 2026. 3. 20. 오후 4:10:00" value="'+esc(h.date)+'"></div>'
      : '')
    +'<div class="slbl">📝 메모</div>'
    +'<div class="fg"><textarea class="fc" id="hnote-edit" rows="3" style="resize:none;font-size:14px">'+esc(h.note||'')+'</textarea></div>'
    +(realIdx >= 0 ? '<button class="btn bb" id="hnote-save" data-ridx="'+realIdx+'" data-origdate="'+esc(h.date)+'">💾 저장</button>' : '');

  if (realIdx >= 0) {
    ge('hnote-save').addEventListener('click', function(){
      var idx      = parseInt(this.dataset.ridx);
      var origDate = this.dataset.origdate;
      var newDate  = ge('hdate-edit').value.trim();
      var note     = ge('hnote-edit').value.trim();
      // 일시가 실제로 바뀐 경우에만 dateEdited 마킹
      if (newDate && newDate !== origDate) {
        DB.history[idx].date       = newDate;
        DB.history[idx].dateEdited = true;
      }
      DB.history[idx].note = note;
      saveDB(); toast('저장됨'); cSheet('s-det'); rHist();
    });
  }
  oSheet('s-det');
}

function setHF(v, el) {
  S.hf = v;
  var pills = ge('hpills').querySelectorAll('.pill');
  for (var i = 0; i < pills.length; i++) pills[i].className = 'pill';
  el.className = 'pill on';
  rHist();
}
function setHD(v, el) {
  S.hd = v;
  var pills = ge('hdatepills').querySelectorAll('.pill');
  for (var i = 0; i < pills.length; i++) pills[i].className = 'pill';
  el.className = 'pill on';
  rHist();
}



// ── 관리자 탭 ─────────────────────────────────────────────────────
function rAdm() {
  ge('alock').style.display  = S.admin ? 'none' : '';
  ge('apanel').style.display = S.admin ? '' : 'none';
  if (S.admin) { setATab('emp'); rEL(); rAP(); rBOM(); rShip(); } else { S.pin = ''; updDots(); }
}
function pNum(n) {
  if (S.pin.length >= 4) return;
  S.pin += n;
  updDots();
  if (S.pin.length === 4) setTimeout(chkPin, 80);
}
function pDel() { S.pin = S.pin.slice(0, -1); updDots(); }
function updDots() {
  for (var i = 0; i < 4; i++) ge('d'+i).className = 'dot' + (i < S.pin.length ? ' don' : '');
}
function chkPin() {
  if (S.pin === DB.adminPw) {
    S.admin = true; ge('scroll').scrollTop = 0; rAdm(); toast('관리자 인증 완료');
  } else {
    var dots = document.querySelectorAll('.dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.add('derr');
      (function(d){ setTimeout(function(){ d.classList.remove('derr'); }, 400); })(dots[i]);
    }
    toast('비밀번호 오류','err'); S.pin = ''; setTimeout(updDots, 420);
  }
}
function lockAdm() { S.admin = false; ge('scroll').scrollTop = 0; rAdm(); toast('잠금됨','warn'); }
function setATab(t) {
  var tabs = document.querySelectorAll('.atab');
  for (var i = 0; i < tabs.length; i++) tabs[i].className = 'atab';
  var at = document.querySelector('.atab[data-t="'+t+'"]');
  if (at) at.className = 'atab on';
  ['emp','prod','bom','ship','cfg'].forEach(function(s){ ge('at-'+s).style.display = s === t ? '' : 'none'; });
}

function rEL() {
  var sm   = S.sortMode;
  var wrap = ge('emplist');
  wrap.innerHTML = DB.employees.map(function(emp){
    return '<div class="row" data-eid="'+esc(emp.id)+'">'
          +(sm ? '<div class="drag-h" data-eid="'+esc(emp.id)+'">☰</div>' : '')
          +'<div class="eav sm" style="background:'+empColor(emp)+'">'+esc(emp.name.slice(1))+'</div>'
          +'<div class="rb"><div class="rt">'+esc(emp.name)+'</div><div class="rs">'+esc(emp.role)+'</div></div>'
          +(!sm ? '<div style="display:flex;gap:6px">'
            +'<button class="ibtn" data-eid="'+esc(emp.id)+'" data-act="edit">✏️</button>'
            +'<button class="ibtn del" data-eid="'+esc(emp.id)+'" data-act="del">🗑</button>'
            +'</div>' : '')
          +'</div>';
  }).join('') || '<div class="empty">👥 직원 없음</div>';

  wrap.onclick = function(ev){
    var t = ev.target;
    while (t && t !== wrap && !t.dataset.act && !t.dataset.eid) t = t.parentNode;
    if (!t || t === wrap) return;
    var eid = t.dataset.eid;
    if (!eid) return;
    if (t.dataset.act === 'edit') openEditEmp(eid);
    else if (t.dataset.act === 'del') delEmp(eid);
  };
  wrap.onpointerdown = sm ? function(ev){
    var t = ev.target;
    while (t && t !== wrap && !t.classList.contains('drag-h')) t = t.parentNode;
    if (t && t.classList && t.classList.contains('drag-h')) dragStart(ev, t.dataset.eid);
  } : null;
}

function rAP() {
  var kw = (ge('apsrch') || {value:''}).value || '';

  // ft 필터 pills
  var ftWrap = ge('ap-ft');
  if (ftWrap) {
    var ftEntries = [['','전체'],['ft:원자재','원자재'],['pt:조립/출하','조립'],['pt:진공파트','진공'],
                     ['pt:고압파트','고압'],['pt:튜닝파트','튜닝'],['ft:발생부자재','발생부'],
                     ['ft:완제품','완제품'],['ft:데모/테스트장비','데모']];
    ftWrap.innerHTML = ftEntries.map(function(e){
      return '<div class="pill'+(S.apft===e[0]?' on':'')+'" data-apft="'+esc(e[0])+'">'+esc(e[1])+'</div>';
    }).join('');
    ftWrap.onclick = function(ev){
      var t = ev.target;
      while (t && t !== ftWrap && t.dataset.apft === undefined) t = t.parentNode;
      if (t && t !== ftWrap) { S.apft = t.dataset.apft; S.apmd = ''; rAP(); }
    };
  }

  // md 필터 pills (Ass'y 포함)
  var mdWrap = ge('ap-md');
  if (mdWrap) {
    var pool = S.apft ? DB.products.filter(function(p){ return matchFt(p, S.apft); }) : DB.products;
    var mods = getMods(pool);
    var h = '<div class="pill'+(S.apmd===''?' on':'')+'" data-apmd="">전체</div>';
    h += '<div class="pill'+(S.appassy?' on':'')+'" data-appassy="1">Ass&#39;y</div>';
    mods.forEach(function(m){
      h += '<div class="pill'+(S.apmd===m?' on':'')+'" data-apmd="'+esc(m)+'">'+esc(m)+'</div>';
    });
    mdWrap.innerHTML = h;
    mdWrap.onclick = function(ev){
      var t = ev.target;
      while (t && t !== mdWrap && t.dataset.apmd === undefined && !t.dataset.appassy) t = t.parentNode;
      if (!t || t === mdWrap) return;
      if (t.dataset.appassy) { S.appassy = !S.appassy; rAP(); return; }
      S.apmd = t.dataset.apmd; rAP();
    };
  }

  var filtered = DB.products.filter(function(p){
    return (!kw || qMatch(p, kw))
      && matchFt(p, S.apft)
      && (!S.apmd || (p.model||'').indexOf(S.apmd) >= 0)
      && (!S.appassy || (p.itemType||'').toUpperCase().indexOf('ASS') >= 0);
  }).slice(0, 100);

  ge('aplist').innerHTML = filtered.map(function(p){
    return '<div class="row">'
          +'<div class="rb"><div class="rt">'+esc(p.name)+'</div><div class="rs">'+esc(p.id)+' · '+esc(p.model||'-')+' · '+p.stock+'개</div></div>'
          +'<div style="display:flex;gap:5px;flex-shrink:0">'+bdg(p.fileType)
          +'<button class="ibtn" data-id="'+esc(p.id)+'" data-act="edit">✏️</button>'
          +'<button class="ibtn del" data-id="'+esc(p.id)+'" data-act="del">🗑</button>'
          +'</div></div>';
  }).join('');
  ge('aplist').onclick = function(ev){
    var t = ev.target;
    while (t && t !== ge('aplist') && !t.dataset.act) t = t.parentNode;
    if (!t || !t.dataset.act) return;
    if (t.dataset.act === 'edit') openEditProd(t.dataset.id);
    else if (t.dataset.act === 'del') delProd(t.dataset.id);
  };
}


function openEditProd(id) {
  var p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === id) { p = DB.products[i]; break; }
  if (!p) return;
  S.editProd = id;
  ge('pstitle').textContent = '상품 수정';
  ge('pscode').value = p.id; ge('pscode').disabled = true;
  ge('psname').value = p.name||'';
  ge('psft').value   = p.fileType||'원자재';
  ge('psmod').value  = p.model||'';
  ge('psity').value  = p.itemType||'';
  ge('pssup').value  = p.supplier||'';
  ge('psstock').value = p.stock;
  ge('psmin').value  = p.minStock||0;
  ge('psbar').value  = p.barcode||'';
  oSheet('s-prod');
}
function openNewProd() {
  S.editProd = null;
  ge('pstitle').textContent = '상품 추가';
  ['pscode','psname','psmod','psity','pssup','psbar'].forEach(function(id){ ge(id).value = ''; ge(id).disabled = false; });
  ge('psstock').value = '0'; ge('psmin').value = '0';
  oSheet('s-prod');
}
function saveProd() {
  var code = ge('pscode').value.trim(), name = ge('psname').value.trim();
  if (!code || !name) { toast('코드와 이름은 필수','err'); return; }
  if (!S.editProd) {
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === code) { toast('코드 중복','err'); return; }
    DB.products.push({
      id:ge('pscode').value.trim(), name:name, fileType:ge('psft').value, part:'',
      itemType:ge('psity').value.trim(), model:ge('psmod').value.trim(),
      supplier:ge('pssup').value.trim(), spec:'',
      stock:parseInt(ge('psstock').value)||0, minStock:parseInt(ge('psmin').value)||0,
      barcode:ge('psbar').value.trim(), monthIn:0, monthOut:0
    });
    toast('"'+name+'" 추가됨');
  } else {
    var p = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === S.editProd) { p = DB.products[i]; break; }
    if (p) {
      p.name=name; p.fileType=ge('psft').value; p.itemType=ge('psity').value.trim();
      p.model=ge('psmod').value.trim(); p.supplier=ge('pssup').value.trim();
      p.stock=parseInt(ge('psstock').value)||0; p.minStock=parseInt(ge('psmin').value)||0;
      p.barcode=ge('psbar').value.trim();
    }
    toast('"'+name+'" 수정됨');
  }
  saveDB(); cSheet('s-prod'); rProd(); rAP();
}
function delProd(id) {
  var p = null;
  for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === id) { p = DB.products[i]; break; }
  if (!p || !confirm('"'+p.name+'" 삭제?')) return;
  DB.products = DB.products.filter(function(x){ return x.id !== id; });
  saveDB(); rProd(); rAP(); toast('"'+p.name+'" 삭제됨','warn');
}
function editAndClose(id) { openEditProd(id); cSheet('s-det'); }
function delAndClose(id)  { delProd(id);       cSheet('s-det'); }

function openEditEmp(id) {
  var emp = null;
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === id) { emp = DB.employees[i]; break; }
  if (!emp) return;
  S.editEmp = id;
  ge('estitle').textContent = '직원 수정';
  ge('esname').value = emp.name;
  ge('esrole').value = emp.role;
  ge('eslv').value   = emp.level||'staff';
  ge('esph').value   = emp.phone||'';
  oSheet('s-emp');
}
function openNewEmp() {
  S.editEmp = null;
  ge('estitle').textContent = '직원 추가';
  ['esname','esrole','esph'].forEach(function(id){ ge(id).value = ''; });
  ge('eslv').value = 'staff';
  oSheet('s-emp');
}
function saveEmp() {
  var name = ge('esname').value.trim(), role = ge('esrole').value.trim();
  if (!name || !role) { toast('이름과 직책 필수','err'); return; }
  if (!S.editEmp) {
    DB.employees.push({id:'E'+Date.now(), name:name, role:role, level:ge('eslv').value, phone:ge('esph').value.trim(), category:role.split('/')[0].trim()||'기타'});
  } else {
    var emp = null;
    for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === S.editEmp) { emp = DB.employees[i]; break; }
    if (emp) { emp.name=name; emp.role=role; emp.level=ge('eslv').value; emp.phone=ge('esph').value.trim(); }
  }
  saveDB(); cSheet('s-emp'); rEL(); toast('"'+name+'" 저장됨');
}
function delEmp(id) {
  var emp = null;
  for (var i = 0; i < DB.employees.length; i++) if (DB.employees[i].id === id) { emp = DB.employees[i]; break; }
  if (!emp || !confirm('"'+emp.name+'" 삭제?')) return;
  DB.employees = DB.employees.filter(function(x){ return x.id !== id; });
  saveDB(); rEL(); toast('"'+emp.name+'" 삭제됨','warn');
}
function chPw() {
  var cur=ge('pwc').value, nw=ge('pwn').value, nc=ge('pwk').value;
  if (cur !== DB.adminPw)       { toast('현재 비밀번호 오류','err'); return; }
  if (!/^\d{4}$/.test(nw))     { toast('4자리 숫자만 가능','err'); return; }
  if (nw !== nc)                { toast('새 비밀번호 불일치','err'); return; }
  DB.adminPw = nw; saveDB();
  ['pwc','pwn','pwk'].forEach(function(id){ ge(id).value = ''; });
  toast('비밀번호 변경됨');
}

// ── BOM 관리 ──────────────────────────────────────────────────────
var _bomQtyCache = {}; // 검색결과 수량 임시 저장
function rBOM() {
  var kw = (ge('bomsrch') || {value:''}).value.trim();
  var assys = DB.products.filter(function(p){
    return ((p.itemType||'').toUpperCase().indexOf('ASS') >= 0 || p.fileType === '완제품')
      && (!kw || p.name.toLowerCase().indexOf(kw.toLowerCase()) >= 0);
  });
  var wrap = ge('bomlist');
  if (!wrap) return;
  if (!assys.length) { wrap.innerHTML = '<div class="empty">Ass&#39;y 품목 없음</div>'; return; }
  wrap.innerHTML = assys.map(function(p){
    var bom = DB.bom[p.id] || [];
    return '<div class="row" style="flex-direction:column;align-items:stretch;gap:8px" data-bomid="'+esc(p.id)+'">'
      +'<div style="display:flex;align-items:center;gap:8px;cursor:pointer" data-bomtoggle="'+esc(p.id)+'">'
        +'<div class="rb" style="flex:1"><div class="rt">'+esc(p.name)+'</div>'
        +'<div class="rs">'+esc(p.model||'')+'</div></div>'
        +'<span class="bom-cnt" style="font-size:11px;color:var(--muted2)">구성품 '+bom.length+'개</span>'
        +'<span style="font-size:13px;color:var(--muted2)">▶</span>'
      +'</div>'
      +'<div id="bom-detail-'+esc(p.id)+'" style="display:none;padding:0 4px">'
        +renderBOMDetail(p.id)
      +'</div>'
      +'</div>';
  }).join('');
  wrap.onclick = function(ev) {
    var t = ev.target;
    while (t && t !== wrap) {
      if (t.dataset.bomtoggle) { toggleBOMDetail(t.dataset.bomtoggle); return; }
      if (t.dataset.bomdeladd && t.dataset.bomassy) { bomAddItem(t.dataset.bomassy, t.dataset.bomdeladd, parseInt(t.dataset.bomqty)||0); return; }
      if (t.dataset.bomdel)    { bomDelItem(t.dataset.assyid, t.dataset.bomdel); return; }
      t = t.parentNode;
    }
  };
}

function renderBOMDetail(assyId) {
  var bom  = DB.bom[assyId] || [];
  var rows = bom.map(function(item) {
    var p = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { p = DB.products[i]; break; }
    return '<div class="dr" style="gap:8px">'
      +'<span class="dl" style="flex:1">'+esc(p ? p.name : item.id)+'</span>'
      +'<span style="font-family:var(--mono);font-size:13px;color:var(--muted2)">×'+item.qty+'</span>'
      +'<button class="ibtn del" data-assyid="'+esc(assyId)+'" data-bomdel="'+esc(item.id)+'">🗑</button>'
      +'</div>';
  }).join('');
  var empty = bom.length ? '' : '<div style="font-size:12px;color:var(--muted2);padding:6px 0">구성품 없음</div>';
  return '<div class="card" style="padding:4px 14px;margin-bottom:8px">'+( rows || empty )+'</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:8px">'
      +'<div class="sbox" style="flex:1;margin-bottom:0"><span>🔍</span>'
        +'<input id="bom-srch-'+esc(assyId)+'" placeholder="구성품 검색" data-bsid="'+esc(assyId)+'" class="bom-srch-input" autocomplete="off"></div>'
    +'</div>'
    +'<div id="bom-srch-result-'+esc(assyId)+'"></div>';
}

function toggleBOMDetail(assyId) {
  var el = ge('bom-detail-'+assyId);
  if (!el) return;
  var isOpen = el.style.display !== 'none';
  // 다른 모두 닫기
  var all = document.querySelectorAll('[id^="bom-detail-"]');
  for (var i = 0; i < all.length; i++) all[i].style.display = 'none';
  if (!isOpen) {
    el.style.display = '';
    // input 이벤트 바인딩
    var inp = el.querySelector('.bom-srch-input');
    if (inp) inp.oninput = function(){ bomSearch(this.dataset.bsid); };
  }
}

function bomSearch(assyId) {
  var kw = (ge('bom-srch-'+assyId) || {value:''}).value.trim();
  var wrap = ge('bom-srch-result-'+assyId);
  if (!wrap) return;
  if (!kw) { wrap.innerHTML = ''; return; }
  var bom = DB.bom[assyId] || [];
  var existing = {};
  bom.forEach(function(b){ existing[b.id] = 1; });
  var list = DB.products.filter(function(p){
    return !existing[p.id] && qMatch(p, kw);
  }).slice(0, 10);
  wrap.innerHTML = list.length
    ? list.map(function(p){
        return '<div class="row" style="padding:8px 10px">'
          +'<div class="rb"><div class="rt" style="font-size:13px">'+esc(p.name)+'</div>'
          +'<div class="rs">'+esc(p.model||'')+'</div></div>'
          +'<div style="display:flex;align-items:center;gap:4px">'
            +'<button class="qbtn qm" style="width:30px;height:30px;font-size:14px" data-bqm="'+esc(assyId)+'__'+esc(p.id)+'">−</button>'
            +'<input id="bom-qty-'+esc(assyId)+'__'+esc(p.id)+'" type="number" min="1" '
              +'value="'+(_bomQtyCache[assyId+'__'+p.id]||1)+'" '
              +'style="width:44px;background:var(--s3);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:4px;font-size:16px;font-weight:700;text-align:center">'
            +'<button class="qbtn qp" style="width:30px;height:30px;font-size:14px" data-bqp="'+esc(assyId)+'__'+esc(p.id)+'">＋</button>'
            +'<button class="ibtn" style="margin-left:4px" data-bomdeladd="'+esc(p.id)+'" data-bomassy="'+esc(assyId)+'" data-bomqty="1">추가</button>'
          +'</div>'
          +'</div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--muted2);padding:6px 10px">결과 없음</div>';
  wrap.onclick = function(ev) {
    var t = ev.target;
    while (t && t !== wrap) {
      if (t.dataset.bomdeladd && t.dataset.bomassy) { bomAddItem(t.dataset.bomassy, t.dataset.bomdeladd, parseInt(t.dataset.bomqty)||0); return; }
      if (t.dataset.bqm) {
        var inp = ge('bom-qty-'+t.dataset.bqm);
        if (inp) {
          inp.value = Math.max(1, (parseInt(inp.value)||1) - 1);
          _bomQtyCache[t.dataset.bqm] = parseInt(inp.value);
          var addBtn = t.parentNode.querySelector('[data-bomdeladd]');
          if (addBtn) addBtn.dataset.bomqty = inp.value;
        }
        return;
      }
      if (t.dataset.bqp) {
        var inp = ge('bom-qty-'+t.dataset.bqp);
        if (inp) {
          inp.value = (parseInt(inp.value)||1) + 1;
          _bomQtyCache[t.dataset.bqp] = parseInt(inp.value);
          var addBtn = t.parentNode.querySelector('[data-bomdeladd]');
          if (addBtn) addBtn.dataset.bomqty = inp.value;
        }
        return;
      }
      t = t.parentNode;
    }
  };
}

function bomAddItem(assyId, prodId, passedQty) {
  if (!assyId || !prodId) return;
  var qtyEl = ge('bom-qty-'+assyId+'__'+prodId);
  // 버튼에서 전달된 qty > 캐시 > input > 1 순서로 우선
  var qty = (passedQty && passedQty > 0) ? passedQty
          : (_bomQtyCache[assyId+'__'+prodId] || (qtyEl ? (parseInt(qtyEl.value) || 1) : 1));
  if (!DB.bom[assyId]) DB.bom[assyId] = [];
  // 이미 있으면 수량 업데이트
  var found = false;
  for (var i = 0; i < DB.bom[assyId].length; i++) {
    if (DB.bom[assyId][i].id === prodId) { DB.bom[assyId][i].qty = qty; found = true; break; }
  }
  if (!found) DB.bom[assyId].push({id: prodId, qty: qty});
  delete _bomQtyCache[assyId+'__'+prodId];
  saveDB();
  refreshBOMDetail(assyId);
  toast('구성품 추가됨');
}

function bomDelItem(assyId, prodId) {
  if (!DB.bom[assyId]) return;
  DB.bom[assyId] = DB.bom[assyId].filter(function(b){ return b.id !== prodId; });
  saveDB();
  refreshBOMDetail(assyId);
  toast('구성품 삭제됨', 'warn');
}

// 버그1+3 해결: 디테일 갱신 + 구성품 수 텍스트 갱신 + input 바인딩 복원
function refreshBOMDetail(assyId) {
  // 디테일 패널 갱신
  var detail = ge('bom-detail-'+assyId);
  if (detail) {
    detail.innerHTML = renderBOMDetail(assyId);
    // 버그3 해결: input 바인딩 복원
    var inp = detail.querySelector('.bom-srch-input');
    if (inp) inp.oninput = function(){ bomSearch(this.dataset.bsid); };
  }
  // 버그1 해결: 구성품 N개 텍스트 갱신
  var bom = DB.bom[assyId] || [];
  var cntEl = document.querySelector('[data-bomid="'+assyId+'"] .bom-cnt');
  if (cntEl) cntEl.textContent = '구성품 '+bom.length+'개';
}



// ── 출하묶음 관리 ────────────────────────────────────────────────
// DB.shipPkgs = [{id, name, items:[{id,qty}]}, ...]

function rShip() {
  var wrap = ge('shiplist');
  if (!wrap) return;
  var pkgs = DB.shipPkgs || [];
  var html = pkgs.map(function(pkg) {
    return '<div class="row" style="flex-direction:column;align-items:stretch;gap:8px">'
      +'<div style="display:flex;align-items:center;gap:8px;cursor:pointer" data-shiptoggle="'+esc(pkg.id)+'">'
        +'<div class="rb" style="flex:1"><div class="rt">'+esc(pkg.name)+'</div>'
        +'<div class="rs">구성품 '+pkg.items.length+'종</div></div>'
        +'<button class="ibtn del" data-shipdelpkg="'+esc(pkg.id)+'">🗑</button>'
        +'<span style="font-size:13px;color:var(--muted2)">▶</span>'
      +'</div>'
      +'<div id="spkg-'+esc(pkg.id)+'" style="display:none;padding:0 4px">'
        +renderShipPkg(pkg.id)
      +'</div>'
      +'</div>';
  }).join('');
  wrap.innerHTML = html || '<div class="empty">출하묶음 없음</div>';
  wrap.onclick = function(ev) {
    var t = ev.target;
    while (t && t !== wrap) {
      if (t.dataset.shiptoggle)  { toggleShipPkg(t.dataset.shiptoggle); return; }
      if (t.dataset.shipdelpkg)  { shipDelPkg(t.dataset.shipdelpkg); return; }
      if (t.dataset.shipadditem && t.dataset.shippkgid) {
        shipAddItem(t.dataset.shippkgid, t.dataset.shipadditem, parseInt(t.dataset.shipqty)||1); return;
      }
      if (t.dataset.shipdelitem) { shipDelItem(t.dataset.shippkgid2, t.dataset.shipdelitem); return; }
      if (t.dataset.sqm) {
        var inp = ge('sq-'+t.dataset.sqm);
        if (inp) { inp.value = Math.max(1,(parseInt(inp.value)||1)-1); var ab=t.parentNode.querySelector('[data-shipadditem]'); if(ab) ab.dataset.shipqty=inp.value; } return;
      }
      if (t.dataset.sqp) {
        var inp = ge('sq-'+t.dataset.sqp);
        if (inp) { inp.value=(parseInt(inp.value)||1)+1; var ab=t.parentNode.querySelector('[data-shipadditem]'); if(ab) ab.dataset.shipqty=inp.value; } return;
      }
      t = t.parentNode;
    }
  };
}

function renderShipPkg(pkgId) {
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  if (!pkg) return '';
  var rows = pkg.items.map(function(item) {
    var p = null;
    for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === item.id) { p = DB.products[i]; break; }
    return '<div class="dr" style="gap:8px;align-items:center">'
      +'<span class="dl" style="flex:1">'+esc(p ? p.name : item.id)+'</span>'
      +'<span style="font-family:var(--mono);font-size:12px;color:var(--muted2)">×'+item.qty+'</span>'
      +'<button class="ibtn del" data-shippkgid2="'+esc(pkgId)+'" data-shipdelitem="'+esc(item.id)+'">🗑</button>'
      +'</div>';
  }).join('');
  var empty = pkg.items.length ? '' : '<div style="font-size:12px;color:var(--muted2);padding:6px 0">구성품 없음</div>';
  return '<div class="card" style="padding:4px 14px;margin-bottom:8px">'+(rows||empty)+'</div>'
    +'<div class="sbox" style="margin-bottom:6px"><span>🔍</span>'
    +'<input id="ssrch-'+esc(pkgId)+'" placeholder="품목 검색" data-spid="'+esc(pkgId)+'" class="spkg-srch"></div>'
    +'<div id="ssres-'+esc(pkgId)+'"></div>';
}

function toggleShipPkg(pkgId) {
  var el = ge('spkg-'+pkgId);
  if (!el) return;
  var isOpen = el.style.display !== 'none';
  var all = document.querySelectorAll('[id^="spkg-"]');
  for (var i = 0; i < all.length; i++) all[i].style.display = 'none';
  if (!isOpen) {
    el.style.display = '';
    var inp = el.querySelector('.spkg-srch');
    if (inp) inp.oninput = function(){ shipItemSearch(this.dataset.spid); };
  }
}

function shipItemSearch(pkgId) {
  var kw = (ge('ssrch-'+pkgId) || {value:''}).value.trim();
  var wrap = ge('ssres-'+pkgId);
  if (!wrap) return;
  if (!kw) { wrap.innerHTML = ''; return; }
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  var existing = {};
  if (pkg) pkg.items.forEach(function(b){ existing[b.id] = 1; });
  var list = DB.products.filter(function(p){ return !existing[p.id] && qMatch(p, kw); }).slice(0, 10);
  wrap.innerHTML = list.length
    ? list.map(function(p){
        var key = pkgId+'__'+p.id;
        return '<div class="row" style="padding:8px 10px">'
          +'<div class="rb" style="flex:1"><div class="rt" style="font-size:13px">'+esc(p.name)+'</div>'
          +'<div class="rs">재고 '+p.stock+'개</div></div>'
          +'<div style="display:flex;align-items:center;gap:4px">'
            +'<button class="qbtn qm" style="width:28px;height:28px;font-size:14px" data-sqm="'+esc(key)+'">−</button>'
            +'<input id="sq-'+esc(key)+'" type="number" min="1" value="1" style="width:44px;background:var(--s3);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:4px;font-size:16px;font-weight:700;text-align:center">'
            +'<button class="qbtn qp" style="width:28px;height:28px;font-size:14px" data-sqp="'+esc(key)+'">＋</button>'
            +'<button class="ibtn" style="margin-left:4px" data-shipadditem="'+esc(p.id)+'" data-shippkgid="'+esc(pkgId)+'" data-shipqty="1">추가</button>'
          +'</div>'
          +'</div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--muted2);padding:6px 10px">결과 없음</div>';
}

function refreshShipPkg(pkgId) {
  var el = ge('spkg-'+pkgId);
  if (el) {
    el.innerHTML = renderShipPkg(pkgId);
    var inp = el.querySelector('.spkg-srch');
    if (inp) inp.oninput = function(){ shipItemSearch(this.dataset.spid); };
  }
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  // 목록의 구성품 수 텍스트 갱신
  rShip();
}

function shipAddItem(pkgId, itemId, qty) {
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  if (!pkg) return;
  qty = qty || 1;
  var found = false;
  for (var i = 0; i < pkg.items.length; i++) {
    if (pkg.items[i].id === itemId) { pkg.items[i].qty = qty; found = true; break; }
  }
  if (!found) pkg.items.push({id: itemId, qty: qty});
  saveDB(); refreshShipPkg(pkgId);
  // 검색창 유지 위해 detail 다시 열기
  var el = ge('spkg-'+pkgId);
  if (el) {
    el.style.display = '';
    var inp = el.querySelector('.spkg-srch');
    if (inp) inp.oninput = function(){ shipItemSearch(this.dataset.spid); };
  }
  toast('추가됨');
}

function shipDelItem(pkgId, itemId) {
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  if (!pkg) return;
  pkg.items = pkg.items.filter(function(b){ return b.id !== itemId; });
  saveDB(); refreshShipPkg(pkgId); toast('삭제됨', 'warn');
}

function shipDelPkg(pkgId) {
  var pkg = null;
  for (var i = 0; i < DB.shipPkgs.length; i++) if (DB.shipPkgs[i].id === pkgId) { pkg = DB.shipPkgs[i]; break; }
  if (!pkg || !confirm('"'+pkg.name+'" 삭제?')) return;
  DB.shipPkgs = DB.shipPkgs.filter(function(p){ return p.id !== pkgId; });
  saveDB(); rShip(); toast('"'+pkg.name+'" 삭제됨', 'warn');
}

function shipNewPkg() {
  var name = ge('ship-newname') ? ge('ship-newname').value.trim() : '';
  if (!name) { toast('묶음 이름을 입력하세요', 'err'); return; }
  var id = 'SP'+Date.now();
  if (!DB.shipPkgs) DB.shipPkgs = [];
  DB.shipPkgs.push({id: id, name: name, items: []});
  saveDB();
  ge('ship-newname').value = '';
  rShip();
  // 새로 만든 패키지 자동 펼치기
  setTimeout(function(){ toggleShipPkg(id); }, 50);
  toast('"'+name+'" 생성됨');
}


function resetAll() {
  if (!confirm('전체 초기화?')) return;
  var pw = DB.adminPw;
  DB = {employees:JSON.parse(JSON.stringify(INIT_DB.employees)), products:JSON.parse(JSON.stringify(INIT_DB.products)), history:[], adminPw:pw};
  saveDB(); rEL(); rAP(); toast('초기화됨','warn');
}
function toggleSort() {
  S.sortMode = !S.sortMode;
  ge('sort-btn').style.color  = S.sortMode ? 'var(--blue)' : 'var(--muted2)';
  ge('sort-hint').style.display = S.sortMode ? '' : 'none';
  rEL();
}

var dragState = {id:null, curIdx:0};
function dragStart(ev, eid) {
  ev.preventDefault();
  dragState.id     = eid;
  dragState.curIdx = DB.employees.findIndex(function(x){ return x.id === eid; });
  document.addEventListener('pointermove', dragMove);
  document.addEventListener('pointerup',   dragEnd);
}
function dragMove(ev) {
  if (!dragState.id) return;
  var wrap = ge('emplist'), rows = wrap.querySelectorAll('.row'), y = ev.clientY, ni = dragState.curIdx;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) { ni = i; break; }
    ni = i + 1;
  }
  ni = Math.max(0, Math.min(DB.employees.length - 1, ni));
  if (ni !== dragState.curIdx) {
    var e = DB.employees.splice(dragState.curIdx, 1)[0];
    DB.employees.splice(ni, 0, e);
    dragState.curIdx = ni;
    rEL();
  }
}
function dragEnd() {
  dragState.id = null;
  document.removeEventListener('pointermove', dragMove);
  document.removeEventListener('pointerup',   dragEnd);
  saveDB(); toast('순서 저장됨');
}

// ── QR 스캐너 ─────────────────────────────────────────────────────
var SSt = {stream:null, raf:null, found:null, qty:1};
function loadSc(src) {
  return new Promise(function(r){
    if (document.querySelector('script[src="'+src+'"]')) { r(); return; }
    var s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r;
    document.head.appendChild(s);
  });
}
function openScan() {
  ge('scanmod').style.display = 'flex';
  rScan(); setSt('로딩 중...');
  Promise.all([loadSc('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js')]).then(function(){
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}}).then(function(stream){
      SSt.stream = stream;
      var v = ge('scanvid');
      v.srcObject = stream;
      v.play().then(function(){ setSt('QR코드를 프레임에 맞춰주세요'); scanLoop(); });
    }).catch(function(){ setSt('카메라 오류'); });
  });
}
function scanLoop() {
  var v = ge('scanvid'), c = ge('scancan'), ctx = c.getContext('2d', {willReadFrequently:true});
  function tick() {
    if (!SSt.stream) return;
    if (v.readyState !== 4) { SSt.raf = requestAnimationFrame(tick); return; }
    var w = v.videoWidth, h = v.videoHeight, s = Math.min(w,h) * 0.7 | 0;
    c.width = s; c.height = s;
    ctx.drawImage(v, (w-s)/2, (h-s)/2, s, s, 0, 0, s, s);
    var img = ctx.getImageData(0, 0, s, s);
    if (window.jsQR) {
      var res = jsQR(img.data, s, s, {inversionAttempts:'dontInvert'});
      if (res) { onScan(res.data); return; }
    }
    SSt.raf = requestAnimationFrame(tick);
  }
  SSt.raf = requestAnimationFrame(tick);
}
function onScan(code) {
  if (SSt.found) return;
  cancelAnimationFrame(SSt.raf);
  var p = null;
  for (var i = 0; i < DB.products.length; i++) {
    if (DB.products[i].barcode === code || DB.products[i].id === code) { p = DB.products[i]; break; }
  }
  if (!p) { setSt('미등록: '+code); SSt.raf = requestAnimationFrame(function(){ scanLoop(); }); return; }
  SSt.found = p; SSt.qty = 1;
  if (navigator.vibrate) navigator.vibrate([50,20,50]);
  ge('scannm').textContent   = p.name;
  ge('scanmeta').textContent = p.id+' · '+p.stock+'개';
  ge('scanres').style.display = '';
  ge('scanqrow').style.display = '';
  ge('scanqty').textContent  = '1';
  ge('scancfm').style.display = '';
  ge('scancfm').textContent  = '확인 '+p.name+' 1개';
  ge('scanagn').style.display = '';
  setSt('수량 확인 후 처리');
}
function adjSQ(d) {
  SSt.qty = Math.max(1, SSt.qty + d);
  ge('scanqty').textContent = SSt.qty;
  if (SSt.found) ge('scancfm').textContent = '확인 '+SSt.found.name+' '+SSt.qty+'개';
}
function cfmScan() {
  if (!SSt.found) return;
  selProd(SSt.found.id);
  ge('ioqty').value = SSt.qty;
  ioPrev(); closeScan();
}
function reScan() { rScan(); setSt('프레임에 맞춰주세요'); scanLoop(); }
function rScan()  {
  SSt.found = null; SSt.qty = 1;
  ['scanres','scanqrow','scancfm','scanagn'].forEach(function(id){ ge(id).style.display = 'none'; });
}
function setSt(m) { ge('scanst').textContent = m; }
function closeScan() {
  cancelAnimationFrame(SSt.raf);
  if (SSt.stream) { SSt.stream.getTracks().forEach(function(t){ t.stop(); }); SSt.stream = null; }
  ge('scanmod').style.display = 'none';
  rScan();
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────────
function bindEvents() {
  // 탭 네비
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    (function(tab){ tab.addEventListener('click', function(){ go(tab.getAttribute('data-p')); }); })(tabs[i]);
  }

  // 창고 이동 유형
  ge('mvgrid').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('mvgrid') && !t.getAttribute('data-mv')) t = t.parentNode;
    if (t && t !== ge('mvgrid')) setMv(t.getAttribute('data-mv'));
  });

  // KPI 카드 클릭으로 재고 상태 필터
  ge('d-kpi').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('d-kpi') && t.dataset.ss === undefined) t = t.parentNode;
    if (t && t !== ge('d-kpi')) {
      S.pss = t.dataset.ss;
      rProd();
    }
  });

  // 내역 타입 필터
  ge('hpills').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('hpills') && !t.dataset.hf) t = t.parentNode;
    if (t && t !== ge('hpills') && t.dataset.hf) setHF(t.dataset.hf, t);
  });

  // 내역 날짜 필터
  ge('hdatepills').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('hdatepills') && !t.dataset.hd) t = t.parentNode;
    if (t && t !== ge('hdatepills') && t.dataset.hd) setHD(t.dataset.hd, t);
  });

  // 내역 직원/모델 필터는 renderHistFilters()가 rHist() 내에서 직접 처리
  // 수량 버튼 (창고)
  ge('qrow').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('qrow') && !t.dataset.d) t = t.parentNode;
    if (t && t.dataset.d) qStep(parseInt(t.dataset.d));
  });

  // 수량 버튼 (부서)
  ge('diocrow').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('diocrow') && !t.dataset.d) t = t.parentNode;
    if (t && t.dataset.d) dioQStep(parseInt(t.dataset.d));
  });

  // 창고 입출고 처리 버튼
  ge('io-btn').addEventListener('click', doIO);

  // 부서 입출고 처리 버튼
  ge('dio-btn-in').addEventListener('click',  function(){ doDIO('in');  });
  ge('dio-btn-out').addEventListener('click', function(){ doDIO('out'); });

  // 부서 선택 버튼
  ge('diodeptrow').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('diodeptrow') && !t.getAttribute('data-dept')) t = t.parentNode;
    if (t && t !== ge('diodeptrow')) {
      DIO.dept = t.getAttribute('data-dept'); DIO.md = ''; DIO.passy = false; rDIO();
    }
  });

  // 확인 팝업
  ge('cfm-cancel').addEventListener('click', function(){ cSheet('s-cfm'); });

  // 내역 이동 버튼들
  ge('hist-goto-btn').addEventListener('click',  function(){ go('hist'); });
  ge('hist-goto-btn2').addEventListener('click', function(){ go('hist'); });
  ge('hist-goto-btn3').addEventListener('click', function(){ go('hist'); });

  // 스캐너
  ge('scan-open-btn').addEventListener('click', openScan);
  ge('scan-cls-btn').addEventListener('click',  closeScan);
  ge('scancfm').addEventListener('click',  cfmScan);
  ge('scanagn').addEventListener('click',  reScan);
  ge('sq-minus').addEventListener('click', function(){ adjSQ(-1); });
  ge('sq-plus').addEventListener('click',  function(){ adjSQ(1);  });

  // 관리자 숫자패드
  ge('numpad').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('numpad') && !t.dataset.n) t = t.parentNode;
    if (t && t !== ge('numpad') && t.dataset.n) pNum(t.dataset.n);
  });
  ge('pdel-btn').addEventListener('click', pDel);

  // 관리자 탭
  ge('atabrow').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('atabrow') && !t.dataset.t) t = t.parentNode;
    if (t && t !== ge('atabrow') && t.dataset.t) setATab(t.dataset.t);
  });

  // 직원/상품 관리
  ge('new-emp-btn').addEventListener('click', openNewEmp);
  ge('sort-btn').addEventListener('click',    toggleSort);
  ge('new-prod-btn').addEventListener('click', openNewProd);
  ge('chpw-btn').addEventListener('click',    chPw);
  ge('reset-btn').addEventListener('click',   resetAll);
  ge('lock-btn').addEventListener('click',    lockAdm);
  ge('save-prod-btn').addEventListener('click', saveProd);
  ge('save-emp-btn').addEventListener('click',  saveEmp);

  // 시트 배경 닫기
  ge('sbg').addEventListener('click', function(ev){
    if (ev.target === ge('sbg')) cSheet(ge('sbg').dataset.s);
  });

  // 불일치 알림 닫기
  // BOM 검색 입력 이벤트
  var bomSrch = ge('bom-srch');


  ge('mismatch-bar').addEventListener('click', function(ev){
    if (ev.target.id === 'mismatch-close') ge('mismatch-bar').style.display = 'none';
  });

  // 상세 팝업 버튼
  ge('s-det').addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== ge('s-det') && !t.dataset.act) t = t.parentNode;
    if (!t || !t.dataset.act) return;
    if (t.dataset.act === 'eclose') editAndClose(t.dataset.id);
    else if (t.dataset.act === 'dclose') delAndClose(t.dataset.id);
  });
}

// ── 초기화 ────────────────────────────────────────────────────────
function enableMouseDrag(el) {
  var isDown = false, startX = 0, scrollLeft = 0;
  el.addEventListener('mousedown', function(e){
    isDown = true;
    el.style.cursor = 'grabbing';
    startX    = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    e.preventDefault();
  });
  el.addEventListener('mouseleave', function(){ isDown = false; el.style.cursor = ''; });
  el.addEventListener('mouseup',    function(){ isDown = false; el.style.cursor = ''; });
  el.addEventListener('mousemove',  function(e){
    if (!isDown) return;
    var x = e.pageX - el.offsetLeft;
    el.scrollLeft = scrollLeft - (x - startX);
  });
}

function initMouseDrag() {
  // .empsel 요소 전체에 마우스 드래그 스크롤 적용
  var els = document.querySelectorAll('.empsel');
  for (var i = 0; i < els.length; i++) enableMouseDrag(els[i]);
  // 동적으로 생성되는 empsel은 MutationObserver로 감지
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          if (node.classList && node.classList.contains('empsel')) enableMouseDrag(node);
          var children = node.querySelectorAll ? node.querySelectorAll('.empsel') : [];
          for (var i = 0; i < children.length; i++) enableMouseDrag(children[i]);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
  // iOS 사파리 pinch-zoom 차단 (user-scalable=no 무시하므로 JS로 직접 막음)
  document.addEventListener('gesturestart',  function(e){ e.preventDefault(); }, {passive:false});
  document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, {passive:false});
  document.addEventListener('gestureend',    function(e){ e.preventDefault(); }, {passive:false});
  document.addEventListener('touchmove', function(e){
    if (e.touches.length > 1) e.preventDefault();
  }, {passive:false});


  loadDB(); bindEvents(); initMouseDrag(); go('io');
}
init();
