# FormLine

FormLine is a public Australian thoroughbred race research site and a browser-saved paper-betting workspace. It does not place bets. No statistical prediction model has been selected or validated for current races.

## What the site shows

- **Upcoming races:** a seven-day date, meeting and race picker with Flemington and Rosehill featured above the other meetings. The NSW/VIC entries for 5–11 November 2026 are a dated, source-linked schedule, not an automatically updated public race feed. Flemington and Rosehill have published race programs in this snapshot; some other meetings have dates only. Open a race to see its known details, source links and available research notes. The site does not invent a horse selection when the required data is missing.
- **7 November fields and research:** all 19 Flemington and Rosehill races have dated field snapshots in `data/race-fields-2026-11-07.json`: 125 Flemington acceptors checked against the [VRC racebook](https://online.flippingbook.com/view/525741370/) and [Racing Australia race-day fields](https://www.racingaustralia.horse/FreeFields/Acceptances.aspx?Key=2026Nov07%2CVIC%2CFlemington), and 133 Rosehill acceptors from [Racing NSW](https://mdata.racingnsw.com.au/FreeFields/Acceptances.aspx?Key=2026Nov07%2CNSW%2CRosehill+Gardens). The race view shows barriers, weights, jockeys, trainers, available recent-form strings, scratching status and source links. Flemington scratchings and emergency promotions were checked against official race-day updates; Rosehill scratchings were checked at 7:52 am AEDT. Dated editorial notes in `data/race-notes-2026-11-07.json` show two selections, form arguments, risks, public reports and sources for each race. Official results appear separately where verified. Post-jump selection edits are marked as such. These are original editorial assessments, not private insider information, calibrated model probabilities or live prices.
- **Queensland open data:** current Queensland meetings and race programs are requested from [Racing Queensland Open Data Web Services](https://www.racingqueensland.com.au/about/reports-and-data/open-data) through the public `/api/schedule` function. Where the service supplies a runner list, the site can show those runners. Availability and completeness depend on what Racing Queensland has published for that meeting. Recheck the official card for late changes and scratchings.
- **3 November archive:** [cup-day-2026.html](cup-day-2026.html) retains the dated Flemington/Randwick research, saved runner tags and scenario tools. It is historical content, not a current race card.
- **Cup history and editorial forecast:** the [Cup analysis](cup-analysis.html) covers the top four finishers in each Melbourne Cup from 2011–2025, plus a dated, provisional 2026 forecast and scenario discussion. The historical table contains only top-four finishers, so it cannot establish a barrier success rate across all starters. The editorial forecast is not the output of a calibrated betting model.
- **Research tools:** [research-tools.html](research-tools.html) includes the dated 3 November Flemington/Randwick cards, sourced gate examples, an All horses view where runner details exist, a gate and early-map research panel, a betting-return calculator, manual race and runner records, a paper journal, performance tracking, strategy explanations and an A–Z glossary. The calculator uses odds entered by the user; it does not fetch a bookmaker quote.

The public Queensland endpoints currently connected to FormLine do **not** return live odds, horse form histories, barriers or race results. The 7 November NSW/VIC runner data and editorial notes are dated snapshots, not a live feed. Some archived cards contain dated runner details, gate examples, track reports and editorial notes; those must not be treated as live information. A drawn barrier can also differ from the effective stall after scratchings. Check the linked official source before using any card.

[PuntersEdge's Free-plan terms](https://puntersedge.online/terms) permit personal research and dashboards but restrict public redistribution. The 7 November PuntersEdge acceptances, form, odds and results were collected for private cross-checking outside this repository. Their raw responses and the API key are not served by this site. The public field snapshot above was sourced independently from the VRC and Racing NSW.

The gate and early-map panel describes factors to review, especially on shorter races. Its manual gate-map adjustment is a small, unvalidated research tiebreak for a complete saved field, not a win probability or demonstrated betting edge. Two-horse Top 3/4/5 ideas require a complete field and appropriate evidence; the site must not make up a combined same-race-multi price. Enter an actual offered combined quote when recording a paper multi.

## Run locally

From this directory, run `python3 -m http.server 8767 --bind 127.0.0.1` and open `http://127.0.0.1:8767/`. The archive, dated schedule, public field snapshots, calculator and manual research workspace work through this static server. The Queensland API function runs on Vercel and is unavailable through a plain Python static server. The older localhost Python/SQLite app is a separate backend and is not included in this static deployment.

## Deploy on Vercel

Import this repository as a Vercel project. Choose **Other** as the framework, leave the build command empty, and use the repository root as the output directory. The public Queensland function needs no API key. No PuntersEdge key or FormLine access code is needed on Vercel. A push to the configured production branch, normally `main`, triggers a production deployment through Vercel's Git integration.

## Paper records and data limits

Research records, favourites, finish tags and journal entries stay in this browser; they do not sync between devices. Export a backup before clearing site data. Manual result entry and paper settlement need review for dead heats, scratchings, deductions and bookmaker-specific place terms. Proper historical backtesting would require separately collected, timestamped pre-race fields, form, available odds and complete outcomes, including races and selections the user skipped. The site does not currently have that dataset or a validated profit claim.

## Phone app mode

The site includes a manifest, service worker, square green home-screen icon and responsive navigation. On iPhone, open the HTTPS site in Safari, choose **Share → Add to Home Screen**, then open the saved icon. On Android, choose **Install app** or **Add to Home screen**. Standalone mode opens without ordinary browser tabs; a site opened in a normal Safari or Chrome tab cannot hide that browser's controls.
