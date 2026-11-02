'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let research;
let selectedRace = 7;
let installEvent = null;
const marksKey = 'formline_public_melbourne_cup_2026_marks_v1';
let marks = (() => { try { const value=JSON.parse(localStorage.getItem(marksKey)||'{}'); return value&&typeof value==='object'?value:{}; } catch { return {}; } })();
const privateMarksKey = 'formline_public_cup_day_field_marks_v1';
const sessionCodeKey = 'formline_access_code_session';
let privateMarks = (() => { try { const value=JSON.parse(localStorage.getItem(privateMarksKey)||'{}'); return value&&typeof value==='object'?value:{}; } catch { return {}; } })();
let privateCode = (() => { try { return sessionStorage.getItem(sessionCodeKey)||''; } catch { return ''; } })();
let privateCupCard = null;
let privateCupStatus = 'Fields not loaded. No data request is made until you press Load.';
let privateCupError = false;

function sourceLinks(ids) {
  return [...new Set(ids||[])].map(id => {
    const item=research?.sources?.[id];
    if(!item || !/^https:\/\/(?:www\.)?(?:vrc\.com\.au|racing\.com|racingandsports\.com\.au|bom\.gov\.au|tab\.co\.nz)\//.test(item.url))return '';
    return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)} ↗</a>`;
  }).filter(Boolean).join('');
}
function markControls(profile) {
  const current=marks[profile.number]||{},tags=Array.isArray(current.tags)?current.tags:[];
  return `<div class="mark-controls"><button type="button" class="mark-star ${current.favorite?'active':''}" data-favorite="${profile.number}" aria-pressed="${!!current.favorite}" aria-label="${current.favorite?'Remove':'Add'} ${esc(profile.horse)} ${current.favorite?'from':'to'} favourites">${current.favorite?'★':'☆'} Favourite</button>${[['win','Win'],['top2','Top 2'],['top3','Top 3'],['top4','Top 4']].map(([tag,label])=>`<button type="button" class="mark-tag ${tags.includes(tag)?'active':''}" data-mark="${profile.number}" data-tag="${tag}" aria-pressed="${tags.includes(tag)}" aria-label="Mark ${esc(profile.horse)} ${label}">${label}</button>`).join('')}</div>`;
}
function fieldMark(raceNumber,runnerNumber){return raceNumber===7?(marks[runnerNumber]||{}):(privateMarks[`${raceNumber}:${runnerNumber}`]||{});}
function privateFieldMarkControls(raceNumber,runner){
  const current=fieldMark(raceNumber,runner.number),tags=Array.isArray(current.tags)?current.tags:[];
  return `<div class="mark-controls private-mark-controls"><button type="button" class="mark-star ${current.favorite?'active':''}" data-field-favorite="${raceNumber}:${runner.number}" aria-pressed="${!!current.favorite}" aria-label="${current.favorite?'Remove':'Add'} ${esc(runner.name)} ${current.favorite?'from':'to'} favourites">${current.favorite?'★':'☆'} Favourite</button>${[['win','Win'],['top2','Top 2'],['top3','Top 3'],['top4','Top 4']].map(([tag,label])=>`<button type="button" class="mark-tag ${tags.includes(tag)?'active':''}" data-field-mark="${raceNumber}:${runner.number}" data-field-tag="${tag}" aria-pressed="${tags.includes(tag)}" aria-label="Mark ${esc(runner.name)} ${label}">${label}</button>`).join('')}</div>`;
}
function privateFieldRows(raceNumber){
  const field=privateCupCard?.races?.[raceNumber];
  if(!privateCupCard)return '<p class="private-field-empty">Enter your private code and load the Cup Day card to see the full field for this race.</p>';
  if(!field?.length)return '<p class="private-field-empty">No runners were returned for this race. The meeting card may be unpublished or incomplete. Check the official field.</p>';
  return `<div class="private-field-list">${field.map(runner=>`<article class="private-runner ${runner.scratched?'is-scratched':''}" data-private-runner="${raceNumber}:${runner.number}"><div class="private-runner-info"><span class="runner-no">${esc(runner.number)}</span><div><strong>${esc(runner.name)}${runner.scratched?' · SCRATCHED':''}</strong><small>Gate ${esc(runner.barrier??'—')} · ${esc(runner.weight??'—')}kg · ${esc(runner.jockey||'Rider pending')}</small><small>${esc(runner.trainer||'Trainer pending')} · Last 10 ${esc(runner.form||'—')}</small></div></div>${runner.scratched?'':privateFieldMarkControls(raceNumber,runner)}</article>`).join('')}</div>`;
}
function privateFieldsSection(race){
  const count=privateCupCard?.races?.[race.number]?.length;
  const track=privateCupCard?.track;
  const checked=privateCupCard?.fetchedAt?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(privateCupCard.fetchedAt)):'';
  return `<section class="private-fields" aria-labelledby="private-fields-title"><div class="private-fields-heading"><div><p class="eyebrow">OWNER-ONLY CUP DAY CARD</p><h3 id="private-fields-title">R${race.number} full field${count!=null?` · ${count} runners`:''}</h3><p>Private personal-use data. Saved favourites and finish tags stay in this browser. Verify scratchings, ground and rider changes on race day; no odds are shown here.</p></div><a href="https://www.vrc.com.au/race-days-and-events/2026-2027/lexus-melbourne-cup-day/" target="_blank" rel="noopener noreferrer">Official meeting ↗</a></div><div class="private-field-controls"><label for="cupAccessCode">FormLine access code</label><input id="cupAccessCode" type="password" autocomplete="off" placeholder="Private code"><button id="loadCupCard" type="button">↻ Load 3 Nov fields</button></div><p id="cupCardStatus" class="private-card-status ${privateCupError?'error':''}" role="status">${esc(privateCupStatus)}${track?` Reported ground ${esc(track)}${checked?` · checked ${esc(checked)}`:''}.`:''}</p>${privateFieldRows(race.number)}<p class="private-card-license">The PuntersEdge Free plan permits personal use only. Keep the access code and provider data private. <a href="https://puntersedge.online/terms" target="_blank" rel="noopener noreferrer">Data terms ↗</a></p></section>`;
}
async function loadPrivateCupCard(){
  const button=$('#loadCupCard'),input=$('#cupAccessCode');
  const code=(input?.value||privateCode).trim();
  if(!code){privateCupError=true;privateCupStatus='Enter your FormLine access code first.';$('#cupCardStatus').textContent=privateCupStatus;$('#cupCardStatus').classList.add('error');return;}
  privateCode=code;
  try{sessionStorage.setItem(sessionCodeKey,code);}catch{}
  button.disabled=true;button.textContent='Loading…';
  $('#cupCardStatus').textContent='Checking the protected Cup Day card…';$('#cupCardStatus').classList.remove('error');
  try{
    const url=new URL('api/puntersedge',location.href);url.searchParams.set('action','board');url.searchParams.set('date','2026-11-03');
    const response=await fetch(url,{headers:{'X-FormLine-Access-Code':code,Accept:'application/json'},cache:'no-store'});
    let payload;try{payload=await response.json();}catch{throw Error('The private feed returned an unreadable response.');}
    if(!response.ok)throw Error(payload.error||'The private Cup Day card could not be loaded.');
    const meeting=(payload.acceptances?.meetings||[]).find(item=>/\bflemington\b/i.test(String(item.venue||'')));
    const priced=(payload.races||[]).filter(item=>/\bflemington\b/i.test(String(item.venue||'')));
    if(!meeting&&!priced.length)throw Error(payload.acceptance_error||'Flemington fields are not available in this feed yet. Check the official meeting card.');
    const raceMap={};
    for(let number=1;number<=10;number++){
      const accepted=meeting?.races?.find(item=>Number(item.race_number)===number);
      const pricedRace=priced.find(item=>Number(item.race_number)===number);
      const rows=Array.isArray(accepted?.runners)&&accepted.runners.length?accepted.runners:pricedRace?.runners||[];
      const scratches=new Set((pricedRace?.scratchings||[]).map(item=>Number(item.number)));
      raceMap[number]=rows.filter(item=>item&&Number.isInteger(Number(item.number))&&Number(item.number)>0&&Number(item.number)<100&&!item.emergency).map(item=>({number:Number(item.number),name:String(item.name||item.runner_name||'Unknown').slice(0,100),barrier:item.barrier??null,weight:item.weight??item.weight_kg??null,jockey:String(item.jockey||'').slice(0,100),trainer:String(item.trainer||'').slice(0,100),form:String(item.form||item.last10||'').slice(0,80),scratched:Boolean(item.scratched||scratches.has(Number(item.number)))}));
    }
    privateCupCard={races:raceMap,track:meeting?.track?.track_condition||'',fetchedAt:payload.fetched_at||new Date().toISOString()};
    privateCupError=false;privateCupStatus=`Private field checked · ${Object.values(raceMap).filter(rows=>rows.length).length} races available.`;
  }catch(error){privateCupError=true;privateCupStatus=error.message||'The protected card is unavailable.';}
  renderRacePanel(research.races.find(item=>item.number===selectedRace)||research.races[6]);
}
function cupProfiles() {
  return `<section class="dossiers"><div class="dossier-heading"><p class="eyebrow">THE 24-RUNNER DOSSIER</p><h3>Every Cup entrant, one question at a time</h3><p>Tap a runner to see the form case and its main weakness. Favourite and position tags save in this browser. Rider, scratches and odds can change.</p></div><div class="dossier-grid">${research.cup_profiles.map(p=>`<details class="dossier" ${p.number===20?'open':''}><summary><span class="runner-no">${p.number}</span><span><strong>${esc(p.horse)}</strong><small>Gate ${esc(p.barrier)} · ${esc(p.weight_kg)}kg · ${esc(p.jockey||'Rider pending')}</small></span><span aria-hidden="true" class="dossier-chevron">⌄</span></summary><div class="dossier-body"><p>${esc(p.case)}</p><p class="dossier-risk"><strong>Check:</strong> ${esc(p.watch)}</p><p class="dossier-meta">${esc(p.trainer)} · Last 10 ${esc(p.last10)}</p>${markControls(p)}<div class="source-links">${sourceLinks(p.sources)}</div></div></details>`).join('')}</div></section>`;
}
function renderRacePanel(race) {
  $('#race-panel').setAttribute('aria-labelledby',`race-tab-${race.number}`);
  $('#race-panel').innerHTML=`<div class="race-heading"><p class="eyebrow">RACE ${race.number} · ${esc(race.time)} AEDT</p><h2>${esc(race.name)}</h2><div class="fact-list"><span>${esc(race.distance_m)}m</span><span>${esc(race.grade||'Open')}</span><span>${race.active_runners} runners in the dated snapshot</span></div></div>
  <div class="lean"><p class="eyebrow">THE RESEARCH QUESTION</p><h3>${esc(race.question)}</h3><p><strong>Ground scenario:</strong> ${esc(race.ground)}</p></div>
  <section class="watchlist"><div class="dossier-heading"><p class="eyebrow">FORM WATCHLIST</p><h3>Three to examine</h3><p>These cases are provisional. They are not price-based recommendations.</p></div><div class="watch-grid">${race.watchlist.map((p,i)=>`<article class="watch-card"><span>${String(i+1).padStart(2,'0')}</span><h4>#${esc(p.number)} ${esc(p.horse)}</h4><p>${esc(p.case)}</p><p class="watch-risk"><strong>Question:</strong> ${esc(p.risk)}</p><div class="source-links">${sourceLinks(p.sources)}</div></article>`).join('')}</div></section>
  ${privateFieldsSection(race)}
  ${race.number===7?cupProfiles():''}
  <div class="before-jump"><div><p class="eyebrow">BEFORE THE JUMP</p><h3>Recheck the race-day facts</h3><p>Confirm final scratchings, rider, published track rating and the actual accepted quote. A form case does not establish a positive expected return.</p></div><div><p class="eyebrow">PUBLIC SOURCES</p><div class="source-links">${sourceLinks(race.sources)}</div></div></div>`;
  $('#cupAccessCode').value=privateCode;
}
function renderNews() {
  $('#news-list').innerHTML=research.news.map(item=>`<article class="news-card"><div class="news-meta"><span>${esc(item.kind)}</span><time datetime="${esc(item.date)}">${esc(item.date)}</time></div><h3>${esc(item.headline)}</h3><p>${esc(item.detail)}</p><p class="news-impact"><strong>Why it matters:</strong> ${esc(item.impact)}</p><div class="news-horses">${item.horses.map(h=>`<span>${esc(h)}</span>`).join('')}</div><div class="source-links">${sourceLinks(item.sources)}</div></article>`).join('');
}
function render() {
  const race=research.races.find(item=>item.number===selectedRace)||research.races[6];
  $('#snapshot-date').textContent=`Prepared ${research.prepared_at}`;
  $('#track-snapshot').textContent=research.track_snapshot;
  $('#track-time').textContent='Forecast is not a race-day track rating.';
  $('#method-copy').innerHTML=`<p>${esc(research.method_note)}</p><p>${esc(research.status)}</p>`;
  $('#race-tabs').innerHTML=research.races.map(item=>`<button type="button" role="tab" id="race-tab-${item.number}" aria-controls="race-panel" aria-selected="${item.number===race.number}" tabindex="${item.number===race.number?'0':'-1'}" class="race-tab ${item.number===race.number?'active':''}" data-race="${item.number}"><strong>R${item.number}</strong><span>${esc(item.time)}</span><small>${esc(item.name)}</small></button>`).join('');
  $('#race-index-list').innerHTML=research.races.map(item=>`<button type="button" class="index-row ${item.number===race.number?'active':''}" data-race="${item.number}" ${item.number===race.number?'aria-current="true"':''}><span>R${item.number}</span><span><strong>${esc(item.watchlist[0].horse)}</strong><small>${esc(item.name)}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  renderRacePanel(race);renderNews();
}
function selectRace(number,focus=true) {
  const parsed=Number(number);if(!research?.races.some(item=>item.number===parsed))return;
  selectedRace=parsed;render();
  if(focus){$(`#race-tab-${parsed}`)?.focus();$('#race-panel').scrollIntoView({behavior:'smooth',block:'start'});}
}
function setMenu(open,focusBack=false){const mobile=matchMedia('(max-width:700px)').matches,active=!!open&&mobile;document.body.classList.toggle('menu-open',active);$('#menuToggle').setAttribute('aria-expanded',String(active));$('#menuToggle').setAttribute('aria-label',active?'Close navigation':'Open navigation');$('#appSidebar').inert=mobile&&!active;if(active){$('#appSidebar').setAttribute('role','dialog');$('#appSidebar').setAttribute('aria-modal','true');$('#appSidebar nav a')?.focus();}else{$('#appSidebar').removeAttribute('role');$('#appSidebar').removeAttribute('aria-modal');if(focusBack)$('#menuToggle').focus();}}
$('#menuToggle').addEventListener('click',()=>setMenu(!document.body.classList.contains('menu-open'),true));
$('#menuScrim').addEventListener('click',()=>setMenu(false,true));
$('#appSidebar nav').addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false);});
matchMedia('(max-width:700px)').addEventListener('change',()=>setMenu(false));setMenu(false);
document.addEventListener('click',event=>{
  if(event.target.closest('#loadCupCard')){loadPrivateCupCard();return;}
  const fieldFavourite=event.target.closest('[data-field-favorite]'),fieldTag=event.target.closest('[data-field-mark][data-field-tag]');
  if(fieldFavourite||fieldTag){
    const target=fieldFavourite||fieldTag,match=String(fieldFavourite?.dataset.fieldFavorite||fieldTag.dataset.fieldMark).match(/^(\d{1,2}):(\d{1,2})$/);
    if(!match)return;
    const raceNumber=Number(match[1]),runnerNumber=Number(match[2]),runner=privateCupCard?.races?.[raceNumber]?.find(item=>item.number===runnerNumber);
    if(!runner)return;
    const current={favorite:Boolean(fieldMark(raceNumber,runnerNumber).favorite),tags:[...(fieldMark(raceNumber,runnerNumber).tags||[])]};
    if(fieldFavourite)current.favorite=!current.favorite;
    else{const tag=fieldTag.dataset.fieldTag;if(!['win','top2','top3','top4'].includes(tag))return;current.tags=current.tags.includes(tag)?current.tags.filter(item=>item!==tag):[...current.tags,tag];}
    if(raceNumber===7){marks[runnerNumber]=current;try{localStorage.setItem(marksKey,JSON.stringify(marks));}catch{}}
    else{privateMarks[`${raceNumber}:${runnerNumber}`]=current;try{localStorage.setItem(privateMarksKey,JSON.stringify(privateMarks));}catch{}}
    const holder=target.closest('.private-mark-controls');
    if(holder){holder.outerHTML=privateFieldMarkControls(raceNumber,runner);const row=document.querySelector(`[data-private-runner="${raceNumber}:${runnerNumber}"]`);row?.querySelector(fieldFavourite?'[data-field-favorite]':`[data-field-tag="${fieldTag.dataset.fieldTag}"]`)?.focus();}
    if(raceNumber===7){const profile=research?.cup_profiles.find(item=>item.number===runnerNumber);const dossier=[...document.querySelectorAll('.dossier')].find(item=>Number(item.querySelector('.runner-no')?.textContent)===runnerNumber);if(profile&&dossier){const controls=dossier.querySelector('.mark-controls');if(controls)controls.outerHTML=markControls(profile);}}
    return;
  }
  const favourite=event.target.closest('[data-favorite]'),tag=event.target.closest('[data-mark][data-tag]');
  if(favourite||tag){
    const number=Number(favourite?.dataset.favorite||tag.dataset.mark),current=marks[number]||{favorite:false,tags:[]};
    if(favourite)current.favorite=!current.favorite;
    else{const value=tag.dataset.tag;current.tags=Array.isArray(current.tags)?current.tags:[];current.tags=current.tags.includes(value)?current.tags.filter(x=>x!==value):[...current.tags,value];}
    marks[number]=current;try{localStorage.setItem(marksKey,JSON.stringify(marks));}catch{}
    const p=research.cup_profiles.find(x=>x.number===number),parent=(favourite||tag).closest('.mark-controls');if(parent&&p)parent.outerHTML=markControls(p);
    const runner=privateCupCard?.races?.[7]?.find(item=>item.number===number),row=document.querySelector(`[data-private-runner="7:${number}"]`);
    if(runner&&row){const controls=row.querySelector('.private-mark-controls');if(controls)controls.outerHTML=privateFieldMarkControls(7,runner);}
    return;
  }
  const button=event.target.closest('[data-race]');if(button)selectRace(button.dataset.race);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('menu-open')){setMenu(false,true);return;}
  if(event.key==='Tab'&&document.body.classList.contains('menu-open')){const links=[...document.querySelectorAll('#appSidebar a[href]')],first=links[0],last=links[links.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;}
  const current=event.target.closest('#race-tabs [role="tab"]');if(!current||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const index=Number(current.dataset.race)-1,next=event.key==='Home'?1:event.key==='End'?10:((index+(event.key==='ArrowRight'?1:-1)+10)%10)+1;
  event.preventDefault();selectRace(next,false);$(`#race-tab-${next}`)?.focus();
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;$('#installBtn').hidden=false;});
$('#installBtn').addEventListener('click',async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$('#installBtn').hidden=true;});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
fetch('melbourne-cup-2026.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Cup research file unavailable');return response.json();}).then(data=>{if(data.races?.length!==10||data.cup_profiles?.length!==24)throw Error('Cup research file is incomplete');research=data;render();}).catch(error=>{$('#race-panel').innerHTML=`<div class="loading">${esc(error.message)}. Reload the page to try again.</div>`;$('#news-list').innerHTML='';});
