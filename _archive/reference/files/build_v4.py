import json, re, subprocess, tempfile, os


HTML_BODY = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>재고관리</title>
<style>
:root{
  --bg:#080a10;--s1:#10121a;--s2:#181b26;--s3:#1f2333;
  --bd:rgba(255,255,255,.07);
  --blue:#4f8ef7;--green:#1fd17a;--red:#f25f5c;
  --yellow:#f4b942;--purple:#9b72f8;--cyan:#06b6d4;
  --text:#eef0f8;--muted:#5a5f75;--muted2:#8890aa;
  --mono:Menlo,'Courier New',monospace;
  --sat:env(safe-area-inset-top,44px);
  --sab:env(safe-area-inset-bottom,34px);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%;overflow:hidden;background:#000;color:var(--text);font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
#wrap{display:flex;flex-direction:column;height:100%;background:var(--bg)}#sbg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;align-items:flex-end}
#sbg.on{display:flex}
@media(min-width:431px){html,body{background:#000}body{display:flex;justify-content:center;align-items:stretch}#wrap{width:430px;max-width:430px;flex-shrink:0;position:relative;overflow:hidden;box-shadow:0 0 60px rgba(0,0,0,.8)}#sbg{position:absolute!important}}

#safe{height:var(--sat);background:var(--s1);flex-shrink:0}
#top{background:var(--s1);border-bottom:1px solid var(--bd);padding:10px 18px 12px;flex-shrink:0}
#top-sub{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted2);margin-bottom:3px}
#top-ttl{font-size:24px;font-weight:900}
#scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px}
#scroll::-webkit-scrollbar{display:none}
#io-bottom,#dio-bottom{padding:10px 14px 6px;background:var(--s1);border-top:1px solid var(--bd);flex-shrink:0}
#nav{height:calc(58px + var(--sab));background:var(--s1);border-top:1px solid var(--bd);display:flex;padding-top:6px;flex-shrink:0}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;border:none;background:none;cursor:pointer;padding:4px 2px}
.ti{font-size:20px}.tl{font-size:9px;font-weight:700;color:var(--muted)}.td{width:4px;height:4px;border-radius:50%;background:var(--blue);opacity:0}
.tab.on .tl{color:var(--blue)}.tab.on .td{opacity:1}
.pg{animation:fu .18s ease}@keyframes fu{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.pad{height:16px}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:14px;overflow:hidden;margin-bottom:12px}
.row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--bd);cursor:pointer;-webkit-user-select:none}
.row:last-child{border-bottom:none}.row:active{background:var(--s2)}
.row.col{flex-direction:column;align-items:stretch;gap:0}
.rb{flex:1;min-width:0}
.rt{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-user-select:text;user-select:text}
.rs{font-size:10px;color:var(--muted2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{text-align:center;padding:28px;color:var(--muted2);font-size:13px}
.esm{padding:10px 14px;font-size:12px;color:var(--muted2)}
.more{text-align:center;padding:14px;font-size:13px;font-weight:700;color:var(--blue);cursor:pointer}
.slbl{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);padding:4px 2px 6px}
.kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.kpi{background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:10px 8px;position:relative;overflow:hidden}
.kpi::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px}
.kb::after{background:var(--blue)}.kg::after{background:var(--green)}.ky::after{background:var(--yellow)}.kr::after{background:var(--red)}
.kl{font-size:8px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.kv{font-family:var(--mono);font-size:18px;font-weight:700}
.kb .kv{color:var(--blue)}.kg .kv{color:var(--green)}.ky .kv{color:var(--yellow)}.kr .kv{color:var(--red)}
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;white-space:nowrap}
.sok{background:rgba(31,209,122,.15);color:var(--green)}.slow{background:rgba(244,185,66,.15);color:var(--yellow)}.szero{background:rgba(242,95,92,.15);color:var(--red)}
.brm{background:rgba(79,142,247,.15);color:var(--blue)}.bas{background:rgba(31,209,122,.15);color:var(--green)}.bgp{background:rgba(244,185,66,.15);color:var(--yellow)}.bfg{background:rgba(155,114,248,.15);color:var(--purple)}.bdm{background:rgba(6,182,212,.15);color:var(--cyan)}
.pills{display:flex;gap:6px;margin-bottom:8px;overflow-x:auto;padding-bottom:2px}
.pills::-webkit-scrollbar{display:none}
.pill{padding:4px 11px;border-radius:99px;font-size:10px;font-weight:600;border:1px solid var(--bd);background:var(--s2);color:var(--muted2);white-space:nowrap;cursor:pointer;flex-shrink:0}
.pill.on{background:var(--blue);color:#fff;border-color:var(--blue)}
.sbox{background:var(--s2);border:1px solid var(--bd);border-radius:11px;display:flex;align-items:center;gap:8px;padding:0 12px;margin-bottom:10px}.sbox input{font-size:16px}
.sbox input{flex:1;background:none;border:none;outline:none;font-size:14px;color:var(--text);padding:10px 0}
.sbox input::placeholder{color:var(--muted)}
.rcnt{font-size:10px;color:var(--muted2);font-family:var(--mono);padding:2px 2px 6px}
.btn{width:100%;padding:13px;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:0;display:flex;align-items:center;justify-content:center;gap:6px;-webkit-appearance:none}
.btn:active{transform:scale(.97)}
.bf{background:var(--green);color:#000}.bb{background:var(--blue);color:#fff}.br{background:var(--red);color:#fff}.bp{background:var(--purple);color:#fff}.bg{background:rgba(242,95,92,.12);color:var(--red)}
.ptag{font-size:10px}.ptag.muted{color:var(--muted2)}.sep{color:var(--bd);margin:0 4px}
.mvgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.mvbtn{background:var(--s2);border:1.5px solid var(--bd);border-radius:14px;padding:12px 8px;cursor:pointer;text-align:center;-webkit-user-select:none}
.mvbtn.on{background:rgba(79,142,247,.12);border-color:var(--blue)}
.mvbtn.on .mvlbl{color:var(--blue)}
.mvico{font-size:22px;margin-bottom:4px;pointer-events:none}
.mvlbl{font-size:12px;font-weight:700;color:var(--text);pointer-events:none}
.flow{display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px 14px;margin-bottom:14px}
.fbox{background:var(--s3);border-radius:8px;padding:5px 12px;font-size:13px;font-weight:700;flex:1;text-align:center}
.farrow{font-size:20px;color:var(--blue);flex-shrink:0}
.fg{margin-bottom:12px}
.fl{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted2);margin-bottom:6px;display:block}
.fc{width:100%;background:var(--s2);border:1px solid var(--bd);border-radius:11px;padding:11px 13px;font-size:16px;color:var(--text);outline:none;-webkit-appearance:none}
.fc:focus{border-color:var(--blue)}
.qrow{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:7px}
.qbtn{padding:11px 0;border-radius:10px;border:none;font-family:var(--mono);font-size:14px;font-weight:700;cursor:pointer}
.qbtn:active{transform:scale(.9)}
.qm{background:rgba(242,95,92,.15);color:var(--red)}.qp{background:rgba(31,209,122,.12);color:var(--green)}
.pvbox{background:var(--s2);border:1px solid var(--bd);border-radius:11px;padding:12px 14px;margin-bottom:12px}
.empsel{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px}
.empsel::-webkit-scrollbar{display:none}
.echip{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;padding:2px 4px;-webkit-user-select:none}
.echip:active{transform:scale(.9)}
.eav{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;border:2.5px solid transparent}
.eav.sm{width:36px;height:36px;font-size:14px}
.echip.on .eav{border-color:var(--blue);box-shadow:0 0 0 3px rgba(79,142,247,.2)}.empsel.has-sel .echip:not(.on){opacity:.35;transition:opacity .2s}.empsel.flex-wrap{flex-wrap:wrap;overflow-x:visible;height:auto}
.enm{font-size:9px;font-weight:600;color:var(--muted2);max-width:48px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.echip.on .enm{color:var(--blue)}
.scanbtn{background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:10px;-webkit-user-select:none}
.scanico{width:44px;height:44px;background:rgba(79,142,247,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.htag{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;flex-shrink:0}
.hin{background:rgba(31,209,122,.15);color:var(--green)}.hout{background:rgba(242,95,92,.15);color:var(--red)}
.dr{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd)}
.dr:last-child{border-bottom:none}
.dl{font-size:11px;color:var(--muted2);font-weight:600;flex-shrink:0;width:64px}
.dv{font-size:13px;font-weight:600;text-align:right;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lockwrap{display:flex;flex-direction:column;align-items:center;padding-top:20px}
.dots{display:flex;gap:14px;margin-bottom:24px}
.dot{width:15px;height:15px;border-radius:50%;border:2px solid var(--bd);transition:all .15s}
.don{background:var(--purple);border-color:var(--purple);transform:scale(1.1)}
.derr{border-color:var(--red);animation:shake .35s}
@keyframes shake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
.numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;width:100%;max-width:280px}
.num{background:var(--s2);border:1px solid var(--bd);border-radius:14px;padding:16px 0;font-family:var(--mono);font-size:20px;font-weight:700;color:var(--text);cursor:pointer;text-align:center;-webkit-user-select:none}
.num:active{background:var(--s3);transform:scale(.9)}
.nsub{font-size:7px;letter-spacing:1px;color:var(--muted)}
.invis{visibility:hidden}
.atabrow{display:flex;gap:7px;margin-bottom:14px}
.atab{padding:7px 16px;border-radius:99px;font-size:12px;font-weight:700;border:1px solid var(--bd);background:var(--s2);color:var(--muted2);cursor:pointer;-webkit-user-select:none}
.atab.on{background:var(--purple);color:#fff;border-color:var(--purple)}
.ibtn{width:32px;height:32px;border-radius:8px;border:none;font-size:14px;cursor:pointer;background:rgba(79,142,247,.15);flex-shrink:0}
.ibtn.del{background:rgba(242,95,92,.15)}
.drag-h{font-size:20px;color:var(--muted);padding-right:4px;cursor:grab;touch-action:none;-webkit-user-select:none;flex-shrink:0}
.sheet{display:none;width:100%;background:var(--s1);border-radius:22px 22px 0 0;border-top:1px solid var(--bd);padding:0 0 calc(var(--sab)+20px);max-height:92vh;overflow-y:auto;animation:sup .25s cubic-bezier(.32,1.2,.6,1)}
.sheet.on{display:block}
@keyframes sup{from{transform:translateY(60px);opacity:0}to{transform:none;opacity:1}}
.shandle{width:34px;height:4px;border-radius:2px;background:var(--s3);margin:12px auto 20px}
#scanmod{display:none;position:fixed;inset:0;z-index:300;background:#000;flex-direction:column}
.scantop{display:flex;align-items:center;justify-content:space-between;padding:calc(var(--sat)+10px) 18px 10px;background:#000}
.scancls{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:15px;cursor:pointer}
.scanvp{flex:1;position:relative;overflow:hidden}
.scanover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.scanframe{width:220px;height:220px;position:relative;box-shadow:0 0 0 9999px rgba(0,0,0,.55);border-radius:10px}
.sf{position:absolute;width:22px;height:22px;border-color:#4f8ef7;border-style:solid}
.sf.tl{top:0;left:0;border-width:3px 0 0 3px;border-radius:3px 0 0 0}.sf.tr{top:0;right:0;border-width:3px 3px 0 0;border-radius:0 3px 0 0}
.sf.bl{bottom:0;left:0;border-width:0 0 3px 3px;border-radius:0 0 0 3px}.sf.br{bottom:0;right:0;border-width:0 3px 3px 0;border-radius:0 0 3px 0}
.laser{position:absolute;left:4px;right:4px;height:2px;background:linear-gradient(90deg,transparent,#4f8ef7,transparent);animation:lz 2s ease-in-out infinite}
@keyframes lz{0%,100%{top:8%}50%{top:90%}}
.scanbott{background:#111318;border-top:1px solid rgba(255,255,255,.08);padding:14px 18px calc(var(--sab)+14px);flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:10px}
.scanst{font-size:12px;color:rgba(255,255,255,.4);text-align:center}
.scanres{width:100%;background:rgba(31,209,122,.1);border:1px solid rgba(31,209,122,.25);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px}
.scanqrow{display:flex;align-items:center;gap:18px}
.scanqbtn{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:20px;cursor:pointer}
.scancfm{width:100%;padding:13px;border:none;border-radius:12px;background:var(--blue);color:#fff;font-size:15px;font-weight:700;cursor:pointer}
.scanagn{background:none;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.55);border-radius:8px;padding:7px 18px;font-size:12px;cursor:pointer}
#toasts{position:fixed;top:calc(var(--sat)+54px);left:14px;right:14px;z-index:500;display:flex;flex-direction:column;gap:7px;pointer-events:none}
.toast{background:var(--s3);border:1px solid var(--bd);border-left:3px solid var(--blue);border-radius:12px;padding:10px 14px;font-size:12px;font-weight:600;animation:tdrop .25s,tfade .3s ease 2.5s forwards}
.terr{border-left-color:var(--red)}.twarn{border-left-color:var(--yellow)}
@keyframes tdrop{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes tfade{to{opacity:0}}
to{opacity:1;transform:translate(-50%,-50%) scale(1)}}}@keyframes btpop{from{opacity:0;transform:translate(-50%,-50%) scale(.75)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
</style>
</head>
<body>
<div id="wrap">
  <div id="safe"></div>
  <div id="top"><div id="top-sub">Warehouse</div><div id="top-ttl">창고 입출고</div></div>
  <div id="scroll">

    <!-- 재고 -->
    <div id="pg-prod" class="pg" style="display:none">
      <div id="mismatch-bar" style="display:none;background:rgba(244,185,66,.15);border:1px solid var(--yellow);border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:12px;font-weight:600;color:var(--yellow);line-height:1.6"></div>
      <button class="btn" style="background:var(--s2);border:1px solid var(--bd);color:var(--muted2);margin-bottom:10px" id="hist-goto-btn">📋 입출고 내역 확인</button>
      <div class="sbox"><span>🔍</span><input id="pkw" placeholder="품명·모델·공급처·ID" oninput="S.pkw=this.value;rProd()"></div>
      <div class="pills" id="pft"></div>
      <div class="pills" id="pmd"></div>
      <div class="kgrid" id="d-kpi" style="margin-bottom:10px"></div>
      <div class="rcnt" id="pcnt"></div>
      <div class="card" id="plist"></div>
      <div class="pad"></div>
    </div>

    <!-- 창고 입출고 -->
    <div id="pg-io" class="pg">
      <button class="btn" style="background:var(--s2);border:1px solid var(--bd);color:var(--muted2);margin-bottom:12px" id="hist-goto-btn2">📋 입출고 내역 확인</button>
      <div class="slbl">이동 유형</div>
      <div class="mvgrid" id="mvgrid">
        <div class="mvbtn on" data-mv="wh2d"><div class="mvico">🏭→🔧</div><div class="mvlbl">창고→생산부</div></div>
        <div class="mvbtn" data-mv="d2wh"><div class="mvico">🔧→🏭</div><div class="mvlbl">생산부→창고</div></div>
        <div class="mvbtn" data-mv="whin"><div class="mvico">📥</div><div class="mvlbl">창고 입고</div></div>
      </div>
      <div class="flow" id="io-flow" style="display:none">
        <div id="io-from" class="fbox">🏭 창고</div>
        <div class="farrow">→</div>
        <div id="io-to" class="fbox">생산부</div>
      </div>
      <div class="slbl">👤 담당 직원</div>
      <div class="empsel" id="empsel"></div>
      <div id="scan-open-btn" class="scanbtn">
        <div class="scanico">📷</div>
        <div><div style="font-size:14px;font-weight:700">QR 스캔</div><div style="font-size:11px;color:var(--muted2);margin-top:2px">카메라로 상품 인식</div></div>
        <span style="color:var(--muted);font-size:22px;margin-left:auto">›</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin:10px 0"><div style="flex:1;height:1px;background:var(--bd)"></div><span style="font-size:10px;color:var(--muted);font-weight:600">또는 직접 선택</span><div style="flex:1;height:1px;background:var(--bd)"></div></div>
      <div class="sbox" style="margin-bottom:8px"><span>🔍</span><input id="iosrch" placeholder="품명 검색..." oninput="ioSearch()"></div>
      <div class="card" id="iolist" style="max-height:200px;overflow-y:auto;margin-bottom:12px"></div>
      <div id="iosel" style="display:none;margin-bottom:12px">
        <div class="slbl">선택된 품목</div>
        <div class="card" style="padding:12px 14px;display:flex;align-items:stretch;gap:12px">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700" id="io-sn"></div>
            <div style="font-size:11px;color:var(--muted2);margin-top:2px" id="io-ss"></div>
            <div style="display:flex;gap:20px;margin-top:10px">
              <div><div style="font-size:9px;color:var(--muted2)" id="io-fl">창고 재고</div><div style="font-family:var(--mono);font-size:22px;font-weight:900;color:var(--blue)" id="io-fs">-</div></div>
              <div id="io-tw"><div style="font-size:9px;color:var(--muted2)" id="io-tl">생산부 재고</div><div style="font-family:var(--mono);font-size:22px;font-weight:900;color:var(--green)" id="io-ts">-</div></div>
            </div>
          </div>
          <button id="iosel-cancel" style="background:rgba(242,95,92,.15);border:1.5px solid var(--red);color:var(--red);border-radius:12px;width:52px;min-width:52px;height:52px;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;align-self:center">✕</button>
        </div>
      </div>
      <div class="fg"><label class="fl">수량</label>
        <input class="fc" type="number" id="ioqty" placeholder="0" min="0" style="text-align:center;font-family:var(--mono);font-size:22px;font-weight:700" oninput="ioPrev()">
        <div id="io-bom-preview" style="display:none"></div>
        <div class="qrow" id="qrow">
          <button class="qbtn qm" data-d="-10">−10</button>
          <button class="qbtn qm" data-d="-1">−1</button>
          <button class="qbtn qp" data-d="1">＋1</button>
          <button class="qbtn qp" data-d="10">＋10</button>
        </div>
      </div>
      <div class="fg"><label class="fl">비고</label><input class="fc" type="text" id="ionote" placeholder="메모 (선택)"></div>
      <div class="pvbox" id="ioprev" style="display:none"><div id="pvd"></div></div>
      <div class="pad"></div>
    </div>

    <!-- 부서 입출고 -->
    <div id="pg-dio" class="pg" style="display:none">
      <button class="btn" style="background:var(--s2);border:1px solid var(--bd);color:var(--muted2);margin-bottom:12px" id="hist-goto-btn3">📋 입출고 내역 확인</button>
      <div class="slbl">부서 선택</div>
      <div id="diodeptrow" style="display:flex;gap:6px;margin-bottom:12px">
        <button class="mvbtn" data-dept="튜브" style="min-width:62px;padding:10px 8px"><div style="font-size:18px;pointer-events:none">🧪</div><div class="mvlbl" style="pointer-events:none">튜브</div></button>
        <button class="mvbtn" data-dept="고압" style="min-width:62px;padding:10px 8px"><div style="font-size:18px;pointer-events:none">⚡</div><div class="mvlbl" style="pointer-events:none">고압</div></button>
        <button class="mvbtn" data-dept="진공" style="min-width:62px;padding:10px 8px"><div style="font-size:18px;pointer-events:none">🔩</div><div class="mvlbl" style="pointer-events:none">진공</div></button>
        <button class="mvbtn" data-dept="튜닝" style="min-width:62px;padding:10px 8px"><div style="font-size:18px;pointer-events:none">🎛</div><div class="mvlbl" style="pointer-events:none">튜닝</div></button>
        <button class="mvbtn on" data-dept="조립" style="min-width:62px;padding:10px 8px"><div style="font-size:18px;pointer-events:none">🔧</div><div class="mvlbl" style="pointer-events:none">조립</div></button>
        <button class="mvbtn" data-dept="출하" style="min-width:62px;padding:10px 8px"><div style="font-size:18px;pointer-events:none">📦</div><div class="mvlbl" style="pointer-events:none">출하</div></button>
      </div>

      <div class="slbl">👤 담당 직원</div>
      <div class="empsel" id="dioempsel"></div>
      <div style="display:flex;align-items:center;gap:10px;margin:10px 0"><div style="flex:1;height:1px;background:var(--bd)"></div><span style="font-size:10px;color:var(--muted);font-weight:600">품목 선택</span><div style="flex:1;height:1px;background:var(--bd)"></div></div>
      <div class="pills" id="diomd"></div>
      <div class="sbox" style="margin-bottom:8px"><span>🔍</span><input id="diosrch" placeholder="품명 검색..." oninput="dioSearch()"></div>
      <div class="card" id="diolist" style="max-height:200px;overflow-y:auto;margin-bottom:12px"></div>
      <div id="diosel" style="display:none;margin-bottom:12px">
        <div class="slbl">선택된 품목</div>
        <div class="card" style="padding:12px 14px;display:flex;align-items:stretch;gap:12px">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700" id="dio-sn"></div>
            <div style="font-size:11px;color:var(--muted2);margin-top:2px" id="dio-ss"></div>
            <div style="margin-top:8px"><div style="font-size:9px;color:var(--muted2)" id="dio-sl">부서 재고</div><div style="font-family:var(--mono);font-size:22px;font-weight:900;color:var(--blue)" id="dio-sv">-</div></div>
          </div>
          <button id="diosel-cancel" style="background:rgba(242,95,92,.15);border:1.5px solid var(--red);color:var(--red);border-radius:12px;width:52px;min-width:52px;height:52px;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;align-self:center">✕</button>
        </div>
      </div>
      <div class="fg"><label class="fl">수량</label>
        <input class="fc" type="number" id="dioqty" placeholder="0" min="0" style="text-align:center;font-family:var(--mono);font-size:22px;font-weight:700" oninput="dioPrev()">
        <div id="dio-bom-preview" style="display:none;margin-bottom:10px"></div>
      <div class="qrow" id="diocrow">
          <button class="qbtn qm" data-d="-10">−10</button>
          <button class="qbtn qm" data-d="-1">−1</button>
          <button class="qbtn qp" data-d="1">＋1</button>
          <button class="qbtn qp" data-d="10">＋10</button>
        </div>
      </div>
      <div class="fg"><label class="fl">비고</label><input class="fc" type="text" id="dionote" placeholder="메모 (선택)"></div>
      <div class="pvbox" id="dioprev" style="display:none"><div id="diopvd"></div></div>
      <div class="pad"></div>
    </div>

    <!-- 내역 -->
    <div id="pg-hist" class="pg" style="display:none">
      <div class="pills" id="hpills">
        <div class="pill on" data-hf="all">전체</div>
        <div class="pill" data-hf="입고">입고</div>
        <div class="pill" data-hf="출고">출고</div>
      </div>
      <div class="slbl">👤 담당 직원</div>
      <div class="empsel" id="hEmpSel" style="margin-bottom:10px"></div>
      <div class="slbl">🔧 모델</div>
      <div class="empsel" id="hProdSel" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap" id="hdatepills"><div class="pill on" data-hd="month">이번달</div><div class="pill" data-hd="week">이번주</div><div class="pill" data-hd="today">오늘</div><div class="pill" data-hd="all">전체</div></div>
      <div class="rcnt" id="hcnt"></div>
      <div class="card" id="hlist"></div>
      <div class="pad"></div>
    </div>

    <!-- 관리자 -->
    <div id="pg-adm" class="pg" style="display:none">
      <div id="alock" class="lockwrap">
        <div style="font-size:50px;margin-bottom:12px">🔐</div>
        <div style="font-size:20px;font-weight:900;margin-bottom:6px">관리자 인증</div>
        <div style="font-size:12px;color:var(--muted2);margin-bottom:24px">4자리 비밀번호 입력</div>
        <div class="dots"><div class="dot" id="d0"></div><div class="dot" id="d1"></div><div class="dot" id="d2"></div><div class="dot" id="d3"></div></div>
        <div class="numpad" id="numpad">
          <div class="num" data-n="1">1</div><div class="num" data-n="2">2<div class="nsub">ABC</div></div><div class="num" data-n="3">3<div class="nsub">DEF</div></div>
          <div class="num" data-n="4">4<div class="nsub">GHI</div></div><div class="num" data-n="5">5<div class="nsub">JKL</div></div><div class="num" data-n="6">6<div class="nsub">MNO</div></div>
          <div class="num" data-n="7">7<div class="nsub">PQRS</div></div><div class="num" data-n="8">8<div class="nsub">TUV</div></div><div class="num" data-n="9">9<div class="nsub">WXYZ</div></div>
          <div class="num invis"></div><div class="num" data-n="0">0</div><div class="num" id="pdel-btn">⌫</div>
        </div>
      </div>
      <div id="apanel" style="display:none">
        <div class="atabrow" id="atabrow">
          <div class="atab on" data-t="emp">👤 직원</div>
          <div class="atab" data-t="prod">📦 재고</div>
          <div class="atab" data-t="bom">🔩 BOM</div>
          <div class="atab" data-t="ship">🚚 출하묶음</div>
          <div class="atab" data-t="cfg">⚙️ 설정</div>
        </div>
        <div id="at-emp">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <button class="btn" id="sort-btn" style="width:auto;padding:9px 14px;background:var(--s2);border:1px solid var(--bd);color:var(--muted2);font-size:12px">↕ 순서 변경</button>
            <button class="btn bp" id="new-emp-btn" style="width:auto;padding:9px 18px">＋ 직원 추가</button>
          </div>
          <div id="sort-hint" style="display:none;font-size:11px;color:var(--muted2);text-align:center;padding:4px 0 10px">☰ 를 길게 눌러 드래그하여 순서 변경</div>
          <div class="card" id="emplist"></div>
          <div class="pad"></div>
        </div>
        <div id="at-prod" style="display:none">
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn bb" id="new-prod-btn" style="width:auto;padding:9px 18px">＋ 상품 추가</button></div>
          <div class="sbox"><span>🔍</span><input id="apsrch" placeholder="상품명·코드" oninput="rAP()"></div>
          <div class="pills" id="ap-ft"></div>
          <div class="pills" id="ap-md"></div>
          <div class="card" id="aplist"></div>
          <div class="pad"></div>
        </div>
        <div id="at-bom" style="display:none">
          <div class="slbl">🔧 Ass'y BOM 관리</div>
          <div class="sbox"><span>🔍</span><input id="bomsrch" placeholder="Ass'y 품명 검색" oninput="rBOM()"></div>
          <div class="card" id="bomlist"></div>
          <div class="pad"></div>
        </div>
        <div id="at-ship" style="display:none">
          <div class="slbl">🚚 출하묶음 관리</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input class="fc" id="ship-newname" placeholder="묶음 이름 (예: COCOON_미국_벡터)" style="flex:1;margin-bottom:0">
            <button class="btn bb" style="width:auto;padding:9px 14px;flex-shrink:0" onclick="shipNewPkg()">＋ 추가</button>
          </div>
          <div class="card" id="shiplist"></div>
          <div class="pad"></div>
        </div>
        <div id="at-cfg" style="display:none">
          <div class="slbl">🔑 비밀번호 변경</div>
          <div class="card" style="padding:14px;margin-bottom:12px">
            <div class="fg"><label class="fl">현재</label><input class="fc" type="password" id="pwc" placeholder="현재 비밀번호"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="fg"><label class="fl">새 비밀번호</label><input class="fc" type="password" id="pwn" placeholder="4자리" maxlength="4"></div>
              <div class="fg"><label class="fl">확인</label><input class="fc" type="password" id="pwk" placeholder="재입력" maxlength="4"></div>
            </div>
          </div>
          <button class="btn bp" id="chpw-btn">🔑 변경</button>
          <div class="slbl" style="margin-top:8px">⚠️ 데이터 관리</div>
          <button class="btn bg" id="reset-btn">🗑 전체 초기화</button>
          <button class="btn bp" id="lock-btn">🔒 관리자 잠금</button>
          <div class="pad"></div>
        </div>
      </div>
    </div>

  </div>
  <!-- 하단 고정 버튼 -->
  <div id="io-bottom" style="display:none"><button class="btn br" id="io-btn">📤 출고</button></div>
  <div id="dio-bottom" style="display:none"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 14px 6px;background:var(--s1);border-top:1px solid var(--bd)"><button class="btn bf" id="dio-btn-in" style="margin-bottom:0">📥 입고</button><button class="btn br" id="dio-btn-out" style="margin-bottom:0">📤 출고</button></div></div>
  <nav id="nav">
    <button class="tab" data-p="prod"><div class="ti">🏷</div><div class="tl">재고</div><div class="td"></div></button>
    <button class="tab on" data-p="io"><div class="ti">🏭</div><div class="tl">창고입출고</div><div class="td"></div></button>
    <button class="tab" data-p="dio"><div class="ti">🔧</div><div class="tl">부서입출고</div><div class="td"></div></button>
    <button class="tab" data-p="adm"><div class="ti">🔐</div><div class="tl">관리자</div><div class="td"></div></button>
  </nav>
<!-- 시트 -->
<div id="sbg">
  <div class="sheet" id="s-det"><div class="shandle"></div><div id="det-body"></div></div>
  <div class="sheet" id="s-prod">
    <div class="shandle"></div>
    <div style="font-size:18px;font-weight:900;margin-bottom:14px" id="pstitle">상품 추가</div>
    <div class="fg"><label class="fl">코드 *</label><input class="fc" id="pscode" placeholder="예) RM0001"></div>
    <div class="fg"><label class="fl">품명 *</label><input class="fc" id="psname" placeholder="품명"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg"><label class="fl">파일구분</label><select class="fc" id="psft"><option value="원자재">원자재</option><option value="조립자재">조립자재</option><option value="발생부자재">발생부자재</option><option value="완제품">완제품</option><option value="데모/테스트장비">데모/테스트</option></select></div>
      <div class="fg"><label class="fl">모델</label><input class="fc" id="psmod" placeholder="예) DX3000"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg"><label class="fl">분류</label><input class="fc" id="psity"></div>
      <div class="fg"><label class="fl">공급처</label><input class="fc" id="pssup"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg"><label class="fl">현재고 *</label><input class="fc" type="number" id="psstock" placeholder="0"></div>
      <div class="fg"><label class="fl">안전재고</label><input class="fc" type="number" id="psmin" placeholder="0"></div>
    </div>
    <div class="fg"><label class="fl">바코드</label><input class="fc" id="psbar"></div>
    <button class="btn bb" id="save-prod-btn">저장</button>
  </div>
  <div class="sheet" id="s-cfm">
    <div class="shandle"></div>
    <div style="padding:0 20px 8px"><div style="font-size:18px;font-weight:900;margin-bottom:16px" id="cfm-title">확인</div>
    <div class="card" style="padding:4px 14px;margin-bottom:20px" id="cfm-body"></div>
    <button class="btn bf" id="cfm-btn" style="margin-bottom:8px">처리</button>
    <button class="btn" style="background:var(--s2);border:1px solid var(--bd);color:var(--muted2)" id="cfm-cancel">취소</button>
  </div>
  <div class="sheet" id="s-emp">
    <div class="shandle"></div>
    <div style="padding:0 20px 8px"><div style="font-size:18px;font-weight:900;margin-bottom:14px" id="estitle">직원 추가</div>
    <div class="fg"><label class="fl">이름 *</label><input class="fc" id="esname" placeholder="홍길동"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg"><label class="fl">직책 *</label><input class="fc" id="esrole" placeholder="예) 조립/주임"></div>
      <div class="fg"><label class="fl">권한</label><select class="fc" id="eslv"><option value="staff">일반</option><option value="admin">관리자</option></select></div>
    </div>
    <div class="fg"><label class="fl">연락처</label><input class="fc" id="esph" type="tel"></div>
    <button class="btn bp" id="save-emp-btn">저장</button>
  </div>
</div>

<!-- 스캐너 -->
<div id="scanmod">
  <div class="scantop"><span style="font-size:15px;font-weight:700;color:#fff">📷 QR 스캔</span><button class="scancls" id="scan-cls-btn">✕</button></div>
  <div class="scanvp">
    <video id="scanvid" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
    <canvas id="scancan" style="display:none"></canvas>
    <div class="scanover"><div class="scanframe"><div class="sf tl"></div><div class="sf tr"></div><div class="sf bl"></div><div class="sf br"></div><div class="laser"></div></div></div>
  </div>
  <div class="scanbott">
    <div class="scanres" id="scanres" style="display:none"><span style="font-size:20px">✅</span><div><div style="font-size:14px;font-weight:700;color:#fff" id="scannm"></div><div style="font-size:10px;color:rgba(255,255,255,.5);font-family:var(--mono)" id="scanmeta"></div></div></div>
    <div class="scanst" id="scanst">카메라 시작 중...</div>
    <div class="scanqrow" id="scanqrow" style="display:none">
      <button class="scanqbtn" id="sq-minus">−</button>
      <div id="scanqty" style="font-family:var(--mono);font-size:30px;font-weight:700;color:#fff;min-width:44px;text-align:center">1</div>
      <button class="scanqbtn" id="sq-plus">＋</button>
    </div>
    <button class="scancfm" id="scancfm" style="display:none"></button>
    <button class="scanagn" id="scanagn" style="display:none">다시 스캔</button>
  </div>
</div>

<div id="toasts"></div>

</div><!-- /wrap -->

"""

# JS 읽기
HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, 'init_db_v4.js'), encoding='utf-8') as f:
    init_db_js = f.read()
with open(os.path.join(HERE, 'app_final.js'), encoding='utf-8') as f:
    app_js = f.read()

# 최종 HTML 조립
EXCEL_HEADER = 'var EXCEL_SERVER = \'\';\nvar EXCEL_ENABLED = true;\n'
final = HTML_BODY + '\n<script>' + init_db_js + '</script>\n<script>\n' + EXCEL_HEADER + app_js + '\n</script>\n</body>\n</html>'

# 검증
scripts = list(re.finditer(r'<script>(.*?)</script>', final, re.DOTALL))
print(f"script 태그: {len(scripts)}개")
all_ok = True
for i, s in enumerate(scripts):
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8')
    tmp.write(s.group(1)); tmp.close()
    r = subprocess.run(['node','--check',tmp.name], capture_output=True, text=True)
    ok = r.returncode==0
    if not ok: all_ok = False
    print(f"  [{i}] {len(s.group(1))//1024}KB: {'✅' if ok else '❌ '+r.stderr[:80]}")
    os.unlink(tmp.name)

# onclick 따옴표 확인
bad = [m.group(1) for m in re.finditer(r'onclick="([^"]+)"', final) if "'" in m.group(1)]
oninput_bad = [m.group(1) for m in re.finditer(r'oninput="([^"]+)"', final) if "'" in m.group(1)]
print(f"onclick 따옴표: {len(bad)}개 {'✅' if not bad else '❌'}")
print(f"oninput 따옴표: {len(oninput_bad)}개 {'✅' if not oninput_bad else '❌'}")
print(f"init() 호출: {final.count('init();')}개")
print(f"파일 크기: {len(final)//1024}KB")

out_path = os.path.join(HERE, 'inventory_v2.html')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(final)
print(f"✅ 저장 완료: {out_path}")
