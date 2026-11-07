'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state = {date:'',meeting:'',race:'',publicMeetings:[],savedMeetings:[],editorial:null,publicFields:null,fieldOpen:false,fieldQuery:'',fieldSort:'number',fieldGateRange:'all',qldCards:new Set(),qldDetails:new Map(),runnerCache:new Map(),loadingRace:'',raceError:'',requestId:0};
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
function meetingChoice(row, featured=false){
  const count=row.races.length?`${row.races.length} race${row.races.length===1?'':'s'}`:row.race_count?`${row.race_count} scheduled`:'Program pending';
  const detail=`${esc(row.state||'Saved')} · ${esc(count)}`;
  const source=row.meeting_id?'Live QLD feed':row.source==='saved'?'Your saved card':'Dated schedule';
  return `<button type="button" class="meeting-choice${featured?' featured-choice':''}" data-meeting-id="${esc(meetingId(row))}" aria-pressed="${meetingId(row)===state.meeting}"><span>${featured?'<span class="featured-kicker">FEATURED MEETING</span>':''}<strong>${esc(row.venue)}</strong><small>${detail} · ${featured&&row.date==='2026-11-07'?'Race research':esc(source)}</small></span><span aria-hidden="true">↗</span></button>`;
}
function renderMeetings(){
  const meetings=mergedMeetings();
  const featured=meetings.filter(row=>/^(flemington|rosehill(?: gardens)?)$/i.test(String(row.venue).trim()))
    .sort((a,b)=>Number(/rosehill/i.test(a.venue))-Number(/rosehill/i.test(b.venue)));
  const others=meetings.filter(row=>!featured.includes(row));
  const featuredRoot=$('#featuredMeetings');
  featuredRoot.hidden=featured.length===0;
  featuredRoot.innerHTML=featured.length?`<p class="eyebrow">FEATURED MEETINGS</p><div class="featured-meeting-grid">${featured.map(row=>meetingChoice(row,true)).join('')}</div>`:'';
  $('#meetingTitle').textContent=featured.length?'Other meetings':'Meetings';
  $('#meetingCount').textContent=String(others.length);
  $('#meetingList').innerHTML=others.length?others.map(row=>meetingChoice(row)).join(''):featured.length
    ?'<p class="meeting-list-empty">No other meetings listed for this day.</p>'
    :'<div class="empty-state"><strong>No meetings listed for this day</strong><p>Queensland open data and the dated NSW/Victorian schedule may not yet have a card. Check the official racing calendars.</p></div>';
  $('#scheduleSource').innerHTML=`Queensland meetings and runners update from ${officialLink('https://www.racingqueensland.com.au/about/reports-and-data/open-data','RQ Open Data ↗')}. NSW/Victorian entries are a dated schedule and may change. ${officialLink('https://www.racingnsw.com.au/race-time-information/','NSW times ↗')} ${officialLink('https://www.racing.com/group-races-calendar','VIC calendar ↗')}`;
}
function renderRaces(){const meeting=selectedMeeting();$('#selectedMeetingDate').textContent=meeting?dateLabel(meeting.date,{weekday:'long'}).toUpperCase():'CHOOSE A MEETING';$('#selectedMeetingTitle').textContent=meeting?meeting.venue+(meeting.feature?` · ${meeting.feature}`:''):'Race card';const source=safeUrl(meeting?.state==='QLD'?'https://www.racingqueensland.com.au/racing/full-calendar':meeting?.source_url);$('#meetingSourceLink').hidden=!source;if(source)$('#meetingSourceLink').href=source;$('#raceList').innerHTML=!meeting?'<p class="loading">Select a meeting to see its races.</p>':meeting.races.length?meeting.races.map(r=>{const started=r.start_time&&Date.parse(r.start_time)<=Date.now(),detail=meeting.meeting_id?'Open public runner list':editorialNoteFor(r,meeting)?'Research notes · '+(editorialNoteFor(r,meeting).underdog?.horse?'three':'two')+' selections':r.savedRace?'Open saved research':r.preview_url?'Dated card · preview linked':'Dated race schedule';return `<button type="button" class="today-race ${started?'started':''}" data-race-id="${esc(raceId(r,meeting))}" aria-pressed="${state.race===raceId(r,meeting)}"><span>R${r.number}</span><span><strong>${esc(r.name||`Race ${r.number}`)}</strong><small>${r.distance_m?`${esc(r.distance_m)}m · `:''}${esc(detail)}</small></span><span>${esc(timeLabel(r.start_time))}</span></button>`;}).join(''):`<div class="empty-state"><strong>Race program pending</strong><p>${meeting.meeting_id?'This Queensland meeting is listed, but its races are not available through open data yet.':'Open the official meeting to check the latest program.'}</p></div>`;if(meeting?.meeting_id&&!state.qldCards.has(meetingId(meeting)))$('#raceList').insertAdjacentHTML('beforeend','<button type="button" id="loadQldCard" class="today-race"><span>↻</span><span><strong>Load Queensland race program</strong><small>Official public open data</small></span><span>Open</span></button>');}
function renderBoard(){renderDates();renderMeetings();renderRaces();}
function infoPanel(race,meeting,body){const started=race.start_time&&Date.parse(race.start_time)<=Date.now(),source=meeting.meeting_id?'https://www.racingqueensland.com.au/racing/full-calendar':race.source_url||meeting.source_url,details=state.qldDetails.get(meetingId(meeting));return `<div class="analysis-top"><div><p class="eyebrow">${esc(meeting.venue)} · R${race.number} · ${esc(dateLabel(meeting.date))}</p><h3>${esc(race.name||`Race ${race.number}`)}</h3><p>${esc(timeLabel(race.start_time))} AEDT · ${started?'Scheduled jump has passed':'Upcoming'}</p></div>${officialLink(source)}</div><div class="analysis-facts">${race.distance_m?`<span>${esc(race.distance_m)}m</span>`:''}${race.race_class?`<span>${esc(race.race_class)}</span>`:''}${race.track_rating||details?.track_rating?`<span>Track ${esc(race.track_rating||details.track_rating)}</span>`:''}${details?.rail_position?`<span>Rail ${esc(details.rail_position)}</span>`:''}<span>${esc(meeting.state||'Saved')}</span></div>${body}`;}
function researchLens(race){const distance=Number(race.distance_m);if(Number.isFinite(distance)&&distance<=1200)return 'For a shorter race, inspect early pace, the actual barrier draw, rail position and whether a runner can find cover.';if(Number.isFinite(distance)&&distance>=2000)return 'For a staying race, inspect recent runs over a similar distance, carried weight, fitness and track suitability.';return 'Compare recent runs near this distance and class, likely early position and the current track rating.';}
function fieldHtml(runners,asOf,label){if(!Array.isArray(runners)||!runners.length)return '<p class="analysis-state warning">No horses are currently listed for this race. Acceptances may still be pending.</p>';return `<div class="field-heading"><div><p class="eyebrow">${esc(label)}</p><h4>${runners.length} horses listed</h4></div>${asOf?`<span>Checked ${esc(timeLabel(asOf))} AEDT</span>`:''}</div><div class="public-runner-list">${runners.map(runner=>`<article class="public-runner"><div class="runner-number">${runner.number?`#${esc(runner.number)}`:'—'}</div><div><h5>${esc(runner.name||runner.runner_name)}</h5><p>${runner.jockey?`Jockey: ${esc(runner.jockey)}`:'Jockey TBC'}${runner.trainer?` · Trainer: ${esc(runner.trainer)}`:''}</p></div><strong>${runner.weight_kg||runner.weight?`${esc(runner.weight_kg||runner.weight)}kg`:'Weight TBC'}</strong></article>`).join('')}</div>`;}
function publicFieldMeeting(meeting){
  if(state.publicFields?.date!==meeting.date)return null;
  const venue=String(meeting.venue||'').trim().toLowerCase().replace(/ gardens$/,'');
  return (state.publicFields.meetings||[]).find(row=>String(row.venue||'').trim().toLowerCase().replace(/ gardens$/,'')===venue)||null;
}
function publicFieldFor(race,meeting){
  return publicFieldMeeting(meeting)?.races?.find(row=>Number(row.number)===Number(race.number))||null;
}
function publicFieldRunners(runners){
  const query=state.fieldQuery.trim().toLowerCase();
  const filtered=runners.filter(runner=>{
    const barrier=Number(runner.barrier);
    const gateMatches=state.fieldGateRange==='all'||(state.fieldGateRange==='low'&&barrier>=1&&barrier<=4)||(state.fieldGateRange==='mid'&&barrier>=5&&barrier<=8)||(state.fieldGateRange==='wide'&&barrier>=9)||(state.fieldGateRange==='unknown'&&(!Number.isFinite(barrier)||barrier<=0));
    const text=[runner.number,runner.name,runner.jockey,runner.trainer,runner.last10].join(' ').toLowerCase();
    return gateMatches&&(!query||text.includes(query));
  });
  filtered.sort((a,b)=>{
    const gateA=Number(a.barrier),gateB=Number(b.barrier);
    if(state.fieldSort==='barrier-asc'||state.fieldSort==='barrier-desc'){
      const knownA=Number.isFinite(gateA)&&gateA>0,knownB=Number.isFinite(gateB)&&gateB>0;
      if(knownA!==knownB)return knownA?-1:1;
      if(knownA&&gateA!==gateB)return state.fieldSort==='barrier-asc'?gateA-gateB:gateB-gateA;
    }
    return Number(a.number||999)-Number(b.number||999);
  });
  return filtered;
}
function publicFieldListHtml(field){
  const all=Array.isArray(field.runners)?field.runners:[];
  const runners=publicFieldRunners(all);
  const cards=runners.map(runner=>{
    const scratched=runner.scratched===true;
    const barrier=Number(runner.barrier);
    const barrierText=Number.isFinite(barrier)&&barrier>0?`Gate ${barrier}`:'Gate TBC';
    const weight=Number(runner.weight_kg);
    const weightText=Number.isFinite(weight)&&weight>0?`${weight} kg`:'Weight TBC';
    const formUrl=safeUrl(runner.horse_form_url);
    return `<article class="all-horse-card${scratched?' scratched':''}"><span class="all-horse-number">${runner.number?`#${esc(runner.number)}`:'—'}</span><div class="all-horse-detail"><div class="all-horse-name"><h5>${esc(runner.name||'Unnamed runner')}</h5>${scratched?'<span class="horse-scratched">Scratched</span>':runner.promoted_emergency===true?'<span class="horse-promoted">Promoted emergency</span>':runner.emergency===true?'<span class="horse-emergency">Emergency</span>':''}</div><p>${esc(runner.jockey||'Jockey TBC')} <span aria-hidden="true">·</span> ${esc(runner.trainer||'Trainer TBC')}</p>${runner.last10?`<small>Published form figures: <strong>${esc(runner.last10)}</strong></small>`:''}${formUrl?`<a href="${esc(formUrl)}" target="_blank" rel="noopener noreferrer">Official full form ↗</a>`:''}</div><div class="all-horse-facts"><strong>${esc(barrierText)}</strong><span>${esc(weightText)}</span></div></article>`;
  }).join('');
  return {count:runners.length,html:cards||'<p class="all-horses-empty">No horses match those filters.</p>'};
}
function independentFieldHtml(race,meeting){
  const field=publicFieldFor(race,meeting);
  if(!field||!Array.isArray(field.runners)||!field.runners.length)return '';
  const active=field.runners.filter(runner=>runner.scratched!==true).length;
  const source=safeUrl(field.source_url||meeting.source_url);
  const snapshot=state.publicFields?.retrieved_at||state.publicFields?.source_as_of||'';
  const fieldMeeting=publicFieldMeeting(meeting);
  const scratchingNote=fieldMeeting?.scratching_status||'';
  const scratchingsUrl=safeUrl(fieldMeeting?.scratchings_url);
  const list=publicFieldListHtml(field);
  return `<section class="all-horses" aria-label="Public field for race ${esc(race.number)}"><div class="all-horses-head"><div><p class="eyebrow">PUBLIC FIELD SNAPSHOT</p><h4>All horses <span>${active} listed${active!==field.runners.length?` · ${field.runners.length-active} scratched`:''}</span></h4></div><button type="button" id="toggleAllHorses" aria-expanded="${state.fieldOpen}" aria-controls="allHorsesBody">${state.fieldOpen?'Hide':'Show'} all horses <span aria-hidden="true">${state.fieldOpen?'−':'+'}</span></button></div><p class="all-horses-context">Independent public racecard facts${snapshot?` · collected ${esc(editorialAsOf(snapshot))}`:''}. ${scratchingNote?`${esc(scratchingNote)} `:''}Check the official card for subsequent changes.</p><div id="allHorsesBody"${state.fieldOpen?'':' hidden'}><div class="all-horses-toolbar"><label>Find a horse<input id="fieldSearch" type="search" value="${esc(state.fieldQuery)}" placeholder="Name, rider or trainer" autocomplete="off"></label><label>Barrier range<select id="fieldGateFilter"><option value="all"${state.fieldGateRange==='all'?' selected':''}>All gates</option><option value="low"${state.fieldGateRange==='low'?' selected':''}>1–4</option><option value="mid"${state.fieldGateRange==='mid'?' selected':''}>5–8</option><option value="wide"${state.fieldGateRange==='wide'?' selected':''}>9+</option><option value="unknown"${state.fieldGateRange==='unknown'?' selected':''}>Not published</option></select></label><label>Sort<select id="fieldSort"><option value="number"${state.fieldSort==='number'?' selected':''}>Runner number</option><option value="barrier-asc"${state.fieldSort==='barrier-asc'?' selected':''}>Gate: inside first</option><option value="barrier-desc"${state.fieldSort==='barrier-desc'?' selected':''}>Gate: outside first</option></select></label></div><p id="fieldCount" class="all-horses-count" role="status">Showing ${list.count} of ${field.runners.length} horses</p><div id="allHorsesList" class="all-horses-list">${list.html}</div><div class="all-horses-source"><div>${source?officialLink(source,'Open official race form ↗'):'Check the official meeting for complete form.'}${scratchingsUrl?` ${officialLink(scratchingsUrl,'Official scratchings ↗')}`:''}</div><span>Form figures are published results codes, not a FormLine rating.</span></div></div></section>`;
}
function refreshPublicFieldList(){
  const race=selectedRace(),meeting=selectedMeeting();
  if(!race||!meeting)return;
  const field=publicFieldFor(race,meeting);
  if(!field||!$('#allHorsesList'))return;
  const list=publicFieldListHtml(field);
  $('#allHorsesList').innerHTML=list.html;
  $('#fieldCount').textContent=`Showing ${list.count} of ${field.runners.length} horses`;
}
function renderTips(meeting){
  const section=$('#publicTips');
  const venue=String(meeting?.venue||'').trim().toLowerCase();
  const tips=state.editorial?.meetings?.[venue]?._tips;
  section.hidden=!Array.isArray(tips)||tips.length===0;
  if(section.hidden)return;
  $('#tipsMeeting').textContent=`${meeting.venue} · source-linked race-day notes`;
  $('#tipsCards').innerHTML=tips.map(item=>{
    const url=safeUrl(item.url);
    return `<article class="tip-card"><span class="tip-race">${esc(item.race||'MEETING')}</span><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p><div class="tip-source"><span>${esc(item.source||'Public report')}</span>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Read source ↗</a>`:''}</div></article>`;
  }).join('');
}
function renderAnalysis(){
  const race=selectedRace(),meeting=selectedMeeting();
  renderTips(meeting);
  if(!race||!meeting){
    $('#analysisPanel').innerHTML='<div class="empty-state"><strong>Choose a race above</strong><p>Choose a race from the selected meeting to inspect its field, research notes and form link.</p></div>';
    return;
  }
  if(state.loadingRace===state.race){
    $('#analysisPanel').innerHTML=infoPanel(race,meeting,'<p class="analysis-state">Loading the public Queensland field…</p>');
    return;
  }
  const cached=race.race_id?state.runnerCache.get(String(race.race_id)):null;
  const independentField=independentFieldHtml(race,meeting);
  const field=meeting.meeting_id
    ? cached?fieldHtml(cached.runners,cached.as_of,'PUBLIC QUEENSLAND FIELD'):'<p class="analysis-state">Choose Refresh public field to load the current runner list.</p>'
    :race.savedRace?fieldHtml(race.savedRace.runners,null,'SAVED IN THIS BROWSER'):'';
  const editorial=renderEditorial(race,meeting);
  const coverage=meeting.meeting_id
    ?'Racing Queensland open data provides horses, weights, jockeys and trainers. The endpoints connected here do not include barriers, historical form, live odds or final placings.'
    :race.savedRace?'This card is saved only in this browser. Review it against the official field before making any decision.'
    :independentField?'This race has a dated public field snapshot with runner details and a source link. It is not a live field or odds feed.'
    :editorial?'This NSW/Victorian card includes a dated, source-linked editorial assessment. A public live runner and odds feed is not connected.'
    :'This is a dated NSW/Victorian schedule entry. A public, reusable live runner feed for this state is not connected.';
  const pending='<div class="prediction-card model-pending"><p class="eyebrow">MODEL DECISION PENDING</p><h4>Research checklist</h4><p>'+esc(researchLens(race))+'</p><p>FormLine is not generating picks or two-horse placement combinations from a partial field. Those need a selected, tested probability model and licensed point-in-time form and odds data.</p></div>';
  const error=state.raceError?`<p class="analysis-state warning">${esc(state.raceError)}</p>`:'';
  const preview=race.preview_url?`<p class="analysis-foot">${officialLink(race.preview_url,'External race preview ↗')}</p>`:'';
  $('#analysisPanel').innerHTML=infoPanel(race,meeting,`${error}<p class="analysis-state">${esc(coverage)}</p>${independentField}${field}${editorial||pending}${meeting.meeting_id?'<div class="analysis-actions"><button type="button" class="secondary" id="refreshRace">Refresh public field</button></div>':''}${preview}<p class="analysis-foot">Verify scratchings, current ground, rider changes and results at the official source. No bets are placed here.</p>`);
}
async function loadQueenslandCard(meeting,autoOpen=false){if(!meeting?.meeting_id||state.qldCards.has(meetingId(meeting)))return;const url=new URL('/api/schedule',location.href);url.searchParams.set('action','card');url.searchParams.set('meeting_id',String(meeting.meeting_id));url.searchParams.set('date',meeting.date);const response=await fetch(url,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||`Queensland race program returned HTTP ${response.status}.`);const original=state.publicMeetings.find(row=>meetingId(row)===meetingId(meeting)&&row.meeting_id);if(!original)return;original.races=normalisePublic([{...original,races:data.races}])[0]?.races||[];state.qldDetails.set(meetingId(meeting),data);state.qldCards.add(meetingId(meeting));renderBoard();if(autoOpen&&state.meeting===meetingId(meeting)&&original.races.length&&!state.race)selectRace(raceId(original.races[0],original),false);}
async function loadQueenslandRunners(force=false){const meeting=selectedMeeting(),race=selectedRace();if(!meeting?.meeting_id||!race?.race_id)return;const id=String(race.race_id),requestId=++state.requestId;if(!force&&state.runnerCache.has(id)){renderAnalysis();return;}state.loadingRace=state.race;state.raceError='';renderAnalysis();try{const url=new URL('/api/schedule',location.href);url.searchParams.set('action','runners');url.searchParams.set('race_id',id);url.searchParams.set('meeting_id',String(meeting.meeting_id));url.searchParams.set('date',meeting.date);const response=await fetch(url,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||`Queensland runner feed returned HTTP ${response.status}.`);if(requestId!==state.requestId)return;state.runnerCache.set(id,data);}catch(error){if(requestId===state.requestId)state.raceError=error.message;}finally{if(requestId===state.requestId){state.loadingRace='';renderAnalysis();}}}
function resetFieldControls(){state.fieldQuery='';state.fieldGateRange='all';state.fieldSort='number';state.fieldOpen=false;}
function selectDate(date){if(!inRange(date))return;state.requestId++;state.date=date;state.meeting='';state.race='';state.raceError='';resetFieldControls();const first=mergedMeetings().find(row=>row.meeting_id&&row.race_count)||mergedMeetings()[0];if(first)state.meeting=meetingId(first);renderBoard();renderAnalysis();if(first?.meeting_id)loadQueenslandCard(first,true).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});}
function selectMeeting(id){if(!mergedMeetings().some(row=>meetingId(row)===id))return;state.requestId++;state.meeting=id;state.race='';state.raceError='';resetFieldControls();renderBoard();renderAnalysis();const meeting=selectedMeeting();if(meeting?.meeting_id)loadQueenslandCard(meeting).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});}
function selectRace(id,scroll=true){const meeting=selectedMeeting();if(!meeting?.races.some(row=>raceId(row,meeting)===id))return;state.requestId++;state.race=id;state.raceError='';resetFieldControls();renderBoard();renderAnalysis();if(selectedRace()?.race_id&&meeting.meeting_id)loadQueenslandRunners();if(scroll)$('#analysis').scrollIntoView({behavior:'smooth',block:'start'});}
$('#menuToggle').addEventListener('click',()=>{const open=!document.body.classList.contains('menu-open');document.body.classList.toggle('menu-open',open);$('#menuToggle').setAttribute('aria-expanded',String(open));$('#appSidebar').inert=!open;});
$('#menuScrim').addEventListener('click',()=>{document.body.classList.remove('menu-open');$('#menuToggle').setAttribute('aria-expanded','false');$('#appSidebar').inert=true;});
$('#appSidebar nav').addEventListener('click',()=>{document.body.classList.remove('menu-open');$('#menuToggle').setAttribute('aria-expanded','false');$('#appSidebar').inert=true;});
$('#appSidebar').inert=matchMedia('(max-width:700px)').matches;matchMedia('(max-width:700px)').addEventListener('change',event=>{$('#appSidebar').inert=event.matches;document.body.classList.remove('menu-open');$('#menuToggle').setAttribute('aria-expanded','false');});
document.addEventListener('click',event=>{const date=event.target.closest('[data-date]');if(date){selectDate(date.dataset.date);return;}const meeting=event.target.closest('[data-meeting-id]');if(meeting){selectMeeting(meeting.dataset.meetingId);return;}const race=event.target.closest('[data-race-id]');if(race){selectRace(race.dataset.raceId);return;}if(event.target.id==='toggleAllHorses'){state.fieldOpen=!state.fieldOpen;event.target.setAttribute('aria-expanded',String(state.fieldOpen));event.target.innerHTML=`${state.fieldOpen?'Hide':'Show'} all horses <span aria-hidden="true">${state.fieldOpen?'−':'+'}</span>`;$('#allHorsesBody').hidden=!state.fieldOpen;return;}if(event.target.id==='refreshRace'){loadQueenslandRunners(true);return;}if(event.target.id==='loadQldCard'){const row=selectedMeeting();if(row)loadQueenslandCard(row).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});}});
document.addEventListener('input',event=>{if(event.target.id==='fieldSearch'){state.fieldQuery=event.target.value;refreshPublicFieldList();}});
document.addEventListener('change',event=>{if(event.target.id==='fieldSort'){state.fieldSort=event.target.value;refreshPublicFieldList();}if(event.target.id==='fieldGateFilter'){state.fieldGateRange=event.target.value;refreshPublicFieldList();}});
(async function init(){
  state.date=dayAt(0);
  state.savedMeetings=savedMeetings();
  $('#todayTag').textContent=dateLabel(state.date,{weekday:'long'}).toUpperCase();
  const results=await Promise.allSettled([
    fetch('data/upcoming-races-2026-11-05.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Dated schedule unavailable'))),
    fetch('/api/schedule?action=meetings',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Queensland feed unavailable'))),
    fetch('data/race-notes-2026-11-07.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Dated research unavailable'))),
    fetch('data/race-fields-2026-11-07.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Public field snapshot unavailable'))),
    fetch('data/underdogs-2026-11-07.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Dated underdog research unavailable')))
  ]);
  const fixture=results[0].status==='fulfilled'?results[0].value:null;
  const queensland=results[1].status==='fulfilled'?results[1].value:null;
  state.editorial=results[2].status==='fulfilled'?results[2].value:null;
  state.publicFields=results[3].status==='fulfilled'?results[3].value:null;
  if(results[4].status==='fulfilled')mergeDatedUnderdogs(results[4].value);
  const fieldSchedule=state.publicFields?.date===state.date?(state.publicFields.meetings||[]).map(row=>({date:state.publicFields.date,venue:row.venue,state:row.state,source_url:row.source_url,races:(row.races||[]).map(race=>({number:race.number,name:race.name,start_time:race.start_time,distance_m:race.distance_m,source_url:race.source_url}))})):[];
  state.publicMeetings=normalisePublic([...(fixture?.meetings||[]),...fieldSchedule,...(queensland?.meetings||[])]);
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
  $('#scheduleStatus').textContent=`${new Set(state.publicMeetings.map(meetingId)).size} meeting${new Set(state.publicMeetings.map(meetingId)).size===1?'':'s'} listed in the next seven days · ${queensland?'live Queensland feed':'Queensland feed unavailable'} · NSW/VIC dated schedule${state.publicFields&&state.date==='2026-11-07'?' with public field snapshots':''}${state.editorial&&state.date==='2026-11-07'?' and research notes':''}.`;
  renderBoard();renderAnalysis();
  if(first?.meeting_id)loadQueenslandCard(first,true).catch(error=>{$('#raceList').insertAdjacentHTML('beforeend',`<p class="analysis-state warning">${esc(error.message)}</p>`);});
}()).catch(error=>{$('#scheduleStatus').textContent=error.message;renderBoard();});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

function mergeDatedUnderdogs(data){
  if(!state.editorial || !state.publicFields || !data || data.date!==state.editorial.date || data.date!==state.publicFields.date)return;
  const addedAt=Date.parse(data.as_of);
  if(!Number.isFinite(addedAt))return;
  for(const [venueKey,racePicks] of Object.entries(data.meetings||{})){
    const venue=String(venueKey).trim().toLowerCase();
    const notes=state.editorial.meetings?.[venue];
    const field=state.publicFields.meetings?.find(item=>String(item.venue||'').trim().toLowerCase()===venue);
    if(!notes || !field || !racePicks || typeof racePicks!=='object')continue;
    for(const [raceNumber,entry] of Object.entries(racePicks)){
      const number=Number(raceNumber),race=field.races?.find(item=>Number(item.number)===number),note=notes[raceNumber];
      const pick=entry?.underdog?.horse?entry.underdog:entry;
      if(!race || !note?.primary?.horse || !note?.alternative?.horse || !pick?.horse || !Array.isArray(pick.reasons) || !pick.reasons.length)continue;
      const jump=Date.parse(race.start_time);
      if(!Number.isFinite(jump) || jump<=addedAt)continue;
      note.underdog={...pick,as_of:data.as_of};
    }
  }
}

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

function editorialPick(pick, kind, heading) {
  const metrics = Array.isArray(pick.metrics) ? pick.metrics.filter(Boolean) : [];
  const reasons = Array.isArray(pick.reasons) ? pick.reasons.filter(Boolean) : [];
  const sources = (Array.isArray(pick.sources) ? pick.sources : []).map(item => ({label:item?.label || 'Form source', url:safeUrl(item?.url)})).filter(item => item.url);
  const label = heading || (kind === 'primary' ? 'Win selection' : kind === 'underdog' ? 'CHEAKY underdog' : 'Other win / place candidate');
  return `<article class="editorial-pick editorial-pick-${kind}">
    <div class="editorial-pick-head"><span>${label}</span><strong>${esc(pick.bet || (kind === 'primary' ? 'Win' : 'Win or place'))}</strong></div>
    <h4>${esc(pick.horse)}</h4>
    ${pick.market_context || (kind === 'underdog' && pick.as_of) ? `<p class="editorial-market-context">${kind === 'underdog' && pick.as_of ? `Added ${esc(editorialAsOf(pick.as_of))}${pick.market_context ? ' · ' : ''}` : ''}${pick.market_context ? esc(pick.market_context) : ''}</p>` : ''}
    ${metrics.length ? `<div class="editorial-metrics" aria-label="Key form figures">${metrics.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}
    ${reasons.length ? `<ul class="editorial-reasons">${reasons.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="editorial-missing">Detailed form reasons were not supplied for this selection.</p>'}
    ${pick.risk ? `<p class="editorial-risk"><strong>Watch:</strong> ${esc(pick.risk)}</p>` : ''}
    ${sources.length ? `<div class="editorial-pick-sources">${sources.map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label)} ↗</a>`).join('')}</div>` : ''}
  </article>`;
}

function resultCard(result){
  if(!result||!Array.isArray(result.placings)||!result.placings.length)return '';
  const placings=result.placings.filter(item=>item&&item.horse).sort((a,b)=>Number(a.position||99)-Number(b.position||99));
  if(!placings.length)return '';
  return `<section class="race-result" aria-label="Recorded race result"><div class="race-result-head"><div><p class="eyebrow">RACE OUTCOME</p><h4>${esc(result.status||'Recorded result')}</h4></div>${officialLink(result.source_url,'Official result ↗')}</div><ol>${placings.map(item=>`<li><span>${esc(item.position||'—')}</span><strong>${esc(item.horse)}</strong></li>`).join('')}</ol><p>This result is separate from the dated selections below.</p></section>`;
}
function baseHorseName(name){
  return String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s*\((?:AUS|NZ|IRE|GB|FR|USA|JPN|GER|CAN|SAF)\)\s*$/i,'').replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/gi,'').toLowerCase();
}
function selectionFieldWarnings(note,race,meeting){
  const field=publicFieldFor(race,meeting);
  if(!field?.runners)return '';
  const warnings=[];
  for(const pick of [note.primary,note.alternative,note.underdog]){
    const runner=field.runners.find(row=>baseHorseName(row.name)===baseHorseName(pick?.horse));
    if(!runner)continue;
    if(runner.scratched===true)warnings.push(`${pick.horse} is scratched in the sourced field.`);
    else if(runner.emergency===true&&runner.promoted_emergency!==true)warnings.push(`${pick.horse} is listed as an emergency; confirm a start on the current official card.`);
  }
  return warnings.length?`<p class="analysis-state warning">${esc(warnings.join(' '))}</p>`:'';
}

function renderEditorial(race, meeting) {
  const note = editorialNoteFor(race, meeting);
  if (!note) return '';
  const passed = race.start_time && Date.parse(race.start_time) <= Date.now();
  const facts = [note.track && `Track: ${note.track}`, note.rail && `Rail: ${note.rail}`].filter(Boolean);
  const news = (Array.isArray(note.public_news) ? note.public_news : []).filter(item => item?.text);
  const links = (Array.isArray(note.sources) ? note.sources : []).map(item => ({label:item?.label || 'Source', url:safeUrl(item?.url)})).filter(item => item.url);
  const weather=state.editorial.meetings?.[String(meeting.venue||'').toLowerCase()]?._weather;
  const weatherLinks=(Array.isArray(weather?.sources)?weather.sources:[]).map(item=>({label:item?.label||'Track source',url:safeUrl(item?.url)})).filter(item=>item.url);
  const weatherHtml=weather
    ?'<div class="editorial-weather"><div class="editorial-weather-head"><strong>'+(String(meeting.venue||'').toLowerCase()==='flemington'?'Flemington rain scenario':'Rosehill ground update')+'</strong><span>'+esc(weather.as_of||'Race-day snapshot')+'</span></div><p>'+esc(weather.status)+'</p><p>'+esc(note.weather_scenario||weather.if_soft)+'</p>'+(weatherLinks.length?'<div class="editorial-weather-links">'+weatherLinks.map(item=>'<a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.label)+' ↗</a>').join('')+'</div>':'')+'</div>'
    :'';
  return `<section class="editorial-research" aria-label="Dated race research">
    <div class="editorial-intro"><div><p class="eyebrow">7 NOVEMBER RESEARCH NOTES</p><h4>${note.underdog?.horse?'Three':'Two'} runners to examine</h4><p>Editorial assessment from public form and reports. These are not calibrated model probabilities or private insider information.</p>${state.editorial.method ? `<p class="editorial-method">${esc(state.editorial.method)}</p>` : ''}</div><span class="editorial-time">${note.as_of?'Revised':'Initial research'} ${esc(editorialAsOf(note.as_of || state.editorial.as_of))}</span></div>
    ${facts.length ? `<div class="editorial-conditions">${facts.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}
    <p class="analysis-state ${passed ? 'warning' : ''}">${passed ? (note.result ? 'The scheduled jump has passed. The recorded outcome below is separate from these dated selections.' : 'The scheduled jump has passed. These dated editorial notes are not a verified pre-race prediction or confirmed results; check the official outcome.') : 'Pre-race view. Recheck scratchings, ground, rider changes and the available price before using this research.'}</p>
    ${note.revision_note ? `<p class="analysis-state warning">${esc(note.revision_note)}</p>` : ''}
    ${selectionFieldWarnings(note,race,meeting)}
    ${resultCard(note.result)}
    ${weatherHtml}
    <div class="editorial-picks">${editorialPick(note.primary, 'primary', passed && note.revision_note ? 'Revised form choice' : '')}${editorialPick(note.alternative, 'alternative')}${note.underdog?.horse ? editorialPick(note.underdog, 'underdog') : ''}</div>
    ${news.length ? `<div class="editorial-news"><h5>Public reports and stable comments</h5><ul>${news.map(item => { const url = safeUrl(item.url); return `<li>${esc(item.text)}${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Read source ↗</a>` : ''}</li>`; }).join('')}</ul></div>` : ''}
    ${links.length ? `<div class="editorial-sources"><strong>Research sources</strong><div>${links.map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label)} ↗</a>`).join('')}</div></div>` : ''}
  </section>`;
}
