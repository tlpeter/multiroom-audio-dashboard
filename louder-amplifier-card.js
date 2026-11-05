/* Multiroom Audio Dashboard v2.2.0-beta.5 — four styles, local colors and Music Assistant audio relay. */
(() => {
  const TAG = 'multiroom-audio-dashboard';
  const LEGACY_TAG = 'louder-amplifier-card';
  if (customElements.get(TAG)) return;
  const ESC = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const VALID = /^[a-z_]+\.[a-z0-9_]+$/;
  const EDITOR_TAG='multiroom-audio-dashboard-editor';
  const HEX = /^#[0-9a-f]{6}$/i;
  const PALETTES = {
    lime:{name:'Lime',accent:'#b5e147',peak:'#f1a444',background:'#17191f',meter:'#f0e6b9'},
    paars:{name:'Paars',accent:'#bf8cff',peak:'#ff709c',background:'#17141f',meter:'#efe0ff'},
    oceaan:{name:'Oceaan',accent:'#46c9ed',peak:'#9a8cff',background:'#111a25',meter:'#d8f2ff'},
    koper:{name:'Koper',accent:'#ecb26e',peak:'#ff7461',background:'#1d1916',meter:'#f4dfaa'}
  };
  const COLOR_KEYS=['accent','peak','background','meter'];
  const SKINS={
    modern:{name:'Modern spectrum',visual:'spectrum',colors:PALETTES.lime},
    retro:{name:'Retro spectrum',visual:'spectrum',colors:PALETTES.lime},
    vintage:{name:'Vintage hifi',visual:'analog',colors:{accent:'#ad6c2a',peak:'#b36b28',background:'#c7cac2',meter:'#f2e4b9'}},
    midnight:{name:'Midnight studio',visual:'spectrum',colors:{accent:'#e0a35d',peak:'#f57b69',background:'#131313',meter:'#f4dfaa'}}
  };
  const rgb = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const mix = (a,b,t) => '#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
  const luminance = h => rgb(h).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const ink = h => contrast(h,'#ffffff')>contrast(h,'#111111')?'#ffffff':'#111111';
  class AudioRelay {
    constructor(hass,entity,onState){this.hass=hass;this.entity=entity;this.onState=onState;this.frames=[];this.samples=[];this.offset=null;this.closed=false;}
    static analyze(bytes){
      const n=1024,re=new Float64Array(n),im=new Float64Array(n);let energy=0,mean=0;
      for(let i=0;i<n;i++){const v=(bytes[i]-128)/127;re[i]=v;mean+=v/n;}
      for(let i=0;i<n;i++){const v=re[i]-mean;energy+=v*v;re[i]=v*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));}
      for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const v=re[i];re[i]=re[j];re[j]=v;}}
      for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len;for(let start=0;start<n;start+=len)for(let j=0;j<len/2;j++){
        const a=start+j,b=a+len/2,co=Math.cos(angle*j),si=Math.sin(angle*j),tr=re[b]*co-im[b]*si,ti=re[b]*si+im[b]*co;
        re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
      }}
      const bars=[];for(let i=0;i<48;i++){const lo=Math.max(1,Math.floor(511**(i/48))),hi=Math.min(512,Math.max(lo+1,Math.ceil(511**((i+1)/48))));let peak=0;
        for(let k=lo;k<hi;k++)peak=Math.max(peak,Math.hypot(re[k],im[k])*4/n);
        bars.push(Math.max(0,Math.min(1,(20*Math.log10(Math.max(peak,.001))+60)/60)));
      }
      return {rms:Math.min(1,Math.sqrt(energy/n)),bars};
    }
    async connect(){
      this.onState('connecting');
      const registry=this.hass.callWS({type:'config/entity_registry/get',entity_id:this.entity}).catch(error=>({registryError:error}));
      let info,session;
      try{[info,session]=await Promise.all([
        this.hass.callWS({type:'supervisor/api',endpoint:'/addons/d5369777_music_assistant/info',method:'get'}),
        this.hass.callWS({type:'supervisor/api',endpoint:'/ingress/session',method:'post'})
      ]);}catch(err){
        if(err?.code!=='unknown_command')throw err;
        [info,session]=await Promise.all([
          this.hass.callWS({type:'supervisor/ingress/info',slug:'d5369777_music_assistant'}),
          this.hass.callWS({type:'supervisor/ingress/session',slug:'d5369777_music_assistant'})
        ]);
      }
      const entity=await registry,entry=info?.ingress_url||info?.ingress_entry;
      if(entity.registryError)throw entity.registryError;
      if(this.closed)return;
      if(!session?.session||!entry||entity?.platform!=='music_assistant'||typeof entity.unique_id!=='string')throw Error('Music Assistant niet beschikbaar.');
      const url=new URL(entry,location.origin);
      if(url.origin!==location.origin||!url.pathname.startsWith('/api/hassio_ingress/'))throw Error('Geen geldige Home Assistant-appverbinding.');
      document.cookie=`ingress_session=${session.session};path=/api/hassio_ingress/;SameSite=Strict${location.protocol==='https:'?';Secure':''}`;
      url.pathname=url.pathname.replace(/\/$/,'')+'/milkdrop_visualizer';url.search='';url.searchParams.set('player',entity.unique_id);url.protocol=location.protocol==='https:'?'wss:':'ws:';
      const ws=this.ws=new WebSocket(url);ws.binaryType='arraybuffer';
      ws.onopen=()=>{if(this.closed){ws.close();return;}let burst=0;const ping=()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'client/time',payload:{client_transmitted:Math.round(performance.now()*1000)}}));};ping();this.timer=setInterval(()=>{ping();if(++burst>=8){clearInterval(this.timer);this.timer=setInterval(ping,5000);}},250);};
      ws.onmessage=e=>{if(!this.closed)this.receive(e.data);};
      ws.onclose=e=>{clearInterval(this.timer);this.frames=[];this.current=null;this.offset=null;if(!this.closed)this.onState(e.code===4001?'denied':'unavailable');};
      ws.onerror=()=>{if(!this.closed)this.onState('unavailable');};
    }
    receive(data){
      const now=Math.round(performance.now()*1000);
      if(typeof data==='string'){
        let msg;try{msg=JSON.parse(data);}catch{return;}
        if(msg.type==='server/time'){
          const p=msg.payload;if(!p||![p.client_transmitted,p.server_received,p.server_transmitted].every(Number.isFinite))return;
          const delay=now-p.client_transmitted-(p.server_transmitted-p.server_received);
          if(delay<0||delay>2000000)return;
          this.samples.push({delay,offset:((p.server_received-p.client_transmitted)+(p.server_transmitted-now))/2});this.samples=this.samples.slice(-8);
          this.offset=this.samples.reduce((a,b)=>a.delay<b.delay?a:b).offset;
        }else if(['stream/clear','stream/end'].includes(msg.type)){this.frames=[];this.current=null;this.onState('waiting');}
        else if(msg.type==='stream/start')this.onState('waiting');
        else if(msg.type==='error')this.onState('unavailable');
        return;
      }
      if(!(data instanceof ArrayBuffer)||data.byteLength!==1033)return;
      const view=new DataView(data);if(view.getUint8(0)!==22)return;
      const timestamp=Number(view.getBigInt64(1,false));if(!Number.isSafeInteger(timestamp))return;
      this.onState('streaming');
      this.frames.push({timestamp,bytes:new Uint8Array(data,9).slice()});
      if(this.frames.length>1&&this.frames.at(-2).timestamp>timestamp)this.frames.sort((a,b)=>a.timestamp-b.timestamp);
      if(this.frames.length>512)this.frames.splice(0,this.frames.length-512);
    }
    currentLevels(){
      if(this.offset===null)return null;const now=performance.now()*1000+this.offset;
      let latest;while(this.frames.length&&this.frames[0].timestamp<=now)latest=this.frames.shift();
      if(latest)this.current={timestamp:latest.timestamp,levels:AudioRelay.analyze(latest.bytes)};
      if(!this.current||now-this.current.timestamp>250000)return null;
      return this.current.levels;
    }
    close(){this.closed=true;clearInterval(this.timer);if(this.ws?.readyState===1)this.ws.send(JSON.stringify({type:'client/goodbye',payload:{reason:'user_request'}}));this.ws?.close();this.frames=[];this.current=null;}
  }
  const RETRO_CSS = `
    :host{--accent:var(--retro-accent);--ink:var(--retro-ink);--muted:var(--retro-muted);--line:var(--retro-line);font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif);color-scheme:var(--retro-scheme)}
    .studio{background:var(--retro-bg);border:1px solid var(--retro-line);border-radius:24px;padding:0 20px 24px;max-width:1450px;color:var(--ink)}
    .top{padding:17px 0;border-bottom:1px solid var(--retro-line);margin-bottom:14px;gap:16px}.brandmark{background:var(--retro-panel);color:var(--accent);border-radius:12px;border:1px solid var(--line)}h1{font-size:24px;letter-spacing:-.5px;text-transform:none}.eyebrow{font-size:11px;letter-spacing:1.4px}.subline{font-size:11px}.nav{flex-wrap:wrap}.nav a,.nav button{background:var(--retro-panel);border:1px solid var(--line);border-radius:999px;color:var(--ink);font-size:11px;padding:9px 12px}
    .retro-rack{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;align-items:start}.retro-deck{display:grid;gap:14px;min-width:0}.boards{display:grid;grid-template-columns:1fr;gap:12px;min-width:0}.card{background:var(--retro-panel);border:1px solid var(--line);border-radius:20px;box-shadow:0 6px 22px color-mix(in srgb,var(--retro-bg),#000000 24%)}.card-pad{padding:18px}.board-body{display:block;margin-top:15px}.speaker-art{display:none}.board-head h3{font-size:18px}.board-buttons{margin-top:9px}.board-buttons button{border-radius:10px}.selects{margin-top:11px}.sensors{border-color:var(--line);gap:6px;margin-top:12px;padding-top:11px}.sensor{background:var(--retro-bg);border-radius:10px;font-size:11px;color:var(--muted)}.sensor b{color:var(--ink)}
    button,select{background:var(--retro-panel);border:1px solid var(--line);border-radius:10px;color:var(--ink)}button:hover:not(:disabled){background:color-mix(in srgb,var(--retro-panel),var(--ink) 8%)}input[type=range]{accent-color:var(--accent)}.select-field{font-size:11px}select{font-size:12px}.range-field>span{font-size:12px}.range-field output{color:var(--ink)}
    .screen{background:#0b100b;border:1px solid var(--line);border-radius:16px;color:var(--retro-screen-ink);padding:18px;margin-top:14px}.screen:after{display:none}.track strong{font-size:19px;letter-spacing:.2px}.track small,.time{color:var(--retro-screen-muted)}.track-icon{background:#172216;color:var(--retro-screen-ink);border-radius:10px}.spectrum{height:125px;margin-top:22px}.freq,.demo-line{color:var(--retro-screen-muted);font-size:11px;letter-spacing:0}.demo-line input{accent-color:var(--retro-bar)}.transport{justify-content:flex-start}.transport button{border-radius:10px}.transport .play{background:var(--accent);color:var(--retro-accent-ink);border-color:var(--accent)}.transport .play:hover{background:var(--accent);filter:brightness(1.08)}
    .master{text-align:left}.master .dial,.master-note,.master .small-caps{display:none}.master-wrap{display:block}.master .row{margin-bottom:8px}.master-wrap>div:last-child{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;align-items:end}.master .mute-master{margin:0;min-height:40px;font-size:11px}.master .range-field{text-align:left}.master .range-field input{margin-bottom:9px}
    .pill,.pill.dim{background:var(--retro-bg);color:var(--accent);border-radius:999px;font-size:10px}.pill.dim{color:var(--muted)}.eq{margin-top:16px}.eq-head{gap:12px}.eq-tools{flex-wrap:wrap}.tabs{border-color:var(--line);border-radius:10px}.tabs button{color:var(--ink);border-radius:12px}.tabs button[aria-pressed=true],.preset-buttons button[aria-pressed=true]{background:var(--accent);color:var(--retro-accent-ink);border-color:var(--accent)}.presets{background:var(--retro-bg);border:1px solid var(--line);border-radius:12px}.preset-buttons button{border-radius:999px;font-size:12px}.preset-heading b{color:var(--ink)}.preset-description,.preset-message{font-size:11px}.preset-message{color:var(--ink)}.band{background:transparent;border-radius:0}.band output,.band .hz{color:var(--muted);font-size:11px}.band input{accent-color:var(--accent);height:118px}.eq-axis{color:var(--muted);font-size:11px;letter-spacing:.7px}.advanced{border-color:var(--line)}summary{color:var(--ink)}.foot{color:var(--muted);font-size:11px}.foot b{color:var(--ink)}.error{border:1px solid #d47b5d;background:var(--retro-panel);color:var(--ink);border-radius:10px}
    .appearance{margin:0 0 16px;border:1px solid var(--line);border-radius:14px;background:var(--retro-panel);padding:13px 16px}.appearance summary{font-size:12px;color:var(--ink);min-height:22px}.appearance-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding-top:15px}.color-field{font-size:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.color-field input{width:52px;height:38px;padding:2px;border:1px solid var(--line);background:var(--retro-bg);border-radius:10px}.color-field span{flex-basis:100%;color:var(--muted)}.color-field output{font-size:11px;color:var(--ink)}.color-presets{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.color-presets button{font-size:12px;min-height:36px}.color-note,.color-status{font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5}.color-status:empty{display:none}
    @media(max-width:900px){.studio{padding:0 16px 20px}.retro-rack{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}.card-pad{padding:14px}.monitor-meta{gap:10px}.time{display:none}.track-icon{display:none}}
    @media(max-width:700px){.retro-rack{grid-template-columns:1fr}.top{flex-wrap:wrap}.nav{width:100%}.appearance-grid{grid-template-columns:1fr}.color-field span{flex-basis:auto;min-width:135px}.studio{padding:0 10px 20px}.master-wrap>div:last-child{grid-template-columns:1fr}.master .mute-master{width:auto;justify-self:start}.board-body{display:block}.track strong{font-size:17px}.demo-line{font-size:10px}.eq-head{align-items:flex-start;flex-direction:column}.foot{font-size:11px}.brandmark{width:36px;height:36px}.brand{gap:9px}h1{font-size:20px}.eq-bands{min-width:750px}}
  `;
  const SKIN_CSS=`
    [hidden]{display:none!important}.appearance-selects{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.appearance-selects label{display:grid;gap:7px;color:var(--muted);font-size:12px}.appearance-selects select{font-size:12px}.appearance-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.color-note{max-width:75ch}
    .screen{background:var(--retro-screen-bg)}.analog-meters{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}.analog-meter{min-width:0;background:var(--retro-meter-bg);color:var(--retro-meter-ink);border:3px solid color-mix(in srgb,var(--retro-meter-ink),var(--retro-meter-bg) 30%);border-radius:12px;padding:5px;box-shadow:inset 0 0 25px color-mix(in srgb,var(--retro-meter-needle),transparent 83%)}.analog-meter svg{width:100%;height:auto;display:block}.meter-scale{fill:none;stroke:currentColor;stroke-width:1}.analog-meter text{fill:currentColor;font:11px ui-monospace,Consolas,monospace}.analog-meter .meter-title{font-size:14px;letter-spacing:2px}.vu-needle{stroke:var(--retro-meter-needle);stroke-width:2.5;stroke-linecap:round}.meter-pivot{fill:currentColor}
    .studio[data-skin=retro]{border:3px ridge var(--line);border-radius:5px;font-family:ui-monospace,Consolas,monospace}.studio[data-skin=retro] .card{border:2px ridge var(--line);border-radius:2px;box-shadow:none}.studio[data-skin=retro] button,.studio[data-skin=retro] select,.studio[data-skin=retro] .nav a{border:2px outset var(--line);border-radius:2px}.studio[data-skin=retro] .screen{border:3px inset var(--line);border-radius:0}.studio[data-skin=retro] .presets,.studio[data-skin=retro] .appearance,.studio[data-skin=retro] .tabs{border-radius:2px}.studio[data-skin=retro] h1{text-transform:uppercase;letter-spacing:1px;font-size:22px}
    .studio[data-skin=vintage]{background:repeating-linear-gradient(0deg,#ffffff0a 0px,#ffffff0a 1px,#00000004 1px,#00000004 3px),var(--retro-bg);border-left:10px solid color-mix(in srgb,var(--accent),#2f1d12 75%);border-right:10px solid color-mix(in srgb,var(--accent),#2f1d12 75%)}.studio[data-skin=vintage] h1{font-family:Georgia,serif;font-style:italic;font-weight:500;font-size:30px}.studio[data-skin=vintage] .retro-rack{grid-template-columns:1fr}.studio[data-skin=vintage] .retro-deck{grid-template-columns:minmax(0,1.8fr) minmax(200px,1fr);gap:18px}.studio[data-skin=vintage] .boards{grid-template-columns:1fr 1fr}.studio[data-skin=vintage] .screen{color:var(--ink)}.studio[data-skin=vintage] .track strong{color:var(--ink)}.studio[data-skin=vintage] .track small,.studio[data-skin=vintage] .time,.studio[data-skin=vintage] .freq,.studio[data-skin=vintage] .demo-line{color:var(--muted)}.studio[data-skin=vintage] .track-icon{display:none}.studio[data-skin=vintage] .master{text-align:center}.studio[data-skin=vintage] .master .dial{display:grid;margin:18px auto 20px;background:conic-gradient(from 225deg,var(--accent) calc(var(--vol,0)*2.7deg),var(--line) 0deg 270deg,transparent 270deg)}.studio[data-skin=vintage] .dial:before{background:var(--retro-panel)}.studio[data-skin=vintage] .dial-inner{background:radial-gradient(circle at 30% 20%,color-mix(in srgb,var(--retro-panel),var(--ink) 10%),var(--retro-bg));border-color:var(--line)}.studio[data-skin=vintage] .dial-inner small{color:var(--muted)}.studio[data-skin=vintage] .master-wrap>div:last-child{display:block}.studio[data-skin=vintage] .master .mute-master{margin-top:12px}
    .studio[data-skin=midnight] .retro-rack{grid-template-columns:1fr}.studio[data-skin=midnight] .retro-deck{grid-template-columns:minmax(0,1.7fr) minmax(220px,1fr);align-items:center;gap:24px}.studio[data-skin=midnight] .boards{grid-template-columns:1fr 1fr}.studio[data-skin=midnight] .retro-deck>.card{background:transparent;box-shadow:none;border-color:transparent}.studio[data-skin=midnight] .screen{background:transparent;border-color:transparent;padding:0;color:var(--ink)}.studio[data-skin=midnight] .track strong{font-size:28px;color:var(--ink)}.studio[data-skin=midnight] .track small,.studio[data-skin=midnight] .time,.studio[data-skin=midnight] .freq,.studio[data-skin=midnight] .demo-line{color:var(--muted)}.studio[data-skin=midnight] .spectrum{height:65px}.studio[data-skin=midnight] .track-icon{display:grid;width:84px;height:84px;border-radius:50%;font-size:0;background:repeating-radial-gradient(circle,var(--retro-bg) 0px,var(--retro-bg) 3px,var(--line) 4px,var(--retro-bg) 5px)}.studio[data-skin=midnight] .track-icon:after{content:'♫';display:grid;place-items:center;font-size:23px;width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--retro-accent-ink)}
    @media(max-width:900px){.appearance-grid{grid-template-columns:1fr 1fr}.studio[data-skin=vintage] .retro-deck{grid-template-columns:minmax(0,1.6fr) minmax(180px,1fr)}.analog-meters{gap:8px}.analog-meter{padding:2px}}
    @media(max-width:700px){.appearance-selects,.appearance-grid{grid-template-columns:1fr}.studio[data-skin=vintage] .retro-deck,.studio[data-skin=midnight] .retro-deck,.studio[data-skin=vintage] .boards,.studio[data-skin=midnight] .boards{grid-template-columns:1fr}.studio[data-skin=vintage]{border-left-width:6px;border-right-width:6px}.studio[data-skin=vintage] h1{font-size:25px}.studio[data-skin=vintage] .master .dial{margin:12px 0 16px}.studio[data-skin=vintage] .master-wrap{display:grid;grid-template-columns:130px minmax(0,1fr);gap:14px;align-items:center}.studio[data-skin=vintage] .master .mute-master{width:100%;font-size:11px}.studio[data-skin=midnight] .track strong{font-size:23px}.studio[data-skin=midnight] .track-icon{width:62px;height:62px}.studio[data-skin=midnight] .retro-deck{gap:0}}
  `;
  // Custom starting curves in dB, ordered by the board's exposed frequencies.
  const FREQUENCIES = ['20hz','31_5hz','50hz','80hz','125hz','200hz','315hz','500hz','800hz','1250hz','2000hz','3150hz','5000hz','8000hz','16000hz'];
  const PRESETS = {
    vlak: {name:'Vlak', description:'Neutraal · alle banden op 0 dB', values:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
    bas: {name:'Bas', description:'Extra laag en een stevigere bas', values:[2,3,5,6,5,3,1,0,0,0,0,0,0,0,0]},
    disco: {name:'Disco', description:'Stevige bas en sprankelend hoog', values:[1,3,4,4,3,1,0,-1,-2,-1,0,1,2,3,2]},
    rock: {name:'Rock', description:'Kick, gitaren en wat extra helderheid', values:[0,1,2,3,2,0,-1,-1,0,1,2,3,2,1,0]},
    pop: {name:'Pop', description:'Stemmen en melodie wat meer naar voren', values:[0,1,2,2,1,0,0,1,2,3,2,1,1,1,0]},
    jazz: {name:'Jazz', description:'Warm laag met een open midden', values:[0,1,2,2,1,0,0,1,1,1,1,0,1,2,1]},
    klassiek: {name:'Klassiek', description:'Subtiel meer warmte en lucht', values:[0,0,1,1,1,0,0,0,0,0,0,1,1,2,1]},
    zang: {name:'Zang', description:'Minder laag, meer verstaanbaarheid', values:[-4,-3,-2,-2,-1,0,0,1,2,3,3,2,1,0,-1]},
    nacht: {name:'Nacht', description:'Minder bas en zachter hoog', values:[-6,-5,-4,-3,-2,-1,0,0,1,1,1,0,-1,-2,-3]}
  };
  // Named user profiles: stored per HA user (frontend user data), browser storage only as fallback.
  // Optional online track info (off by default): MusicBrainz, Wikidata, Wikipedia, Cover Art Archive.
  const ONLINE_KEY='multiroom-audio-dashboard:online-info';
  const MBID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const CUSTOM_KEY='multiroom-audio-dashboard:eq-presets',CUSTOM_MAX=24,CUSTOM_NAME_MAX=40;
  const BUILTIN_NAMES=new Set(Object.values(PRESETS).map(p=>p.name.toLowerCase()));
  const cleanName=(v)=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
  function cleanCustomPresets(raw){
    const out=[],seen=new Set();
    for(const p of Array.isArray(raw?.presets)?raw.presets:[]){
      if(out.length>=CUSTOM_MAX)break;
      const name=cleanName(p?.name),key=name.toLowerCase();
      if(!name||name.length>CUSTOM_NAME_MAX||BUILTIN_NAMES.has(key)||seen.has(key))continue;
      if(!Array.isArray(p.values)||p.values.length!==FREQUENCIES.length||!p.values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=-15&&v<=15))continue;
      seen.add(key);out.push({name,values:p.values.map(v=>Math.round(v*100)/100)});
    }
    return out;
  }
  class MultiroomAudioDashboardEditor extends HTMLElement {
    constructor(){
      super();this.attachShadow({mode:'open'});this._known=new Map();
      this.shadowRoot.addEventListener('change',event=>this._change(event));
      this.shadowRoot.addEventListener('input',event=>{if(event.target.dataset.search!==undefined){this._filter=event.target.value;this._filterRows();}});
    }
    setConfig(config){
      this._config={...config};
      for(const item of this._players()){const player=typeof item==='string'?{player:item}:{...item};this._known.set(player.player,player);}
      this._render();
    }
    set hass(hass){this._hass=hass;this._render();}
    _players(){return this._config?.players??this._config?.boards??(this._config?.entity?[this._config.entity]:[]);}
    _ids(){return this._players().map(item=>typeof item==='string'?item:item.player);}
    _change(event){
      const input=event.target;
      if(!this._config)return;
      let next;
      if(input.dataset.main!==undefined){
        if(!/^media_player\.[a-z0-9_]+$/.test(input.value))return;
        next={...this._config,entity:input.value};
      }else if(input.dataset.player){
        const id=input.dataset.player;if(!/^media_player\.[a-z0-9_]+$/.test(id))return;
        const ids=this._ids().filter(value=>value!==id);if(input.checked)ids.push(id);
        if(!ids.length||ids.length>32){input.checked=!input.checked;this.shadowRoot.querySelector('[role=alert]').textContent='Kies minimaal één en maximaal 32 spelers.';return;}
        const players=ids.map(player=>({...this._known.get(player),player}));
        next={...this._config,players};delete next.boards;
      }else return;
      this._config=next;this._render();
      this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:next},bubbles:true,composed:true}));
    }
    _filterRows(){
      const query=(this._filter||'').toLocaleLowerCase();let count=0;
      this.shadowRoot.querySelectorAll('[data-row]').forEach(row=>{row.hidden=!row.textContent.toLocaleLowerCase().includes(query);if(!row.hidden)count++;});
      const empty=this.shadowRoot.querySelector('[data-empty]');if(empty)empty.hidden=count>0;
    }
    _render(){
      if(!this._config)return;
      const states=this._hass?.states||{},selected=this._ids();
      const ids=[...new Set([...Object.keys(states).filter(id=>/^media_player\.[a-z0-9_]+$/.test(id)),...selected,this._config.entity].filter(id=>/^media_player\.[a-z0-9_]+$/.test(id||'')))];
      const label=id=>this._known.get(id)?.name||states[id]?.attributes.friendly_name||id;
      ids.sort((a,b)=>label(a).localeCompare(label(b))||a.localeCompare(b));
      const rows=ids.map(id=>({id,name:label(id),offline:!states[id]||['unavailable','unknown'].includes(states[id].state)}));
      const signature=JSON.stringify([rows,selected,this._config.entity]);if(signature===this._signature)return;this._signature=signature;
      this.shadowRoot.innerHTML=`<style>:host{display:block;color:var(--primary-text-color,#263746);font:14px system-ui,sans-serif}[hidden]{display:none!important}h3{margin:0 0 8px}p{line-height:1.55;color:var(--secondary-text-color,#637482)}label.field{display:grid;gap:7px;margin:16px 0}input[type=search],select{box-sizing:border-box;width:100%;font:inherit;padding:11px;border:1px solid var(--divider-color,#ccd4da);border-radius:10px;color:inherit;background:var(--card-background-color,#fff)}fieldset{margin:16px 0;border:1px solid var(--divider-color,#ccd4da);border-radius:12px;padding:10px}.players{max-height:360px;overflow:auto}.player{display:flex;align-items:center;gap:12px;padding:12px 6px;border-radius:8px}.player input{width:20px;height:20px;flex-shrink:0}.player span{display:grid;gap:4px;min-width:0}.player small{overflow-wrap:anywhere;color:var(--secondary-text-color,#637482)}[role=alert]{color:var(--error-color,#b3261e);min-height:1.4em}</style><h3>Speakers beheren</h3><p>Kies uit je Home Assistant-spelers. De hoofdspeler of bestaande groep bedient het bovenste afspeelpaneel; aangevinkte speakers krijgen hun eigen bediening.</p><label class="field">Hoofdspeler<select data-main aria-label="Hoofdspeler"><option value="" disabled>Kies een speler of groep</option>${rows.map(row=>`<option value="${ESC(row.id)}" ${row.id===this._config.entity?'selected':''}>${ESC(row.name)}${row.offline?' · niet beschikbaar':''}</option>`).join('')}</select></label><label class="field">Zoek een speaker<input type="search" data-search aria-label="Zoek een speaker" placeholder="Naam of entiteit" value="${ESC(this._filter||'')}"></label><fieldset><legend>Speakers op dit dashboard (${selected.length}/32)</legend><div class="players">${rows.map(row=>`<label class="player" data-row><input type="checkbox" data-player="${ESC(row.id)}" ${selected.includes(row.id)?'checked':''} aria-label="${ESC(row.name+' ('+row.id+')')}"><span><b>${ESC(row.name)}</b><small>${ESC(row.id)}${row.offline?' · niet beschikbaar':''}</small></span></label>`).join('')}<p data-empty hidden>Geen spelers gevonden. Voeg de speaker eerst toe via de passende integratie in Home Assistant en wis eventueel de zoekopdracht.</p></div></fieldset><p>Bestaande EQ-, mixer- en sensorkoppelingen van geselecteerde versterkers blijven behouden. Nieuwe speakers krijgen de functies die hun HA-integratie aanbiedt. De selectie maakt geen audiogroep aan.</p><p>Sla de kaart op met de knop <b>Opslaan</b> van Home Assistant. Kleuren en stijl wijzig je daarna op de kaart via <b>Kleuren & uiterlijk</b>.</p><p role="alert" aria-live="polite"></p>`;
      this._filterRows();
    }
  }
  if(!customElements.get(EDITOR_TAG))customElements.define(EDITOR_TAG,MultiroomAudioDashboardEditor);
  class MultiroomAudioDashboard extends HTMLElement {
    static getConfigElement(){return document.createElement(EDITOR_TAG);}
    static getStubConfig(hass){
      const entity=Object.keys(hass?.states||{}).find(id=>/^media_player\.[a-z0-9_]+$/.test(id))||'media_player.kies_een_speler';
      return {entity,players:[entity]};
    }
    static get AudioRelay(){return AudioRelay;}
    constructor() {
      super(); this.attachShadow({mode:'open'}); this._tab = 0; this._demo = true; this._pending = new Set();
      this._reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      this._visibilityChanged=()=>{if(document.hidden)this._stopLive();this._animate();};
      this.shadowRoot.addEventListener('change',e=>this._change(e));
      this.shadowRoot.addEventListener('input',e=>this._input(e));
      this.shadowRoot.addEventListener('click',e=>this._click(e));
      this.shadowRoot.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('[data-custom-name]')){e.preventDefault();this._saveCustomPreset();}});
    }
    setConfig(c) {
      this._stopLive();this._liveRetryAt=0;
      if (!c || !/^media_player\.[a-z0-9_]+$/.test(c.entity || '')) throw Error('Kies een media_player als hoofdspeler.');
      const input=c.players ?? c.boards ?? [c.entity];
      if(!Array.isArray(input)||!input.length||input.length>32)throw Error('Kies 1 tot 32 spelers.');
      const ids=[c.entity],domains={eq:'select',mixer:'select',trim_left:'number',trim_right:'number',temperature:'sensor',wifi:'sensor',fault:'binary_sensor',led:'light',fan:'fan'};
      const boards=input.map((item,i)=>{
        const b=typeof item==='string'?{player:item}:{...item};
        if(!/^media_player\.[a-z0-9_]+$/.test(b.player||''))throw Error('Ongeldige speler.');
        b.name=String(b.name||b.player.replace('media_player.','').replaceAll('_',' '));
        b.bands=b.bands??[];ids.push(b.player);
        for(const [key,domain] of Object.entries(domains))if(b[key]!==undefined){
          if(!VALID.test(b[key])||!b[key].startsWith(domain+'.'))throw Error('Ongeldige entiteit voor '+key);
          ids.push(b[key]);
        }
        if(!Array.isArray(b.bands)||b.bands.length>32)throw Error('Ongeldige EQ-banden.');
        b.bands=b.bands.map(band=>{
          if(!VALID.test(band.entity||'')||!band.entity.startsWith('number.'))throw Error('Ongeldige EQ-band.');
          ids.push(band.entity);return {...band,label:String(band.label||'')};
        });
        return b;
      });
      if(new Set(boards.map(b=>b.player)).size!==boards.length)throw Error('Kies elke speler maar één keer.');
      this._cfg={...c,boards};this._tab=Math.max(0,boards.findIndex(b=>b.bands.length));
      this._allowed=new Set(ids);this._loadColors();this._build();this._sync();
    }
    set hass(h) { this._hass = h; if(this._cfg) this._sync(); if(this._cfg&&!this._customLoading){this._customLoading=true;this._loadCustomPresets();} }
    get hass() { return this._hass; }
    getCardSize() { return 16; }
    connectedCallback() { document.addEventListener('visibilitychange',this._visibilityChanged);this._observe(); }
    disconnectedCallback() { document.removeEventListener('visibilitychange',this._visibilityChanged);cancelAnimationFrame(this._raf);clearTimeout(this._timer);this._stopLive();this._observer?.disconnect(); }
    _observe() {
      this._observer?.disconnect();
      this._observer = new IntersectionObserver(entries=>{ this._visible = entries.some(x=>x.isIntersecting); this._animate(); });
      this._observer.observe(this);
    }
    _st(id) { return this._hass?.states?.[id]; }
    _ok(id) { const s=this._st(id); return !!s && !['unavailable','unknown'].includes(s.state); }
    _num(id) { const s=this._st(id); return this._ok(id) && Number.isFinite(Number(s.state)) ? Number(s.state) : null; }
    _fmt(id, suffix, decimals=0) { const n=this._num(id); return n===null?'—':n.toFixed(decimals)+suffix; }
    _q(s) { return this.shadowRoot.querySelector(s); }
    _all(s) { return this.shadowRoot.querySelectorAll(s); }
    _speaker(side) {
      return `<svg viewBox="0 0 180 200" class="speaker-art" aria-hidden="true"><defs><linearGradient id="cab-${side}" x2="1" y2="1"><stop stop-color="#e0e5e9"/><stop offset="1" stop-color="#b9c3cd"/></linearGradient><radialGradient id="cone-${side}"><stop stop-color="#263a4d"/><stop offset=".35" stop-color="#334c61"/><stop offset=".5" stop-color="#617488"/><stop offset=".57" stop-color="#203244"/><stop offset=".88" stop-color="#465b6e"/><stop offset="1" stop-color="#1a2d3e"/></radialGradient></defs><ellipse cx="90" cy="188" rx="69" ry="8" fill="#23384d" opacity=".12"/><path d="M40 12h92l12 9v156l-12 10H40l-7-8V20z" fill="url(#cab-${side})"/><rect x="37" y="12" width="95" height="172" rx="12" fill="#203345"/><rect x="43" y="18" width="83" height="160" rx="8" fill="#2b4053"/><circle cx="85" cy="48" r="20" fill="#152637"/><circle cx="85" cy="48" r="13" fill="url(#cone-${side})"/><g class="cone"><circle cx="85" cy="111" r="38" fill="#172a3b"/><circle cx="85" cy="111" r="32" fill="url(#cone-${side})"/><circle cx="85" cy="111" r="10" fill="#172b3c"/><circle cx="82" cy="108" r="5" fill="#506578" opacity=".5"/></g><rect x="68" y="159" width="33" height="5" rx="2.5" fill="#142637"/><circle cx="85" cy="170" r="2" fill="#57d2ce"/></svg>`;
    }
    _range(id, label, kind='number', extra='') {
      return `<label class="range-field ${extra}"><span>${ESC(label)}<output data-out="${ESC(id)}">—</output></span><input aria-label="${ESC(label)}" type="range" data-kind="${kind}" data-entity="${ESC(id)}" min="0" max="100" step="1" disabled></label>`;
    }
    _select(id,label) { return `<label class="select-field"><span>${ESC(label)}</span><select aria-label="${ESC(label)}" data-entity="${ESC(id)}" data-kind="select" disabled></select></label>`; }
    _loadColors() {
      try{this._online=localStorage.getItem(ONLINE_KEY)==='1';}catch{this._online=false;}
      this._skin='modern';this._visual='spectrum';this._source=this._cfg.preview?'demo':'live';this._themes={};this._colors={...PALETTES.lime};
      try{
        const saved=JSON.parse(localStorage.getItem('louder-studio:appearance:'+this._cfg.entity));
        if(Object.hasOwn(SKINS,saved?.skin))this._skin=saved.skin;
        for(const id of Object.keys(SKINS))if(saved?.themes?.[id]&&typeof saved.themes[id]==='object'){
          const theme={...SKINS[id].colors,visual:SKINS[id].visual};
          for(const key of COLOR_KEYS)if(HEX.test(saved.themes[id][key]||''))theme[key]=saved.themes[id][key];
          if(['spectrum','analog'].includes(saved.themes[id].visual))theme.visual=saved.themes[id].visual;
          this._themes[id]=theme;
        }
        this._colors={...SKINS[this._skin].colors,...this._themes[this._skin]};
        this._visual=this._themes[this._skin]?.visual||SKINS[this._skin].visual;
        for(const key of COLOR_KEYS)if(HEX.test(saved?.[key]||''))this._colors[key]=saved[key];
        if(['spectrum','analog'].includes(saved?.visual))this._visual=saved.visual;
        if(['live','demo'].includes(saved?.source))this._source=saved.source;
      }catch{}
    }
    _setSkin(id) {
      if(!Object.hasOwn(SKINS,id))return;
      this._themes[this._skin]={...this._colors,visual:this._visual};
      this._skin=id;const saved=this._themes[id];
      this._colors={...SKINS[id].colors,...saved};this._visual=saved?.visual||SKINS[id].visual;
      this._applyColors(true);
    }
    _applyColors(persist=false) {
      const c=this._colors,bg=c.background,fg=ink(bg),panel=mix(bg,fg,.07),line=mix(bg,fg,.28);
      let muted=mix(bg,fg,.72);if(contrast(bg,muted)<4.5||contrast(panel,muted)<4.5)muted=fg;
      const screen=this._skin==='vintage'?panel:this._skin==='midnight'?bg:'#0b100b',screenInk=ink(screen);
      const bar=contrast(c.accent,screen)>=3?c.accent:mix(c.accent,screenInk,.65),peak=contrast(c.peak,screen)>=3?c.peak:mix(c.peak,screenInk,.65);
      const meter=c.meter||PALETTES.lime.meter,meterInk=ink(meter),needle=contrast(c.peak,meter)>=3?c.peak:mix(c.peak,meterInk,.55);
      this._canvasColors={bar,peak,grid:mix(screen,screenInk,.14)};
      const vars={bg,panel,line,ink:fg,muted,accent:c.accent,'accent-ink':ink(c.accent),scheme:fg==='#ffffff'?'dark':'light','screen-bg':screen,'screen-ink':bar,'screen-muted':mix(screen,screenInk,.72),bar,'meter-bg':meter,'meter-ink':meterInk,'meter-needle':needle};
      for(const [name,value]of Object.entries(vars))this.style.setProperty('--retro-'+name,value);
      this._all('[data-color]').forEach(el=>{el.value=c[el.dataset.color];this._q('[data-color-out="'+el.dataset.color+'"]').textContent=c[el.dataset.color].toUpperCase();});
      this._q('.studio').dataset.skin=this._skin;
      this._q('[data-appearance=skin]').value=this._skin;this._q('[data-appearance=visual]').value=this._visual;
      this._q('[data-appearance=source]').value=this._source;
      const analog=this._visual==='analog';this._q('.analog-meters').hidden=!analog;this._q('canvas').hidden=analog;this._q('.freq').hidden=analog;
      this._updateLiveLabel(false);
      if(persist){
        this._themes[this._skin]={...c,visual:this._visual};
        let message='Uiterlijk bewaard op dit apparaat.';
        try{localStorage.setItem('louder-studio:appearance:'+this._cfg.entity,JSON.stringify({accent:c.accent,peak:c.peak,background:c.background,meter,skin:this._skin,visual:this._visual,source:this._source,themes:this._themes}));}catch{message='Uiterlijk gewijzigd voor deze sessie.';}
        this._q('.color-status').textContent=message;
      }
      this._animate();
    }
    _analogMeter(label) {
      const point=(angle,r)=>{const a=(angle-90)*Math.PI/180;return [110+Math.cos(a)*r,126+Math.sin(a)*r];};
      const ticks=[-40,-25,-15,-10,-5,0].map(v=>{const angle=-50+(v+40)/40*100,a=point(angle,86),b=point(angle,94),t=point(angle,108);return `<path class="meter-scale" d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/><text x="${t[0]}" y="${t[1]}" text-anchor="middle">${v}</text>`;}).join('');
      return `<div class="analog-meter"><svg viewBox="0 0 220 146" role="img" aria-label="${ESC(label)} bronmeter in VU-stijl"><path class="meter-scale" d="M41 68 A90 90 0 0 1 179 68"/>${ticks}<text class="meter-title" x="110" y="92" text-anchor="middle">VU</text><text x="12" y="136">${ESC(label)}</text><text x="208" y="136" text-anchor="end">dBFS</text><line class="vu-needle" x1="110" y1="126" x2="110" y2="42" transform="rotate(-55 110 126)"/><circle class="meter-pivot" cx="110" cy="126" r="3"/></svg></div>`;
    }
    _installRetro() {
      const style=document.createElement('style');style.textContent=RETRO_CSS+SKIN_CSS+`.nav{flex-wrap:wrap}.nav .manage-speakers{background:var(--accent);border-color:var(--accent);color:var(--retro-accent-ink);font-weight:750;min-height:44px}.speaker-access-note{font-size:13px;line-height:1.5;margin:0 0 16px;color:var(--ink)}.speaker-access-note:empty{display:none}`;this.shadowRoot.append(style);
      const overview=this._q('.overview'),rack=document.createElement('div'),deck=document.createElement('div');rack.className='retro-rack';deck.className='retro-deck';deck.append(...overview.children);rack.append(deck,this._q('.boards'));overview.replaceWith(rack);this._q('.section-line').remove();
      this._q('canvas').insertAdjacentHTML('beforebegin',`<div class="analog-meters" hidden>${this._analogMeter('Links')}${this._analogMeter('Rechts')}</div>`);
      this._q('.foot').firstElementChild.lastChild.textContent=' De visualisatie toont de sfeer van het ontwerp, niet het gemeten geluid.';
      this._q('.foot').lastElementChild.textContent='Audiobron: Music Assistant · MilkDrop-relay.';
      this._q('.top').insertAdjacentHTML('afterend',`<details class="appearance"><summary>Kleuren & uiterlijk</summary><div class="appearance-selects"><label>Stijl<select data-appearance="skin" aria-label="Stijl">${Object.entries(SKINS).map(([id,s])=>`<option value="${id}">${s.name}</option>`).join('')}</select></label><label>Visualisatie<select data-appearance="visual" aria-label="Visualisatie"><option value="spectrum">Spectrum</option><option value="analog">Analoge VU-meters</option></select></label></div><div class="appearance-grid">${[['accent','Accentkleur'],['peak','Spectrumtop / naald'],['background','Achtergrond'],['meter','Meterverlichting']].map(([key,label])=>`<label class="color-field"><span>${label}</span><input type="color" data-color="${key}" aria-label="${label}"><output data-color-out="${key}"></output></label>`).join('')}</div><div class="color-presets" role="group" aria-label="Kleurcombinaties">${Object.entries(PALETTES).map(([id,p])=>`<button data-act="palette" data-palette="${id}">${p.name}</button>`).join('')}</div><p class="color-note">Je stijl, visualisatie en kleuren worden op dit apparaat bewaard. Elke stijl onthoudt zijn eigen kleurkeuze.</p><label class="online-toggle"><input type="checkbox" data-online-info> Online info over het nummer</label><p class="online-note">Uit: er gaat niets naar externe diensten. Aan: artiest, titel en album worden opgezocht bij MusicBrainz, Wikidata en Wikipedia (albumjaar, korte tekst over de artiest, albumhoes als Home Assistant er geen heeft). Bewaard in deze browser.</p><p class="color-status" role="status" aria-live="polite"></p></details>`);
      this._q('.appearance-selects').insertAdjacentHTML('beforeend','<label>Databron<select data-appearance="source" aria-label="Databron"><option value="live">Live Music Assistant</option><option value="demo">Demo-animatie</option></select></label>');
      this._q('.demo-line').insertAdjacentHTML('afterend','<p class="level-note" hidden>Beide meters tonen hetzelfde mono-bronsignaal vóór de boardinstellingen; geen afzonderlijke meting van de speakeruitgangen.</p>');
      this._q('.color-presets').insertAdjacentHTML('beforeend','<button data-act="default-colors">Standaard voor deze stijl</button>');
      const noteStyle=document.createElement('style');noteStyle.textContent='.level-note{font-size:11px;line-height:1.5;color:var(--retro-screen-muted);margin-top:10px}.studio[data-skin=vintage] .level-note,.studio[data-skin=midnight] .level-note{color:var(--muted)}';this.shadowRoot.append(noteStyle);
      this._applyColors();
    }
    _stopLive(){if(this._relay){this._relay.close();this._relay=null;}this._liveState='waiting';}
    _ensureLive(){
      const wanted=this.isConnected&&this._cfg&&this._hass&&this._source==='live'&&this._demo&&this._visible!==false&&!document.hidden&&this._st(this._cfg.entity)?.state==='playing';
      if(!wanted){this._stopLive();return;}
      if(typeof this._hass.callWS!=='function'){this._liveState='unavailable';return;}
      if(this._relay||performance.now()<(this._liveRetryAt||0))return;
      const relay=new AudioRelay(this._hass,this._cfg.entity,state=>{
        if(this._relay!==relay)return;this._liveState=state;
        if(['unavailable','denied'].includes(state)){relay.close();this._relay=null;this._liveRetryAt=performance.now()+30000;}
      });
      this._relay=relay;
      relay.connect().catch(()=>{if(this._relay===relay){relay.close();this._relay=null;this._liveState='unavailable';this._liveRetryAt=performance.now()+30000;}});
    }
    _updateLiveLabel(hasFrame){
      const live=this._source==='live',analog=this._visual==='analog';let text;
      if(!live)text=(analog?'VU-demo':'Spectrumdemo')+' · geen live-audioanalyse';
      else if(!this._demo)text='Live-meting gepauzeerd';
      else if(hasFrame)text='Live · mono-bronniveau';
      else if(this._st(this._cfg.entity)?.state!=='playing')text='Live · geen muziek';
      else text={connecting:'Live · verbinding maken…',denied:'Live · geen toegang tot Music Assistant',unavailable:'Live audio niet beschikbaar · controleer de verbinding en MilkDrop-plugin'}[this._liveState]||'Live · wachten op audiodata';
      if(this._q('.demo-line>span').textContent!==text)this._q('.demo-line>span').textContent=text;
      this._q('.foot b').textContent=live?'Bediening en visualisatie via Music Assistant.':'Bediening live · visualisatie demo.';
      const caption=this._q('.foot span')?.lastChild;if(caption)caption.textContent=live?' Bronniveau vóór de boardinstellingen; geen meting van de versterkeruitgang.':' De visualisatie is een demo en meet het geluid niet.';
      if(this._q('.level-note'))this._q('.level-note').hidden=!(live&&analog);
      const labels=live?['Laag','','Midden','','','Hoog']:['32 Hz','125','500','2k','8k','16k'];
      this._all('.freq span').forEach((el,i)=>{if(el.textContent!==labels[i])el.textContent=labels[i];});
    }
    _build() {
      cancelAnimationFrame(this._raf);
      const c=this._cfg;
      this.shadowRoot.innerHTML = `<style>
      :host [hidden]{display:none!important}:host{display:block;--ink:#233a50;--muted:#718496;--accent:#159caa;--line:#e1e8ed;font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif);color:var(--ink)}
      *{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{-webkit-tap-highlight-color:transparent}button,a{touch-action:manipulation}button{cursor:pointer}button:disabled,input:disabled,select:disabled{opacity:.42;cursor:not-allowed}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #3fb6c6;outline-offset:4px}button{color:inherit}a{color:inherit;text-decoration:none}button,select{border:1px solid var(--line);background:#fff;border-radius:12px}button:hover:not(:disabled){background:#f0f7f8}button{min-height:44px;padding:10px 15px}h1,h2,h3,p{margin:0}button svg{width:20px;height:20px}input[type=range]{accent-color:var(--accent);cursor:pointer;width:100%;margin:12px 0 5px}
      .studio{max-width:1400px;margin:0 auto;padding:24px 28px 40px;background:#f3f5f6;border-radius:26px}.top{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:24px}.brand{display:flex;align-items:center;gap:13px}.brandmark{width:46px;height:46px;border-radius:15px;background:#163c51;color:#81dfdc;display:grid;place-items:center;font-size:25px}.eyebrow{font-size:10px;font-weight:750;letter-spacing:2px;color:var(--muted);text-transform:uppercase}h1{overflow-wrap:anywhere;font-size:27px;letter-spacing:-1px;line-height:1.35}.subline{font-size:12px;color:var(--muted);margin-top:3px}.nav{display:flex;gap:8px}.nav a{border:1px solid var(--line);border-radius:24px;padding:11px 17px;background:white;font-size:12px;font-weight:650}.overview{display:grid;grid-template-columns:1.8fr 1fr;gap:18px}.card{border:1px solid #e2e8ed;border-radius:23px;background:#fff;box-shadow:0 5px 24px #223e5110;overflow:hidden}.card-pad{padding:24px}.row{display:flex;align-items:center;justify-content:space-between;gap:12px}.pill{font-size:10px;letter-spacing:.5px;font-weight:750;border-radius:20px;padding:7px 10px;background:#e9f8f3;color:#25826f;white-space:nowrap}.pill.dim{background:#eff2f5;color:#7c8b99}.live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#2eaf97;margin-right:5px}.screen{position:relative;background:#132b3d;border:1px solid #27465b;border-radius:16px;padding:18px 20px;margin-top:17px;color:#e8f3f8;overflow:hidden}.screen:after{content:"";position:absolute;inset:0;background:linear-gradient(125deg,#ffffff06,transparent 45%);pointer-events:none}.monitor-meta{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:16px}.track-icon{width:46px;height:46px;border-radius:13px;background:#25485b;display:grid;place-items:center;color:#79dcda;font-size:25px;flex-shrink:0}.track{min-width:0;flex:1}.track strong{font-size:20px;letter-spacing:-.4px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.track small{display:block;color:#94acbc;font-size:12px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.time{font:12px ui-monospace,monospace;color:#91c4cd;white-space:nowrap}.spectrum{display:block;width:100%;height:106px;margin-top:15px}.freq{display:flex;justify-content:space-between;color:#718f9e;font-size:9px;letter-spacing:1px;padding-top:6px}.demo-line{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:10px;color:#94acbc;margin-top:13px}.demo-line label{display:flex;align-items:center;gap:6px;white-space:nowrap}.demo-line input{accent-color:#50c5c7}.transport{display:flex;gap:10px;justify-content:center;margin-top:17px}.transport button{width:48px;padding:0;font-size:17px}.transport .play{width:62px;background:var(--accent);border-color:var(--accent);color:white;font-size:21px}.transport .play:hover{background:#138998}.master{text-align:center}.master .row{text-align:left}.dial{width:156px;height:156px;position:relative;display:grid;place-items:center;margin:17px auto 8px;border-radius:50%;background:conic-gradient(from 225deg,#28b9bd calc(var(--vol,0)*2.7deg),#e5edf1 0deg 270deg,transparent 270deg)}.dial:before{content:"";position:absolute;inset:9px;border-radius:50%;background:#fff}.dial-inner{z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:123px;height:123px;border-radius:50%;border:1px solid #dbe4ea;background:radial-gradient(circle at 35% 25%,#fff,#edf2f5);box-shadow:0 4px 12px #2c45551b}.dial-inner b{font-size:38px;font-weight:600;letter-spacing:-2px}.dial-inner small{font-size:9px;letter-spacing:2px;color:#7a8d9d}.master .range-field{text-align:left}.master-note{font-size:11px;color:var(--muted);margin-top:13px;line-height:1.55}.section-line{margin:26px 2px 13px;display:flex;justify-content:space-between;align-items:center}h2{font-size:17px;letter-spacing:-.35px}.section-line p{font-size:11px;color:var(--muted)}.boards{display:grid;grid-template-columns:1fr 1fr;gap:18px}.board-head h3{font-size:19px;letter-spacing:-.5px}.board-body{display:grid;grid-template-columns:135px 1fr;gap:18px;align-items:center;margin-top:8px}.speaker-art{width:130px;height:156px}.range-field{display:block}.range-field>span{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);gap:8px}.range-field output{color:var(--ink);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}.board-buttons{display:flex;gap:7px;margin-top:14px}.board-buttons button{font-size:11px;min-height:38px;padding:7px 12px}.sensors{display:flex;gap:8px;flex-wrap:wrap;margin-top:17px;padding-top:15px;border-top:1px solid #edf1f4}.sensor{font-size:10px;color:#708799;border-radius:8px;background:#f3f7f9;padding:7px 9px}.sensor b{font-weight:650;color:#314c61}.fault{color:#c24f3d!important}.selects{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.select-field{display:flex;flex-direction:column;gap:6px;font-size:10px;color:var(--muted)}select{width:100%;min-height:42px;padding:8px;font-size:11px;color:var(--ink)}.eq{margin-top:18px}.eq .card-pad{padding-bottom:20px}.eq-tools{display:flex;gap:8px;align-items:center}.tabs{display:flex;border:1px solid var(--line);border-radius:11px;padding:3px;gap:3px}.tabs button{border:0;min-height:32px;padding:5px 13px;border-radius:8px;font-size:11px;background:transparent}.tabs button[aria-pressed=true]{background:#e3f5f5;color:#14838f}.eq-tools>button{min-height:36px;padding:6px 12px;font-size:11px}.eq-intro{font-size:11px;color:var(--muted);margin-top:7px;line-height:1.6}.eq-scroll{overflow-x:auto;padding:5px 0 4px;margin-top:12px;scrollbar-width:thin}.eq-bands{display:grid;grid-template-columns:repeat(15,minmax(40px,1fr));gap:5px;min-width:680px}.band{display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;padding:9px 0;border-radius:9px;background:linear-gradient(#f6f9fb,#fbfcfd)}.band output{font:10px ui-monospace,monospace;color:#4c687c;min-height:15px}.band input{writing-mode:vertical-lr;direction:rtl;width:32px;height:120px;margin:5px 0;accent-color:#209fae}.band .hz{font-size:9px;font-weight:650;color:#6c8598}.eq-axis{display:flex;justify-content:space-between;color:#95a6b3;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;margin-top:10px}.advanced{margin-top:16px;border-top:1px solid var(--line);padding-top:13px}summary{font-size:11px;font-weight:650;cursor:pointer;color:#5b7588}.trim-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding-top:16px}.foot{font-size:10px;color:#7f93a3;display:flex;justify-content:space-between;gap:20px;margin:19px 2px 0;line-height:1.65}.foot b{color:#49677d;font-weight:650}.error{margin:15px 0 0;padding:12px 15px;border-radius:12px;background:#fff0ec;font-size:12px;color:#a34d38}.error:empty{display:none}.small-caps{font-size:10px;color:#7c94a6;letter-spacing:1.2px}.playing .cone{animation:pulse-cone .8s ease-in-out infinite;transform-origin:85px 111px}@keyframes pulse-cone{50%{transform:scale(1.025)}}
      @media(max-width:900px){.overview{grid-template-columns:1.35fr 1fr}.studio{padding:20px}.card-pad{padding:19px}.board-body{grid-template-columns:95px 1fr;gap:8px}.speaker-art{width:95px;height:135px}.board-buttons{flex-wrap:wrap}.time{display:none}.nav a{padding:10px 13px}.dial{width:143px;height:143px}.dial-inner{width:112px;height:112px}}
      @media(max-width:620px){.studio{padding:16px 12px 26px;border-radius:16px}.top{align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:17px}.brandmark{width:39px;height:39px;border-radius:12px}h1{font-size:24px}.brand{gap:10px}.nav{width:100%;justify-content:flex-start}.nav a{font-size:11px;min-height:40px}.overview,.boards{grid-template-columns:1fr;gap:13px}.card{border-radius:20px}.card-pad{padding:19px}.master-wrap{display:grid;grid-template-columns:140px 1fr;align-items:center;gap:12px}.dial{margin:13px 0 0;width:132px;height:132px}.dial-inner{width:101px;height:101px}.dial-inner b{font-size:32px}.master-note{text-align:left;font-size:10px}.master .mute-master{width:100%;font-size:11px;margin-top:12px}.section-line{margin-top:23px}.section-line p{max-width:120px;text-align:right;font-size:10px}.board-body{grid-template-columns:108px 1fr;gap:12px}.speaker-art{width:108px;height:148px}.eq-tools{gap:6px}.eq-tools>button{padding:5px 8px;font-size:10px}.tabs button{padding:5px 9px}.eq-head{align-items:flex-start;gap:12px;flex-direction:column}.trim-grid{grid-template-columns:1fr;gap:12px}.foot{flex-direction:column;gap:7px;font-size:10px}.track strong{font-size:18px}.screen{padding:16px}.demo-line{gap:5px;font-size:9px}.eq-bands{min-width:700px}.subline{font-size:11px}}
      .studio{width:100%;min-width:0}.overview>*,.boards>*,.board-body>*,.master-wrap>*,.foot>*{min-width:0}.board-body{grid-template-columns:135px minmax(0,1fr)}.nav button{border-radius:24px;padding:11px 17px;font-size:12px;font-weight:650;min-height:0}.section-line{gap:14px}.section-line p{flex-shrink:1}.foot span{overflow-wrap:anywhere}select{min-width:0}
      @media(max-width:900px){.board-body{grid-template-columns:95px minmax(0,1fr)}}
      @media(max-width:620px){.board-body{grid-template-columns:98px minmax(0,1fr);gap:10px}.speaker-art{width:98px}.master-wrap{grid-template-columns:130px minmax(0,1fr);gap:8px}.nav button{font-size:11px;padding:10px 13px;min-height:40px}.master .small-caps{font-size:8px;letter-spacing:.6px}.section-line p{max-width:110px}.selects{gap:6px}}
      .presets{margin-top:15px;padding:14px;border:1px solid var(--line);border-radius:14px;background:#f8fbfc}.preset-heading{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted)}.preset-heading b{color:var(--ink)}.preset-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.preset-buttons button{min-height:38px;font-size:11px;padding:8px 13px}.preset-buttons button[aria-pressed=true]{background:#e0f4f3;border-color:#83c8c9;color:#127e87}.preset-description,.preset-message{font-size:11px;color:var(--muted);line-height:1.6;margin-top:9px}.preset-message{color:#127e87}.preset-message:empty{display:none}
      .custom-presets-wrap{margin-top:13px;padding-top:11px;border-top:1px dashed var(--line)}.custom-item{display:inline-flex;gap:3px}.custom-delete{min-width:36px;padding:8px 9px}.custom-empty{font-size:11px;color:var(--muted);align-self:center}.custom-save{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.custom-save input{flex:1 1 180px;min-width:0;min-height:38px;padding:0 11px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:12px;background:transparent;color:var(--ink)}.custom-save button{min-height:38px;font-size:11px}
      .np-info{display:flex;gap:14px;align-items:flex-start;margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:14px}.np-info[hidden]{display:none}.np-art{width:96px;height:96px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--line)}.np-art[hidden]{display:none}.np-text{min-width:0;flex:1;font-size:12px;line-height:1.5}.np-meta{font-weight:600;color:var(--ink);overflow-wrap:anywhere}.np-meta:empty{display:none}.np-bio{margin:6px 0 0;color:var(--muted);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.np-bio:empty{display:none}.np-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.np-links a{font-size:11px;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:5px 10px;text-decoration:none}.np-links a[hidden]{display:none}.np-source{display:block;margin-top:6px;font-size:10px;color:var(--muted)}.np-source:empty{display:none}.online-toggle{display:flex;gap:8px;align-items:center;margin-top:14px;font-size:12px;color:var(--ink)}.online-note{font-size:11px;color:var(--muted);margin:4px 0 0;line-height:1.5}@media(max-width:500px){.np-art{width:64px;height:64px}}
      @media(prefers-reduced-motion:reduce){.playing .cone{animation:none}}
      </style><main class="studio"><header class="top"><div class="brand"><div class="brandmark">≋</div><div><div class="eyebrow">Jouw geluid. Jouw instelling.</div><h1>Multiroom Audio Dashboard</h1><p class="subline">${c.boards.length} speler${c.boards.length===1?'':'s'} · jouw geluid</p></div></div><nav class="nav"><button class="manage-speakers" data-act="manage-speakers" aria-label="Speakers beheren">⚙ Speakers beheren</button><a href="/lovelace/home" data-nav>⌂ Home</a><button data-act="more-group">Speler openen ↗</button></nav></header><p class="speaker-access-note" role="status" aria-live="polite"></p>
      <div class="overview"><section class="card card-pad"><div class="row"><span class="eyebrow">Nu aan het spelen</span><span class="pill" id="group-state"></span></div><div class="screen"><div class="monitor-meta"><div class="track-icon">♫</div><div class="track"><strong id="title">Even verbinden…</strong><small id="artist">Louder-speakers</small></div><span class="time" id="time">—</span></div><canvas class="spectrum" aria-label="Spectrumdemo; geen meting van het audiosignaal"></canvas><div class="freq"><span>32 Hz</span><span>125</span><span>500</span><span>2k</span><span>8k</span><span>16k</span></div><div class="demo-line"><span>Spectrumdemo · geen live-audioanalyse</span><label><input type="checkbox" id="demo" checked> Animatie</label></div></div><div class="transport"><button data-act="media_previous_track" aria-label="Vorige track">⏮</button><button data-act="media_play_pause" class="play" aria-label="Afspelen of pauzeren" id="play">Ⅱ</button><button data-act="media_next_track" aria-label="Volgende track">⏭</button><button data-act="more-group" aria-label="Speler en wachtrij">☷</button></div><div class="np-info" hidden><img class="np-art" alt="" hidden><div class="np-text"><div class="np-meta" id="np-meta"></div><p class="np-bio" id="np-bio"></p><div class="np-links"><a id="np-youtube" target="_blank" rel="noopener noreferrer">▶ Zoek videoclip op YouTube</a><a id="np-mb" target="_blank" rel="noopener noreferrer" hidden>MusicBrainz</a><a id="np-wiki" target="_blank" rel="noopener noreferrer" hidden>Wikipedia</a></div><small class="np-source" id="np-source"></small></div></div></section>
      <section class="card card-pad master"><div class="row"><span class="eyebrow">Master volume</span><span class="small-caps">HOOFDSPELER</span></div><div class="master-wrap"><div class="dial" id="dial"><div class="dial-inner"><b id="master-value">—</b><small>VOLUME %</small></div></div><div>${this._range(c.entity,'Groepsvolume','volume')}<button class="mute-master" data-act="mute-group" id="mute-group">Geluid dempen</button><p class="master-note">Bedient de ingestelde hoofdspeler.<br>Elke speaker is ook apart instelbaar.</p></div></div></section></div>
      <div class="section-line"><h2>Je speakers</h2><p>Live bediening via Home Assistant</p></div><div class="boards">${c.boards.map((b,i)=>`<section class="card card-pad" id="board-${i}"><div class="row board-head"><div><div class="eyebrow">${b.bands.length?'Versterker · ':'Speaker · '}${i+1}</div><h3>${ESC(b.name)}</h3></div><span class="pill" data-status="${i}">—</span></div><div class="board-body">${this._speaker(i)}<div>${this._range(b.player,'Afspeelvolume','volume')}<div class="board-buttons"><button data-act="mute" data-board="${i}" id="mute-${i}">Dempen</button><button data-act="more" data-board="${i}">Speler ↗</button></div><div class="selects">${b.eq?this._select(b.eq,'Equalizer'):''}${b.mixer?this._select(b.mixer,'Kanaalmix'):''}</div></div></div>${this._playerControls(b.player)}<div class="sensors"><span class="sensor">CPU <b id="temp-${i}">—</b></span><span class="sensor">WiFi <b id="wifi-${i}">—</b></span><span class="sensor" id="fault-${i}">Status <b>—</b></span><button data-act="led" data-board="${i}" aria-label="LED van ${ESC(b.name)}" style="font-size:10px;min-height:30px;padding:5px 9px">LED ↗</button><button data-act="fan" data-board="${i}" aria-label="Koeling van ${ESC(b.name)}" style="font-size:10px;min-height:30px;padding:5px 9px">Koeling ↗</button></div></section>`).join('')}</div>
      <section class="card card-pad eq"><div class="row eq-head"><div><span class="eyebrow">Fijnafstelling</span><h2>15-bands equalizer</h2></div><div class="eq-tools"><div class="tabs">${c.boards.map((b,i)=>`<button data-act="tab" data-board="${i}" aria-pressed="${i===this._tab}">${ESC(b.name)}</button>`).join('')}</div><button data-act="flat">Vlak · 0 dB</button></div></div><p class="eq-intro" id="eq-description"></p><div class="eq-scroll"><div class="eq-bands" id="bands"></div></div><div class="eq-axis"><span>Laag · bas</span><span>Midden</span><span>Hoog · detail</span></div><details class="advanced"><summary>Uitgangstrim van dit board · dB</summary><div class="trim-grid" id="trims"></div><p class="eq-intro">Kanaal 1 en 2 zijn de fysieke uitgangen van het geselecteerde board.</p></details></section>
      <p class="error" role="status" aria-live="polite"></p><footer class="foot"><span><b>Bediening live · spectrum demo.</b> De balkjes tonen de sfeer van het ontwerp, niet het gemeten geluid.</span><span>Voor echt audio-reactief beeld: Music Assistant → Plugins → MilkDrop Visualizer.</span></footer></main>`;
      this._q('.eq-scroll').insertAdjacentHTML('beforebegin',`<div class="presets"><div class="preset-heading"><b>Equalizerprofielen</b><span id="preset-active">Huidig: —</span></div><div class="preset-buttons" role="group" aria-label="Equalizerprofielen">${Object.entries(PRESETS).map(([id,p])=>`<button data-act="preset" data-preset="${id}" aria-pressed="false" title="${ESC(p.description)}">${ESC(p.name)}</button>`).join('')}</div><p class="preset-description" id="preset-description"></p><p class="preset-message" role="status" aria-live="polite"></p><div class="custom-presets-wrap"><div class="preset-heading"><b>Mijn profielen</b><span class="custom-store"></span></div><div class="preset-buttons" id="custom-presets" role="group" aria-label="Mijn profielen"></div><div class="custom-save"><input type="text" data-custom-name maxlength="${CUSTOM_NAME_MAX}" placeholder="Naam, bijv. Avond" aria-label="Naam voor huidige equalizerinstelling" autocomplete="off" enterkeyhint="done"><button type="button" data-act="custom-save">Huidige instelling opslaan</button></div><p class="preset-message custom-message" role="status" aria-live="polite"></p></div></div>`);
      this._renderCustomPresets();
      this._renderEq(); this._installRetro(); this._q('.eq').hidden=!c.boards.some(b=>b.bands.length); this._all('[data-act=tab]').forEach(el=>{el.hidden=!c.boards[Number(el.dataset.board)].bands.length;}); if(this.isConnected) this._observe();
    }
    _renderEq() {
      const b=this._cfg.boards[this._tab];
      if(!b?.bands.length)return;
      this._q('#bands').innerHTML=b.bands.map(f=>`<label class="band"><output data-out="${ESC(f.entity)}">—</output><input type="range" min="-15" max="15" step="1" data-entity="${ESC(f.entity)}" data-kind="number" aria-label="${ESC(b.name+' '+f.label+' Hz')}" disabled><span class="hz">${ESC(f.label)}</span></label>`).join('');
      this._q('#trims').innerHTML=(b.trim_left?this._range(b.trim_left,'Kanaal 1'):'')+(b.trim_right?this._range(b.trim_right,'Kanaal 2'):'');
      this._q('#eq-description').textContent=b.name+' · de 15 beschikbare EQ-banden van je firmware. Op een telefoon kun je horizontaal door de banden vegen.';
      this._all('[data-act=tab]').forEach(el=>el.setAttribute('aria-pressed',Number(el.dataset.board)===this._tab));
      this._q('.preset-message').textContent='';
    }
    _nowPlaying() {
      // Main entity first; a group without metadata falls back to a configured speaker that plays.
      const main=this._st(this._cfg.entity);
      if(main?.attributes?.media_title)return {id:this._cfg.entity,st:main};
      const ids=this._cfg.boards.map(b=>b.player).filter(id=>this._st(id)?.attributes?.media_title);
      const id=ids.find(x=>this._st(x).state==='playing')||ids.find(x=>this._st(x).state==='paused');
      return id?{id,st:this._st(id)}:{id:this._cfg.entity,st:main};
    }
    _artUrl(st) {
      const pic=st?.attributes?.entity_picture;
      if(typeof pic!=='string'||!pic)return null;
      if(/^\/(?!\/)/.test(pic))return typeof this._hass?.hassUrl==='function'?this._hass.hassUrl(pic):pic;
      return /^https?:\/\//i.test(pic)?pic:null;
    }
    _setOnline(on) {
      this._online=!!on;
      try{localStorage.setItem(ONLINE_KEY,this._online?'1':'0');}catch{}
      this._npKey=null;this._syncNowPlaying();
    }
    _syncNowPlaying() {
      const box=this._q('.np-info');if(!box)return;
      const toggle=this._q('[data-online-info]');if(toggle&&this.shadowRoot?.activeElement!==toggle)toggle.checked=!!this._online;
      const st=this._nowPlaying()?.st,a=st?.attributes||{},title=typeof a.media_title==='string'?a.media_title.trim():'';
      const artist=typeof a.media_artist==='string'?a.media_artist.trim():'',album=typeof a.media_album_name==='string'?a.media_album_name.trim():'';
      if(!title){box.hidden=true;return;}
      box.hidden=false;
      const key=[artist,title,album].join('\u241f').toLowerCase();
      this._npCache??=new Map();
      const info=this._online?this._npCache.get(key):null;
      if(this._online&&key!==this._npKey){
        this._npKey=key;clearTimeout(this._npTimer);
        if(!this._npCache.has(key))this._npTimer=setTimeout(()=>this._lookupTrack(key,artist,title,album).then(()=>{if(this._npKey===key)this._syncNowPlaying();}),1200);
      }
      this._q('#np-meta').textContent=[album||info?.album,info?.year].filter(Boolean).join(' · ');
      const art=this._q('.np-art'),src=this._artUrl(st)||(info?.releaseId?'https://coverartarchive.org/release/'+info.releaseId+'/front-250':null);
      if(art){
        if(!src){art.hidden=true;art.removeAttribute?.('src');art.dataset.src='';}
        else if(art.dataset.src!==src){art.dataset.src=src;art.hidden=false;art.onerror=()=>{art.hidden=true;};art.src=src;}
      }
      this._q('#np-youtube').href='https://www.youtube.com/results?search_query='+encodeURIComponent([artist,title].filter(Boolean).join(' '));
      this._q('#np-bio').textContent=info?.bio||'';
      const mb=this._q('#np-mb'),wiki=this._q('#np-wiki');
      mb.hidden=!info?.recordingUrl;if(info?.recordingUrl)mb.href=info.recordingUrl;
      wiki.hidden=!info?.wikiUrl;if(info?.wikiUrl)wiki.href=info.wikiUrl;
      this._q('#np-source').textContent=!this._online?'':!info?'Online info zoeken…':info.bio?'Tekst: Wikipedia (CC BY-SA) · gegevens: MusicBrainz':info.recordingUrl?'Gegevens: MusicBrainz':'Geen online info gevonden.';
    }
    async _fetchJson(url) {
      const ctrl=typeof AbortController==='function'?new AbortController():null,timer=setTimeout(()=>ctrl?.abort(),8000);
      try{
        const res=await fetch(url,{headers:{Accept:'application/json'},credentials:'omit',referrerPolicy:'no-referrer',signal:ctrl?.signal});
        if(!res.ok)throw Error('HTTP '+res.status);
        return await res.json();
      }finally{clearTimeout(timer);}
    }
    async _mbFetch(path) {
      // MusicBrainz allows about one request per second per client.
      const wait=Math.max(0,(this._mbNext||0)-Date.now());this._mbNext=Date.now()+wait+1100;
      if(wait)await new Promise(done=>setTimeout(done,wait));
      return this._fetchJson('https://musicbrainz.org/ws/2/'+path);
    }
    async _lookupTrack(key,artist,title,album) {
      this._npCache??=new Map();
      if(this._npCache.has(key))return this._npCache.get(key);
      const result={},clean=v=>v.replace(/["\\]/g,' ').trim();
      try{
        const query='recording:"'+clean(title)+'"'+(artist?' AND artist:"'+clean(artist)+'"':'');
        const data=await this._mbFetch('recording?query='+encodeURIComponent(query)+'&limit=5&fmt=json');
        const rec=(Array.isArray(data?.recordings)?data.recordings:[]).find(x=>Number(x?.score)>=80);
        if(rec){
          if(MBID.test(rec.id||''))result.recordingUrl='https://musicbrainz.org/recording/'+rec.id;
          const year=/^\d{4}/.exec(String(rec['first-release-date']||''))?.[0];if(year)result.year=year;
          const rels=Array.isArray(rec.releases)?rec.releases:[];
          const rel=rels.find(x=>album&&String(x?.title||'').toLowerCase()===album.toLowerCase())||rels.find(x=>x?.['release-group']?.['primary-type']==='Album')||rels[0];
          if(rel){if(typeof rel.title==='string')result.album=rel.title.slice(0,200);if(MBID.test(rel.id||''))result.releaseId=rel.id;}
          const artistId=rec['artist-credit']?.[0]?.artist?.id;
          if(MBID.test(artistId||'')){
            const art=await this._mbFetch('artist/'+artistId+'?inc=url-rels&fmt=json');
            const wd=(Array.isArray(art?.relations)?art.relations:[]).map(x=>/^https:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/.exec(String(x?.url?.resource||''))?.[1]).find(Boolean);
            if(wd){
              const w=await this._fetchJson('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+wd+'&props=sitelinks&sitefilter=nlwiki%7Cenwiki&format=json&origin=*');
              const links=w?.entities?.[wd]?.sitelinks||{};
              for(const [site,lang] of [['nlwiki','nl'],['enwiki','en']]){
                const page=links[site]?.title;if(typeof page!=='string'||!page)continue;
                const sum=await this._fetchJson('https://'+lang+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(page.replaceAll(' ','_')));
                if(typeof sum?.extract!=='string'||!sum.extract.trim())continue;
                result.bio=sum.extract.trim().slice(0,600);
                const url=sum.content_urls?.desktop?.page;
                if(typeof url==='string'&&url.startsWith('https://'+lang+'.wikipedia.org/wiki/'))result.wikiUrl=url;
                break;
              }
            }
          }
        }
      }catch{result.error=true;}
      this._npCache.set(key,result);
      if(this._npCache.size>50)this._npCache.delete(this._npCache.keys().next().value);
      return result;
    }
    async _loadCustomPresets() {
      let raw=null,store='local';
      if(typeof this._hass?.callWS==='function'){
        try{raw=(await this._hass.callWS({type:'frontend/get_user_data',key:CUSTOM_KEY}))?.value;store='ha';}catch{raw=null;}
      }
      if(store==='local'){try{raw=JSON.parse(localStorage.getItem(CUSTOM_KEY));}catch{raw=null;}}
      this._customStore=store;this._customPresets=cleanCustomPresets(raw);
      this._renderCustomPresets();if(this._cfg)this._sync();
    }
    async _storeCustomPresets(list) {
      const value={version:1,presets:list.map(p=>({name:p.name,values:[...p.values]}))};
      if(this._customStore==='ha')await this._hass.callWS({type:'frontend/set_user_data',key:CUSTOM_KEY,value});
      else localStorage.setItem(CUSTOM_KEY,JSON.stringify(value));
      this._customPresets=list;this._renderCustomPresets();
    }
    _renderCustomPresets() {
      const box=this._q('#custom-presets');if(!box)return;
      const list=this._customPresets||[],store=this._q('.custom-store');
      if(store)store.textContent=!this._customPresets?'Laden…':this._customStore==='ha'?'Bewaard in je Home Assistant-account':'Bewaard in deze browser';
      box.innerHTML=list.length?list.map(p=>{const confirm=this._confirmDelete===p.name;return `<span class="custom-item"><button data-act="custom-preset" data-name="${ESC(p.name)}" aria-pressed="false">${ESC(p.name)}</button><button class="custom-delete" data-act="custom-delete" data-name="${ESC(p.name)}" aria-label="${ESC(confirm?'Bevestig: profiel '+p.name+' verwijderen':'Profiel '+p.name+' verwijderen')}">${confirm?'Verwijderen?':'×'}</button></span>`;}).join(''):'<span class="custom-empty">Nog geen eigen profielen. Stel de schuiven in, geef een naam en sla op.</span>';
    }
    _currentProfileValues(board) {
      // Read the board's live band states and store them in FREQUENCIES order.
      if(board.bands.length!==FREQUENCIES.length)throw Error('dit board heeft geen 15 EQ-banden');
      const values=new Array(FREQUENCIES.length).fill(null);
      board.bands.forEach(f=>{
        const index=FREQUENCIES.findIndex(hz=>f.frequency===hz||f.entity.endsWith('_left_'+hz)),v=this._num(f.entity);
        if(index<0||values[index]!==null)throw Error('de frequenties van dit board komen niet overeen');
        if(v===null||v<-15||v>15)throw Error('niet alle EQ-banden van '+board.name+' zijn beschikbaar');
        values[index]=Math.round(v*100)/100;
      });
      return values;
    }
    async _saveCustomPreset() {
      if(this._savingCustom||this._applyingPreset||!this._customPresets)return;
      const input=this._q('[data-custom-name]'),name=cleanName(input?.value),b=this._cfg.boards[this._tab],msg=this._q('.custom-message');
      const fail=text=>{msg.textContent='';this._q('.error').textContent=text;};
      if(!name)return fail('Geef het profiel eerst een naam.');
      if(name.length>CUSTOM_NAME_MAX)return fail('De profielnaam mag maximaal '+CUSTOM_NAME_MAX+' tekens hebben.');
      if(BUILTIN_NAMES.has(name.toLowerCase()))return fail(name+' is al een standaardprofiel. Kies een andere naam.');
      let values;try{values=this._currentProfileValues(b);}catch(err){return fail('Profiel niet opgeslagen: '+err.message+'.');}
      const existing=this._customPresets.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
      if(existing<0&&this._customPresets.length>=CUSTOM_MAX)return fail('Je kunt maximaal '+CUSTOM_MAX+' eigen profielen bewaren. Verwijder er eerst een.');
      const list=this._customPresets.map(p=>({name:p.name,values:[...p.values]}));
      if(existing<0)list.push({name,values});else list[existing]={name,values};
      this._savingCustom=true;this._confirmDelete=null;
      try{
        await this._storeCustomPresets(list);
        this._q('.error').textContent='';if(input)input.value='';
        msg.textContent='Profiel '+name+(existing<0?' opgeslagen':' bijgewerkt')+' met de huidige instelling van '+b.name+'. Er is niets naar de speaker gestuurd.';
      }catch(err){fail('Profiel niet opgeslagen: '+(err?.message||err)+'.');}
      finally{this._savingCustom=false;this._sync();}
    }
    async _deleteCustomPreset(name) {
      if(this._savingCustom||this._applyingPreset||!this._customPresets?.some(p=>p.name===name))return;
      clearTimeout(this._confirmTimer);
      if(this._confirmDelete!==name){
        // Two-step delete without browser dialogs; the confirmation expires after 5 s.
        this._confirmDelete=name;this._renderCustomPresets();this._sync();
        this._confirmTimer=setTimeout(()=>{this._confirmDelete=null;this._renderCustomPresets();this._sync();},5000);
        return;
      }
      this._confirmDelete=null;this._savingCustom=true;
      try{await this._storeCustomPresets(this._customPresets.filter(p=>p.name!==name));this._q('.custom-message').textContent='Profiel '+name+' verwijderd.';}
      catch(err){this._renderCustomPresets();this._q('.error').textContent='Profiel niet verwijderd: '+(err?.message||err)+'.';}
      finally{this._savingCustom=false;this._sync();}
    }
    _presetValues(board, preset) {
      if(!preset || board.bands.length!==FREQUENCIES.length)throw Error('Dit profiel vereist de 15 EQ-banden van je board.');
      const indexes=board.bands.map(f=>FREQUENCIES.findIndex(hz=>f.frequency===hz||f.entity.endsWith('_left_'+hz)));
      if(indexes.some(i=>i<0)||new Set(indexes).size!==FREQUENCIES.length)throw Error('De frequenties van dit board komen niet overeen.');
      return board.bands.map(f=>{
        const index=FREQUENCIES.findIndex(hz=>f.frequency===hz||f.entity.endsWith('_left_'+hz));
        if(index<0)throw Error('De frequenties van dit board komen niet overeen.');
        return preset.values[index];
      });
    }
    _presetReady(board, preset) {
      try {
        const values=this._presetValues(board,preset),mode=this._st(board.eq);
        return this._ok(board.eq) && mode.attributes.options?.includes('EQ 15 Band') && board.bands.every((f,i)=>{
          const a=this._st(f.entity)?.attributes,v=values[i];
          return this._num(f.entity)!==null && Number.isFinite(a?.min) && Number.isFinite(a?.max) && v>=a.min && v<=a.max && Number.isFinite(a.step) && a.step>0 && Math.abs((v-a.min)/a.step-Math.round((v-a.min)/a.step))<.001;
        });
      } catch {return false;}
    }
    _syncPresets() {
      const b=this._cfg.boards[this._tab];if(!b?.bands.length)return;
      const enabled=this._st(b.eq)?.state==='EQ 15 Band';
      const same=p=>{try{return this._presetValues(b,p).every((v,i)=>this._num(b.bands[i].entity)===v);}catch{return false;}};
      const match=enabled?Object.entries(PRESETS).find(([,p])=>same(p)):null;
      const custom=enabled&&!match?(this._customPresets||[]).find(same):null;
      this._q('#preset-active').textContent=this._applyingPreset?'Wordt toegepast…':'Huidig: '+(!this._ok(b.eq)?'Onbekend':!enabled?'Equalizer uit':match?match[1].name:custom?custom.name:'Aangepast');
      this._q('#preset-description').textContent=(match?match[1].description+'. ':custom?'Eigen profiel. ':'')+'Kies een profiel voor '+b.name+'. De equalizer wordt ingeschakeld; daarna kun je zelf fijnregelen.';
      const busy=!!this._applyingPreset||!!this._savingCustom;
      this._all('[data-act=custom-preset]').forEach(el=>{const p=this._customPresets?.find(x=>x.name===el.dataset.name);el.disabled=busy||!this._presetReady(b,p);el.setAttribute('aria-pressed',custom&&custom.name===el.dataset.name?'true':'false');});
      this._all('[data-act=custom-delete]').forEach(el=>{el.disabled=busy;});
      let readable=true;try{this._currentProfileValues(b);}catch{readable=false;}
      const save=this._q('[data-act=custom-save]');if(save)save.disabled=busy||!this._customPresets||!readable;
      const nameInput=this._q('[data-custom-name]');if(nameInput)nameInput.disabled=busy||!this._customPresets;
      this._all('[data-act=preset]').forEach(el=>{el.disabled=!!this._applyingPreset||!this._presetReady(b,PRESETS[el.dataset.preset]);el.setAttribute('aria-pressed',match?.[0]===el.dataset.preset?'true':'false');});
      this._all('[data-act=tab]').forEach(el=>{el.disabled=!!this._applyingPreset;});
      this._q('[data-act=flat]').disabled=!!this._applyingPreset||!this._presetReady(b,PRESETS.vlak);
      if(this._applyingPreset){this._all('#bands input').forEach(el=>el.disabled=true);this._all('select[data-kind=select]').forEach(el=>{if(el.dataset.entity===b.eq)el.disabled=true;});}
    }
    async _applyPreset(id) {
      if(this._applyingPreset)return;
      const b=this._cfg.boards[this._tab],preset=typeof id==='object'?this._customPresets?.find(p=>p.name===id?.custom):PRESETS[id];
      if(!this._presetReady(b,preset)){this._q('.error').textContent='Profiel niet toegepast: de equalizer of een EQ-band is niet beschikbaar.';return;}
      const values=this._presetValues(b,preset);
      this._applyingPreset=true;this._q('.preset-message').textContent='Profiel '+preset.name+' toepassen op '+b.name+'…';this._sync();
      try {
        for(let i=0;i<b.bands.length;i++)if(this._num(b.bands[i].entity)!==values[i])await this._call('number','set_value',b.bands[i].entity,{value:values[i]},true);
        if(this._st(b.eq)?.state!=='EQ 15 Band')await this._call('select','select_option',b.eq,{option:'EQ 15 Band'},true);
        this._q('.preset-message').textContent='Profiel '+preset.name+' verstuurd naar '+b.name+'.';
      } catch(err) {
        this._q('.preset-message').textContent='';this._q('.error').textContent='Profiel niet volledig toegepast op '+b.name+': '+err.message+' Controleer de schuiven en probeer opnieuw.';
      } finally {this._applyingPreset=false;this._sync();}
    }
    _input(e) {
      const el=e.target;
      if(el.dataset.color){if(COLOR_KEYS.includes(el.dataset.color)&&HEX.test(el.value)){this._colors[el.dataset.color]=el.value;this._applyColors(true);}return;}
      if(!el.matches('input[data-entity]')) return;
      this._all('[data-out]').forEach(out=>{if(out.dataset.out===el.dataset.entity)out.textContent=el.value+(el.dataset.kind==='volume'?'%':' dB');});
    }
    async _change(e) {
      const el=e.target;
      if(el.dataset.color)return;
      if(el.dataset.onlineInfo!==undefined){this._setOnline(el.checked);return;}
      if(el.dataset.appearance==='skin'){this._setSkin(el.value);return;}
      if(el.dataset.appearance==='visual'){if(['spectrum','analog'].includes(el.value)){this._visual=el.value;this._applyColors(true);}return;}
      if(el.dataset.appearance==='source'){if(['live','demo'].includes(el.value)){this._source=el.value;this._stopLive();this._liveRetryAt=0;this._applyColors(true);}return;}
      if(el.id==='demo'){this._demo=el.checked;this._animate();return;}
      const id=el.dataset.entity; if(!id || !this._allowed.has(id))return;
      if(el.dataset.media){const service=el.dataset.media,key={select_source:'source',select_sound_mode:'sound_mode',repeat_set:'repeat',media_seek:'seek_position'}[service];if(key)await this._call('media_player',service,id,{[key]:service==='media_seek'?Number(el.value):el.value});return;}
      if(el.dataset.kind==='select')await this._call('select','select_option',id,{option:el.value});
      else if(el.dataset.kind==='volume')await this._call('media_player','volume_set',id,{volume_level:Number(el.value)/100});
      else if(el.dataset.kind==='number')await this._call('number','set_value',id,{value:Number(el.value)});
    }
    _more(id) { this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:id},bubbles:true,composed:true})); }
    _speakerEditorTarget() {
      // Follow this card's composed ancestors only; never search another dashboard.
      let node=this,wrapper,view,modern=false,options;
      while(node){
        if(node.localName==='hui-card'&&!wrapper)wrapper=node;
        if(node.localName==='hui-card-options'&&!options)options=node;
        if(Array.isArray(node.path)&&node.path[0]==='views')modern=true;
        if(node.localName==='hui-view'){view=node;break;}
        node=node.parentNode||node.host;
      }
      const dashboard=view?.lovelace,index=view?.index;
      if(!wrapper||!dashboard||!Number.isInteger(index)||index<0||dashboard.mode==='yaml')return null;
      const config=dashboard.config?.views?.[index],target=wrapper.config;
      if(!config||config.strategy||dashboard.config.strategy||![`custom:${TAG}`,`custom:${LEGACY_TAG}`].includes(target?.type)||target.entity!==this._cfg.entity)return null;
      const matches=[];
      const walk=(item,path,depth=0)=>{
        if(!item||typeof item!=='object'||depth>32)return;
        if(item.type)matches.push({item,path});
        for(const key of ['cards','sections'])if(Array.isArray(item[key]))item[key].forEach((child,i)=>walk(child,[...path,key,i],depth+1));
      };
      walk(config,['views',index]);
      let found=matches.filter(entry=>entry.item===target);
      if(!found.length){try{const json=JSON.stringify(target);found=matches.filter(entry=>JSON.stringify(entry.item)===json);}catch{return null;}}
      if(found.length!==1)return null;
      const path=found[0].path;
      if(options?.path){
        // In edit mode use HA's exact path, including its version-specific shape.
        const p=options.path;
        if(!Array.isArray(p)||JSON.stringify(p)!==JSON.stringify(modern?path:path.filter(value=>Number.isInteger(value))))return null;
        return {path:[...p]};
      }
      if(modern)return {path};
      // HA 2026.10 and earlier: direct cards [view,card], sections [view,section,card].
      const relative=path.slice(2);
      if(relative.length!==2&&!(relative.length===4&&relative[0]==='sections'))return null;
      return {path:path.filter(value=>Number.isInteger(value))};
    }
    _openSpeakerEditor(){
      const note=this._q('.speaker-access-note');
      if(this._hass?.user?.is_admin!==true){note.textContent='Log in als beheerder om speakers op dit dashboard te kiezen.';return;}
      const target=this._speakerEditorTarget();
      if(!target){note.textContent='De kaarteditor kon hier niet rechtstreeks worden geopend. Gebruik Dashboard bewerken en daarna Bewerken onder deze kaart.';return;}
      note.textContent='';
      // HA loads its own dialog and handles Save/Cancel and dashboard permissions.
      this.dispatchEvent(new CustomEvent('ll-edit-card',{detail:target,bubbles:true,composed:true}));
    }
    async _click(e) {
      const link=e.target.closest('a[data-nav]');
      if(link && this._hass){e.preventDefault();history.pushState(null,'',link.getAttribute('href'));window.dispatchEvent(new Event('location-changed'));return;}
      const el=e.target.closest('[data-act]'); if(!el || el.disabled)return;
      const a=el.dataset.act,b=this._cfg.boards[Number(el.dataset.board)||0],g=this._cfg.entity;
      if(a==='manage-speakers'){this._openSpeakerEditor();return;}
      if(a==='palette'){const palette=PALETTES[el.dataset.palette];if(palette){this._colors={...palette};this._applyColors(true);}return;}
      if(a==='default-colors'){this._colors={...SKINS[this._skin].colors};this._applyColors(true);return;}
      if(a==='tab'){this._tab=Number(el.dataset.board);this._renderEq();this._sync();return;}
      if(a==='more-group'){this._more(g);return;}
      if(['more','led','fan'].includes(a)){this._more(a==='more'?b.player:b[a]);return;}
      if(a==='player-service'){const id=el.dataset.entity,service=el.dataset.service;await this._call('media_player',service,id,service==='shuffle_set'?{shuffle:!this._st(id)?.attributes.shuffle}:{});return;}
      if(a==='mute-group') {await this._muteGroup();return;}
      if(a==='mute'){await this._call('media_player','volume_mute',b.player,{is_volume_muted:!this._st(b.player)?.attributes.is_volume_muted});return;}
      if(a==='flat'||a==='preset'){await this._applyPreset(a==='flat'?'vlak':el.dataset.preset);return;}
      if(a==='custom-preset'){await this._applyPreset({custom:el.dataset.name});return;}
      if(a==='custom-save'){await this._saveCustomPreset();return;}
      if(a==='custom-delete'){await this._deleteCustomPreset(el.dataset.name);return;}
      if(['media_play_pause','media_previous_track','media_next_track'].includes(a))await this._call('media_player',a,g,{});
    }
    _supports(id, service) {
      const features=this._st(id)?.attributes.supported_features;
      if(!Number.isSafeInteger(features)||features<0||!this._ok(id))return false;
      const bits={media_pause:1,media_seek:2,volume_set:4,volume_mute:8,media_previous_track:16,media_next_track:32,turn_on:128,turn_off:256,volume_up:1024,volume_down:1024,select_source:2048,media_stop:4096,clear_playlist:8192,media_play:16384,shuffle_set:32768,select_sound_mode:65536,repeat_set:262144};
      if(service==='media_play_pause')return !!(features&(this._st(id).state==='playing'?1:16384));
      return !!bits[service] && !!(features&bits[service]);
    }
    _playerControls(id) {
      const buttons=[['media_play','Afspelen'],['media_pause','Pauze'],['media_stop','Stop'],['media_previous_track','Vorige'],['media_next_track','Volgende'],['volume_down','Zachter'],['volume_up','Harder'],['turn_on','Aan'],['turn_off','Uit'],['shuffle_set','Shuffle']];
      return `<div class="player-controls" data-player="${ESC(id)}"><div class="board-buttons" style="flex-wrap:wrap">${buttons.map(([service,label])=>`<button data-act="player-service" data-service="${service}" data-entity="${ESC(id)}" aria-label="${ESC(id+' '+label)}" hidden disabled>${label}</button>`).join('')}</div>${[['select_source','Bron'],['select_sound_mode','Geluidsprofiel'],['repeat_set','Herhalen']].map(([service,label])=>`<label class="select-field" data-media-label hidden>${label}<select aria-label="${ESC(id+' '+label)}" data-entity="${ESC(id)}" data-media="${service}" disabled></select></label>`).join('')}<label class="range-field" data-media-label hidden>Positie (seconden)<input type="range" aria-label="${ESC(id+' Positie')}" data-entity="${ESC(id)}" data-media="media_seek" min="0" step="1" disabled></label><p class="eq-intro">Extra functies en groepering: open Speler ↗.</p></div>`;
    }
    async _muteGroup() {
      // Only command the configured main entity. A configured speaker list is not group membership.
      const id=this._cfg.entity;
      await this._call('media_player','volume_mute',id,{is_volume_muted:!this._st(id)?.attributes.is_volume_muted});
    }
    async _call(domain, service, id, data, bubble=false) {
      try {
        if(!this._hass || !this._allowed.has(id) || !this._ok(id)||!id.startsWith(domain+'.'))throw Error('Deze bediening is nu niet beschikbaar.');
        const allowed={number:['set_value'],select:['select_option'],media_player:['media_play_pause','media_play','media_pause','media_stop','media_previous_track','media_next_track','volume_set','volume_mute','volume_up','volume_down','turn_on','turn_off','select_source','select_sound_mode','repeat_set','shuffle_set','media_seek']};
        if(!allowed[domain]?.includes(service))throw Error('Onbekende bediening.');
        const a=this._st(id).attributes;
        let clean={};
        if(domain==='number') {
          const v=data.value;
          if(!Number.isFinite(v)||!Number.isFinite(a.min)||!Number.isFinite(a.max)||v<a.min||v>a.max||!Number.isFinite(a.step)||a.step<=0||Math.abs((v-a.min)/a.step-Math.round((v-a.min)/a.step))>.001)throw Error('Waarde valt buiten het bereik of de stapgrootte.');
          clean={value:v};
        }
        if(domain==='select'){
          if(!Array.isArray(a.options)||!a.options.includes(data.option))throw Error('Deze instelling wordt niet aangeboden.');
          clean={option:data.option};
        }
        if(domain==='media_player'){
          if(!this._supports(id,service))throw Error('Deze speler biedt deze functie niet aan.');
          if(service==='volume_set'){if(!Number.isFinite(data.volume_level)||data.volume_level<0||data.volume_level>1)throw Error('Ongeldig volume.');clean={volume_level:data.volume_level};}
          if(service==='volume_mute'){if(typeof data.is_volume_muted!=='boolean')throw Error('Ongeldige dempstand.');clean={is_volume_muted:data.is_volume_muted};}
          if(service==='shuffle_set'){if(typeof data.shuffle!=='boolean')throw Error('Ongeldige shuffle.');clean={shuffle:data.shuffle};}
          if(service==='media_seek'){if(!Number.isFinite(a.media_duration)||!Number.isFinite(data.seek_position)||data.seek_position<0||data.seek_position>a.media_duration)throw Error('Ongeldige positie.');clean={seek_position:data.seek_position};}
          for(const [svc,key,list] of [['select_source','source',a.source_list],['select_sound_mode','sound_mode',a.sound_mode_list],['repeat_set','repeat',['off','one','all']]])if(service===svc){if(!Array.isArray(list)||!list.includes(data[key]))throw Error('Deze keuze wordt niet aangeboden.');clean={[key]:data[key]};}
        }
        this._q('.error').textContent='';
        await this._hass.callService(domain,service,clean,{entity_id:id});
        return true;
      } catch(err) { this._q('.error').textContent='Instelling niet uitgevoerd: '+err.message; if(bubble)throw err; return false; }
    }
    _sync() {
      if(!this._cfg || !this._q('#title'))return;
      const g=this._st(this._cfg.entity),attrs=g?.attributes||{},playing=g?.state==='playing';
      const manage=this._q('[data-act=manage-speakers]');manage.disabled=this._hass?.user?.is_admin!==true;manage.title=manage.disabled?'Beheerder nodig om speakers te kiezen':'Kies speakers en hoofdspeler';
      const np=this._nowPlaying()?.st?.attributes||attrs;
      this._q('#title').textContent=np.media_title||'Kies je muziek';
      this._q('#artist').textContent=[np.media_artist,np.media_album_name].filter(Boolean).join(' · ')||attrs.friendly_name||'Je speakers';
      this._syncNowPlaying();
      this._q('#group-state').textContent=playing?'● SPEELT':['paused','idle'].includes(g?.state)?'GEREED':'NIET VERBONDEN';
      this._q('#group-state').classList.toggle('dim',!playing);
      this._q('#play').textContent=playing?'Ⅱ':'▶';
      this._all('.transport [data-act]').forEach(el=>{el.disabled=!this._supports(this._cfg.entity,el.dataset.act);});
      const vol=Number.isFinite(attrs.volume_level)?Math.round(attrs.volume_level*100):null;
      this._q('#master-value').textContent=vol===null?'—':vol;
      this._q('#dial').style.setProperty('--vol',vol||0);
      this._q('#mute-group').disabled=!this._supports(this._cfg.entity,'volume_mute');
      this._q('#mute-group').textContent=attrs.is_volume_muted===true?'Geluid aan':'Geluid dempen';
      this._cfg.boards.forEach((b,i)=>{
        const online=this._ok(b.player),fault=this._st(b.fault)?.state;
        const badge=this._q(`[data-status="${i}"]`);badge.textContent=online?'● ONLINE':'OFFLINE';badge.classList.toggle('dim',!online);
        this._q('#board-'+i).classList.toggle('playing',this._st(b.player)?.state==='playing');
        this._q('#temp-'+i).textContent=this._fmt(b.temperature,' °C',1);
        this._q('#wifi-'+i).textContent=this._fmt(b.wifi,' dBm');
        const f=this._q('#fault-'+i);f.querySelector('b').textContent=fault==='off'?'In orde':fault==='on'?'Foutmelding':'Onbekend';f.classList.toggle('fault',fault==='on');
        const mute=this._q('#mute-'+i);mute.disabled=!this._supports(b.player,'volume_mute');mute.textContent=this._st(b.player)?.attributes.is_volume_muted?'Geluid aan':'Dempen';
      });
      this._all('select[data-kind=select]').forEach(el=>{
        const s=this._st(el.dataset.entity),opts=s?.attributes.options||[];
        if(el.dataset.options!==JSON.stringify(opts)){el.innerHTML=opts.map(x=>`<option value="${ESC(x)}">${ESC(x)}</option>`).join('');el.dataset.options=JSON.stringify(opts);}
        if(this.shadowRoot.activeElement!==el)el.value=s?.state||'';el.disabled=!this._ok(el.dataset.entity);
      });
      this._all('input[data-kind][data-entity]').forEach(el=>{
        const id=el.dataset.entity,s=this._st(id),volume=el.dataset.kind==='volume';
        const value=volume?Number(s?.attributes.volume_level)*100:this._num(id);
        const valid=this._ok(id)&&Number.isFinite(value)&&(!volume||this._supports(id,'volume_set'));
        el.min=volume?0:s?.attributes.min??-15;el.max=volume?100:s?.attributes.max??15;el.step=volume?1:s?.attributes.step??1;el.disabled=!valid;
        if(this.shadowRoot.activeElement!==el && !el.matches(':active')){
          if(valid)el.value=value;
          this._all('[data-out]').forEach(out=>{if(out.dataset.out===id)out.textContent=valid?(volume?Math.round(value)+'%':value+' dB'):'—';});
        }
      });
      this._cfg.boards.forEach((b,i)=>{
        for(const [key,selector] of [['temperature','#temp-'+i],['wifi','#wifi-'+i],['fault','#fault-'+i]]){const el=this._q(selector);(key==='fault'?el:el.parentElement).hidden=!b[key];}
        for(const key of ['led','fan'])this._q(`[data-act="${key}"][data-board="${i}"]`).hidden=!b[key];
      });
      this._all('[data-act=player-service]').forEach(el=>{el.hidden=!this._supports(el.dataset.entity,el.dataset.service);el.disabled=el.hidden;if(el.dataset.service==='shuffle_set')el.setAttribute('aria-pressed',String(!!this._st(el.dataset.entity)?.attributes.shuffle));});
      this._all('[data-media]').forEach(el=>{
        const a=this._st(el.dataset.entity)?.attributes||{},service=el.dataset.media;
        let enabled=this._supports(el.dataset.entity,service);
        if(service==='media_seek'){
          enabled=enabled&&Number.isFinite(a.media_duration)&&a.media_duration>0;el.max=a.media_duration||0;
          if(this.shadowRoot.activeElement!==el)el.value=a.media_position||0;
        }else{
          const list=service==='select_source'?a.source_list:service==='select_sound_mode'?a.sound_mode_list:['off','one','all'];
          enabled=enabled&&Array.isArray(list)&&list.length>0;
          const opts=Array.isArray(list)?list:[];
          if(el.dataset.options!==JSON.stringify(opts)){el.innerHTML=opts.map(v=>`<option value="${ESC(v)}">${ESC(v)}</option>`).join('');el.dataset.options=JSON.stringify(opts);}
          if(this.shadowRoot.activeElement!==el)el.value=a[service==='select_source'?'source':service==='select_sound_mode'?'sound_mode':'repeat']||'';
        }
        el.disabled=!enabled;el.parentElement.hidden=!enabled;
      });
      this._syncPresets();
      this._animate();
    }
    _animate() {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._timer);
      this._ensureLive();
      if(!this.isConnected || !this._q('canvas') || this._visible===false)return;
      const draw=(t)=>{
        if(!this.isConnected || this._visible===false)return;
        const active=this._demo && this._st(this._cfg.entity)?.state==='playing';
        const tm=this._reduced.matches?1:t/1000;
        const live=this._source==='live',levels=live&&active?this._relay?.currentLevels():null;
        this._updateLiveLabel(!!levels);
        if(this._visual==='analog'){
          const dt=Math.max(.001,Math.min(.05,(t-(this._lastVuTime??t-16))/1000));this._lastVuTime=t;
          const energy=(levels?.rms||0)**2;this._vuEnergy=(this._vuEnergy||0)+(energy-(this._vuEnergy||0))*(1-Math.exp(-dt/.3));
          const db=10*Math.log10(Math.max(this._vuEnergy,1e-12)),target=db< -45?-55:Math.max(-50,Math.min(50,-50+(db+40)/40*100));
          this._vuAngle??=-55;this._vuVelocity??=0;this._vuVelocity+=(110*(target-this._vuAngle)-18*this._vuVelocity)*dt;this._vuAngle+=this._vuVelocity*dt;
          if(!active){this._vuEnergy=0;this._vuAngle=-55;this._vuVelocity=0;}
          this._all('.vu-needle').forEach((needle,i)=>{
            const angle=live?this._vuAngle:active?-18+24*Math.sin(tm*2.1+i*.4)+12*Math.sin(tm*4.3+i*.6):-55;
            needle.setAttribute('transform',`rotate(${Math.max(-55,Math.min(50,angle))} 110 126)`);
          });
        } else {
          const canvas=this._q('canvas'),ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight;
          if(w>0&&h>0){
            const dpr=Math.min(window.devicePixelRatio||1,2);
            if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
            ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
            ctx.strokeStyle=this._canvasColors?.grid||'#29402b';ctx.lineWidth=.6;
            for(let y=8;y<h;y+=22){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
            const n=48,gap=3,bw=(w-(n-1)*gap)/n;
            for(let i=0;i<n;i++){
              const shape=.3+.48*Math.abs(Math.sin(i*.19+tm*.75))+.19*Math.sin(tm*3.3+i*.68);
              const amp=live?(levels?.bars[i]||0):active?Math.max(.06,shape*(1-i/n*.45)):.035;
              const bar=Math.round(amp*(h-10)/5)*5;
              const colors=this._canvasColors||{bar:'#b5e147',peak:'#f1a444'};
              const gradient=ctx.createLinearGradient(0,h,0,0);gradient.addColorStop(0,colors.bar);gradient.addColorStop(.6,colors.bar);gradient.addColorStop(1,colors.peak);
              ctx.fillStyle=gradient;ctx.fillRect(i*(bw+gap),h-bar,bw,bar);
              if(active&&bar>0){ctx.fillStyle=colors.peak;ctx.fillRect(i*(bw+gap),h-bar-4,bw,2);}
            }
          }
        }
        const p=this._nowPlaying()?.st,a=p?.attributes||{};
        const elapsed=(a.media_position||0)+(p?.state==='playing'&&a.media_position_updated_at?Math.max(0,(Date.now()-Date.parse(a.media_position_updated_at))/1000):0);
        const mm=(s)=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
        this._q('#time').textContent=Number.isFinite(a.media_duration)?mm(Math.min(a.media_duration,elapsed))+' / '+mm(a.media_duration):'LIVE';
        if(!document.hidden && active && !this._reduced.matches)this._raf=requestAnimationFrame(draw);
        else {clearTimeout(this._timer);this._timer=setTimeout(()=>this._animate(),1000);}
      };draw(performance.now());
    }
  }
  customElements.define(TAG,MultiroomAudioDashboard);
  if(!customElements.get(LEGACY_TAG))customElements.define(LEGACY_TAG,class extends MultiroomAudioDashboard {});
  window.customCards=window.customCards||[];
  window.customCards.push({type:TAG,name:'Multiroom Audio Dashboard',description:'Audiobediening voor Home Assistant-spelers, met eigen stijlen, kleuren en Music Assistant-bronmeters.'});
})();

