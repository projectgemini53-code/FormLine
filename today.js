'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state = {date:'',meeting:'',race:'',publicMeetings:[],savedMeetings:[],editorial:null,qldCards:new Set(),qldDetails:new Map(),runnerCache:new Map(),loadingRace:'',raceError:'',requestId:0};
try { sessionStorage.removeItem('formline_access_code_session'); } catch { /* Storage may be disabled. */ }
function dateKey(value){const parts=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);const get=type=>parts.find(part=>part.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}
function dayAt(offset){return dateKey(new Date(Date.now()+offset*86400000));}
function dateLabel(key,options={}){return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:options.weekday||'short',day:'numeric',month:'short'}).format(new Date(`${key}T12:00:00+11:00`));}
function timeLabel(value){if(!value||!Number.isFinite(Date.parse(value)))return 'Time TBC';return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(value));}
function safeUrl(value){try{const url=new URL(String(value));return url.protocol==='https:'&&/(^|\.)(racingnsw\.com\.au|racing\.com|racingqueensland\.com\.au|racingaustralia\.horse|vrc\.com\.au|racehub\.com\.au|racingandsports\.com\.au|theoverlay\.com\.au|online\.flippingbook\.com|tabtouch\.com\.au|hkjc\.com)$/.test(url.hostname)?url.href:'';}catch{return '';}}
function officialLink(url,label='Official card ↗'){const safe=safeUrl(url);return safe?`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';}
function meetingId(row){return `${row.date}|${String(row.venue||'').trim().toLowerCase()}`;}
function raceId(row,meeting){return `${meetingId(meeting)}|${Number(row.number)}`;}
function inRange(date){return date>=dayAt(0)&&date<=dayAt(6);}
function normalisePublic(meetings){return(Array.isArray(meetings)?meetings:[]).filter(row=>row?.date&&row?.venue&&inRange(row.date)).map(row=>({...row,source_url:safeUrl(row.source_url),races:(Array.isArray(row.races)?row.races:[]).filter(r=>Number.isInteger(Number(r?.number))&&Number(r.number)>0).map(r=>({...r,number:Number(r.number),source_url:safeUrl(r.source_url||row.source_url),preview_url:safeUrl(r.preview_url),start_time:r.start_time||''}))}));}
function savedMeetings(){try{const store=JSON.parse(localStorage.getItem('formline_research_workspace_v1')||'null');if(!Array.isArray(store?.races))return[];const map=new Map();for(const race of store.races){if(!Number.isFinite(Date.parse(race.startTime||'')))continue;const date=dateKey(new Date(race.startTime));if(!inRange(date)||!race.venue||!Number.isInteger(Number(race.raceNumber)))continue;const key=`${date}|${String(race.venue).toLowerCase()}`;if(!map.has(key))map.set(key,{date,venue:race.venue,state:'',feature:'Saved research',source_url:safeUrl(race.sourceUrl),source:'saved',races:[]});map.get(key).races.push({number:Number(race.raceNumber),name:race.raceName,start_time:race.startTime,distance_m:race.distance,source_url:safeUrl(race.sourceUrl),savedRace:race});}return[...map.values()];}catch{return[];}}
function mergedMeetings(date=state.date){const map=new Map();for(const row of [...state.publicMeetings,...state.savedMeetings]){if(row.date!==date)continue;const id=meetingId(row),old=map.get(id);if(!old){map.set(id,{...row,races:row.races.slice()});continue;}const races=new Map(old.races.map(r=>[Number(r.number),r]));for(const race of row.races){const previous=races.get(Number(race.number));races.set(Number(race.number),{...previous,...race,race_id:race.race_id||previous?.race_id||'',source_url:race.source_url||previous?.source_url||'',preview_url:race.preview_url||previous?.preview_url||'',start_time:race.start_time||previous?.start_time||''});}map.set(id,{...old,...row,state:row.state||old.state,feature:row.feature==='Saved research'&&old.feature?old.feature:row.feature||old.feature,meeting_id:old.meeting_id||row.meeting_id,source_url:row.source_url||old.source_url,races:[...races.values()].sort((a,b)=>a.number-b.number)});}return[...map.values()].sort((a,b)=>a.venue.localeCompare(b.venue));}
function selectedMeeting(){return mergedMeetings().find(row=>meetingId(row)===state.meeting);}
function selectedRace(){const meeting=selectedMeeting();return meeting?.races.find(row=>raceId(row,meeting)===state.race);}
function renderDates(){$('#dateTabs').innerHTML=Array.from({length:7},(_,i)=>{const date=dayAt(i),count=mergedMeetings(date).length;return `<button type="button" data-date="${date}" aria-pressed="${date===state.date}"><strong>${i===0?'Today':i===1?'Tomorrow':esc(dateLabel(date).split(',')[0])}</strong><small>${esc(dateLabel(date).replace(/^\w+,?\s*/,''))} · ${count} meeting${count===1?'':'s'}</small></button>`;}).join('');}
function renderMeetings(){const meetings=mergedMeetings();$('#meetingCount').textContent=String(meetings.length);$('#meetingList').innerHTML=meetings.length?meetings.map(row=>`<button type="button" class="meeting-choice" data-meeting-id="${esc(meetingId(row))}" aria-pressed="${meetingId(row)===state.meeting}"><span><strong>${esc(row.venue)}</strong><small>${esc(row.state||'Saved')} · ${row.meeting_id?'Live QLD feed':row.source==='saved'?'Your saved card':'Dated schedule'} · ${row.races.length?`${row.races.length} race${row.races.length===1?'':'s'}`:row.race_count?`${row.race_count} scheduled`:'Program pending'}</small></span><span aria-hidden="true">↗</span></button>`).join(''):'<div class="empty-state"><strong>No meetings listed for this day</strong><p>Queensland open data and the dated NSW/Victorian schedule may not yet have a card. Check the official racing calendars.</p></div>';$('#scheduleSource').innerHTML=`Queensland meetings and runners update from ${officialLink('https://www.racingqueensland.com.au/about/reports-and-data/open-data','RQ Open Data ↗')}. NSW/Victorian entries are a dated schedule and may change. ${officialLink('https://www.racingnsw.com.au/race-time-information/','NSW times ↗')} ${officialLink('https://www.racing.com/group-races-calendar','VIC calendar ↗')}`;}
function renderRaces(){const meeting=selectedMeeting();$('#selectedMeetingDate').textContent=meeting?dateLabel(meeting.date,{weekday:'long'}).toUpperCase():'CHOOSE A MEETING';$('#selectedMeetingTitle').textContent=meeting?meeting.venue+(meeting.feature?` · ${meeting.feature}`:''):'Race card';const source=safeUrl(meeting?.state==='QLD'?'https://www.racingqueensland.com.au/racing/full-calendar':meeting?.source_url);$('#meetingSourceLink').hidden=!source;if(source)$('#meetingSourceLink').href=source;$('#raceList').innerHTML=!meeting?'<p class="loading">Select a meeting to see its races.</p>':meeting.races.length?meeting.races.map(r=>{const started=r.start_time&&Date.parse(r.start_time)<=Date.now(),detail=meeting.meeting_id?'Open public runner list':editorialNoteFor(r,meeting)?'Research notes · two selections':r.savedRace?'Open saved research':r.preview_url?'Dated card · preview linked':'Dated race schedule';return `<button type="button" class="today-race ${started?'started':''}" data-race-id="${esc(raceId(r,meeting))}" aria-pressed="${state.race===raceId(r,meeting)}"><span>R${r.number}</span><span><strong>${esc(r.name||`Race ${r.number}`)}</strong><small>${r.distance_m?`${esc(r.distance_m)}m · `:''}${esc(detail)}</small></span><span>${esc(timeLabel(r.start_time))}</span></button>`;}).join(''):`<div class="empty-state"><strong>Race program pending</strong><p>${meeting.meeting_id?'This Queensland meeting is listed, but its races are not available through open data yet.':'Open the official meeting to check the latest program.'}</p></div>`;if(meeting?.meeting_id&&!state.qldCards.has(meetingId(meeting)))$('#raceList').insertAdjacentHTML('beforeend','<button type="button" id="loadQldCard" class="today-race"><span>↻</span><span><strong>Load Queensland race program</strong><small>Official public open data</small></span><span>Open</span></button>');}
function renderBoard(){renderDates();renderMeetings();renderRaces();}
function infoPanel(race,meeting,body){const started=race.start_time&&Date.parse(race.start_time)<=Date.now(),source=meeting.meeting_id?'https://www.racingqueensland.com.au/racing/full-calendar':race.source_url||meeting.source_url,details=state.qldDetails.get(meetingId(meeting));return `<div class="analysis-top"><div><p class="eyebrow">${esc(meeting.venue)} · R${race.number} · ${esc(dateLabel(meeting.date))}</p><h3>${esc(race.name||`Race ${race.number}`)}</h3><p>${esc(timeLabel(race.start_time))} AEDT · ${started?'Scheduled jump has passed':'Upcoming'}</p></div>${officialLink(source)}</div><div class="analysis-facts">${race.distance_m?`<span>${esc(race.distance_m)}m</span>`:''}${race.race_class?`<span>${esc(race.race_class)}</span>`:''}${race.track_rating||details?.track_rating?`<span>Track ${esc(race.track_rating||details.track_rating)}</span>`:''}${details?.rail_position?`<span>Rail ${esc(details.rail_position)}</span>`:''}<span>${esc(meeting.state||'Saved')}</span></div>${body}`;}
function researchLens(race){const distance=Number(race.distance_m);if(Number.isFinite(distance)&&distance<=1200)return 'For a shorter race, inspect early pace, the actual barrier draw, rail position and whether a runner can find cover.';if(Number.isFinite(distance)&&distance>=2000)return 'For a staying race, inspect recent runs over a similar distance, carried weight, fitness and track suitability.';return 'Compare recent runs near this distance and class, likely early position and the current track rating.';}
function fieldHtml(runners,asOf,label){if(!Array.isArray(runners)||!runners.length)return '<p class="analysis-state warning">No horses are currently listed for this race. Acceptances may still be pending.</p>';return `<div class="field-heading"><div><p class="eyebrow">${esc(label)}</p><h4>${runners.length} horses listed</h4></div>${asOf?`<span>Checked ${esc(timeLabel(asOf))} AEDT</span>`:''}</div><div class="public-runner-list">${runners.map(runner=>`<article class="public-runner"><div class="runner-number">${runner.number?`#${esc(runner.number)}`:'—'}</div><div><h5>${esc(runner.name||runner.runner_name)}</h5><p>${runner.jockey?`Jockey: ${esc(runner.jockey)}`:'Jockey TBC'}${runner.trainer?` · Trainer: ${esc(runner.trainer)}`:''}</p></div><strong>${runner.weight_kg||runner.weight?`${esc(runner.weight_kg||runner.weight)}kg`:'Weight TBC'}</strong></article>`).join('')}</div>`;}
function renderAnalysis(){
  const race=selectedRace(),meeting=selectedMeeting();
  if(!race||!meeting){
    $('#analysisPanel').innerHTML='<div class="empty-state"><strong>Choose a race above</strong><p>Open a Queensland race to see its current public runner list. NSW and Victorian entries show dated schedule facts.</p></div>';
    return;
  }
  if(state.loadingRace===state.race){
    $('#analysisPanel').innerHTML=infoPanel(race,meeting,'<p class="analysis-state">Loading the public Queensland field…</p>');
    return;
  }
  const cached=race.race_id?state.runnerCache.get(String(race.race_id)):null;
  const field=meeting.meeting_id
    ? cached?fieldHtml(cached.runners,cached.as_of,'PUBLIC QUEENSLAND FIELD'):'<p class="analysis-state">Choose Refresh public field to load the current runner list.</p>'
    :race.savedRace?fieldHtml(race.savedRace.runners,null,'SAVED IN THIS BROWSER'):'';
  const editorial=renderEditorial(race,meeting);
  const coverage=meeting.meeting_id
    ?'Racing Queensland open data provides horses, weights, jockeys and trainers. The endpoints connected here do not include barriers, historical form, live odds or final placings.'
    :race.savedRace?'This card is saved only in this browser. Review it against the official field before making any decision.'
    :editorial?'This NSW/Victorian card includes a dated, source-linked editorial assessment. A public live runner and odds feed is not connected.'
    :'This is a dated NSW/Victorian schedule entry. A public, reusable live runner feed for this state is not connected.';
  const pending='<div class="prediction-card model-pending"><p class="eyebrow">MODEL DECISION PENDING</p><h4>Research checklist</h4><p>'+esc(researchLens(race))+'</p><p>FormLine is not generating picks or two-horse placement combinations from a partial field. Those need a selected, tested probability model and licensed point-in-time form and odds data.</p></div>';
  const sydneyLink=meeting.state==='NSW'&&/randwick|rosehill|canterbury|warwick farm/i.test(meeting.venue)?`<p class="analysis-foot"><a href="#sydney" data-pe-date="${esc(meeting.date)}">Open this date in personal Sydney research ↗</a></p>`:'';
  const error=state.raceError?`<p class="analysis-state warning">${esc(state.raceError)}</p>`:'';
  const preview=race.preview_url?`<p class="analysis-foot">${officialLink(race.preview_url,'External race preview ↗')}</p>`:'';
  $('#analysisPanel').innerHTML=infoPanel(race,meeting,`${error}<p class="analysis-state">${esc(coverage)}</p>${field}${editorial||pending}${meeting.meeting_id?'<div class="analysis-actions"><button type="button" class="secondary" id="refreshRace">Refresh public field</button></div>':''}${sydneyLink}${preview}<p class="analysis-foot">Verify scratchings, current ground, rider changes and results at the official source. No bets are placed here.</p>`);
}
async function loadQueenslandCard(meeting,autoOpen=false){if(!meeting?.meeting_id||state.qldCards.has(meetingId(meeting)))return;const url=new URL('/api/schedule',location.href);url.searchParams.set('action','card');url.searchParams.set('meeting_id',String(meeting.meeting_id));url.searchParams.set('date',meeting.date);const response=await fetch(url,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||`Queensland race program returned HTTP ${response.status}.`);const original=state.publicMeetings.find(row=>meetingId(row)===meetingId(meeting)&&row.meeting_id);if(!original)return;original.races=normalisePublic([{...original,races:data.races}])[0]?.races||[];state.qldDetails.set(meetingId(meeting),data);state.qldCards.add(meetingId(meeting));renderBoard();if(autoOpen&&state.meeting===meetingId(meeting)&&original.races.length&&!state.race)selectRace(raceId(original.races[0],original),false);}
async function loadQueenslandRunners(force=false){const meeting=selectedMeeting(),race=selectedRace();if(!meeting?.meeting_id||!race?.race_id)return;const id=String(race.race_id),requestId=++state.requestId;if(!force&&state.runnerCache.has(id)){renderAnalysis();return;}state.loadingRace=state.race;state.raceError='';renderAnalysis();try{const url=new URL('/api/schedule',location.href);url.searchParams.set('action','runners');url.searchParams.set('race_id',id);url.searchParams.set('meeting_id',String(meeting.meeting_id));url.searchParams.set('date',meeting.date);const response=await fetch(url,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||`Queensland runner feed returned HTTP ${response.status}.`);if(requestId!==state.requestId)return;state.runnerCache.set(id,data);}catch(error){if(requestId===state.requestId)state.raceError=error.message;}finally{if(requestId===state.requestId){state.loadingRace='';renderAnalysis();}}}
function selectDate(date){if(!inRange(date))return;state.requestId++;state.date=date;state.meeting='';state.race='';state.raceError='';const first=mergedMeetings().find(row=>row.meeting_id&&row.race_count)||mergedMeetings()[0];if(first)state.meeting=meetingId(first);renderBoard();renderAnalysis();if(first?.meeting_id)loadQueenslandCard(first,true).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});}
function selectMeeting(id){if(!mergedMeetings().some(row=>meetingId(row)===id))return;state.requestId++;state.meeting=id;state.race='';state.raceError='';renderBoard();renderAnalysis();const meeting=selectedMeeting();if(meeting?.meeting_id)loadQueenslandCard(meeting).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});}
function selectRace(id,scroll=true){const meeting=selectedMeeting();if(!meeting?.races.some(row=>raceId(row,meeting)===id))return;state.requestId++;state.race=id;state.raceError='';renderBoard();renderAnalysis();if(selectedRace()?.race_id&&meeting.meeting_id)loadQueenslandRunners();if(scroll)$('#analysis').scrollIntoView({behavior:'smooth',block:'start'});}
$('#menuToggle').addEventListener('click',()=>{const open=!document.body.classList.contains('menu-open');document.body.classList.toggle('menu-open',open);$('#menuToggle').setAttribute('aria-expanded',String(open));$('#appSidebar').inert=!open;});
$('#menuScrim').addEventListener('click',()=>{document.body.classList.remove('menu-open');$('#menuToggle').setAttribute('aria-expanded','false');$('#appSidebar').inert=true;});
$('#appSidebar nav').addEventListener('click',()=>{document.body.classList.remove('menu-open');$('#menuToggle').setAttribute('aria-expanded','false');$('#appSidebar').inert=true;});
$('#appSidebar').inert=matchMedia('(max-width:700px)').matches;matchMedia('(max-width:700px)').addEventListener('change',event=>{$('#appSidebar').inert=event.matches;document.body.classList.remove('menu-open');$('#menuToggle').setAttribute('aria-expanded','false');});
document.addEventListener('click',event=>{const date=event.target.closest('[data-date]');if(date){selectDate(date.dataset.date);return;}const meeting=event.target.closest('[data-meeting-id]');if(meeting){selectMeeting(meeting.dataset.meetingId);return;}const race=event.target.closest('[data-race-id]');if(race){selectRace(race.dataset.raceId);return;}if(event.target.id==='refreshRace'){loadQueenslandRunners(true);return;}if(event.target.id==='loadQldCard'){const row=selectedMeeting();if(row)loadQueenslandCard(row).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});}});
(async function init(){
  state.date=dayAt(0);
  state.savedMeetings=savedMeetings();
  $('#todayTag').textContent=dateLabel(state.date,{weekday:'long'}).toUpperCase();
  const results=await Promise.allSettled([
    fetch('data/upcoming-races-2026-11-05.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Dated schedule unavailable'))),
    fetch('/api/schedule?action=meetings',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Queensland feed unavailable'))),
    fetch('data/race-notes-2026-11-07.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Dated research unavailable')))
  ]);
  const fixture=results[0].status==='fulfilled'?results[0].value:null;
  const queensland=results[1].status==='fulfilled'?results[1].value:null;
  state.editorial=results[2].status==='fulfilled'?results[2].value:null;
  state.publicMeetings=normalisePublic([...(fixture?.meetings||[]),...(queensland?.meetings||[])]);
  const featured=state.date==='2026-11-07'&&state.editorial
    ?mergedMeetings().find(row=>/flemington|rosehill/i.test(row.venue)&&row.races.some(race=>editorialNoteFor(race,row)))
    :null;
  const first=featured||mergedMeetings().find(row=>row.meeting_id&&row.race_count)||mergedMeetings()[0];
  if(first){
    state.meeting=meetingId(first);
    if(featured){
      const firstRace=first.races.find(race=>Date.parse(race.start_time)>Date.now()&&editorialNoteFor(race,first))||first.races.find(race=>editorialNoteFor(race,first));
      if(firstRace)state.race=raceId(firstRace,first);
    }
  }
  $('#scheduleStatus').textContent=`${state.publicMeetings.length} meeting${state.publicMeetings.length===1?'':'s'} listed in the next seven days · ${queensland?'live Queensland feed':'Queensland feed unavailable'} · NSW/VIC dated schedule${state.editorial&&state.date==='2026-11-07'?' with 7 November research notes':''}.`;
  renderBoard();renderAnalysis();
  if(first?.meeting_id)loadQueenslandCard(first,true).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});
}()).catch(error=>{$('#scheduleStatus').textContent=error.message;renderBoard();});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

function editorialNoteFor(race, meeting) {
  if (meeting?.date !== '2026-11-07' || !state.editorial) return null;
  const venue = String(meeting.venue || '').trim().toLowerCase();
  const venueNotes = state.editorial.meetings?.[venue]
    || state.editorial.meetings?.[venue.replace(/ gardens$/, '')]
    || state.editorial[venue]
    || state.editorial[venue.replace(/ gardens$/, '')];
  const note = venueNotes?.[String(race.number)] || venueNotes?.[`R${race.number}`];
  return note?.primary?.horse && note?.alternative?.horse ? note : null;
}

function editorialAsOf(value) {
  if (!value) return 'Time not recorded';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return `${new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney', day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true}).format(new Date(parsed))} AEDT`;
}

function editorialPick(pick, kind) {
  const metrics = Array.isArray(pick.metrics) ? pick.metrics.filter(Boolean) : [];
  const reasons = Array.isArray(pick.reasons) ? pick.reasons.filter(Boolean) : [];
  const label = kind === 'primary' ? 'Win selection' : 'Other win / place candidate';
  return `<article class="editorial-pick editorial-pick-${kind}">
    <div class="editorial-pick-head"><span>${label}</span><strong>${esc(pick.bet || (kind === 'primary' ? 'Win' : 'Win or place'))}</strong></div>
    <h4>${esc(pick.horse)}</h4>
    ${metrics.length ? `<div class="editorial-metrics" aria-label="Key form figures">${metrics.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}
    ${reasons.length ? `<ul class="editorial-reasons">${reasons.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="editorial-missing">Detailed form reasons were not supplied for this selection.</p>'}
    ${pick.risk ? `<p class="editorial-risk"><strong>Watch:</strong> ${esc(pick.risk)}</p>` : ''}
  </article>`;
}

function renderEditorial(race, meeting) {
  const note = editorialNoteFor(race, meeting);
  if (!note) return '';
  const passed = race.start_time && Date.parse(race.start_time) <= Date.now();
  const facts = [note.track && `Track: ${note.track}`, note.rail && `Rail: ${note.rail}`].filter(Boolean);
  const news = (Array.isArray(note.public_news) ? note.public_news : []).filter(item => item?.text);
  const links = (Array.isArray(note.sources) ? note.sources : []).map(item => ({label:item?.label || 'Source', url:safeUrl(item?.url)})).filter(item => item.url);
  const weather=String(meeting.venue||'').toLowerCase()==='flemington'?state.editorial.meetings?.flemington?._weather:null;
  const weatherLinks=(Array.isArray(weather?.sources)?weather.sources:[]).map(item=>({label:item?.label||'Track source',url:safeUrl(item?.url)})).filter(item=>item.url);
  const weatherHtml=weather
    ?'<div class="editorial-weather"><div class="editorial-weather-head"><strong>Flemington rain scenario</strong><span>'+esc(weather.as_of||'Race-day snapshot')+'</span></div><p>'+esc(weather.status)+'</p><p>'+esc(note.weather_scenario||weather.if_soft)+'</p>'+(weatherLinks.length?'<div class="editorial-weather-links">'+weatherLinks.map(item=>'<a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.label)+' ↗</a>').join('')+'</div>':'')+'</div>'
    :'';
  return `<section class="editorial-research" aria-label="Dated race research">
    <div class="editorial-intro"><div><p class="eyebrow">7 NOVEMBER RESEARCH NOTES</p><h4>Two runners to examine</h4><p>Editorial assessment from public form and reports. These are not calibrated model probabilities or private insider information.</p>${state.editorial.method ? `<p class="editorial-method">${esc(state.editorial.method)}</p>` : ''}</div><span class="editorial-time">Checked ${esc(editorialAsOf(note.as_of || state.editorial.as_of))}</span></div>
    ${facts.length ? `<div class="editorial-conditions">${facts.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}
    <p class="analysis-state ${passed ? 'warning' : ''}">${passed ? 'The scheduled jump has passed. These dated editorial notes are not a verified pre-race prediction or confirmed results; check the official outcome.' : 'Pre-race view. Recheck scratchings, ground, rider changes and the available price before using this research.'}</p>
    ${weatherHtml}
    <div class="editorial-picks">${editorialPick(note.primary, 'primary')}${editorialPick(note.alternative, 'alternative')}</div>
    ${news.length ? `<div class="editorial-news"><h5>Public reports and stable comments</h5><ul>${news.map(item => { const url = safeUrl(item.url); return `<li>${esc(item.text)}${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Read source ↗</a>` : ''}</li>`; }).join('')}</ul></div>` : ''}
    ${links.length ? `<div class="editorial-sources"><strong>Research sources</strong><div>${links.map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label)} ↗</a>`).join('')}</div></div>` : ''}
  </section>`;
}
