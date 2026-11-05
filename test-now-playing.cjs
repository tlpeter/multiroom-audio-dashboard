const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
// Synthetic data only. External services are mocked; nothing leaves the machine.
const eq=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
const MB_REC='11111111-2222-4333-8444-555555555555',MB_REL='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',MB_ART='99999999-8888-4777-8666-555555555555';
let Card,requests=[],responses={},times=[],delays=[];
const local=new Map();
const ctx={
  HTMLElement:class{},window:{},customElements:{get(){},define(tag,cls){Card=cls;}},
  localStorage:{getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v))},
  setTimeout:(fn,ms)=>{delays.push(ms||0);Promise.resolve().then(fn);return 1;},clearTimeout:()=>{},AbortController,
  async fetch(url,opts){
    requests.push(url);times.push(Date.now());
    assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');
    const host=new URL(url).host;
    assert(['musicbrainz.org','www.wikidata.org','nl.wikipedia.org','en.wikipedia.org'].includes(host),'Unexpected host '+host);
    const key=Object.keys(responses).find(k=>url.includes(k));
    if(!key)return {ok:false,status:404,json:async()=>({})};
    const body=responses[key];if(body instanceof Error)throw body;
    return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(body))};
  }
};
vm.runInNewContext(fs.readFileSync(__dirname+'/louder-amplifier-card.js','utf8'),ctx);
function setup(){
  const {config,states}=JSON.parse(fs.readFileSync(__dirname+'/fixture.json','utf8'));
  const c=Object.create(Card.prototype),nodes=new Map();
  c._cfg=config;c._allowed=new Set(Object.keys(states));c._hass={states,hassUrl:p=>'http://ha.local:8123'+p};
  c._q=sel=>{if(!nodes.has(sel))nodes.set(sel,{textContent:'',hidden:false,href:'',src:'',dataset:{},removeAttribute(){this.src='';}});return nodes.get(sel);};
  requests=[];times=[];delays=[];
  return {c,states,config,q:c._q};
}
function services(){
  responses={
    'ws/2/recording?':{recordings:[{id:MB_REC,score:100,'first-release-date':'1987-05-04','artist-credit':[{artist:{id:MB_ART}}],releases:[{id:MB_REL,title:'Live',date:'1990'},{id:'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',title:'Test Album','release-group':{'primary-type':'Album'}}]}]},
    ['ws/2/artist/'+MB_ART]:{relations:[{url:{resource:'https://www.wikidata.org/wiki/Q42'}}]},
    'wbgetentities':{entities:{Q42:{sitelinks:{nlwiki:{title:'Test Band'},enwiki:{title:'Test band'}}}}},
    'nl.wikipedia.org/api/rest_v1/page/summary/Test_Band':{extract:'Test Band is een fictieve band <script>alert(1)</script>.',content_urls:{desktop:{page:'https://nl.wikipedia.org/wiki/Test_Band'}}}
  };
}
(async()=>{
  // Source: main entity first, otherwise a configured speaker that plays.
  let x=setup();
  eq(x.c._nowPlaying().id,x.config.entity);
  delete x.states[x.config.entity].attributes.media_title;
  x.states['media_player.speaker_links'].state='paused';
  Object.assign(x.states['media_player.speaker_rechts'].attributes,{media_title:'Rechts nummer',media_artist:'Band R'});
  x.states['media_player.speaker_rechts'].state='playing';
  eq(x.c._nowPlaying().id,'media_player.speaker_rechts','Playing speaker wins');
  x.states['media_player.speaker_rechts'].state='idle';
  eq(x.c._nowPlaying().id,'media_player.speaker_links','Paused speaker with metadata as fallback');

  // Artwork: HA-relative path through hassUrl, absolute http(s) kept, other schemes refused.
  x=setup();const st=p=>({attributes:{entity_picture:p}});
  eq(x.c._artUrl(st('/api/media_player_proxy/media_player.a?token=x')),'http://ha.local:8123/api/media_player_proxy/media_player.a?token=x');
  eq(x.c._artUrl(st('https://ma.local/img.jpg')),'https://ma.local/img.jpg');
  for(const bad of ['javascript:alert(1)','//evil.example/x.png','data:image/png;base64,AA',42,null])eq(x.c._artUrl(st(bad)),null,String(bad));

  // Off by default: panel, YouTube link and HA art work without any request.
  x=setup();x.states[x.config.entity].attributes.entity_picture='/api/media_player_proxy/media_player.louder_speakers?token=t';
  x.c._loadColors?.call?.(x.c);x.c._online=false;
  x.c._syncNowPlaying();await new Promise(r=>setImmediate(r));
  eq(requests.length,0,'No external requests while online info is off');
  eq(x.q('.np-info').hidden,false);eq(x.q('#np-meta').textContent,'Synthetic test audio');
  eq(x.q('#np-youtube').href,'https://www.youtube.com/results?search_query=Louder%20Studio%20Demo%20track');
  eq(x.q('.np-art').src,'http://ha.local:8123/api/media_player_proxy/media_player.louder_speakers?token=t');
  eq(x.q('#np-source').textContent,'');
  delete x.states[x.config.entity].attributes.media_title;x.config.boards.forEach(b=>delete x.states[b.player].attributes.media_title);
  x.c._syncNowPlaying();eq(x.q('.np-info').hidden,true,'Hidden without a title');

  // On: MusicBrainz -> Wikidata -> Wikipedia, rate limited, cached, validated.
  services();x=setup();x.c._online=true;x.states[x.config.entity].attributes.media_album_name='Test Album';
  const info=await x.c._lookupTrack('k','Louder Studio','Demo track','Test Album');
  eq(info,{recordingUrl:'https://musicbrainz.org/recording/'+MB_REC,year:'1987',album:'Test Album',releaseId:'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',bio:'Test Band is een fictieve band <script>alert(1)</script>.',wikiUrl:'https://nl.wikipedia.org/wiki/Test_Band'});
  const mb=requests.filter(u=>u.startsWith('https://musicbrainz.org/'));eq(mb.length,2);
  assert(decodeURIComponent(mb[0]).includes('recording:"Demo track" AND artist:"Louder Studio"'));
  assert(delays.some(ms=>ms>=1000&&ms<=1100),'Second MusicBrainz request must wait about 1.1 s');
  const n=requests.length;await x.c._lookupTrack('k','Louder Studio','Demo track','Test Album');eq(requests.length,n,'Cached');
  // Rendering puts external text in textContent only (the node mock has no innerHTML).
  x.c._npCache.set([ 'louder studio','demo track','test album'].join('␟'),info);x.c._npKey=[ 'louder studio','demo track','test album'].join('␟');
  x.c._syncNowPlaying();
  eq(x.q('#np-bio').textContent,info.bio);eq(x.q('#np-meta').textContent,'Test Album · 1987');
  eq(x.q('#np-mb').hidden,false);eq(x.q('#np-wiki').href,info.wikiUrl);assert.match(x.q('#np-source').textContent,/Wikipedia \(CC BY-SA\)/);
  eq(x.q('.np-art').src,'https://coverartarchive.org/release/cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee/front-250','Cover Art Archive only when HA has no art');

  // Untrusted IDs and URLs are not turned into links.
  services();responses['ws/2/recording?'].recordings[0].id='../../evil';responses['ws/2/recording?'].recordings[0].releases=[{id:'x',title:'T'}];
  responses['nl.wikipedia.org/api/rest_v1/page/summary/Test_Band'].content_urls.desktop.page='https://evil.example/wiki';
  x=setup();let bad=await x.c._lookupTrack('b','A','T','');
  eq(bad.recordingUrl,undefined);eq(bad.releaseId,undefined);eq(bad.wikiUrl,undefined);assert(bad.bio);
  // Low score: no match, no further requests.
  services();responses['ws/2/recording?'].recordings[0].score=40;x=setup();
  eq(await x.c._lookupTrack('c','A','T',''),{});eq(requests.length,1);
  // Network failure: quiet.
  responses['ws/2/recording?']=new Error('offline');x=setup();
  eq(await x.c._lookupTrack('d','A','T',''),{error:true});
  // Debounced lookup from sync, then shown.
  services();x=setup();x.c._online=true;x.c._syncNowPlaying();
  eq(x.q('#np-source').textContent,'Online info zoeken…');
  eq(delays.includes(1200),true,'Track changes are debounced');for(let i=0;i<50;i++)await new Promise(r=>setImmediate(r));
  assert.match(x.q('#np-bio').textContent,/fictieve band/);
  // Toggle stored per browser.
  x.c._setOnline(false);eq(local.get('multiroom-audio-dashboard:online-info'),'0');x.c._setOnline(true);eq(local.get('multiroom-audio-dashboard:online-info'),'1');
  console.log('Now-playing checks passed: source fallback, artwork URL rules, no requests when off, YouTube link, MusicBrainz/Wikidata/Wikipedia lookup, rate limit, cache, Cover Art fallback, untrusted IDs/URLs, low score, offline, debounce and stored toggle.');
})().catch(e=>{console.error(e);process.exitCode=1;});
