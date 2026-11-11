const ZL=(()=>{
const TYPES=new Set('A AAAA CNAME MX TXT NS SOA SRV CAA PTR SPF TLSA DS DNSKEY NAPTR HTTPS SVCB ALIAS ANAME'.split(' '));
const ADDR=['A','AAAA','CNAME','ALIAS','ANAME'];
const ORDER=['SOA','NS','A','AAAA','ALIAS','ANAME','CNAME','MX','TXT','SRV','CAA'];
const isNum=t=>/^\d+$/.test(t);
const isTTL=t=>/^\d+[smhdw]?$/i.test(t);
const isClass=t=>/^(IN|CH|HS)$/i.test(t);
const JUNK=/^(auto|automatic|automático|proxied|proxy|dns|only|somente|editar|edit|excluir|delete|remover)$/i;
const HEADER=/^(type|tipo|name|nome|host|hostname|record|registro|entrada)$/i;
const clean=h=>String(h||'').trim().toLowerCase().replace(/\.+$/,'');

function stripComment(line){
  let q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&line[i-1]!=='\\')q=!q;
    else if(c===';'&&!q&&(i===0||/\s/.test(line[i-1])))return line.slice(0,i);
  }
  return line;
}
function parenDepth(s){let q=false,d=0;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'&&s[i-1]!=='\\')q=!q;else if(!q){if(c==='(')d++;else if(c===')')d--;}}return d;}
function stripParens(s){let q=false,o='';for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'&&s[i-1]!=='\\')q=!q;o+=(!q&&(c==='('||c===')'))?' ':c;}return o;}
function joinParens(lines){
  const out=[];
  for(let i=0;i<lines.length;i++){
    let buf=lines[i],d=parenDepth(buf),j=i;
    while(d>0&&j+1<lines.length&&j-i<12){j++;buf+=' '+lines[j].trim();d=parenDepth(buf);}
    if(d===0&&buf.includes('(')){out.push({text:stripParens(buf),n:i+1});i=j;}
    else out.push({text:lines[i],n:i+1});
  }
  return out;
}
function tokenize(s){
  const t=[];let i=0;
  while(i<s.length){
    const c=s[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==='"'){let j=i+1,v='';while(j<s.length&&s[j]!=='"'){if(s[j]==='\\'&&j+1<s.length){v+=s[j+1];j+=2;continue;}v+=s[j];j++;}t.push({v,q:true});i=j+1;continue;}
    let j=i;while(j<s.length&&!/\s/.test(s[j]))j++;
    t.push({v:s.slice(i,j),q:false});i=j;
  }
  return t;
}
const isIP=t=>/^\d{1,3}(\.\d{1,3}){3}$/.test(t);
function strict(type,vt){
  const plain=vt.filter(t=>!t.q).map(t=>t.v);
  if(type==='A')return plain.some(isIP);
  if(type==='AAAA')return plain.some(t=>t.includes(':'));
  if(['MX','CNAME','NS','PTR','ALIAS','ANAME'].includes(type))return plain.some(t=>!isNum(t)&&!isIP(t)&&!JUNK.test(t));
  return vt.length>0;
}
function locate(toks,lead,last){
  const isType=i=>toks[i]&&!toks[i].q&&TYPES.has(toks[i].v.toUpperCase());
  const skip=i=>toks[i]&&!toks[i].q&&(isTTL(toks[i].v)||isClass(toks[i].v));
  const scan=from=>{let i=from,ttl=null;while(skip(i)){if(isTTL(toks[i].v))ttl=toks[i].v;i++;}return isType(i)?{ti:i,ttl}:null;};
  let r;
  if(!lead&&isType(0)&&isType(1)&&toks.length>=3){
    const up=s=>s===s.toUpperCase();
    const nameFirst=strict(toks[1].v.toUpperCase(),toks.slice(2)),typeFirst=strict(toks[0].v.toUpperCase(),toks.slice(2));
    if(typeFirst&&(!nameFirst||(up(toks[0].v)&&!up(toks[1].v))))return{name:toks[1].v,ti:0,ttl:null,from:2};
  }
  if(lead&&last!=null&&(r=scan(0)))return{name:last,ti:r.ti,ttl:r.ttl,from:r.ti+1};
  if(!toks[0].q&&!isClass(toks[0].v)&&(r=scan(1)))return{name:toks[0].v,ti:r.ti,ttl:r.ttl,from:r.ti+1};
  if(isType(0)&&toks.length>=3&&!toks[1].q)return{name:toks[1].v,ti:0,ttl:null,from:2};
  if(last!=null&&(r=scan(0)))return{name:last,ti:r.ti,ttl:r.ttl,from:r.ti+1};
  return null;
}
function buildValue(type,vt){
  const plain=vt.filter(t=>!t.q).map(t=>t.v),quoted=vt.filter(t=>t.q).map(t=>t.v);
  const word=()=>plain.find(t=>!isNum(t)&&!JUNK.test(t));
  switch(type){
    case 'A':{const ip=plain.find(t=>/^\d{1,3}(\.\d{1,3}){3}$/.test(t));return ip?{k:'raw',v:ip}:null;}
    case 'AAAA':{const ip=plain.find(t=>t.includes(':')&&/^[0-9a-f:.]+$/i.test(t));return ip?{k:'raw',v:ip.toLowerCase()}:null;}
    case 'CNAME':case 'NS':case 'PTR':case 'ALIAS':case 'ANAME':{const h=word();return h?{k:'host',host:h}:null;}
    case 'MX':{const h=word();return h?{k:'mx',prio:plain.find(isNum)||'0',host:h}:null;}
    case 'SRV':{const h=word(),n=plain.filter(isNum).slice(0,3);return h&&n.length===3?{k:'srv',nums:n.join(' '),host:h}:null;}
    case 'TXT':case 'SPF':{
      let text;
      if(quoted.length)text=quoted.join('');
      else{const a=plain.slice();if(a.length>1&&a[0]==='0')a.shift();while(a.length>1&&(JUNK.test(a[a.length-1])||isTTL(a[a.length-1])))a.pop();text=a.join(' ');}
      text=text.replace(/\s+/g,' ').trim();
      return text?{k:'text',text}:null;
    }
    case 'CAA':{
      const tag=plain.find(t=>/^(issue|issuewild|iodef)$/i.test(t));
      const val=quoted[0]||plain.find(t=>!isNum(t)&&t!==tag&&!JUNK.test(t));
      return tag&&val?{k:'raw',v:(plain.find(isNum)||'0')+' '+tag.toLowerCase()+' "'+val+'"'}:null;
    }
    default:{const v=vt.map(t=>t.q?'"'+t.v+'"':t.v).join(' ');return v?{k:'raw',v}:null;}
  }
}
function parseZone(text){
  const z={records:[],origin:'',ttl:null,ignored:[]};
  if(!text||!text.trim())return z;
  text=text.replace(/[\u201C\u201D]/g,'"').replace(/\r/g,'');
  let lines=text.split('\n').map(stripComment);
  const ne=lines.filter(l=>l.trim());
  if(ne.length&&ne.every(l=>/^\s/.test(l)))lines=lines.map(l=>l.trim());
  let last=null;
  for(const item of joinParens(lines)){
    const ln=item.text;
    if(!ln.trim())continue;
    const toks=tokenize(ln);
    if(!toks.length)continue;
    const f=toks[0].v;
    if(!toks[0].q&&f[0]==='$'){
      const up=f.toUpperCase();
      if(up==='$ORIGIN'&&toks[1])z.origin=clean(toks[1].v);
      else if(up==='$TTL'&&toks[1])z.ttl=toks[1].v;
      continue;
    }
    const loc=locate(toks,/^\s/.test(ln),last);
    if(!loc){if(!HEADER.test(f))z.ignored.push(item.n);continue;}
    const type=toks[loc.ti].v.toUpperCase();
    const raw=buildValue(type,toks.slice(loc.from));
    if(!raw){z.ignored.push(item.n);continue;}
    last=loc.name;
    z.records.push({name:loc.name,type:type==='SPF'?'TXT':type,raw,ttl:loc.ttl});
  }
  return z;
}
function detectOrigin(zs,domain){
  const d=clean(String(domain||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,''));
  if(d)return d;
  for(const z of zs)if(z.origin)return z.origin;
  for(const z of zs){const soa=z.records.find(r=>r.type==='SOA'&&clean(r.name).includes('.'));if(soa)return clean(soa.name);}
  const names=[];
  for(const z of zs)for(const r of z.records){const n=clean(r.name);if(n.includes('.')&&!n.includes('_')&&!n.includes('*'))names.push(n);}
  let best='',bc=1;
  for(const c of new Set(names)){
    if(!/\.[a-z]{2,}$/.test(c))continue;
    const k=names.filter(n=>n===c||n.endsWith('.'+c)).length;
    if(k>bc||(k===bc&&best&&c.length<best.length)){best=c;bc=k;}
  }
  return best;
}
function relName(name,origin){
  const n=clean(name);
  if(n==='@'||n==='')return '@';
  if(origin){if(n===origin)return '@';if(n.endsWith('.'+origin))return n.slice(0,-origin.length-1);}
  return n;
}
function absHost(h,origin){
  const x=clean(h);
  if(x==='@')return origin||'@';
  if(!x.includes('.')&&origin)return x+'.'+origin;
  return x;
}
function toRel(h,origin){
  if(h==='@')return '@';
  if(origin){if(h===origin)return '@';if(h.endsWith('.'+origin))return h.slice(0,-origin.length-1);return null;}
  return h.includes('.')?null:h;
}
function txtKind(rel,v){
  const l=v.toLowerCase();
  if(l.startsWith('v=spf1'))return 'spf';
  if(rel.startsWith('_dmarc')||l.startsWith('v=dmarc1'))return 'dmarc';
  if(rel.includes('_domainkey')||l.includes('v=dkim1'))return 'dkim';
  if(rel.startsWith('_mta-sts')||rel.startsWith('_smtp._tls'))return 'mtasts';
  if(rel.startsWith('_acme-challenge'))return 'acme';
  if(/^ms=ms\d+/.test(l))return 'verif:ms';
  const m=l.match(/^([a-z0-9._-]*(?:verif|challenge|validation)[a-z0-9._-]*)[=:]/);
  if(m)return 'verif:'+m[1];
  const p=l.match(/^(docusign|atlassian|adobe|zoho|stripe|apple|yandex|openai|miro|notion|canva|hubspot|brevo|sendinblue|mailru)/);
  if(p)return 'verif:'+p[1];
  return 'txt:'+v;
}
function finish(z,origin){
  for(const r of z.records){
    const raw=r.raw;
    r.rel=relName(r.name,origin);r.targets=[];r.kind=null;
    if(raw.k==='host'){r.val=absHost(raw.host,origin);r.targets.push({host:r.val});}
    else if(raw.k==='mx'||raw.k==='srv'){r.host=absHost(raw.host,origin);r.val=(raw.k==='mx'?raw.prio:raw.nums)+' '+r.host;r.targets.push({host:r.host});}
    else if(raw.k==='text'){
      r.val=raw.text;r.kind=txtKind(r.rel,r.val);
      if(r.kind==='spf')for(const tok of r.val.split(' ')){
        const t=tok.replace(/^[+~?-]/,'');let x;
        if(/^a$/i.test(t))r.targets.push({host:origin||'@',spf:'a mechanism'});
        else if((x=t.match(/^a:([^/]+)/i)))r.targets.push({host:absHost(x[1],origin),spf:'a mechanism'});
        else if((x=t.match(/^(?:include:|redirect=)(.+)$/i)))r.targets.push({host:absHost(x[1],origin),any:true,spf:'include'});
      }
    }else r.val=raw.v;
    if(r.type==='CNAME'&&r.rel.includes('_domainkey'))r.kind='dkim';
  }
}
const MAILCLI={webmail:'Webmail shortcut.',autodiscover:'Account autoconfiguration (Outlook and phones).',autoconfig:'Account autoconfiguration (Thunderbird and others).',mail:'Server address used in email apps.',email:'Server address used in email apps.',imap:'Server address used in email apps.',pop:'Server address used in email apps.',pop3:'Server address used in email apps.',smtp:'Server address used in email apps.',lyncdiscover:'Microsoft Teams / Skype for Business.',sip:'Microsoft Teams / Skype for Business.',enterpriseregistration:'Device registration in Microsoft 365.',enterpriseenrollment:'Device registration in Microsoft 365.',msoid:'Legacy Microsoft 365 sign-in.',calendar:'Shortcut to the email provider calendar.',agenda:'Shortcut to the email provider calendar.'};
const SERVER={ftp:'FTP access to the hosting.',sftp:'SFTP access to the hosting.',ssh:'SSH access to the server.',cpanel:'Hosting panel shortcut (cPanel).',whm:'Hosting panel shortcut (WHM).',webdisk:'cPanel web disk.',cpcontacts:'cPanel contacts.',cpcalendars:'cPanel calendar.',painel:'Hosting panel shortcut.',panel:'Hosting panel shortcut.',localhost:'Legacy record with no public use.'};
const WHO={'google-site-verification':'Google','facebook-domain-verification':'Meta',ms:'Microsoft 365','apple-domain-verification':'Apple','atlassian-domain-verification':'Atlassian','openai-domain-verification':'OpenAI'};
function classify(s){
  const rel=s.rel,type=s.type,k=(s.o[0]||s.d[0]).kind;
  if(type==='SOA')return['infra','SOA: created by the DNS provider itself.'];
  if(type==='NS')return rel==='@'?['infra','Name servers: they change with every provider.']:['sub','Delegates '+rel+' to another DNS.'];
  if(type==='MX')return['mail','Sets which server receives the domain email.'];
  if(k==='spf')return['mail','SPF: lists who may send email for the domain.'];
  if(k==='dkim')return['mail','DKIM: key that validates the signature of sent email.'];
  if(k==='dmarc')return['mail','DMARC: what to do with email that fails SPF and DKIM.'];
  if(k==='mtasts')return['mail','Encryption policy for email delivery.'];
  if(k==='acme'||rel.startsWith('_acme-challenge'))return['cert','Certificate issuance validation (ACME).'];
  if(k&&k.startsWith('verif:'))return['verif','Domain ownership proof for '+(WHO[k.slice(6)]||'an external service')+'.'];
  if(type==='TXT')return['unk','TXT with no known pattern.'];
  if(type==='CAA')return['cert','CAA: limits which authorities may issue certificates.'];
  if(type==='SRV')return /^_(autodiscover|imaps?|pop3s?|submissions?|smtps?|sip|sipfederationtls|caldavs?|carddavs?)\./.test(rel)?['mailcli','Service autodiscovery (email, calendar or Teams).']:['unk','SRV for an unrecognized service.'];
  if(ADDR.includes(type)){
    if(rel==='@')return['site','Website address at the root domain.'];
    if(rel==='www')return['site','Website address with www.'];
    if(MAILCLI[rel])return['mailcli',MAILCLI[rel]];
    if(SERVER[rel])return['server',SERVER[rel]];
    if(rel.startsWith('*'))return['sub','Wildcard: answers for any subdomain without its own record.'];
    return['sub','Subdomain '+rel+'.'];
  }
  return['unk',type+' type not classified.'];
}
const cmp=(a,b)=>(a.rel==='@'?0:1)-(b.rel==='@'?0:1)||a.rel.localeCompare(b.rel)||((ORDER.indexOf(a.type)+1||99)-(ORDER.indexOf(b.type)+1||99));
const dot=h=>h.includes('.')?h+'.':h;
function fmtVal(r){
  const raw=r.raw;
  if(raw.k==='host')return dot(r.val);
  if(raw.k==='mx')return raw.prio+' '+dot(r.host);
  if(raw.k==='srv')return raw.nums+' '+dot(r.host);
  if(raw.k==='text'){const parts=r.val.match(/.{1,255}/g)||[''];return parts.map(p=>'"'+p.replace(/(["\\])/g,'\\$1')+'"').join(' ');}
  return r.val;
}
function bindLines(recs){
  const w=Math.min(28,Math.max(1,...recs.map(r=>r.rel.length)));
  return recs.map(r=>r.rel.padEnd(w)+' '+(r.ttl?r.ttl+' ':'')+'IN '+r.type.padEnd(5)+' '+fmtVal(r));
}
const VORDER=['add','diff','review','remove','keep','ok','skip','infra'];
function run(tO,tD,domain,goals,ov){
  const zo=parseZone(tO),zd=parseZone(tD);
  const nO=zo.records.length,nD=zd.records.length;
  const mode=nO&&nD?'both':(nO||nD)?'single':'empty';
  const origin=detectOrigin([zo,zd],domain);
  finish(zo,origin);finish(zd,origin);
  const sets=new Map();
  const put=(r,side)=>{
    const key=r.rel+'|'+r.type+(r.type==='TXT'?'|'+r.kind:'');
    let s=sets.get(key);
    if(!s){s={key,rel:r.rel,type:r.type,o:[],d:[]};sets.set(key,s);}
    if(!s[side].some(x=>x.val===r.val))s[side].push(r);
  };
  if(mode==='both'){zo.records.forEach(r=>put(r,'o'));zd.records.forEach(r=>put(r,'d'));}
  else (nO?zo:zd).records.forEach(r=>put(r,'o'));
  const list=[...sets.values()].sort(cmp);
  const byName=new Map();
  for(const s of list){
    const c=classify(s);s.cat=c[0];s.why=c[1];
    if(!byName.has(s.rel))byName.set(s.rel,[]);
    byName.get(s.rel).push(s);
  }
  const need=new Map();
  for(const s of list){
    if(s.cat==='infra')continue;
    if(ov[s.key]==='keep')need.set(s.key,{via:'pin'});
    else if(ov[s.key]!=='drop'&&goals.has(s.cat))need.set(s.key,{via:'goal'});
  }
  const q=[...need.keys()];
  while(q.length){
    const s=sets.get(q.shift());
    for(const r of s.o.concat(s.d))for(const t of r.targets){
      const rel=toRel(t.host,origin);
      if(rel==null)continue;
      for(const ts of byName.get(rel)||[]){
        if(ts===s||need.has(ts.key)||ts.cat==='infra')continue;
        if(!t.any&&!ADDR.includes(ts.type))continue;
        need.set(ts.key,{via:'dep',by:t.spf?'the SPF ('+t.spf+')':'the '+s.type+' of '+s.rel});
        q.push(ts.key);
      }
    }
  }
  const eq=(a,b)=>a.map(r=>r.val).sort().join('\n')===b.map(r=>r.val).sort().join('\n');
  const counts={add:0,diff:0,review:0,remove:0,keep:0,ok:0,skip:0,infra:0},catCounts={};
  for(const s of list){
    const n=need.get(s.key);
    s.needed=!!n;s.via=n?n.via:null;
    s.note=n&&n.via==='dep'?'Needed: '+n.by+' depends on this name.':n&&n.via==='pin'?'Kept by you.':ov[s.key]==='drop'?'Dismissed by you.':'';
    const inO=s.o.length>0,inD=s.d.length>0,unk=s.cat==='unk'&&ov[s.key]!=='drop';
    if(s.cat==='infra')s.verdict='infra';
    else if(mode==='single')s.verdict=s.needed?'ok':unk?'review':'remove';
    else if(s.needed)s.verdict=!inD?'add':!inO?'keep':eq(s.o,s.d)?'ok':'diff';
    else if(unk)s.verdict='review';
    else s.verdict=inD?'remove':'skip';
    counts[s.verdict]++;catCounts[s.cat]=(catCounts[s.cat]||0)+1;
  }
  const fin=[],finalLines=[];
  for(const s of list){
    const v=s.verdict;
    if(v==='infra'||v==='remove'||v==='skip')continue;
    const recs=(mode==='single'||v==='add')?s.o:s.d;
    if(!recs.length)continue;
    fin.push(...recs);
    s.finalRecs=recs;
  }
  const alerts=[];
  const has=(rel,types)=>fin.some(r=>r.rel===rel&&types.includes(r.type));
  const dom=origin||'the domain';
  if(mode!=='empty'){
    if(!goals.size)alerts.push(['info','Nothing is switched on, so almost everything shows as removable. Switch on what has to keep working.']);
    if(goals.has('site')){
      if(!has('@',ADDR))alerts.push(['crit',"The root domain doesn't point to any server: the site won't open without www."]);
      if(!has('www',ADDR))alerts.push(['warn',"There's no record for www: anyone typing www."+(origin||'domain')+" won't reach the site."]);
    }
    if(goals.has('mail')){
      const mx=fin.filter(r=>r.type==='MX');
      if(!mx.length)alerts.push(['crit','No MX record: '+dom+" can't receive email."]);
      const seen=new Set();
      for(const r of mx){
        const rel=toRel(r.host,origin);
        if(rel==null||seen.has(rel))continue;seen.add(rel);
        if(has(rel,['A','AAAA']))continue;
        if(has(rel,['CNAME']))alerts.push(['warn','The MX points to '+r.host+', which is a CNAME. DNS rules ask for a name with an A record.']);
        else alerts.push(['crit','The MX points to '+r.host+", but that name has no A record. Email won't arrive."]);
      }
      const spf=fin.filter(r=>r.kind==='spf'&&r.rel==='@');
      if(!spf.length)alerts.push(['warn','No SPF at the root domain: outgoing messages tend to land in spam.']);
      if(spf.length>1)alerts.push(['crit','There is more than one SPF at the root domain. Providers treat that as an error; merge them into a single record.']);
      if(!fin.some(r=>r.kind==='dmarc'))alerts.push(['warn','The DMARC record is missing. Gmail and Yahoo require it from bulk senders. To start, create a TXT at _dmarc with "v=DMARC1; p=none".']);
      if(!fin.some(r=>r.kind==='dkim'))alerts.push(['info',"No DKIM found. It may exist under a selector that isn't in the pasted zone; check with the email provider."]);
    }
    for(const r of fin)if(/(…|\.\.\.)$/.test(r.val))alerts.push(['warn',r.type+' '+r.rel+' looks cut off (it ends in an ellipsis). Screenshots often truncate long values; paste the full value before using it.']);
    const names=new Map();
    for(const r of fin){if(!names.has(r.rel))names.set(r.rel,new Set());names.get(r.rel).add(r.type);}
    for(const [rel,ts] of names)if(ts.has('CNAME')&&ts.size>1)alerts.push(['warn',rel+' has a CNAME alongside other records ('+[...ts].filter(t=>t!=='CNAME').join(', ')+'). A CNAME has to be alone on its name.']);
  }
  const addRecs=list.filter(s=>s.verdict==='add').flatMap(s=>s.o);
  const remRecs=list.filter(s=>s.verdict==='remove').flatMap(s=>mode==='single'?s.o:s.d);
  const head=['; Final zone'+(origin?' for '+origin:'')+', generated by Parity','; SOA and NS are left to the DNS provider.'];
  if(origin)head.push('$ORIGIN '+origin+'.');
  head.push('$TTL 3600','');
  const flat=bindLines(fin);let fi=0;
  for(const s of list){
    if(!s.finalRecs)continue;
    if(s.verdict==='diff')finalLines.push('; differs from the origin, check:');
    if(s.verdict==='review')finalLines.push('; not recognized, review:');
    for(let i=0;i<s.finalRecs.length;i++)finalLines.push(flat[fi++]);
  }
  list.sort((a,b)=>VORDER.indexOf(a.verdict)-VORDER.indexOf(b.verdict)||cmp(a,b));
  return{mode,origin,sets:list,alerts,counts,catCounts,
    meta:{o:{n:nO,ignored:zo.ignored},d:{n:nD,ignored:zd.ignored}},
    out:{add:bindLines(addRecs).join('\n'),remove:bindLines(remRecs).join('\n'),final:fin.length?head.concat(finalLines).join('\n'):''}};
}
const EX_O=`$ORIGIN example.com.
$TTL 3600
@                   IN SOA   ns1.old-host.example. hostmaster.example.com. ( 2026110401 3600 600 1209600 3600 )
@                   IN NS    ns1.old-host.example.
@                   IN NS    ns2.old-host.example.
@                   IN A     203.0.113.10
www                 IN CNAME example.com.
@                   IN MX    10 mx.example.com.
mx                  IN A     203.0.113.25
@                   IN TXT   "v=spf1 a mx include:_spf.mail-provider.example ~all"
default._domainkey  IN TXT   "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7vExample0nlyN0tARealKey8dYpQw3Zc1r"
@                   IN TXT   "google-site-verification=Zx9exampleQ4k7m2TtLr8"
webmail             IN CNAME webmail.mail-provider.example.
autodiscover        IN CNAME autodiscover.mail-provider.example.
ftp                 IN CNAME example.com.
cpanel              IN A     203.0.113.10
localhost           IN A     127.0.0.1
shop                IN CNAME stores.shop-platform.example.`;
const EX_D=`Type\tName\tContent\tProxy\tTTL
A\texample.com\t203.0.113.10\tProxied\tAuto
CNAME\twww\texample.com\tProxied\tAuto
MX\texample.com\tmx.example.com\t10\tDNS only\tAuto
TXT\texample.com\t"v=spf1 a mx ~all"\tDNS only\tAuto
TXT\texample.com\t"google-site-verification=Zx9exampleQ4k7m2TtLr8"\tDNS only\tAuto
CNAME\tftp\texample.com\tDNS only\tAuto
A\tcpanel\t203.0.113.10\tDNS only\tAuto
A\tlocalhost\t127.0.0.1\tDNS only\tAuto`;
return{run,parseZone,EX_O,EX_D};
})();
