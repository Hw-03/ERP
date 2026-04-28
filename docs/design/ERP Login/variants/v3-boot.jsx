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
    const t2 = setTimeout(()=> setFormIn(true), 2700); // form fades in during the shrink
    return ()=> {clearTimeout(t1); clearTimeout(t2)};
  },[key]);

  const replay = ()=> setKey(k=>k+1);
  const skip = ()=> { setDone(true); setTimeout(()=>setFormIn(true), 500); };

  // Letters with their ORIGINAL widths (from the source logo PNGs).
  // Placed with gap:0 — matches the real logo layout.
  // Scale factor controls the overall wordmark size (1 = original 55px tall).
  const SCALE = 1.6;   // intro hero size
  const SMALL_SCALE = 0.75; // small header size after landing

  const letters = [
    // baselineY is the top offset inside a 38px box so letters share baseline.
    // D is taller (37px, sits 4px higher than others in source) — its PNG is 37h.
    {src:'assets/letter_D.png', w:40, h:37, baselineOffset:-4}, // D sits higher
    {src:'assets/letter_E.png', w:45, h:38, baselineOffset:0},
    {src:'assets/letter_X.png', w:42, h:38, baselineOffset:0},
    {src:'assets/letter_C.png', w:46, h:38, baselineOffset:0},
    {src:'assets/letter_O.png', w:50, h:38, baselineOffset:0},
    {src:'assets/letter_W.png', w:53, h:38, baselineOffset:0},
    {src:'assets/letter_I.png', w:15, h:38, baselineOffset:0},
    {src:'assets/letter_N.png', w:36, h:38, baselineOffset:0},
  ];
  const totalW = letters.reduce((s,l)=>s+l.w, 0);

  // Subtle directional offsets — letters slide in from near, not fly from far.
  // No rotation, small distance, horizontal-dominant. Refined not bouncy.
  const flyOffsets = [
    {x:-80, y:-20},
    {x:-60, y: 24},
    {x:-40, y:-18},
    {x: 40, y: 20},
    {x: 60, y:-22},
    {x: 80, y: 18},
    {x: 50, y:-14},
    {x: 90, y: 16},
  ];

  // Animation delay per letter — staggered impact.
  const baseDelay = 0.1;
  const stagger = 0.07;
  const flyDuration = 1.1; // each letter — longer = smoother
  const lastImpact = baseDelay + stagger*(letters.length-1) + 0.4;
  const settleTime = lastImpact + 0.25;
  const formRise = settleTime + 0.15;

  return (
    <div className="v3-root" key={key}>
      <div className="v3-bg grid-bg-fine"/>
      <div className="v3-vignette"/>
      <div className={`v3-flash ${done?'v3-flash-hidden':''}`}/>

      {/* Top controls */}
      <div className="v3-topbar">
        <span className="v3-tb-k">DX · ERP</span>
        <span className="v3-tb-v">{done?'READY':'INITIALIZING'}</span>
        <span className="v3-tb-sp"/>
        {!done && (
          <button className="v3-skip" onClick={skip} title="Skip intro">
            SKIP <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 5l7 7-7 7M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
        )}
        {done && (
          <button className="v3-replay" onClick={replay} title="Replay intro">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1015-6.7M21 4v5h-5" stroke="currentColor" strokeWidth="1.8"/></svg>
            REPLAY
          </button>
        )}
      </div>

      {/* ==== Logo stage — stays centered during intro, shifts up via translate only ==== */}
      <div className={`v3-stage ${done?'v3-stage-small':''}`}>
        <div
          className="v3-word"
          style={{
            '--total-w': `${totalW}px`,
            '--scale': done?SMALL_SCALE:SCALE,
          }}
        >
          {letters.map((l,i)=>{
            const delay = baseDelay + i*stagger;
            const off = flyOffsets[i];
            return (
              <img
                key={i}
                src={l.src}
                alt=""
                className={`v3-letter px ${done?'v3-letter-done':''}`}
                style={{
                  width: `${l.w}px`,
                  height: `${l.h}px`,
                  marginTop: `${l.baselineOffset}px`,
                  '--fx': `${off.x}px`,
                  '--fy': `${off.y}px`,
                  animationDelay: done?'0s':`${delay}s`,
                  animationDuration: `${flyDuration}s`,
                }}
              />
            );
          })}
          {/* registered mark ® — sits right of N, small, top-aligned */}
          <img
            src="assets/registered.png"
            alt=""
            className={`v3-reg px ${done?'v3-letter-done':''}`}
            style={{
              animationDelay: done?'0s':`${lastImpact+0.1}s`,
            }}
          />
        </div>

        {/* tagline appears after word settles */}
        <div className={`v3-tag ${done?'v3-tag-hidden':''}`}
          style={{animationDelay: `${lastImpact+0.2}s`}}>
          <span className="v3-tag-line"/>
          <span className="v3-tag-text">Enterprise Resource Planning</span>
          <span className="v3-tag-line"/>
        </div>
      </div>

      {/* ==== Form ==== */}
      <main className={`v3-form-wrap ${formIn?'v3-form-in':''}`}>
        <div className="v3-form-inner">
          <div className="v3-form-head">
            <span className="v3-eyebrow">// ACCESS TERMINAL</span>
            <h1 className="v3-title">Sign in</h1>
          </div>

          <form className="v3-form" onSubmit={e=>e.preventDefault()}>
            <div className="dx-field">
              <div className="dx-label"><span>User ID</span></div>
              <div className="dx-input-wrap">
                <svg className="dx-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 1116 0" stroke="currentColor" strokeWidth="1.6"/></svg>
                <input className="dx-input" placeholder="employee.id" value={id} onChange={e=>setId(e.target.value)}/>
              </div>
            </div>
            <div className="dx-field">
              <div className="dx-label"><span>Password</span></div>
              <div className="dx-input-wrap">
                <svg className="dx-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="11" width="16" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6"/></svg>
                <input type="password" className="dx-input" placeholder="••••••••••••" value={pw} onChange={e=>setPw(e.target.value)}/>
              </div>
            </div>

            <div className="v3-row">
              <label className="dx-check"><input type="checkbox"/> Keep signed in</label>
              <span className="v3-sec"><span className="v3-sec-dot"/> 2FA</span>
            </div>

            <button className="dx-btn" disabled={!canSubmit}>
              <span>Enter system</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.8"/></svg>
            </button>

            <div className="dx-links">
              <a href="#">Forgot password</a>
              <a href="#">Contact IT →</a>
            </div>
          </form>
        </div>
      </main>

      <div className={`v3-bottom ${formIn?'v3-bottom-in':''}`}>
        <span>© 2026 DEXCOWIN®</span>
        <span className="v3-sep">·</span>
        <span>ISO 27001</span>
        <span className="v3-sep">·</span>
        <span>KR-SEOUL-01</span>
        <span className="v3-sep">·</span>
        <span className="v3-on"><span className="v3-on-dot"/> SYSTEM ONLINE</span>
      </div>

      <style>{`
        .v3-root{position:relative;height:100%;background:#05070B;color:var(--text);font-family:var(--font-ui);overflow:hidden}
        .v3-bg{position:absolute;inset:0;opacity:.45}
        .v3-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 0%, #05070B 85%);pointer-events:none}

        /* impact flash — very subtle, just a soft luminance lift */
        .v3-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%, rgba(74,139,212,0.22), transparent 55%);opacity:0;pointer-events:none;z-index:4;animation:impactFlash 3s ease forwards}
        .v3-flash-hidden{opacity:0;animation:none}
        @keyframes impactFlash{
          0%,78%{opacity:0}
          86%{opacity:1}
          100%{opacity:0}
        }

        /* topbar */
        .v3-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:14px;padding:14px 24px;border-bottom:1px solid var(--line);font-family:var(--font-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;z-index:20;background:rgba(5,7,11,0.7);backdrop-filter:blur(6px)}
        .v3-tb-k{color:var(--brand-hi)}
        .v3-tb-v{color:var(--text-dim)}
        .v3-tb-sp{flex:1}
        .v3-skip,.v3-replay{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--line-strong);color:var(--text-dim);font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em;padding:5px 10px;cursor:pointer}
        .v3-skip:hover,.v3-replay:hover{border-color:var(--brand);color:var(--brand-hi)}

        /* ==== Stage ==== */
                /* ==== Stage — fixed to viewport center; only translates up slightly via transform ==== */
        .v3-stage{position:absolute;inset:0;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          transition:transform 1.2s cubic-bezier(.4,0,.2,1);
          transform:translateY(0);
          z-index:5;
          gap:20px;
          pointer-events:none;
        }
        .v3-stage-small{
          transform:translateY(-34%);
        }

        /* wordmark — scales down in place; scale is the ONLY change */
        .v3-word{
          position:relative;
          display:inline-flex;
          align-items:flex-start;
          gap:0;
          transform:scale(var(--scale));
          transform-origin:center center;
          transition:transform 1.2s cubic-bezier(.4,0,.2,1);
          will-change:transform;
        }

        .v3-letter{
          display:block;
          flex-shrink:0;
          opacity:0;
          transform:translate(var(--fx), var(--fy));
          filter:blur(10px);
          animation-name:letterFlyIn;
          animation-timing-function:cubic-bezier(.22,.61,.36,1);
          animation-fill-mode:forwards;
        }
        @keyframes letterFlyIn{
          0%{
            opacity:0;
            transform:translate(var(--fx), var(--fy));
            filter:blur(10px);
          }
          60%{
            opacity:1;
            filter:blur(1px);
          }
          100%{
            opacity:1;
            transform:translate(0,0);
            filter:blur(0);
          }
        }
        /* done state: immediately visible in final position */
        .v3-letter-done{
          opacity:1 !important;
          transform:translate(0,0) !important;
          filter:blur(0) !important;
          animation:none !important;
        }

        /* registered ® — positioned relative to the wordmark flex end */
        .v3-reg{
          position:absolute;
          right:-14px;
          top:-4px;
          width:12px;
          height:12px;
          opacity:0;
          animation:regIn .4s ease forwards;
        }
        @keyframes regIn{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}

        /* tagline — fades OUT when stage shrinks */
        .v3-tag{
          display:flex;align-items:center;gap:12px;
          opacity:0;
          animation:tagIn .6s ease forwards;
          transition:opacity .45s ease;
        }
        .v3-stage-small .v3-tag{opacity:0;animation:none;pointer-events:none}

        @keyframes tagIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .v3-tag-line{width:60px;height:1px;background:linear-gradient(90deg,transparent,var(--line-strong),transparent)}
        .v3-tag-text{font-family:var(--font-mono);font-size:11px;letter-spacing:0.26em;color:var(--text-dim);text-transform:uppercase}

        /* ==== FORM — appears BELOW the shrunk wordmark, vertically balanced ==== */
        .v3-form-wrap{position:absolute;left:0;right:0;top:0;bottom:0;
          display:flex;align-items:center;justify-content:center;padding:80px 24px 80px;z-index:7;
          opacity:0;transform:translateY(20px);pointer-events:none;
          transition:opacity .9s cubic-bezier(.4,0,.2,1), transform 1s cubic-bezier(.4,0,.2,1)
        }
        .v3-form-in{opacity:1;transform:translateY(0);pointer-events:auto}
        .v3-form-inner{width:100%;max-width:360px;margin-top:110px;display:flex;flex-direction:column;gap:20px}
        .v3-form-head{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
        .v3-eyebrow{font-family:var(--font-mono);font-size:10px;letter-spacing:0.22em;color:var(--brand-hi);text-transform:uppercase}
        .v3-title{margin:0;font-size:22px;font-weight:500;color:var(--text-hi);letter-spacing:-0.01em}
        .v3-form{display:flex;flex-direction:column;gap:16px}
        .v3-row{display:flex;justify-content:space-between;align-items:center;font-family:var(--font-mono);font-size:11px}
        .v3-sec{color:var(--text-dim);display:inline-flex;align-items:center;gap:6px;letter-spacing:0.06em}
        .v3-sec-dot{width:6px;height:6px;background:var(--warn);border-radius:50%}

                        .v3-bottom{position:absolute;bottom:20px;left:0;right:0;display:flex;justify-content:center;gap:12px;font-family:var(--font-mono);font-size:10px;letter-spacing:0.16em;color:var(--text-faint);text-transform:uppercase;z-index:8;opacity:0;transition:opacity .7s ease}
        .v3-bottom-in{opacity:1}
        .v3-sep{color:var(--text-faint)}
        .v3-on{color:var(--ok);display:inline-flex;align-items:center;gap:6px}
        .v3-on-dot{width:6px;height:6px;background:var(--ok);border-radius:50%;animation:pulse3 1.6s infinite}
        @keyframes pulse3{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>
    </div>
  );
}

window.LoginBoot = LoginBoot;
