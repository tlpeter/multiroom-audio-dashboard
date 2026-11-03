const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
// Values created inside the card's VM context are cross-realm: compare by JSON.
const eq=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
const KEY='multiroom-audio-dashboard:eq-presets';
let Card;
const local=new Map();
vm.runInNewContext(fs.readFileSync(__dirname+'/louder-amplifier-card.js','utf8'),{
  HTMLElement:class{},window:{},customElements:{get(){},define(tag,cls){Card=cls;}},
  localStorage:{getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v))},
  setTimeout:()=>0,clearTimeout:()=>{}
});
// Synthetic fixture only. `ws` simulates HA frontend user data; null means no WebSocket API (preview).
function setup({ws=new Map(),failSet=false}={}){
  const {config,states}=JSON.parse(fs.readFileSync(__dirname+'/fixture.json','utf8'));
  const c=Object.create(Card.prototype),calls=[],wsCalls=[],nodes=new Map();
  c._cfg=config;c._tab=0;c._allowed=new Set(Object.keys(states));
  c._q=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',value:''});return nodes.get(selector);};
  c._all=()=>[];c._sync=()=>{};
  c._hass={states,async callService(domain,service,data,target){
    calls.push({domain,service,data,target});
    states[target.entity_id].state=String(domain==='number'?data.value:data.option);
  }};
  if(ws)c._hass.callWS=async msg=>{
    wsCalls.push(msg);
    if(msg.type==='frontend/get_user_data')return {value:ws.get(msg.key)};
    if(msg.type==='frontend/set_user_data'){if(failSet)throw Error('Connection lost');ws.set(msg.key,JSON.parse(JSON.stringify(msg.value)));return null;}
    throw Error('unexpected '+msg.type);
  };
  const setBands=(board,values)=>config.boards[board].bands.forEach((f,i)=>{states[f.entity].state=String(values[i]);});
  return {c,calls,wsCalls,states,config,ws,setBands,q:c._q};
}
const BAS=[2,3,5,6,5,3,1,0,0,0,0,0,0,0,0],MINE=[3,2,1,0,-1,-2,-3,0,1,2,3,4,5,4,3];
(async()=>{
  // Save reads live states, stores per HA user and sends no device commands.
  let x=setup();await x.c._loadCustomPresets();
  assert.equal(x.c._customStore,'ha');eq(x.c._customPresets,[]);
  x.setBands(0,MINE);x.q('[data-custom-name]').value='  Avond   laat ';
  await x.c._saveCustomPreset();
  assert.equal(x.calls.length,0,'Saving must not send device commands');
  eq(x.ws.get(KEY),{version:1,presets:[{name:'Avond laat',values:MINE}]});
  assert.match(x.q('.custom-message').textContent,/opgeslagen/);assert.equal(x.q('[data-custom-name]').value,'');

  // Same name (case-insensitive) updates; built-in and empty names are refused.
  x.setBands(0,BAS);x.q('[data-custom-name]').value='avond LAAT';await x.c._saveCustomPreset();
  eq(x.ws.get(KEY).presets,[{name:'avond LAAT',values:BAS}]);assert.match(x.q('.custom-message').textContent,/bijgewerkt/);
  for(const bad of ['Bas','  ','x'.repeat(41)]){
    const before=JSON.stringify(x.ws.get(KEY));x.q('.error').textContent='';x.q('[data-custom-name]').value=bad;
    await x.c._saveCustomPreset();assert.equal(JSON.stringify(x.ws.get(KEY)),before,bad);assert.notEqual(x.q('.error').textContent,'',bad);
  }

  // Unavailable band: nothing stored.
  x=setup();await x.c._loadCustomPresets();x.states[x.config.boards[0].bands[3].entity].state='unavailable';
  x.q('[data-custom-name]').value='Test';await x.c._saveCustomPreset();
  assert.equal(x.ws.get(KEY),undefined);assert.match(x.q('.error').textContent,/niet alle EQ-banden/);

  // Stored in frequency order, so the profile works on another board and with reordered bands.
  x=setup();x.config.boards[0].bands.reverse();await x.c._loadCustomPresets();
  const HZ=['20hz','31_5hz','50hz','80hz','125hz','200hz','315hz','500hz','800hz','1250hz','2000hz','3150hz','5000hz','8000hz','16000hz'];
  x.config.boards[0].bands.forEach(f=>{x.states[f.entity].state=String(MINE[HZ.findIndex(hz=>f.entity.endsWith('_left_'+hz))]);});
  x.q('[data-custom-name]').value='Mijn';await x.c._saveCustomPreset();
  eq(x.ws.get(KEY).presets[0].values,MINE,'Values must be stored in frequency order');
  x.c._tab=1;x.states[x.config.boards[1].eq].state='Off';
  await x.c._applyPreset({custom:'Mijn'});
  assert(x.calls.length>0&&x.calls.every(call=>call.target.entity_id.startsWith('number.speaker_rechts_')||call.target.entity_id===x.config.boards[1].eq));
  eq(x.config.boards[1].bands.map(f=>Number(x.states[f.entity].state)),MINE);
  assert.equal(x.calls.at(-1).data.option,'EQ 15 Band');assert.match(x.q('.preset-message').textContent,/Mijn/);

  // Apply uses the same preflight: out of range means no partial write.
  x=setup({ws:new Map([[KEY,{version:1,presets:[{name:'Hard',values:[10,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]}]])});
  await x.c._loadCustomPresets();x.states[x.config.boards[0].bands[0].entity].attributes.max=6;
  await x.c._applyPreset({custom:'Hard'});assert.equal(x.calls.length,0);assert.match(x.q('.error').textContent,/niet toegepast/);
  await x.c._applyPreset({custom:'Bestaat niet'});assert.equal(x.calls.length,0);

  // Invalid stored data is ignored; only clean entries load.
  x=setup({ws:new Map([[KEY,{presets:[
    {name:'Goed',values:MINE},{name:'goed',values:BAS},{name:'Disco',values:BAS},{name:'',values:BAS},
    {name:'Te kort',values:[1,2]},{name:'Te hard',values:[99,...BAS.slice(1)]},{name:'Tekst',values:BAS.map(String)},{name:'<img src=x>',values:BAS}
  ]}]])});
  await x.c._loadCustomPresets();eq(x.c._customPresets.map(p=>p.name),['Goed','<img src=x>']);
  x.c._renderCustomPresets();assert(!x.q('#custom-presets').innerHTML.includes('<img'),'Names must be escaped');

  // Storage failure: error shown, list unchanged.
  x=setup({failSet:true});await x.c._loadCustomPresets();x.q('[data-custom-name]').value='Avond';
  await x.c._saveCustomPreset();eq(x.c._customPresets,[]);assert.match(x.q('.error').textContent,/Connection lost/);assert.equal(x.c._savingCustom,false);

  // Two-step delete.
  x=setup({ws:new Map([[KEY,{version:1,presets:[{name:'A',values:MINE},{name:'B',values:BAS}]}]])});await x.c._loadCustomPresets();
  await x.c._deleteCustomPreset('A');assert.equal(x.ws.get(KEY).presets.length,2,'First click only asks for confirmation');
  await x.c._deleteCustomPreset('A');eq(x.ws.get(KEY).presets.map(p=>p.name),['B']);

  // Without the HA WebSocket API (preview) the browser storage is used.
  x=setup({ws:null});await x.c._loadCustomPresets();assert.equal(x.c._customStore,'local');
  x.setBands(0,MINE);x.q('[data-custom-name]').value='Lokaal';await x.c._saveCustomPreset();
  eq(JSON.parse(local.get(KEY)).presets,[{name:'Lokaal',values:MINE}]);

  // Limit on the number of profiles.
  x=setup({ws:new Map([[KEY,{version:1,presets:Array.from({length:24},(_,i)=>({name:'P'+i,values:MINE}))}]])});await x.c._loadCustomPresets();
  x.q('[data-custom-name]').value='Nieuw';await x.c._saveCustomPreset();assert.equal(x.ws.get(KEY).presets.length,24);assert.match(x.q('.error').textContent,/maximaal 24/);
  console.log('Custom profile checks passed: save without commands, HA user storage, rename/update, name rules, frequency order across boards, preflight, invalid data, escaping, storage failure, two-step delete, browser fallback and limit.');
})().catch(e=>{console.error(e);process.exitCode=1;});
