(()=>{
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=v=>v;   // show every value in full
const KEY='parity:v1'; // only used to delete old data
const EMPTY={add:'; Nothing to add.',remove:'; Nothing to remove.',final:'; The final zone came out empty. Switch on at least one item.'};

/* A field of squares that behaves like a contributions graph: each cell lights up, steps through tones and goes out. */
const fields=[];
function field(cv){
  const ctx=cv.getContext('2d'),fade=!!cv.dataset.fade,PITCH=16,GAP=3,EMPTY=[232,234,255],FULL=[10,10,255];
  let cols=0,rows=0,v=null,t=null,dpr=1,seed=1,last=0,acc=0,running=false;
  const rnd=()=>{seed=seed+0x6D2B79F5|0;let x=Math.imul(seed^seed>>>15,1|seed);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296;};
  const level=()=>{const r=rnd();return r<.4?.25:r<.7?.5:r<.9?.75:1;};
  const weight=c=>fade?.02+Math.pow(c/Math.max(1,cols-1),3):1;
  function draw(i){
    const x=(i%cols)*PITCH*dpr,y=((i/cols)|0)*PITCH*dpr,s=(PITCH-GAP)*dpr,k=v[i];
    ctx.clearRect(x,y,PITCH*dpr,PITCH*dpr);
    if(fade&&k<.01)return;
    ctx.fillStyle='rgb('+Math.round(EMPTY[0]+(FULL[0]-EMPTY[0])*k)+','+Math.round(EMPTY[1]+(FULL[1]-EMPTY[1])*k)+','+Math.round(EMPTY[2]+(FULL[2]-EMPTY[2])*k)+')';
    if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,s,s,2.5*dpr);ctx.fill();}else ctx.fillRect(x,y,s,s);
  }
  function size(){
    const r=cv.getBoundingClientRect();if(!r.width||!r.height)return;
    const d=Math.min(devicePixelRatio||1,2),W=Math.round(r.width*d),H=Math.round(r.height*d);
    if(v&&cv.width===W&&cv.height===H)return;
    cv.width=W;cv.height=H;dpr=d;
    cols=Math.ceil(r.width/PITCH);rows=Math.ceil(r.height/PITCH);
    v=new Float32Array(cols*rows);t=new Float32Array(cols*rows);seed=20261110;
    for(let i=0;i<v.length;i++){const a=rnd(),b=level();if(a<.22*weight(i%cols))v[i]=t[i]=b;}
    for(let i=0;i<v.length;i++)draw(i);
  }
  function tick(now){
    if(!running||!v)return;
    const dt=Math.min(120,now-last);last=now;acc+=dt;
    while(acc>55){
      acc-=55;
      for(let n=Math.max(1,Math.round(v.length*.02));n>0;n--){
        const i=Math.floor(rnd()*v.length);
        if(rnd()>weight(i%cols))continue;
        if(t[i]===0){if(rnd()<.3)t[i]=level();}
        else if(t[i]<1&&rnd()<.5)t[i]=Math.min(1,t[i]+.25);
        else t[i]=0;
      }
    }
    const k=1-Math.pow(.0002,dt/1000);
    for(let i=0;i<v.length;i++){
      const d=t[i]-v[i];
      if(d===0)continue;
      v[i]=d>.004||d<-.004?v[i]+d*k:t[i];
      draw(i);
    }
    requestAnimationFrame(tick);
  }
  if(window.ResizeObserver)new ResizeObserver(size).observe(cv);
  if(window.IntersectionObserver)new IntersectionObserver(es=>{
    const on=es[0].isIntersecting&&!calm.matches;
    if(on&&!running){running=true;size();last=performance.now();acc=0;requestAnimationFrame(tick);}
    else if(!on)running=false;
  }).observe(cv);
  size();
  return{size};
}
document.querySelectorAll('canvas.px').forEach(c=>fields.push(field(c)));

/* Motion: nothing jumps. What changes place slides, what enters fades in, what opens grows. */
const calm=matchMedia('(prefers-reduced-motion: reduce)');
const EASE='cubic-bezier(.22,.8,.24,1)';
const canAnim=()=>!calm.matches&&!!document.body.animate;
function morph(el,change,ms){
  if(!canAnim()){change();return;}
  const a=el.getBoundingClientRect().height;
  change();
  const b=el.getBoundingClientRect().height;
  if(Math.abs(a-b)<1)return;
  el.style.overflow='hidden';
  const an=el.animate([{height:a+'px'},{height:b+'px'}],{duration:ms||340,easing:EASE});
  an.onfinish=an.oncancel=()=>{el.style.overflow='';};
}
function flip(scope,fn){
  if(!canAnim()){fn();return;}
  const pos=new Map(),num=new Map(),ghosts=new Map(),vh=innerHeight;
  scope.querySelectorAll('[data-flip]').forEach(el=>{
    const r=el.getBoundingClientRect();if(!r.height)return;
    pos.set(el.dataset.flip,r);
    // remember a copy of what is on screen, to let it fade out if it disappears
    if(r.bottom>-80&&r.top<vh+80&&ghosts.size<40)ghosts.set(el.dataset.flip,{node:el.cloneNode(true),r,ctx:(el.closest('.grp')||{}).className||''});
  });
  scope.querySelectorAll('[data-num]').forEach(el=>num.set(el.dataset.num,el.textContent));
  fn();
  const seen=new Set();let enter=0;
  scope.querySelectorAll('[data-flip]').forEach(el=>{
    const r=el.getBoundingClientRect();if(!r.height)return;
    const k=el.dataset.flip;seen.add(k);
    const b=pos.get(k);
    if(!b){
      el.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:460,delay:Math.min(enter++,8)*40,easing:EASE,fill:'backwards'});
      return;
    }
    const dx=b.left-r.left,dy=b.top-r.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
    el.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],{duration:520,easing:EASE});
  });
  // what left: fades out where it was, instead of vanishing
  ghosts.forEach((g,k)=>{
    if(seen.has(k))return;
    const w=document.createElement('div');
    w.className=(g.ctx||'').replace('closing','');
    Object.assign(w.style,{position:'absolute',left:(g.r.left+scrollX)+'px',top:(g.r.top+scrollY)+'px',width:g.r.width+'px',height:g.r.height+'px',margin:'0',pointerEvents:'none',zIndex:'5',overflow:'hidden'});
    if(g.node.classList.contains('rec')){const ul=document.createElement('ul');ul.className='recs';ul.style.cssText='padding:0;margin:0';ul.appendChild(g.node);w.appendChild(ul);}
    else w.appendChild(g.node);
    g.node.removeAttribute('data-flip');
    document.body.appendChild(w);
    const an=w.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-8px) scale(.985)'}],{duration:260,easing:'ease-out',fill:'forwards'});
    an.onfinish=an.oncancel=()=>w.remove();
  });
  scope.querySelectorAll('[data-num]').forEach(el=>{
    if(num.has(el.dataset.num)&&num.get(el.dataset.num)!==el.textContent)el.animate([{opacity:0,transform:'translateY(45%)'},{opacity:1,transform:'none'}],{duration:420,easing:EASE});
  });
}
function toggleGroup(d){
  const body=d.querySelector('.recs');
  if(!body||!canAnim()){d.open=!d.open;return;}
  if(d.dataset.busy)return;
  d.dataset.busy='1';
  body.style.overflow='hidden';
  const done=()=>{delete d.dataset.busy;body.style.overflow='';d.classList.remove('closing');};
  const shut={height:'0px',paddingTop:'0px',opacity:0};
  const full=()=>({height:body.getBoundingClientRect().height+'px',paddingTop:getComputedStyle(body).paddingTop,opacity:1});
  if(d.open){
    d.classList.add('closing');
    const an=body.animate([full(),shut],{duration:340,easing:EASE});
    Array.from(body.children).slice(0,8).forEach(li=>li.animate([{opacity:1},{opacity:0}],{duration:200,easing:'ease-out',fill:'forwards'}));
    const clear=()=>Array.from(body.children).forEach(li=>li.getAnimations().forEach(x=>x.cancel()));
    an.onfinish=()=>{d.open=false;clear();done();};an.oncancel=()=>{clear();done();};
  }else{
    d.open=true;
    const an=body.animate([shut,full()],{duration:420,easing:EASE});
    an.onfinish=an.oncancel=done;
    Array.from(body.children).slice(0,8).forEach((li,n)=>li.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:420,delay:60+n*35,easing:EASE,fill:'backwards'}));
  }
}

/* A zone as a table: one record per row, columns Type / Name / Content / TTL, like a DNS panel. */
function zoneTable(el,z,dom){
  const dot=v=>String(v||'').replace(/\.$/,'');
  const rows=z.records.map(r=>{
    const k=r.raw||{};
    let ct,pr='';
    if(k.k==='mx'){ct=dot(k.host);pr=k.prio;}
    else if(k.k==='host')ct=dot(k.host);
    else if(k.k==='text')ct=k.text;
    else ct=k.v!=null?k.v:'';
    const nm=r.name==='@'?(dom||'@'):dot(r.name);
    return '<tr><td class="ty">'+esc(r.type)+'</td><td class="nm">'+esc(nm)+'</td><td class="ct" title="'+esc(ct)+'">'+esc(ct)+(pr?'<small>Priority '+esc(pr)+'</small>':'')+'</td><td class="tt">'+esc(r.ttl||z.ttl||'Auto')+'</td></tr>';
  }).join('');
  el.innerHTML=rows?'<table><thead><tr><th>Type</th><th>Name</th><th>Content</th><th>TTL</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class="zt-empty">No records recognised in this text.</p>';
}

const GOALS=[
  ['site','Website','Root domain and www','Website'],
  ['mail','Email','MX, SPF, DKIM and DMARC','Email'],
  ['mailcli','Webmail and autoconfig','webmail, autodiscover, Teams','Webmail'],
  ['sub','Other subdomains','shop, blog, app and the like','Subdomains'],
  ['verif','Service verifications','Google, Meta, Microsoft','Verifications'],
  ['server','FTP and panel','ftp, cpanel, ssh','FTP and panel'],
  ['cert','Certificates','CAA and ACME validation','Certificates']
];
const groupsFor=m=>[
  ['add','Add at the destination',"The origin has them and the destination doesn't yet."],
  ['diff','Check','They exist on both sides with different values. Decide which one stands.'],
  ['review','Review',"I couldn't tell what these are for. Decide whether they stay."],
  ['remove','Safe to remove','Nothing you switched on uses these records.'],
  ['keep','Only at the destination','They are needed and stay as they are.'],
  ['ok',m==='single'?'Keep':'Already right',m==='single'?'Used by what you switched on.':'The same on both sides.'],
  ['skip','No need to copy','Only the origin has them, and nothing you switched on uses them.'],
  ['infra','From the DNS provider','SOA and NS change with every provider.']
];
/* A plain-language name for each record. The technical data goes underneath, smaller. */
function titleOf(s){
  const k=(s.o[0]||s.d[0]).kind||'',rel=s.rel,t=s.type;
  if(t==='SOA')return 'Zone authority record';
  if(t==='NS')return rel==='@'?'Name servers':'Delegation of '+rel;
  if(t==='MX')return 'Server that receives email';
  if(k==='spf')return 'Who may send email (SPF)';
  if(k==='dkim')return 'Email signature (DKIM)';
  if(k==='dmarc')return 'Protection against spoofed email (DMARC)';
  if(k==='mtasts')return 'Encryption for email delivery';
  if(s.cat==='cert')return t==='CAA'?'Who may issue certificates':'Certificate validation';
  if(s.cat==='verif'){const m=s.why.match(/for (.+)\.$/);return 'Domain verification'+(m?' for '+m[1]:'');}
  if(s.cat==='site')return rel==='@'?'Website address':'Website address with www';
  if(s.cat==='mailcli')return({webmail:'Webmail shortcut',autodiscover:'Email autoconfiguration',autoconfig:'Email autoconfiguration'})[rel]||(t==='SRV'?'Service autodiscovery':'Server for email apps');
  if(s.cat==='server')return({ftp:'FTP access',sftp:'SFTP access',ssh:'SSH access',cpanel:'Panel shortcut (cPanel)',whm:'Panel shortcut (WHM)',painel:'Panel shortcut',panel:'Panel shortcut',localhost:'Old record, unused'})[rel]||'Hosting service';
  if(s.cat==='sub')return rel.charAt(0)==='*'?'Subdomain wildcard':(/depends on/.test(s.note||'')?'Address used by another record':'Subdomain '+rel);
  if(t==='TXT')return 'Unrecognized text';
  return t+' record';
}
const fresh=()=>({o:'',d:'',dom:'',goals:['site','mail'],ov:{},open:{add:true,diff:true,review:true,remove:true},tab:'',openRec:new Set()});
function metaText(m){
  if(!m.n&&!m.ignored.length)return '';
  let t=m.n+(m.n===1?' record':' records');
  if(m.ignored.length)t+=' · '+m.ignored.length+(m.ignored.length===1?' line ignored':' lines ignored')+' ('+m.ignored.slice(0,5).join(', ')+(m.ignored.length>5?'…':'')+')';
  return t;
}

/* One board = switches + result. The landing page and the tool share it, each with its own state. */
function board(root,st,hooks){
  const el=n=>root.querySelector('[data-el="'+n+'"]');
  let res=null,swapTurn=0;
  function placeInd(anim){
    const seg=root.querySelector('.seg');if(!seg)return;
    const ind=seg.querySelector('.ind'),b=seg.querySelector('[aria-pressed="true"]');if(!ind||!b)return;
    if(!anim)ind.style.transition='none';
    ind.style.width=b.offsetWidth+'px';ind.style.transform='translateX('+(b.offsetLeft-3)+'px)';
    if(!anim){void ind.offsetWidth;ind.style.transition='';}
  }
  function renderGoals(){
    const G=el('goals');
    if(G.children.length){
      for(const g of GOALS){const b=G.querySelector('[data-goal="'+g[0]+'"]');b.setAttribute('aria-checked',String(st.goals.includes(g[0])));}
      return;
    }
    G.innerHTML=GOALS.map(g=>'<button type="button" class="sw" role="switch" data-goal="'+g[0]+'" aria-checked="'+st.goals.includes(g[0])+'"><span class="sw-text"><span class="gl">'+esc(g[1])+'</span><span class="gs">'+esc(g[3])+'</span><span class="gh">'+esc(g[2])+'</span></span><span class="gn" title="Records in this category">'+(res.catCounts[g[0]]||0)+'</span><span class="track" aria-hidden="true"><span class="knob"></span></span></button>').join('');
  }
  function rowHtml(s,i){
    const both=res.mode==='both';
    const vals=a=>a.map(r=>'<span class="val" title="'+esc(r.val)+'">'+esc(short(r.val))+'</span>').join('');
    let body;
    if(s.verdict==='diff')body='<div class="rv sides"><div><span class="side">At the origin</span>'+vals(s.o)+'</div><div><span class="side">At the destination</span>'+vals(s.d)+'</div></div>';
    else body='<div class="rv">'+vals(both&&s.d.length&&s.verdict!=='add'&&s.verdict!=='skip'?s.d:(s.o.length?s.o:s.d))+'</div>';
    let acts='';
    const b=(act,label)=>'<button type="button" class="btn sm" data-act="'+act+'" data-i="'+i+'">'+label+'</button>';
    if(st.ov[s.key])acts=b('undo','Undo');
    else if(s.verdict==='remove')acts=b('keep','Keep');
    else if(s.verdict==='skip')acts=b('keep','Copy too');
    else if(s.verdict==='review')acts=b('keep','Keep')+b('drop','Dismiss');
    return '<li class="rec'+(st.openRec.has(s.key)?' open':'')+'" data-i="'+i+'" data-flip="r:'+esc(s.key)+'"><div class="body"><span class="rt">'+esc(titleOf(s))+'</span><span class="rk"><b>'+esc(s.type)+'</b>'+esc(s.rel==='@'?'@ (root of the domain)':s.rel)+'</span>'+body+(s.note?'<span class="why">'+esc(s.note)+'</span>':'')+'</div><div class="acts">'+acts+'<i class="more" aria-hidden="true"></i></div></li>';
  }
  function renderResults(){
    const R=el('results');
    if(res.mode==='empty'){
      R.innerHTML='<div class="empty"><strong>Nothing to compare yet</strong><p>Paste a zone, upload a screenshot, or load the example. What is missing, what differs and what can go will show up here.</p></div>';
      return;
    }
    const c=res.counts,m=res.mode,na=res.alerts.length,pl=(n,a,b)=>n===1?a:b;
    const stats=m==='both'
      ?[['v-add',pl(c.add,'record to add','records to add'),c.add,'add'],['v-diff',pl(c.diff,'record to check','records to check'),c.diff,'diff'],['v-remove',pl(c.remove,'record that can go','records that can go'),c.remove,'remove'],['s-warn',pl(na,'warning','warnings'),na,'alerts']]
      :[['v-ok',pl(c.ok,'record stays','records stay'),c.ok,'ok'],['v-remove',pl(c.remove,'record can go','records can go'),c.remove,'remove'],['v-review',pl(c.review,'record to review','records to review'),c.review,'review'],['s-warn',pl(na,'warning','warnings'),na,'alerts']];
    const names=GOALS.filter(g=>st.goals.includes(g[0])).map(g=>g[0]==='server'?g[3]:g[3].toLowerCase());
    const list=names.length>1?names.slice(0,-1).join(', ')+' and '+names[names.length-1]:names[0];
    const say=names.length?'To keep <b>'+esc(list)+'</b> working'+(m==='both'?' at the destination':'')+':':'Nothing is switched on. Choose what has to work.';
    let h='<div class="summary"><p class="say" data-num="say">'+say+'</p><div class="figs">'+stats.map(s=>'<button type="button" class="fig '+s[0]+(s[2]?'':' zero')+'" data-jump="'+s[3]+'"'+(s[2]?'':' disabled')+'><i class="dot"></i><span class="n" data-num="'+s[3]+'">'+s[2]+'</span><span class="l">'+s[1]+'</span><i class="go" aria-hidden="true"></i></button>').join('')+'</div></div>';
    if(na){
      const sev={crit:'Critical.',warn:'Heads up.',info:'Tip.'};
      h+='<div class="block" data-el="alerts" data-flip="alerts"><h2>'+pl(na,'Warning','Warnings')+'</h2><ul class="alerts">'+res.alerts.map(a=>'<li class="alert s-'+a[0]+'"><i class="dot"></i><span><b>'+sev[a[0]]+'</b> '+esc(a[1])+'</span></li>').join('')+'</ul></div>';
    }
    h+='<div class="groups">';
    for(const g of groupsFor(m)){
      const rows=[];
      res.sets.forEach((s,i)=>{if(s.verdict===g[0])rows.push(rowHtml(s,i));});
      if(!rows.length)continue;
      h+='<details class="grp v-'+g[0]+'" data-v="'+g[0]+'"'+(st.open[g[0]]?' open':'')+'><summary data-flip="g:'+g[0]+'"><i class="dot"></i><span class="gt">'+g[1]+'</span><span class="gc">'+rows.length+'</span><span class="pm" aria-hidden="true"></span><span class="gd">'+g[2]+'</span></summary><ul class="recs">'+rows.join('')+'</ul></details>';
    }
    h+='</div>';
    const tabs=m==='both'?[['add','Add'],['remove','Remove'],['final','Final zone']]:[['remove','Remove'],['final','Clean zone']];
    if(!tabs.some(t=>t[0]===st.tab))st.tab=m==='both'&&c.add?'add':'final';
    h+='<div class="out" data-flip="out"><div class="out-head"><h2>Ready to copy</h2><div class="seg" role="group" aria-label="Output type"><i class="ind" aria-hidden="true"></i>'+tabs.map(t=>'<button type="button" data-tab="'+t[0]+'" aria-pressed="'+(st.tab===t[0])+'">'+t[1]+'</button>').join('')+'</div></div><pre data-el="pre" tabindex="0"><code>'+esc(res.out[st.tab]||EMPTY[st.tab])+'</code></pre><div><button type="button" class="btn dark" data-el="copy">Copy</button></div></div>';
    R.innerHTML=h;
    placeInd(false);
  }
  function render(){
    res=ZL.run(st.o,st.d,st.dom,new Set(st.goals),st.ov);
    renderGoals();
    renderResults();
    if(hooks.after)hooks.after(res);
  }
  const changed=()=>{if(hooks.changed)hooks.changed();};
  el('goals').addEventListener('click',e=>{
    const b=e.target.closest('[data-goal]');if(!b)return;
    const g=b.dataset.goal,i=st.goals.indexOf(g);
    if(i<0)st.goals.push(g);else st.goals.splice(i,1);
    flip(root,render);changed();
  });
  el('results').addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.v)st.open[d.dataset.v]=d.open;},true);
  el('results').addEventListener('click',e=>{
    const sm=e.target.closest('summary');
    if(sm){e.preventDefault();toggleGroup(sm.parentElement);return;}
    const a=e.target.closest('[data-act]');
    if(a){
      const s=res.sets[+a.dataset.i];if(!s)return;
      if(a.dataset.act==='undo')delete st.ov[s.key];else st.ov[s.key]=a.dataset.act;
      flip(root,render);changed();return;
    }
    const t=e.target.closest('[data-tab]');
    if(t){
      if(t.dataset.tab===st.tab)return;
      // the pill slides, the old text leaves toward where the pill came from, the box grows or shrinks, the new text arrives from the other side
      const tabs=Array.from(el('results').querySelectorAll('[data-tab]')),dir=tabs.indexOf(t)>tabs.findIndex(b=>b.dataset.tab===st.tab)?1:-1;
      st.tab=t.dataset.tab;
      tabs.forEach(b=>b.setAttribute('aria-pressed',String(b===t)));
      placeInd(true);
      const pre=el('pre'),code=pre.firstElementChild,text=res.out[st.tab]||EMPTY[st.tab];
      if(!canAnim()){code.textContent=text;pre.scrollLeft=0;return;}
      const turn=++swapTurn;
      const leave=code.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateX('+(-12*dir)+'px)'}],{duration:140,easing:'ease-in',fill:'forwards'});
      leave.onfinish=()=>{
        if(turn!==swapTurn){leave.cancel();return;}
        const h0=pre.getBoundingClientRect().height;
        code.textContent=text;pre.scrollLeft=0;
        leave.cancel();
        const h1=pre.getBoundingClientRect().height;
        if(Math.abs(h1-h0)>1){
          pre.style.overflow='hidden';
          const grow=pre.animate([{height:h0+'px'},{height:h1+'px'}],{duration:420,easing:EASE});
          grow.onfinish=grow.oncancel=()=>{pre.style.overflow='';};
        }
        code.animate([{opacity:0,transform:'translateX('+(16*dir)+'px)'},{opacity:1,transform:'none'}],{duration:380,easing:EASE});
      };
      return;
    }
    const j=e.target.closest('[data-jump]');
    if(j){
      const v=j.dataset.jump,to=v==='alerts'?el('alerts'):el('results').querySelector('.grp[data-v="'+v+'"]');
      if(!to)return;
      if(to.tagName==='DETAILS'){to.open=true;st.open[v]=true;}
      to.scrollIntoView({behavior:calm.matches?'auto':'smooth',block:'start'});
      return;
    }
    const cp=e.target.closest('[data-el="copy"]');
    if(cp){
      const text=res.out[st.tab]||'';
      const done=msg=>{cp.textContent=msg;setTimeout(()=>{cp.textContent='Copy';},1800);};
      const fallback=()=>{const r=document.createRange();r.selectNodeContents(el('pre'));const sel=getSelection();sel.removeAllRanges();sel.addRange(r);done('Text selected: copy it manually');};
      if(!text){done('Nothing to copy');return;}
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>done('Copied'),fallback);else fallback();
      return;
    }
    const rc=e.target.closest('.rec');
    if(rc){
      const s=res.sets[+rc.dataset.i];
      if(s){if(st.openRec.has(s.key))st.openRec.delete(s.key);else st.openRec.add(s.key);morph(rc,()=>rc.classList.toggle('open'));}
    }
  });
  return{render,placeInd};
}

const HV=document.querySelector('[data-view="home"]'),TV=document.querySelector('[data-view="tool"]');
let demo,tool;
if(HV){
/* Landing: the example lives here, always with the same data. */
const demoState=Object.assign(fresh(),{o:ZL.EX_O,d:ZL.EX_D});
function dnsTable(el,cols,rows){
  const th=cols.map(c=>'<th>'+c+'</th>').join('');
  const tr=rows.map(r=>'<tr>'+r.map((c,i)=>{
    const k=cols[i];
    if(k==='Type')return '<td class="ty">'+esc(c)+'</td>';
    if(k==='Name')return '<td class="nm">'+esc(c)+'</td>';
    if(k==='Content'){const v=Array.isArray(c)?c[0]:c,pr=Array.isArray(c)?c[1]:'';return '<td class="ct" title="'+esc(v)+'">'+esc(v)+(pr?'<small>Priority '+esc(pr)+'</small>':'')+'</td>';}
    if(k==='Proxy status'){const on=/^proxied$/i.test(c);return '<td><span class="pxs'+(on?' on':'')+'">'+esc(c)+'</span></td>';}
    return '<td class="tt">'+esc(c)+'</td>';
  }).join('')+'</tr>').join('');
  el.innerHTML='<table><thead><tr>'+th+'</tr></thead><tbody>'+tr+'</tbody></table>';
}
(()=>{
  const dom='example.com',nm=n=>n==='@'?dom:n;
  const o=[];let ttl='3600';
  ZL.EX_O.split('\n').forEach(l=>{
    if(l.startsWith('$TTL')){ttl=l.split(/\s+/)[1];return;}
    if(l.startsWith('$'))return;
    const m=l.match(/^(\S+)\s+IN\s+(\S+)\s+(.*)$/);if(!m)return;
    let ct=m[3].trim();
    if(m[2]==='SOA')ct=ct.replace(/\s*\(.*\)\s*$/,'');
    if(m[2]==='MX'){const p=ct.split(/\s+/);o.push([m[2],nm(m[1]),[p[1].replace(/\.$/,''),p[0]],ttl]);return;}
    o.push([m[2],nm(m[1]),ct.replace(/^"|"$/g,'').replace(/(\.[a-z]+)\.$/,'$1'),ttl]);
  });
  const d=ZL.EX_D.split('\n').slice(1).map(l=>{
    const p=l.split('\t');
    if(p[0]==='MX')return [p[0],p[1],[p[2],p[3]],p[4],p[5]];
    return [p[0],p[1],p[2].replace(/^"|"$/g,''),p[3],p[4]];
  });
  dnsTable($('demo-o'),['Type','Name','Content','TTL'],o);
  dnsTable($('demo-d'),['Type','Name','Content','Proxy status','TTL'],d);
})();
demo=board(HV,demoState,{after:res=>{$('demo-mo').textContent=metaText(res.meta.o);$('demo-md').textContent=metaText(res.meta.d);}});
demo.render();
}
if(TV){
/* Tool: starts empty every time. Nothing the person pastes is stored anywhere: no localStorage, no cookies, no server. */
const state=fresh();
try{localStorage.removeItem(KEY);}catch(e){}  // wipes anything an earlier version may have left behind
let renderT=0;
function save(){}
tool=board(TV,state,{changed:save,after:res=>{
  $('mo').textContent=metaText(res.meta.o);
  $('md').textContent=metaText(res.meta.d);
  lastDom=res.origin||'';
  $('exo').hidden=!state.o||state.o!==ZL.EX_O;
  $('exd').hidden=!state.d||state.d!==ZL.EX_D;
  syncZones();
}});
function later(){clearTimeout(renderT);renderT=setTimeout(tool.render,180);save();}
/* On a phone each zone stays collapsed until the person asks to edit the text. */
const zopen={o:!state.o.trim(),d:false};
const vw={o:'text',d:'text'};
let lastDom='';
function syncViews(){
  for(const side of ['o','d']){
    const tbl=state[side].trim().length>0;   // text is only the paste box: once there are records, the table takes its place
    $('z'+side).hidden=tbl;$('zt'+side).hidden=!tbl;
    if(tbl)zoneTable($('zt'+side),ZL.parseZone(state[side]),state.dom||lastDom);
  }
}
function syncZones(){
  syncViews();
  for(const side of ['o','d']){
    TV.querySelector('.zone[data-side="'+side+'"]').classList.toggle('closed',!zopen[side]);
    const b=$('edit'+side);b.textContent=zopen[side]?'Close':(state[side].trim()?'Edit text':'Paste text');b.setAttribute('aria-expanded',String(zopen[side]));b.hidden=zopen[side]&&!state[side].trim();
    b.hidden=true;   // the table replaces the text once there are records, so there is nothing to edit here
  }
}
for(const side of ['o','d'])$('edit'+side).addEventListener('click',()=>{zopen[side]=!zopen[side];morph(TV.querySelector('.zone[data-side="'+side+'"]'),syncZones);if(zopen[side])$('z'+side).focus({preventScroll:true});});
for(const side of ['o','d'])$('z'+side).addEventListener('paste',()=>setTimeout(syncZones,60));
syncZones();
$('zo').value=state.o;$('zd').value=state.d;
$('zo').addEventListener('input',e=>{state.o=e.target.value;later();});
$('zd').addEventListener('input',e=>{state.d=e.target.value;later();});
$('bex').addEventListener('click',()=>{state.o=ZL.EX_O;state.d=ZL.EX_D;state.dom='';state.ov={};$('zo').value=state.o;$('zd').value=state.d;vw.o=vw.d='table';zopen.o=zopen.d=false;syncZones();flip(TV,tool.render);save();});
$('bcl').addEventListener('click',()=>{state.o=state.d=state.dom='';state.ov={};$('zo').value=$('zd').value='';vw.o=vw.d='text';zopen.o=true;zopen.d=false;syncZones();flip(TV,tool.render);save();$('zo').focus();});
tool.render();
/* Screenshot reading: Claude transcribes the image into lines the parser already understands. */
const PROMPT=['The image is a screenshot of a DNS panel or of a zone file. If there is more than one image, they are parts of the same zone, in order.',
'Transcribe ALL the DNS records visible, one per line, with the fields separated by TAB, in this exact format:',
'TYPE\tNAME\tVALUE',
'Rules:',
'- TYPE in uppercase (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA).',
'- NAME exactly as it appears in the screenshot. Use @ when the panel shows @ or leaves the name empty.',
'- MX: VALUE is the priority, a space and the server. Example: 10 mx.example.com',
'- SRV: VALUE is priority, weight, port and target, separated by spaces.',
'- TXT: VALUE in double quotes, with the exact text.',
'- Leave out TTL, proxy status, headers, buttons and comments.',
'- Copy character by character. Do not correct, complete or invent anything. If a value is cut off in the screenshot, end that value with the character …',
'- If the image has no DNS records, reply only: NO_RECORDS',
'Reply with the lines only, no text before or after and no code block.'].join('\n');
/* Screenshot reading: OCR (Tesseract.js) running in the browser. The image never leaves the device;
   only the reader library and its language data are downloaded. Text recognition makes mistakes, and the interface says so. */
let ocrLib=null;
function loadOcr(){
  if(window.Tesseract)return Promise.resolve();
  return ocrLib||(ocrLib=new Promise((ok,no)=>{
    const t=document.createElement('script');
    t.src='https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
    t.onload=ok;t.onerror=()=>{ocrLib=null;no({code:'offline'});};
    document.head.appendChild(t);
  }));
}
const TYPE_RE=/\b(SOA|CNAME|AAAA|TXT|MX|NS|A|SRV|CAA|PTR|SPF)\b/;
const ocrFix=l=>{
  const f=l.split('\t');
  if(/^(SOA|CNAME|AAAA|TXT|MX|NS|A|SRV|CAA|PTR|SPF)$/.test(f[0])&&f[1])f[1]=f[1].toLowerCase();   // host names are case-insensitive
  return f.join('\t').replace(/_(?=[.])/g,'');                                              // a stray underscore before a dot is OCR noise
};
const ocrClean=t=>t.split('\n').map(l=>l.replace(/[|│]/g,' ').trim().replace(/\s{2,}/g,'\t')).filter(l=>l&&TYPE_RE.test(l)).map(ocrFix).join('\n');
/* Small text in screenshots is what OCR gets wrong most. Enlarge, make it grey, add contrast, and flip dark themes to dark-on-light. */
async function prepare(file){
  try{
    const bmp=await createImageBitmap(file);
    const k=bmp.width<1000?3:bmp.width<1800?2:1.5;
    const W=Math.round(bmp.width*k),H=Math.round(bmp.height*k);
    if(W*H>40e6)return file;
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const x=c.getContext('2d',{willReadFrequently:true});
    x.imageSmoothingQuality='high';x.fillStyle='#fff';x.fillRect(0,0,W,H);
    x.drawImage(bmp,0,0,W,H);
    const t=document.createElement('canvas');t.width=t.height=24;
    const tx=t.getContext('2d',{willReadFrequently:true});tx.drawImage(bmp,0,0,24,24);
    const d=tx.getImageData(0,0,24,24).data;let lum=0;
    for(let i=0;i<d.length;i+=4)lum+=d[i]*.299+d[i+1]*.587+d[i+2]*.114;
    lum/=d.length/4;
    if('filter' in x){
      const f='grayscale(1) contrast(1.3)',g=lum<115?'invert(1) '+f:f;
      x.filter=g;x.fillStyle='#fff';x.fillRect(0,0,W,H);x.drawImage(bmp,0,0,W,H);x.filter='none';
    }
    bmp.close&&bmp.close();
    return c;
  }catch(e){return file;}
}
async function ocrRead(_prompt,{images,signal}){
  await loadOcr();
  if(signal&&signal.aborted)throw{code:'cancelled'};
  const worker=await Tesseract.createWorker('eng');
  const stop=()=>{worker.terminate().catch(()=>{});};
  if(signal)signal.addEventListener('abort',stop);
  try{
    await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
    const out=[];
    for(const f of images){out.push((await worker.recognize(await prepare(f))).data.text);}
    return{text:ocrClean(out.join('\n'))};
  }catch(e){
    if(signal&&signal.aborted)throw{code:'cancelled'};
    throw e;
  }finally{
    if(signal)signal.removeEventListener('abort',stop);
    worker.terminate().catch(()=>{});
  }
}
let sample=ocrRead,imgLimits={maxCount:5};
const busy={o:false,d:false},ta={o:$('zo'),d:$('zd')},EX={o:ZL.EX_O,d:ZL.EX_D};
function setStatus(side,msg,cancel){
  const el=$('s'+side);
  el.textContent=msg||'';el.hidden=!msg;
  if(msg&&cancel){const sp=document.createElement('span');sp.className='spin';sp.setAttribute('aria-hidden','true');el.prepend(sp);}
  if(msg&&cancel){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent='Cancel';b.addEventListener('click',cancel);el.append(b);}
}
function hideImages(){sample=null;$('dropo').hidden=$('dropd').hidden=true;}
const COPY={rate_limited:'Claude usage limit reached. Try again later.',session_expired:'Session expired. Sign in to Claude again and repeat.',image_rejected:'Image rejected for its type or size. Use PNG or JPG.',refused:"Couldn't read that screenshot. Try a sharper crop.",empty_completion:"Couldn't read that screenshot. Try a sharper crop."};
COPY.offline="Couldn't load the screenshot reader. Check your connection and try again.";
const GONE=['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed','images_unavailable'];
async function readImages(side,files){
  if(!sample||!imgLimits||busy[side])return;
  let imgs=Array.from(files||[]).filter(f=>f.type&&f.type.indexOf('image/')===0);
  if(!imgs.length){setStatus(side,'That file is not an image.');return;}
  const extra=imgs.length>imgLimits.maxCount;
  imgs=imgs.slice(0,imgLimits.maxCount);
  const ctl=new AbortController();
  busy[side]=true;$('pick'+side).disabled=true;
  setStatus(side,'Reading the screenshot. The first time can take a few seconds.',()=>ctl.abort());
  try{
    const r=await sample(PROMPT,{images:imgs,signal:ctl.signal});
    const text=String(r.text||'').replace(/^```.*$/gm,'').trim();
    if(!text||/NO_RECORDS/.test(text)){setStatus(side,'No DNS records found in that screenshot.');return;}
    const cur=state[side],other=side==='o'?'d':'o';
    state[side]=(!cur.trim()||cur===EX[side])?text:cur.replace(/\s+$/,'')+'\n'+text;
    ta[side].value=state[side];
    if(state[other]&&state[other]===EX[other]){state[other]='';ta[other].value='';}
    vw[side]='table';zopen[side]=false;syncZones();flip(TV,tool.render);save();
    const n=text.split('\n').filter(l=>l.trim()).length;
    setStatus(side,n+(n===1?' line read':' lines read')+' from the screenshot'+(r.truncated?' (the answer was cut short: send the screenshot in parts)':'')+'. Text recognition can make mistakes: check every record, especially long values such as DKIM, before using them.'+(extra?' Only the first '+imgLimits.maxCount+' images were read.':''));
  }catch(e){
    const code=e&&e.code;
    if(code==='cancelled')setStatus(side,'');
    else if(GONE.includes(code)){hideImages();setStatus(side,'Screenshot reading is not available here. Paste the zone text.');}
    else setStatus(side,COPY[code]||'Reading failed. Try again.');
  }finally{busy[side]=false;$('pick'+side).disabled=false;}
}
for(const side of ['o','d']){
  const zone=TV.querySelector('.zone[data-side="'+side+'"]'),input=$('f'+side);
  const hasFiles=e=>sample&&e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files');
  $('pick'+side).addEventListener('click',()=>input.click());
  input.addEventListener('change',()=>{readImages(side,input.files);input.value='';});
  zone.addEventListener('dragover',e=>{if(hasFiles(e)){e.preventDefault();zone.classList.add('drag');}});
  zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drag');});
  zone.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();zone.classList.remove('drag');readImages(side,e.dataTransfer.files);});
  ta[side].addEventListener('paste',e=>{
    const fs=Array.from((e.clipboardData&&e.clipboardData.files)||[]).filter(f=>f.type.indexOf('image/')===0);
    if(sample&&fs.length){e.preventDefault();readImages(side,fs);}
  });
}

}
/* The mark behaves like a zone: one connected outline that keeps reshaping itself.
   It is a single polygon. Its corners glide from one arrangement to the next, every edge stays straight and every corner keeps the same radius. */
(function mark(){
  const U=32,R=8,HOLD=420,MOVE=1050;
  const KEYS=[[[1,0],[2,0],[3,0],[2,1.5],[2.5,2.25],[3,3],[2,3],[1,3],[0,3],[1,1.5],[0.5,0.75],[0,0]],[[0.75,0],[1.5,0],[2.25,0.75],[3,1.5],[2.25,2.25],[1.5,3],[1,3],[0.5,3],[0,3],[0.75,2.25],[1.5,1.5],[0,0]],[[0.5,0],[1,0],[1,1],[2,1],[2,2],[3,2],[3,3],[1.5,3],[0,3],[0,2],[0,1],[0,0]],[[0,0],[1,0],[2,1],[3,1],[3,2],[3,2.5],[3,3],[2,3],[1,2],[0,2],[0,1],[0,0.5]],[[1.6,0],[2.4,0],[3,0],[2.75,0.75],[2.25,2.25],[2,3],[1.4,3],[0.6,3],[0,3],[0.25,2.25],[0.75,0.75],[1,0]],[[1,0],[2,0],[2.5,0.5],[3,1],[3,2],[2.5,2.5],[2,3],[1,3],[0.5,2.5],[0,2],[0,1],[0.5,0.5]],[[1,0],[2,0],[2,1],[3,1],[3,2],[2,2],[2,3],[1,3],[1,2],[0,2],[0,1],[1,1]]];
  const paths=[];
  document.querySelectorAll('.mk').forEach(host=>{
    host.innerHTML='<svg viewBox="-4 -4 104 104" aria-hidden="true"><path fill="currentColor"/></svg>';
    paths.push(host.querySelector('path'));
  });
  if(!paths.length)return;
  function outline(P){
    const n=P.length,parts=[];
    for(let i=0;i<n;i++){
      const p0=P[(i+n-1)%n],p1=P[i],p2=P[(i+1)%n];
      const ax=p0[0]-p1[0],ay=p0[1]-p1[1],bx=p2[0]-p1[0],by=p2[1]-p1[1],la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);
      if(la<.001||lb<.001)continue;
      const th=Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/(la*lb))));
      if(th>Math.PI-.02){parts.push(p1[0].toFixed(2)+' '+p1[1].toFixed(2));continue;}
      const tn=Math.tan(th/2),d=Math.min(R/tn,la/2,lb/2),rr=(d*tn).toFixed(2);
      parts.push((p1[0]+ax/la*d).toFixed(2)+' '+(p1[1]+ay/la*d).toFixed(2)+'A'+rr+' '+rr+' 0 0 '+(ax*by-ay*bx<0?1:0)+' '+(p1[0]+bx/lb*d).toFixed(2)+' '+(p1[1]+by/lb*d).toFixed(2));
    }
    return 'M'+parts.join('L')+'Z';
  }
  const at=(a,b,t)=>a.map((p,i)=>[(p[0]+(b[i][0]-p[0])*t)*U,(p[1]+(b[i][1]-p[1])*t)*U]);
  const draw=d=>paths.forEach(p=>p.setAttribute('d',d));
  draw(outline(at(KEYS[0],KEYS[0],0)));
  if(calm.matches||!window.requestAnimationFrame)return;
  const ease=x=>x<.5?16*x*x*x*x*x:1-Math.pow(-2*x+2,5)/2;
  let t0=0,was=-1;
  function frame(now){
    if(!t0)t0=now;
    const span=HOLD+MOVE,el=now-t0,k=Math.floor(el/span)%KEYS.length,local=el%span;
    if(local>=HOLD){draw(outline(at(KEYS[k],KEYS[(k+1)%KEYS.length],ease((local-HOLD)/MOVE))));was=-1;}
    else if(was!==k){draw(outline(at(KEYS[k],KEYS[k],0)));was=k;}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* Two real pages: index.html (landing) and tool.html. Each loads only its own view. */
const cur=HV?demo:tool;
cur.placeInd(false);
fields.forEach(f=>f.size());
if(canAnim())(HV||TV).animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'none'}],{duration:480,easing:EASE});
addEventListener('resize',()=>cur.placeInd(false));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>cur.placeInd(false));
/* The example stays folded until asked for; it opens and closes smoothly. */
const EXB=document.getElementById('ex-btn'),EXD=document.getElementById('ex-body');
let exBusy=false;
function setEx(open,after){
  if(!EXB||exBusy||EXB.getAttribute('aria-expanded')===String(open)){if(after)after();return;}
  const box=EXB.closest('.ex');
  EXB.setAttribute('aria-expanded',String(open));
  if(open)box.setAttribute('data-open','');else box.removeAttribute('data-open');
  if(!canAnim()){EXD.hidden=!open;if(open&&cur)cur.placeInd(false);if(after)after();return;}
  exBusy=true;
  const fin=()=>{EXD.style.overflow='';exBusy=false;if(!open)EXD.hidden=true;if(after)after();};
  if(open){
    EXD.hidden=false;
    const h=EXD.getBoundingClientRect().height;
    EXD.style.overflow='hidden';
    const an=EXD.animate([{height:'0px',opacity:0},{height:h+'px',opacity:1}],{duration:620,easing:EASE});
    EXD.firstElementChild.animate([{transform:'translateY(-16px)'},{transform:'none'}],{duration:620,easing:EASE});
    an.onfinish=an.oncancel=fin;
    if(cur)cur.placeInd(false);
  }else{
    const h=EXD.getBoundingClientRect().height;
    EXD.style.overflow='hidden';
    const an=EXD.animate([{height:h+'px',opacity:1},{height:'0px',opacity:0}],{duration:460,easing:EASE});
    an.onfinish=an.oncancel=fin;
  }
}
if(EXB)EXB.addEventListener('click',()=>setEx(EXB.getAttribute('aria-expanded')!=='true'));
document.addEventListener('click',e=>{
  const sc=e.target.closest('[data-scroll]');
  if(sc){
    const to=$(sc.dataset.scroll);if(!to)return;
    const go=()=>to.scrollIntoView({behavior:calm.matches?'auto':'smooth',block:'start'});
    if(sc.dataset.scroll==='demo'&&EXB&&EXB.getAttribute('aria-expanded')!=='true'){go();setEx(true);}else go();
  }
});

})();

/* Coming back with the browser's back/forward button must not bring the pasted text back either. */
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
