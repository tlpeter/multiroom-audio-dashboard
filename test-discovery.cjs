const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
// Synthetic registry only (names as created by the Sonocotta TAS58xx ESPHome packages).
const eq=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
let Card;
vm.runInNewContext(fs.readFileSync(__dirname+'/louder-amplifier-card.js','utf8'),{
  HTMLElement:class{},window:{},customElements:{get(){},define(tag,cls){Card=cls;}},setTimeout:()=>0,clearTimeout:()=>{}
});
const HZ=['20hz','31_5hz','50hz','80hz','125hz','200hz','315hz','500hz','800hz','1250hz','2000hz','3150hz','5000hz','8000hz','16000hz'];
function device(name,dev,{skipBand}={}){
  const ids=['media_player.'+name,'select.'+name+'_eq_mode','select.'+name+'_mixer_mode','number.'+name+'_volume_left','number.'+name+'_volume_right',
    'sensor.'+name+'_'+name+'_cpu_temperature','sensor.'+name+'_'+name+'_wifi_signal','binary_sensor.'+name+'_any_faults','light.'+name+'_'+name+'_led','fan.'+name+'_cooling_fan',
    ...HZ.filter(h=>h!==skipBand).map(h=>'number.'+name+'_left_'+h)];
  return Object.fromEntries(ids.map(id=>[id,{entity_id:id,device_id:dev}]));
}
function card(config,entities){
  const c=Object.create(Card.prototype);c.builds=0;
  c._stopLive=()=>{};c._loadColors=()=>{};c._build=()=>{c.builds++;};c._sync=()=>{};
  Card.prototype.setConfig.call(c,config);
  const states={};for(const id of Object.keys(entities||{}))states[id]={entity_id:id,state:'0',attributes:{}};
  c._hass={states,entities};c._applyDiscovery();
  return c;
}
const W='speaker_woonkamer_links',R='speaker_woonkamer_rechts';
const reg={...device(W,'d1'),...device(R,'d2'),'number.other_left_20hz':{entity_id:'number.other_left_20hz',device_id:'d9'}};

// A speaker picked in the visual editor (player only) gets its own device's entities.
let c=card({entity:'media_player.'+W,players:['media_player.'+W,'media_player.'+R]},reg);
const b0=c._cfg.boards[0],b1=c._cfg.boards[1];
eq(b0.eq,'select.'+W+'_eq_mode');eq(b0.mixer,'select.'+W+'_mixer_mode');eq(b0.trim_left,'number.'+W+'_volume_left');
eq(b0.fan,'fan.'+W+'_cooling_fan');eq(b0.led,'light.'+W+'_'+W+'_led');eq(b0.fault,'binary_sensor.'+W+'_any_faults');
eq(b0.bands.map(f=>f.entity),HZ.map(h=>'number.'+W+'_left_'+h));eq(b0.bands[9].label,'1,25k');
assert(b1.bands.every(f=>f.entity.startsWith('number.'+R+'_')),'Each board uses only its own device');
assert(c._allowed.has('number.'+R+'_left_16000hz')&&!c._allowed.has('number.other_left_20hz'),'Allow list: own devices only');
eq(c.builds,2,'One rebuild after discovery');
c._applyDiscovery();eq(c.builds,2,'Same registry: no rebuild');
c._hass={...c._hass,entities:{...reg}};c._applyDiscovery();eq(c.builds,2,'New registry object, same result: no rebuild');
c._hass={states:c._hass.states};c._applyDiscovery();eq(c._cfg.boards[0].bands.length,15,'Hass without registry keeps the mapping');eq(c.builds,2);

// Explicit, existing entities win.
c=card({entity:'media_player.'+W,boards:[{player:'media_player.'+W,eq:'select.'+R+'_eq_mode'}]},reg);
eq(c._cfg.boards[0].eq,'select.'+R+'_eq_mode');eq(c._cfg.boards[0].mixer,'select.'+W+'_mixer_mode');

// Stale explicit IDs (renamed device) are replaced by the discovered ones.
const stale={player:'media_player.'+W,eq:'select.speaker_links_eq_mode',bands:HZ.map(h=>({entity:'number.speaker_links_left_'+h,label:h}))};
c=card({entity:'media_player.'+W,boards:[stale]},reg);
eq(c._cfg.boards[0].eq,'select.'+W+'_eq_mode');eq(c._cfg.boards[0].bands[0].entity,'number.'+W+'_left_20hz');

// Incomplete band set: no EQ bands, other entities still found.
c=card({entity:'media_player.'+W,players:['media_player.'+W]},device(W,'d1',{skipBand:'800hz'}));
eq(c._cfg.boards[0].bands,[]);eq(c._cfg.boards[0].eq,'select.'+W+'_eq_mode');

// Ambiguous: two matching entities on one device -> not used.
c=card({entity:'media_player.'+W,players:['media_player.'+W]},{...device(W,'d1'),'select.extra_eq_mode':{entity_id:'select.extra_eq_mode',device_id:'d1'}});
eq(c._cfg.boards[0].eq,undefined);

// Opt-out, player without device, missing registry.
c=card({entity:'media_player.'+W,players:['media_player.'+W],auto_entities:false},reg);eq(c._cfg.boards[0].bands,[]);eq(c.builds,1);
c=card({entity:'media_player.generic',players:['media_player.generic']},{'media_player.generic':{entity_id:'media_player.generic'}});eq(c._cfg.boards[0].bands,[]);
c=card({entity:'media_player.'+W,players:['media_player.'+W]},undefined);eq(c._cfg.boards[0].bands,[]);
// Malformed registry values are ignored.
c=card({entity:'media_player.'+W,players:['media_player.'+W]},{['media_player.'+W]:{entity_id:'media_player.'+W,device_id:'d1'},'bad':{entity_id:'number.x_left_20hz"><img>',device_id:'d1'},'n':null});
eq(c._cfg.boards[0].bands,[]);
// Sendspin track sensors as now-playing metadata (main entity first, then a playing speaker).
const meta=(name,dev)=>Object.fromEntries(['track_title','artist','album'].map(k=>['sensor.'+name+'_'+k,{entity_id:'sensor.'+name+'_'+k,device_id:dev}]));
const regM={...device(W,'d1'),...meta(W,'d1'),...device(R,'d2'),...meta(R,'d2')};
c=card({entity:'media_player.'+W,players:['media_player.'+W,'media_player.'+R]},regM);
const st=c._hass.states;st['media_player.'+W].state='playing';
st['sensor.'+W+'_track_title'].state='Viva house';st['sensor.'+W+'_artist'].state='Me and Jack';st['sensor.'+W+'_album'].state='Essential Elements vol. 6';
let np=c._nowPlaying();eq(np.id,'media_player.'+W);eq([np.st.attributes.media_title,np.st.attributes.media_artist,np.st.attributes.media_album_name],['Viva house','Me and Jack','Essential Elements vol. 6']);
eq(st['media_player.'+W].attributes.media_title,undefined,'HA state object is not modified');
st['media_player.'+W].attributes.media_title='Echte titel';eq(c._nowPlaying().st.attributes.media_title,'Echte titel','Player attributes win');
delete st['media_player.'+W].attributes.media_title;
for(const v of ['unknown','unavailable','','   '])st['sensor.'+W+'_track_title'].state=v;
st['sensor.'+W+'_track_title'].state='unknown';st['media_player.'+R].state='playing';st['sensor.'+R+'_track_title'].state='Rechts nummer';st['sensor.'+R+'_artist'].state='unknown';
np=c._nowPlaying();eq(np.id,'media_player.'+R,'Unknown sensor ignored; playing speaker used');eq(np.st.attributes.media_title,'Rechts nummer');eq(np.st.attributes.media_artist,undefined);
st['sensor.'+R+'_track_title'].state='unavailable';eq(c._nowPlaying().st.attributes.media_title,undefined,'Nothing playing with metadata');
// Main entity not in the speaker list still uses its own device sensors.
c=card({entity:'media_player.'+W,players:['media_player.'+R]},regM);c._hass.states['sensor.'+W+'_track_title'].state='Hoofdspeler';
eq(c._nowPlaying().st.attributes.media_title,'Hoofdspeler');
// Opt-out disables sensor metadata too.
c=card({entity:'media_player.'+W,players:['media_player.'+W],auto_entities:false},regM);c._hass.states['sensor.'+W+'_track_title'].state='X';
eq(c._nowPlaying().st.attributes.media_title,undefined);
console.log('Discovery checks passed: per-device entities, Sendspin track sensors, kept without registry, own device only, allow list, single rebuild, explicit wins, stale IDs replaced, incomplete/ambiguous ignored, opt-out, no device/registry, malformed entries.');
