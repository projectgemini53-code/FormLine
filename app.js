'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let research;
const datasets = {};
const requestedMeeting = new URLSearchParams(location.search).get('meeting')?.toLowerCase();
let selectedMeeting = requestedMeeting === 'randwick' ? 'randwick' : 'flemington';
const selectedByMeeting = { flemington: 7, randwick: 1 };
const requestedRace = Number(new URLSearchParams(location.search).get('race'));
if (Number.isInteger(requestedRace) && requestedRace >= 1 && requestedRace <= 10) selectedByMeeting[selectedMeeting] = requestedRace;
let selectedRace = selectedByMeeting[selectedMeeting];
let installEvent = null;
const marksKey = 'formline_public_melbourne_cup_2026_marks_v1';
let marks = (() => { try { const value=JSON.parse(localStorage.getItem(marksKey)||'{}'); return value&&typeof value==='object'?value:{}; } catch { return {}; } })();
function sourceLinks(ids) {
  return [...new Set(ids||[])].map(id => {
    const item=research?.sources?.[id];
    if(!item || !/^https:\/\/(?:www\.)?(?:vrc\.com\.au|racing\.com|racingandsports\.com\.au|bom\.gov\.au|tab\.co\.nz|racingnsw\.com\.au|mdata\.racingnsw\.com\.au|australianturfclub\.com\.au|racingqueensland\.com\.au|racehub\.com\.au|bets\.com\.au)\//.test(item.url))return '';
    return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)} ↗</a>`;
  }).filter(Boolean).join('');
}
function markControls(profile) {
  const current=marks[profile.number]||{},tags=Array.isArray(current.tags)?current.tags:[];
  return `<div class="mark-controls"><button type="button" class="mark-star ${current.favorite?'active':''}" data-favorite="${profile.number}" aria-pressed="${!!current.favorite}" aria-label="${current.favorite?'Remove':'Add'} ${esc(profile.horse)} ${current.favorite?'from':'to'} favourites">${current.favorite?'★':'☆'} Favourite</button>${[['win','Win'],['top2','Top 2'],['top3','Top 3'],['top4','Top 4']].map(([tag,label])=>`<button type="button" class="mark-tag ${tags.includes(tag)?'active':''}" data-mark="${profile.number}" data-tag="${tag}" aria-pressed="${tags.includes(tag)}" aria-label="Mark ${esc(profile.horse)} ${label}">${label}</button>`).join('')}</div>`;
}
function cupProfiles() {
  return `<section class="dossiers"><div class="dossier-heading"><p class="eyebrow">THE 24-RUNNER DOSSIER</p><h3>Every Cup entrant, one question at a time</h3><p>Tap a runner to see the form case and its main weakness. Favourite and position tags save in this browser. Rider, scratches and odds can change.</p></div><div class="dossier-grid">${research.cup_profiles.map(p=>`<details class="dossier" ${p.number===20?'open':''}><summary><span class="runner-no">${p.number}</span><span><strong>${esc(p.horse)}</strong><small>Gate ${esc(p.barrier)} · ${esc(p.weight_kg)}kg · ${esc(p.jockey||'Rider pending')}</small></span><span aria-hidden="true" class="dossier-chevron">⌄</span></summary><div class="dossier-body"><p>${esc(p.case)}</p><p class="dossier-risk"><strong>Check:</strong> ${esc(p.watch)}</p><p class="dossier-meta">${esc(p.trainer)} · Last 10 ${esc(p.last10)}</p>${markControls(p)}<div class="source-links">${sourceLinks(p.sources)}</div></div></details>`).join('')}</div></section>`;
}
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}
function renderRandwickPanel(race) {
  const started = Number.isFinite(Date.parse(race.start_time)) && Date.parse(race.start_time) <= Date.now();
  const status = started
    ? 'This race has started. These were published pre-race selections; check the official final result before judging them.'
    : 'Pre-race editorial order. Recheck the final field, scratchings, track rating and current price before any decision.';
  $('#race-panel').innerHTML = `<div class="race-heading"><p class="eyebrow">RANDWICK · RACE ${race.number} · ${esc(race.time)} AEDT</p><h2>${esc(race.name)}</h2><div class="fact-list"><span>${esc(race.distance_m)}m</span><span>${esc(race.grade || 'Open')}</span><span>${esc(race.ground || 'Ground unconfirmed')} morning snapshot</span><span>${started ? 'Started · archived preview' : 'Upcoming · pre-race view'}</span></div><a class="all-horses-main-link" href="research-tools.html?venue=Randwick&race=${race.number}&all=1#races">Open field research &amp; gate examples <span aria-hidden="true">↗</span></a></div>
  <p class="prediction-status ${started ? 'is-started' : ''}">${esc(status)}</p>
  <div class="lean"><p class="eyebrow">THE RESEARCH QUESTION</p><h3>${esc(race.question)}</h3><p><strong>Morning ground:</strong> ${esc(race.ground || 'Unconfirmed')}. The published rating can change during the meeting.</p></div>
  <section class="watchlist"><div class="dossier-heading"><p class="eyebrow">${started ? 'ARCHIVED PRE-RACE SOURCE PICKS' : 'SOURCE-BACKED PRE-RACE PREDICTIONS'}</p><h3>Main pick and two alternatives</h3><p>Ordered editorial selections from cited previews, including Racing NSW. These are neither exact finishing positions nor a calibrated betting model. No live odds are shown.</p></div><div class="watch-grid">${race.watchlist.map((p, i) => `<article class="watch-card"><span>${['MAIN PICK', 'DANGER', 'ALTERNATIVE'][i] || 'WATCH'}</span><h4>#${esc(p.number)} ${esc(p.horse)}</h4>${p.barrier != null ? `<p class="prediction-gate">Original draw · gate ${esc(p.barrier)}</p>` : ''}<p>${esc(p.case)}</p><p class="watch-risk"><strong>Question:</strong> ${esc(p.risk)}</p><div class="source-links">${sourceLinks(p.sources)}</div></article>`).join('')}</div></section>
  <div class="before-jump"><div><p class="eyebrow">${started ? 'AFTER THE JUMP' : 'BEFORE THE JUMP'}</p><h3>${started ? 'Compare with the official result' : 'Recheck the race-day facts'}</h3><p>${started ? 'Do not treat a post-race view as a new prediction. Check final placings and the actual track rating.' : 'Confirm scratchings, rider, surface, effective stall and accepted quote. A source pick does not establish a positive expected return.'}</p></div><div><p class="eyebrow">PUBLIC SOURCES</p><div class="source-links">${sourceLinks(race.sources)}</div></div></div>`;
}
function renderRacePanel(race) {
  $('#race-panel').setAttribute('aria-labelledby',`race-tab-${selectedMeeting}-${race.number}`);
  $('#race-panel').dataset.meeting = selectedMeeting;
  if (selectedMeeting === 'randwick') { renderRandwickPanel(race); return; }
  $('#race-panel').innerHTML=`<div class="race-heading"><p class="eyebrow">RACE ${race.number} · ${esc(race.time)} AEDT</p><h2>${esc(race.name)}</h2><div class="fact-list"><span>${esc(race.distance_m)}m</span><span>${esc(race.grade||'Open')}</span><span>${race.active_runners} runners in the dated snapshot</span></div><a class="all-horses-main-link" href="research-tools.html?venue=Flemington&race=${race.number}&all=1#races">All horses &amp; filters <span aria-hidden="true">↗</span></a></div>
  <div class="lean"><p class="eyebrow">THE RESEARCH QUESTION</p><h3>${esc(race.question)}</h3><p><strong>Ground scenario:</strong> ${esc(race.ground)}</p></div>
  <section class="watchlist"><div class="dossier-heading"><p class="eyebrow">FORM WATCHLIST</p><h3>Three to examine</h3><p>These cases are provisional. They are not price-based recommendations.</p></div><div class="watch-grid">${race.watchlist.map((p,i)=>`<article class="watch-card"><span>${String(i+1).padStart(2,'0')}</span><h4>#${esc(p.number)} ${esc(p.horse)}</h4><p>${esc(p.case)}</p><p class="watch-risk"><strong>Question:</strong> ${esc(p.risk)}</p><div class="source-links">${sourceLinks(p.sources)}</div></article>`).join('')}</div></section>
  ${race.number===7?cupProfiles():''}
  <div class="before-jump"><div><p class="eyebrow">BEFORE THE JUMP</p><h3>Recheck the race-day facts</h3><p>Confirm final scratchings, rider, published track rating and the actual accepted quote. A form case does not establish a positive expected return.</p></div><div><p class="eyebrow">PUBLIC SOURCES</p><div class="source-links">${sourceLinks(race.sources)}</div></div></div>`;
}
function renderNews() {
  $('#news-list').innerHTML=research.news.map(item=>`<article class="news-card"><div class="news-meta"><span>${esc(item.kind)}</span><time datetime="${esc(item.date)}">${esc(selectedMeeting === 'randwick' ? dateLabel(item.date) : item.date)}</time></div><h3>${esc(item.headline)}</h3><p>${esc(item.detail)}</p><p class="news-impact"><strong>Why it matters:</strong> ${esc(item.impact)}</p><div class="news-horses">${item.horses.map(h=>`<span>${esc(h)}</span>`).join('')}</div><div class="source-links">${sourceLinks(item.sources)}</div></article>`).join('');
}
function render() {
  research = datasets[selectedMeeting];
  if (!research) return;
  const randwick = selectedMeeting === 'randwick';
  const label = randwick ? 'Randwick' : 'Flemington';
  const race=research.races.find(item=>item.number===selectedRace)||research.races[0];
  if (!race) return;
  selectedRace = race.number;
  $('#header-meeting').innerHTML=`${label.toUpperCase()} <span aria-hidden="true">/</span> 3 NOV 2026`;
  $('#hero-meeting').textContent=randwick?'BIG DANCE DAY · 10-RACE RESEARCH':'MELBOURNE CUP DAY · 10-RACE RESEARCH';
  $('#hero-copy').textContent=randwick
    ? 'Royal Randwick, Tuesday 3 November. Explore source-backed pre-race selections and alternatives for all ten races, then check official results as each race finishes.'
    : 'Flemington, Tuesday 3 November. Explore each race, then examine the full 24-runner Cup dossier and the public reports that could change the picture.';
  document.title=`${randwick ? 'Randwick Big Dance Day' : 'Melbourne Cup Day'} | FormLine`;
  $('#snapshot-date').textContent=`Prepared ${randwick ? dateLabel(research.prepared_at) : research.prepared_at}`;
  const track = research.track_snapshot;
  $('#track-snapshot').textContent=typeof track === 'string' ? track : `Randwick was ${track.rating}, rail ${track.rail}, with ${String(track.weather || 'unreported').toLowerCase()} weather at ${dateLabel(track.observed_at)} AEDT. This is a dated snapshot, not a live rating.`;
  $('#track-time').textContent=randwick?`Official sheet checked ${dateLabel(research.track_observed_at)} AEDT · verify again before the jump.`:'Morning snapshot, 3 Nov 2026 · verify again before the jump.';
  $('#track-source-link').href=randwick?research.track_source_url:'https://www.racingqueensland.com.au/racing/profiles/track/thoroughbred/flem';
  $('#track-source-link').textContent=randwick?'Official rating & scratchings ↗':'Source for morning rating ↗';
  $('#track-latest-link').href=randwick?research.sources.racing_nsw_acceptances.url:'https://www.vrc.com.au/track-and-weather-conditions/';
  $('#track-latest-link').textContent=randwick?'Official Randwick field ↗':'Current VRC track report ↗';
  $('#mobile-track-link').href=randwick?research.current_track_url:'https://www.vrc.com.au/track-and-weather-conditions/';
  $('#mobile-track-link').textContent=randwick?'Official Randwick scratchings ↗':'Official track report ↗';
  $('#cup-feature').hidden=randwick;
  $('#research-title').textContent=`${label} races`;
  $('#research-summary').textContent=randwick?'Main pick and alternatives from cited pre-race previews. Started races are archived views.':'Watchlists are form cases. Confirm final odds before any betting decision.';
  $('#index-title').textContent=`${label} · 10 races`;
  $('#race-tabs').setAttribute('aria-label',`${label} race research`);
  $('#news-title').textContent=randwick?'Randwick inside track':'Inside track';
  $('#footer-meeting').textContent=`${label} · 3 November 2026`;
  document.querySelectorAll('.meeting-switch button[data-meeting]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.meeting===selectedMeeting));button.disabled=!datasets[button.dataset.meeting];});
  $('#method-copy').innerHTML=`<p>${esc(research.method_note)}</p><p>${esc(research.status)}</p>`;
  $('#race-tabs').innerHTML=research.races.map(item=>`<button type="button" role="tab" id="race-tab-${selectedMeeting}-${item.number}" aria-controls="race-panel" aria-selected="${item.number===race.number}" tabindex="${item.number===race.number?'0':'-1'}" class="race-tab ${item.number===race.number?'active':''}" data-race="${item.number}"><strong>R${item.number}</strong><span>${esc(item.time)}</span><small>${esc(item.name)}</small></button>`).join('');
  $('#race-index-list').innerHTML=research.races.map(item=>`<button type="button" class="index-row ${item.number===race.number?'active':''}" data-race="${item.number}" ${item.number===race.number?'aria-current="true"':''}><span>R${item.number}</span><span><strong>${esc(item.watchlist?.[0]?.horse || 'Research pending')}</strong><small>${esc(item.name)}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  renderRacePanel(race);renderNews();
}
function syncLocation(method) {
  const url=new URL(location.href);
  url.searchParams.set('meeting',selectedMeeting);
  url.searchParams.set('race',String(selectedRace));
  history[method](null,'',url);
}
function selectMeeting(meeting) {
  if (!datasets[meeting] || meeting===selectedMeeting) return;
  selectedByMeeting[selectedMeeting]=selectedRace;
  selectedMeeting=meeting;
  selectedRace=selectedByMeeting[meeting];
  render();syncLocation('pushState');
}
function selectRace(number,focus=true) {
  const parsed=Number(number);if(!research?.races.some(item=>item.number===parsed))return;
  selectedRace=parsed;selectedByMeeting[selectedMeeting]=parsed;render();syncLocation('replaceState');
  if(focus){$(`#race-tab-${selectedMeeting}-${parsed}`)?.focus();$('#race-panel').scrollIntoView({behavior:'smooth',block:'start'});}
}
function setMenu(open,focusBack=false){const mobile=matchMedia('(max-width:700px)').matches,active=!!open&&mobile;document.body.classList.toggle('menu-open',active);$('#menuToggle').setAttribute('aria-expanded',String(active));$('#menuToggle').setAttribute('aria-label',active?'Close navigation':'Open navigation');$('#appSidebar').inert=mobile&&!active;if(active){$('#appSidebar').setAttribute('role','dialog');$('#appSidebar').setAttribute('aria-modal','true');$('#appSidebar nav a')?.focus();}else{$('#appSidebar').removeAttribute('role');$('#appSidebar').removeAttribute('aria-modal');if(focusBack)$('#menuToggle').focus();}}
$('#menuToggle').addEventListener('click',()=>setMenu(!document.body.classList.contains('menu-open'),true));
$('#menuScrim').addEventListener('click',()=>setMenu(false,true));
$('#appSidebar nav').addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false);});
matchMedia('(max-width:700px)').addEventListener('change',()=>setMenu(false));setMenu(false);
document.addEventListener('click',event=>{
  const meetingButton=event.target.closest('button[data-meeting]');
  if(meetingButton){selectMeeting(meetingButton.dataset.meeting);return;}
  const favourite=event.target.closest('[data-favorite]'),tag=event.target.closest('[data-mark][data-tag]');
  if(favourite||tag){
    const number=Number(favourite?.dataset.favorite||tag.dataset.mark),current=marks[number]||{favorite:false,tags:[]};
    if(favourite)current.favorite=!current.favorite;
    else{const value=tag.dataset.tag;current.tags=Array.isArray(current.tags)?current.tags:[];current.tags=current.tags.includes(value)?current.tags.filter(x=>x!==value):[...current.tags,value];}
    marks[number]=current;try{localStorage.setItem(marksKey,JSON.stringify(marks));}catch{}
    const p=research.cup_profiles.find(x=>x.number===number),parent=(favourite||tag).closest('.mark-controls');if(parent&&p)parent.outerHTML=markControls(p);
    return;
  }
  const button=event.target.closest('[data-race]');if(button)selectRace(button.dataset.race);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('menu-open')){setMenu(false,true);return;}
  if(event.key==='Tab'&&document.body.classList.contains('menu-open')){const links=[...document.querySelectorAll('#appSidebar a[href]')],first=links[0],last=links[links.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;}
  const current=event.target.closest('#race-tabs [role="tab"]');if(!current||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const index=Number(current.dataset.race)-1,next=event.key==='Home'?1:event.key==='End'?10:((index+(event.key==='ArrowRight'?1:-1)+10)%10)+1;
  event.preventDefault();selectRace(next,false);$(`#race-tab-${selectedMeeting}-${next}`)?.focus();
});
window.addEventListener('popstate',()=>{
  const params=new URLSearchParams(location.search),meeting=params.get('meeting')==='randwick'?'randwick':'flemington',race=Number(params.get('race'));
  if(!datasets[meeting])return;
  selectedMeeting=meeting;
  selectedRace=Number.isInteger(race)&&race>=1&&race<=10?race:selectedByMeeting[meeting];
  selectedByMeeting[meeting]=selectedRace;
  render();
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;$('#installBtn').hidden=false;});
$('#installBtn').addEventListener('click',async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$('#installBtn').hidden=true;});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
Promise.allSettled([
  fetch('melbourne-cup-2026.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Flemington research unavailable');return response.json();}),
  fetch('randwick-research-2026.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Randwick research unavailable');return response.json();})
]).then(([flemington,randwick])=>{
  if(flemington.status==='fulfilled'&&flemington.value.races?.length===10&&flemington.value.cup_profiles?.length===24)datasets.flemington=flemington.value;
  if(randwick.status==='fulfilled'&&randwick.value.races?.length===10&&randwick.value.races.every(race=>race.watchlist?.length===3))datasets.randwick=randwick.value;
  if(!datasets.flemington&&!datasets.randwick)throw Error('Race research files are unavailable');
  if(!datasets[selectedMeeting])selectedMeeting=datasets.flemington?'flemington':'randwick';
  if(!requestedRace&&datasets.randwick)selectedByMeeting.randwick=datasets.randwick.races.find(race=>Date.parse(race.start_time)>Date.now())?.number||1;
  selectedRace=selectedByMeeting[selectedMeeting];
  render();
}).catch(error=>{$('#race-panel').innerHTML=`<div class="loading">${esc(error.message)}. Reload the page to try again.</div>`;$('#news-list').innerHTML='';});
