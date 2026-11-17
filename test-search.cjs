const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
// Synthetic data only; Home Assistant WebSocket and services are mocked.
const eq=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
let Card;
vm.runInNewContext(fs.readFileSync(__dirname+'/louder-amplifier-card.js','utf8'),{
  HTMLElement:class{},window:{},customElements:{get(){},define(tag,cls){Card=cls;}},setTimeout:()=>0,clearTimeout:()=>{}
});
const SEARCH=4194304,PLAY=512,ENQ=2097152;
function setup({mainFeatures=16445|SEARCH|PLAY|ENQ,respond}={}){
  const {config,states}=JSON.parse(fs.readFileSync(__dirname+'/fixture.json','utf8'));
  states[config.entity].attributes.supported_features=mainFeatures;
  const c=Object.create(Card.prototype),nodes=new Map(),ws=[],calls=[];
  c._cfg=config;c._allowed=new Set(Object.keys(states));
  c._q=sel=>{if(!nodes.has(sel))nodes.set(sel,{textContent:'',value:'',disabled:false,innerHTML:''});return nodes.get(sel);};
  c._all=()=>[];c._sync=()=>{};
  c._hass={states,
    async callWS(msg){ws.push(msg);return respond?respond(msg):{response:{[msg.target.entity_id]:{result:[]}}};},
    async callService(domain,service,data,target){calls.push({domain,service,data,target});}};
  return {c,ws,calls,states,config,q:c._q};
}
const item=(o={})=>({title:'Artiest - Nummer',media_class:'track',media_content_type:'music',media_content_id:'library://track/1',can_play:true,thumbnail:'https://ma.local/img/1.jpg',...o});
(async()=>{
  // Target: main player when it can search and play; otherwise a configured speaker; otherwise none.
  let x=setup();eq(x.c._searchTarget(),x.config.entity);
  x=setup({mainFeatures:16445});eq(x.c._searchTarget(),null,'No search support -> no target');
  x.states['media_player.speaker_rechts'].attributes.supported_features=SEARCH|PLAY;eq(x.c._searchTarget(),'media_player.speaker_rechts');
  x.states['media_player.speaker_rechts'].state='unavailable';eq(x.c._searchTarget(),null,'Unavailable player is not used');

  // Nothing happens without a query or without a target.
  x=setup();x.q('[data-search-query]').value='   ';await x.c._search();eq(x.ws.length,0);assert.match(x.q('.search-status').textContent,/Typ eerst/);
  x.q('[data-search-query]').value='x'.repeat(101);await x.c._search();eq(x.ws.length,0);
  x=setup({mainFeatures:16445});x.q('[data-search-query]').value='abba';await x.c._search();eq(x.ws.length,0);assert.match(x.q('.search-status').textContent,/Music Assistant-speler/);

  // Search request and response parsing.
  const many=Array.from({length:60},(_,i)=>item({title:'N'+i,media_content_id:'library://track/'+i}));
  x=setup({respond:m=>({response:{[m.target.entity_id]:{result:[item(),item({title:'',media_content_id:'x'}),item({can_play:false}),item({media_content_id:42}),item({title:'<img src=x onerror=alert(1)>',thumbnail:'javascript:alert(1)',media_class:'album'}),...many]}}})});
  x.q('[data-search-query]').value='  dancing   queen ';x.c._searchFilter='track';await x.c._search();
  eq(x.ws[0],{type:'call_service',domain:'media_player',service:'search_media',service_data:{search_query:'dancing queen',media_filter_classes:['track']},target:{entity_id:x.config.entity},return_response:true});
  eq(x.c._searchResults.length,40,'Results are capped');
  eq(x.c._searchResults[0],{title:'Artiest - Nummer',id:'library://track/1',type:'music',cls:'track',thumb:'https://ma.local/img/1.jpg'});
  eq(x.c._searchResults[1].thumb,null,'Unsafe artwork URL dropped');
  assert(!x.q('.search-results').innerHTML.includes('<img src=x'),'Titles are escaped');
  assert(x.q('.search-results').innerHTML.includes('data-enqueue="next"'),'Enqueue buttons when supported');
  eq(x.calls.length,0,'Searching never plays');

  // Play, next, add -> play_media on the search player with the stored item only.
  await x.c._playResult(0,'play');await x.c._playResult(0,'next');await x.c._playResult(2,'add');
  eq(x.calls,[
    {domain:'media_player',service:'play_media',data:{media_content_id:'library://track/1',media_content_type:'music',enqueue:'play'},target:{entity_id:x.config.entity}},
    {domain:'media_player',service:'play_media',data:{media_content_id:'library://track/1',media_content_type:'music',enqueue:'next'},target:{entity_id:x.config.entity}},
    {domain:'media_player',service:'play_media',data:{media_content_id:'library://track/0',media_content_type:'music',enqueue:'add'},target:{entity_id:x.config.entity}}]);
  await x.c._playResult(999,'play');await x.c._playResult(0,'replace');eq(x.calls.length,3,'Unknown index/enqueue refused');
  // Player changed after the search -> refuse.
  x.states[x.config.entity].attributes.supported_features=16445;await x.c._playResult(0,'play');eq(x.calls.length,3);assert.match(x.q('.error').textContent,/speler is gewijzigd/);

  // No enqueue support: only play buttons, and next/add are refused.
  x=setup({mainFeatures:16445|SEARCH|PLAY,respond:m=>({response:{[m.target.entity_id]:{result:[item()]}}})});
  x.q('[data-search-query]').value='a';await x.c._search();
  assert(!x.q('.search-results').innerHTML.includes('data-enqueue="next"'));
  await x.c._playResult(0,'next');eq(x.calls.length,0);await x.c._playResult(0,'play');eq(x.calls.length,1);

  // Stale responses are ignored; errors are shown.
  let release;const slow=new Promise(r=>{release=r;});
  x=setup({respond:m=>m.service_data.search_query==='oud'?slow.then(()=>({response:{[m.target.entity_id]:{result:[item({title:'Oud'})]}}})):{response:{[m.target.entity_id]:{result:[item({title:'Nieuw'})]}}}});
  x.q('[data-search-query]').value='oud';const first=x.c._search();
  x.q('[data-search-query]').value='nieuw';await x.c._search();release();await first;
  eq(x.c._searchResults.map(r=>r.title),['Nieuw'],'Older answer does not overwrite newer results');
  x=setup({respond:()=>{throw Error('Player does not support searching')}});x.q('[data-search-query]').value='a';await x.c._search();
  assert.match(x.q('.search-status').textContent,/Zoeken mislukt/);eq(x.c._searching,false);
  // Missing or malformed response.
  x=setup({respond:()=>({response:{}})});x.q('[data-search-query]').value='a';await x.c._search();eq(x.c._searchResults,[]);assert.match(x.q('.search-status').textContent,/Niets gevonden/);
  console.log('Search checks passed: target selection, query rules, no search without target, request payload, filter, caps, invalid items, unsafe artwork, escaping, play/next/add payloads, enqueue support, changed player, stale responses, errors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
