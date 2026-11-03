const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  page.testErrors=[];page.on('pageerror',error=>page.testErrors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test.afterEach(async({page})=>{expect(page.testErrors).toEqual([]);});

async function open(page){
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  await page.getByText('Kleuren & uiterlijk',{exact:true}).click();
}

for(const skin of ['modern','retro','vintage','midnight']){
  test('style '+skin+' renders without sending device commands',async({page},testInfo)=>{
    await open(page);await page.getByRole('combobox',{name:'Stijl',exact:true}).selectOption(skin);
    await expect(page.locator('.studio')).toHaveAttribute('data-skin',skin);
    await expect(page.locator('#bands input')).toHaveCount(15);
    await expect(page.getByRole('slider',{name:'Groepsvolume',exact:true})).toBeEnabled();
    if(skin==='vintage')await expect(page.locator('.analog-meters')).toBeVisible();
    else await expect(page.locator('.analog-meters')).toBeHidden();
    await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
    // Capture the real rendered UI for documentation; all data is synthetic.
    if(skin==='vintage')await page.locator('.appearance').screenshot({path:testInfo.outputPath('appearance-settings.png')});
    await page.getByText('Kleuren & uiterlijk',{exact:true}).click();
    await page.locator('.retro-rack').screenshot({path:testInfo.outputPath(skin+'-desktop.png')});
  });
}

test('colors and visualization persist independently per style',async({page})=>{
  await open(page);
  await page.getByRole('combobox',{name:'Stijl',exact:true}).selectOption('vintage');
  await page.getByRole('button',{name:'Paars',exact:true}).click();
  await page.getByRole('combobox',{name:'Stijl',exact:true}).selectOption('modern');
  await page.getByRole('button',{name:'Oceaan',exact:true}).click();
  await page.getByRole('combobox',{name:'Visualisatie',exact:true}).selectOption('analog');
  await page.getByRole('combobox',{name:'Stijl',exact:true}).selectOption('vintage');
  await expect(page.locator('[data-color-out="accent"]')).toHaveText('#BF8CFF');
  await page.reload();await page.getByText('Kleuren & uiterlijk',{exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Stijl',exact:true})).toHaveValue('vintage');
  await expect(page.locator('[data-color-out="accent"]')).toHaveText('#BF8CFF');
  await page.getByRole('combobox',{name:'Stijl',exact:true}).selectOption('modern');
  await expect(page.locator('[data-color-out="accent"]')).toHaveText('#46C9ED');
  await expect(page.getByRole('combobox',{name:'Visualisatie',exact:true})).toHaveValue('analog');
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
});

test('profiles target the selected board and manual changes become custom',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Bas',exact:true}).click();
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Bas');
  let commands=JSON.parse(await page.locator('#commands').textContent());
  expect(commands).toHaveLength(7);expect(commands.every(c=>c.target.entity_id.startsWith('number.speaker_links_left_'))).toBe(true);
  await page.getByRole('button',{name:'Rechts',exact:true}).click();
  await page.getByRole('button',{name:'Disco',exact:true}).click();
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Disco');
  await page.getByRole('slider',{name:'Rechts 20 Hz',exact:true}).press('ArrowRight');
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Aangepast');
  commands=JSON.parse(await page.locator('#commands').textContent());
  expect(commands.slice(7).every(c=>c.target.entity_id.startsWith('number.speaker_rechts_left_'))).toBe(true);
});

test('named equalizer profiles can be saved, reloaded, applied and deleted',async({page},testInfo)=>{
  await open(page);
  await page.getByRole('slider',{name:'Links 20 Hz',exact:true}).press('ArrowRight');
  await page.getByRole('slider',{name:'Links 1,25k Hz',exact:true}).press('ArrowLeft');
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Aangepast');
  const before=JSON.parse(await page.locator('#commands').textContent()).length;
  await page.getByRole('textbox',{name:'Naam voor huidige equalizerinstelling',exact:true}).fill('Avond');
  await page.getByRole('button',{name:'Huidige instelling opslaan',exact:true}).click();
  await expect(page.locator('.custom-message')).toContainText('Profiel Avond opgeslagen');
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Avond');
  expect(JSON.parse(await page.locator('#commands').textContent())).toHaveLength(before);
  await page.locator('.presets').screenshot({path:testInfo.outputPath('custom-profiles-desktop.png')});
  await page.reload();await expect(page.locator('#title')).toHaveText('Demo track');
  await page.getByRole('button',{name:'Rechts',exact:true}).click();
  await page.getByRole('button',{name:'Avond',exact:true}).click();
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Avond');
  const commands=JSON.parse(await page.locator('#commands').textContent());
  expect(commands).toHaveLength(2);expect(commands.every(c=>c.target.entity_id.startsWith('number.speaker_rechts_left_'))).toBe(true);
  await page.getByRole('button',{name:'Profiel Avond verwijderen',exact:true}).click();
  await expect(page.getByRole('button',{name:'Avond',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Bevestig: profiel Avond verwijderen',exact:true}).click();
  await expect(page.getByRole('button',{name:'Avond',exact:true})).toHaveCount(0);
  await expect(page.locator('#preset-active')).toHaveText('Huidig: Aangepast');
});

test('named profile controls fit a mobile viewport',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.getByRole('textbox',{name:'Naam voor huidige equalizerinstelling',exact:true}).fill('Telefoon');
  await page.getByRole('textbox',{name:'Naam voor huidige equalizerinstelling',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'Telefoon',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.locator('.presets').screenshot({path:testInfo.outputPath('custom-profiles-mobile.png')});
});

test('all four styles fit a mobile viewport',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  for(const skin of ['modern','retro','vintage','midnight']){
    await page.getByRole('combobox',{name:'Stijl',exact:true}).selectOption(skin);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow,skin+' should fit the page width').toBe(false);
    await page.screenshot({path:testInfo.outputPath(skin+'-mobile.png'),fullPage:true});
  }
});

async function generic(page,features=0){
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  await page.evaluate(features=>{
    const card=document.querySelector('louder-amplifier-card');window.genericCalls=[];
    const states={'media_player.generic':{state:'playing',attributes:{friendly_name:'Generic test speaker',supported_features:features,volume_level:.35,is_volume_muted:false,source:'Radio',source_list:['Radio','TV'],sound_mode:'Music',sound_mode_list:['Music','Movie'],repeat:'off',media_duration:200,media_position:20}},'media_player.other':{state:'idle',attributes:{supported_features:4,volume_level:.1}}};
    card.setConfig({entity:'media_player.generic',players:[{player:'media_player.generic',name:'Woonkamer'},'media_player.other'],preview:true});
    card.hass={states,async callService(domain,service,data,target){window.genericCalls.push({domain,service,data,target});Object.assign(states[target.entity_id].attributes,data);card.hass={...card.hass};}};
  },features);
}

async function editor(page){
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  await page.evaluate(()=>{
    const card=document.querySelector('louder-amplifier-card');window.editorEvents=[];
    window.originalEditorConfig=structuredClone(card._cfg);
    const editor=card.constructor.getConfigElement();editor.id='speaker-editor';
    const states={...card.hass.states,
      'media_player.test_sonos':{state:'idle',attributes:{friendly_name:'Sonos · testspeler',supported_features:4|8}},
      'media_player.test_cast':{state:'unavailable',attributes:{friendly_name:'Nest · testspeler',supported_features:4}},
      'light.not_a_speaker':{state:'on',attributes:{friendly_name:'Geen speaker'}}};
    editor.setConfig(card._cfg);editor.hass={...card.hass,states};
    editor.addEventListener('config-changed',event=>{window.editorEvents.push(structuredClone(event.detail.config));editor.setConfig(event.detail.config);});
    document.body.prepend(editor);
  });
}

test('top speaker button is visible and opens an editor with explicit Save and Cancel',async({page},testInfo)=>{
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  const manage=page.getByRole('button',{name:'Speakers beheren',exact:true});
  await expect(manage).toBeInViewport();await expect(manage).toBeEnabled();
  await page.locator('.top').screenshot({path:testInfo.outputPath('speaker-toolbar.png')});
  await page.evaluate(()=>{const c=document.querySelector('louder-amplifier-card');c.hass.states['media_player.test_extra']={state:'idle',attributes:{friendly_name:'Extra test speaker',supported_features:4|8,volume_level:.2}};c.hass={...c.hass};});
  await manage.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox',{name:'Extra test speaker (media_player.test_extra)',exact:true}).check();
  await dialog.getByRole('button',{name:'Annuleren',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.locator('.boards .card')).toHaveCount(2);
  await manage.click();await dialog.getByRole('checkbox',{name:'Extra test speaker (media_player.test_extra)',exact:true}).check();
  await dialog.getByRole('button',{name:'Opslaan',exact:true}).click();
  await expect(page.locator('.boards .card')).toHaveCount(3);await expect(page.locator('#bands input')).toHaveCount(15);
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
  await page.screenshot({path:testInfo.outputPath('speaker-shortcut-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  await expect(manage).toBeInViewport();
  await page.locator('.top').screenshot({path:testInfo.outputPath('speaker-toolbar-mobile.png')});
  await manage.click();await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:testInfo.outputPath('speaker-shortcut-mobile.png'),fullPage:true});
  await dialog.getByRole('button',{name:'Annuleren',exact:true}).click();
});

for(const shape of ['legacy panel','modern panel','legacy section','modern section']){
  test('top speaker shortcut targets its own card in '+shape,async({page})=>{
    await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
    const expected=await page.evaluate(shape=>{
      const c=document.querySelector('louder-amplifier-card'),wrapper=c.parentElement,layout=wrapper.parentElement,view=layout.parentElement,target=wrapper.config;
      const unrelated={type:'markdown',content:'Other card'};const section=shape.endsWith('section'),modern=shape.startsWith('modern');
      view.lovelace.config.views[0]=section?{sections:[{cards:[unrelated]},{cards:[unrelated,target]}]}:{cards:[unrelated,target]};
      if(modern)layout.path=['views',0];else delete layout.path;
      window.shortcutEvents=[];view.addEventListener('ll-edit-card',event=>{event.stopPropagation();window.shortcutEvents.push(event.detail);},{capture:true});
      return modern?(section?['views',0,'sections',1,'cards',1]:['views',0,'cards',1]):(section?[0,1,1]:[0,1]);
    },shape);
    await page.getByRole('button',{name:'Speakers beheren',exact:true}).click();
    expect(await page.evaluate(()=>window.shortcutEvents)).toEqual([{path:expected}]);
    await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
  });
}

test('speaker shortcut crosses HA shadow roots and uses the native edit wrapper path',async({page})=>{
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  await page.evaluate(()=>{
    const card=document.querySelector('louder-amplifier-card'),wrapper=card.parentElement,layout=wrapper.parentElement,view=layout.parentElement;
    const options=document.createElement('hui-card-options');options.path=[0,0];wrapper.replaceWith(options);options.append(wrapper);
    wrapper.attachShadow({mode:'open'}).append(card);layout.attachShadow({mode:'open'}).append(options);
    window.shortcutEvents=[];view.addEventListener('ll-edit-card',event=>{event.stopPropagation();window.shortcutEvents.push(event.detail);},{capture:true});
  });
  await page.getByRole('button',{name:'Speakers beheren',exact:true}).click();
  expect(await page.evaluate(()=>window.shortcutEvents)).toEqual([{path:[0,0]}]);
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
});

test('speaker shortcut rejects non-admin, read-only and ambiguous dashboard contexts',async({page})=>{
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  await page.evaluate(()=>{const c=document.querySelector('louder-amplifier-card');window.shortcutEvents=[];document.addEventListener('ll-edit-card',event=>window.shortcutEvents.push(event.detail),{capture:true});c.hass={...c.hass,user:{is_admin:false}};});
  await expect(page.getByRole('button',{name:'Speakers beheren',exact:true})).toBeDisabled();
  await page.evaluate(()=>{const c=document.querySelector('louder-amplifier-card');c._openSpeakerEditor();c.hass={...c.hass,user:{is_admin:true}};const view=c.parentElement.parentElement.parentElement;view.lovelace.mode='yaml';});
  await page.getByRole('button',{name:'Speakers beheren',exact:true}).click();
  await expect(page.locator('.speaker-access-note')).toContainText('kon hier niet rechtstreeks');
  await page.evaluate(()=>{const c=document.querySelector('louder-amplifier-card'),view=c.parentElement.parentElement.parentElement;view.lovelace.mode='storage';view.lovelace.config.views[0].cards=[structuredClone(c.parentElement.config),structuredClone(c.parentElement.config)];});
  await page.getByRole('button',{name:'Speakers beheren',exact:true}).click();
  expect(await page.evaluate(()=>window.shortcutEvents)).toEqual([]);
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
});

test('visual editor discovers HA players and preserves amplifier configuration',async({page},testInfo)=>{
  await editor(page);
  const e=page.locator('#speaker-editor');
  await expect(e.getByRole('heading',{name:'Speakers beheren'})).toBeVisible();
  await expect(e.getByRole('checkbox')).toHaveCount(5);
  await expect(e.getByText('Geen speaker',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>window.editorEvents)).toEqual([]);
  await e.getByRole('checkbox',{name:'Sonos · testspeler (media_player.test_sonos)',exact:true}).check();
  const result=await page.evaluate(()=>({original:window.originalEditorConfig,changed:window.editorEvents.at(-1)}));
  expect(result.changed.players).toHaveLength(3);expect(result.changed.boards).toBeUndefined();
  expect(result.changed.players.slice(0,2)).toEqual(result.original.boards);
  expect(result.changed.players[2]).toEqual({player:'media_player.test_sonos'});
  await e.getByRole('combobox',{name:'Hoofdspeler',exact:true}).selectOption('media_player.test_sonos');
  expect(await page.evaluate(()=>window.editorEvents.at(-1).entity)).toBe('media_player.test_sonos');
  await page.evaluate(()=>{const card=document.querySelector('louder-amplifier-card');card.setConfig(window.editorEvents.at(-1));});
  await expect(page.locator('.boards .card')).toHaveCount(3);await expect(page.locator('#bands input')).toHaveCount(15);
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
  await e.screenshot({path:testInfo.outputPath('speaker-editor.png')});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await e.screenshot({path:testInfo.outputPath('speaker-editor-mobile.png')});
});

test('visual editor searches, retains unavailable players and prevents an empty selection',async({page})=>{
  await editor(page);const e=page.locator('#speaker-editor');
  await e.getByRole('searchbox',{name:'Zoek een speaker'}).fill('Nest');
  await expect(e.locator('[data-row]:visible')).toHaveCount(1);
  await e.getByRole('checkbox',{name:'Nest · testspeler (media_player.test_cast)',exact:true}).check();
  expect(await page.evaluate(()=>window.editorEvents.at(-1).players.some(p=>p.player==='media_player.test_cast'))).toBe(true);
  await e.getByRole('searchbox',{name:'Zoek een speaker'}).fill('');
  await e.getByRole('checkbox',{name:'Links (media_player.speaker_links)',exact:true}).uncheck();
  await e.getByRole('checkbox',{name:'Rechts (media_player.speaker_rechts)',exact:true}).uncheck();
  // The final removal is rejected, so click rather than demanding an unchecked state.
  await e.getByRole('checkbox',{name:'Nest · testspeler (media_player.test_cast)',exact:true}).click();
  await expect(e.getByRole('alert')).toHaveText('Kies minimaal één en maximaal 32 spelers.');
  await expect(e.getByRole('checkbox',{name:'Nest · testspeler (media_player.test_cast)',exact:true})).toBeChecked();
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
});

test('generic players need no amplifier entities and unsupported controls remain unavailable',async({page})=>{
  await generic(page,0);await expect(page.locator('.eq')).toBeHidden();
  await expect(page.locator('.boards .card')).toHaveCount(2);
  await expect(page.getByRole('slider',{name:'Groepsvolume',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'media_player.generic Afspelen',exact:true})).toBeHidden();
  await expect(page.locator('[data-act=led]').first()).toBeHidden();
  expect(await page.evaluate(()=>window.genericCalls)).toEqual([]);
});

test('native controls send validated options only to their speaker',async({page})=>{
  await generic(page,1|2|4|8|16|32|128|256|1024|2048|4096|16384|32768|65536|262144);
  await page.getByRole('combobox',{name:'media_player.generic Bron',exact:true}).selectOption('TV');
  await page.getByRole('combobox',{name:'media_player.generic Geluidsprofiel',exact:true}).selectOption('Movie');
  await page.getByRole('combobox',{name:'media_player.generic Herhalen',exact:true}).selectOption('all');
  await page.getByRole('button',{name:'media_player.generic Shuffle',exact:true}).click();
  await page.locator('#mute-group').click();
  const calls=await page.evaluate(()=>window.genericCalls);
  expect(calls.map(c=>c.service)).toEqual(['select_source','select_sound_mode','repeat_set','shuffle_set','volume_mute']);
  expect(calls.every(c=>c.target.entity_id==='media_player.generic')).toBe(true);
});

test('live HA capability changes disable controls',async({page})=>{
  await generic(page,4|8|16384|1);
  const volume=page.getByRole('slider',{name:'Groepsvolume',exact:true});await expect(volume).toBeEnabled();
  await page.evaluate(()=>{const c=document.querySelector('louder-amplifier-card');c.hass.states['media_player.generic'].attributes.supported_features=0;c.hass={...c.hass};});
  await expect(volume).toBeDisabled();await expect(page.locator('#mute-group')).toBeDisabled();
  expect(await page.evaluate(()=>window.genericCalls)).toEqual([]);
});

test('new neutral card type renders on desktop without actions',async({page},testInfo)=>{
  await page.goto('/');await expect(page.locator('#title')).toHaveText('Demo track');
  await page.evaluate(()=>{const old=document.querySelector('louder-amplifier-card'),card=document.createElement('multiroom-audio-dashboard');card.setConfig({...old._cfg,preview:true});card.hass=old.hass;old.replaceWith(card);});
  await expect(page.getByRole('heading',{name:'Multiroom Audio Dashboard',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('dashboard-desktop.png'),fullPage:true});
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
});

test('live needles react to PCM level, silence and missing data without demo fallback',async({page})=>{
  await page.addInitScript(()=>{
    window.testAmplitude=.5;window.testEmitAudio=true;window.testClosedSockets=0;
    window.WebSocket=class{
      constructor(){this.readyState=0;setTimeout(()=>{
        this.readyState=1;this.onopen?.();
        this.onmessage?.({data:JSON.stringify({type:'stream/start',payload:{visualizer:{types:['waveform']}}})});
        this.interval=setInterval(()=>{
          if(!window.testEmitAudio)return;
          const data=new ArrayBuffer(1033),view=new DataView(data);view.setUint8(0,22);view.setBigInt64(1,BigInt(Math.round(performance.now()*1000+1000000)),false);
          const bytes=new Uint8Array(data,9);for(let i=0;i<1024;i++)bytes[i]=Math.round(128+127*window.testAmplitude*Math.sin(2*Math.PI*32*i/1024));
          this.onmessage?.({data});
        },20);
      },0);}
      send(text){const msg=JSON.parse(text);if(msg.type==='client/time')queueMicrotask(()=>{
        const now=Math.round(performance.now()*1000+1000000);
        this.onmessage?.({data:JSON.stringify({type:'server/time',payload:{client_transmitted:msg.payload.client_transmitted,server_received:now,server_transmitted:now}})});
      });}
      close(){clearInterval(this.interval);this.readyState=3;window.testClosedSockets++;}
    };
  });
  await open(page);
  await page.evaluate(()=>{
    const card=document.querySelector('louder-amplifier-card');
    card.hass={...card.hass,async callWS(msg){
      if(msg.endpoint?.endsWith('/info'))return {ingress_entry:'/api/hassio_ingress/fixture/'};
      if(msg.endpoint==='/ingress/session')return {session:'synthetic-test-session'};
      return {platform:'music_assistant',unique_id:'fixture-group'};
    }};
  });
  await page.getByRole('combobox',{name:'Visualisatie',exact:true}).selectOption('analog');
  await page.getByRole('combobox',{name:'Databron',exact:true}).selectOption('live');
  await expect(page.locator('.demo-line>span')).toHaveText('Live · mono-bronniveau');
  const angle=async()=>Number((await page.locator('.vu-needle').first().getAttribute('transform')).match(/rotate\(([-\d.]+)/)[1]);
  await expect.poll(angle,{timeout:6000}).toBeGreaterThan(0);
  await page.evaluate(()=>{window.testAmplitude=0;});
  await expect.poll(angle,{timeout:6000}).toBeLessThan(-45);
  await page.evaluate(()=>{window.testAmplitude=.5;});
  await expect.poll(angle,{timeout:6000}).toBeGreaterThan(0);
  await page.evaluate(()=>{window.testEmitAudio=false;});
  await expect(page.locator('.demo-line>span')).toHaveText('Live · wachten op audiodata');
  await expect.poll(angle,{timeout:6000}).toBeLessThan(-45);
  await expect(page.locator('#commands')).toHaveText('Geen opdrachten.');
  await page.getByRole('combobox',{name:'Databron',exact:true}).selectOption('demo');
  await expect.poll(()=>page.evaluate(()=>window.testClosedSockets)).toBeGreaterThan(0);
});
