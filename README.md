# FormLine

Source-linked Melbourne Cup research and a personal Australian racing paper-test workspace. The public site has three parts:

- **Race research:** the dated ten-race Flemington card, 24 Cup runner dossiers, saved favourites/finish tags, and dated Inside track reports.
- **Cup history and forecast:** every top-four finisher in the 2011–2025 Melbourne Cups (60 runners), with effective starting gate, listed kilograms, jockey, observed race position, lead-up form, race narrative and sources; an explained, provisional 2026 top four and pace scenarios.
- **Research tools:** a race board, manual or protected on-demand card/results/form/ground lookups, win/place and two-runner Top 3/4 paper bets, paper journal, simple final-result settlement, performance view, four strategy guides and an A–Z racing glossary. Research records stay in the browser and can be exported/imported as a backup.

No real bets are placed. Forecasts are editorial hypotheses, not calibrated probabilities or proven betting edges. The historical top-four data omits losing starters and cannot establish a barrier success rate. The free PuntersEdge plan does not provide a long point-in-time odds archive or genuine pre-race same-race multi combination quotes; enter the *actual combined quote* for a paper multi rather than multiplying leg prices.

## Run locally

From this directory, run `python3 -m http.server 8767 --bind 127.0.0.1` and open `http://127.0.0.1:8767/`. Static research and the manual paper workspace work without any credentials. The optional API function is a Vercel endpoint and will be unavailable under this plain local server.

## Deploy on Vercel

Import this repository as a Vercel project. Choose **Other** as the framework, leave the build command empty, and use the repository root as the output directory. A push to the configured production branch (normally `main`) triggers a production deployment through Vercel's Git integration.

The protected race feed is disabled until **both** of these Production environment variables are set in the Vercel project. The owner can request today's card or a card up to three days ahead, including tomorrow's Cup Day acceptances:

| Name | Value |
| --- | --- |
| `PUNTERSEDGE_API_KEY` | Your private PuntersEdge API key |
| `FORMLINE_ACCESS_CODE` | A long, unique access code you choose for this personal workspace |

Set them in **Project Settings → Environment Variables**, then redeploy so the function receives them. Do not put either value in Git. Enter only the FormLine access code on the Research tools page; the PuntersEdge key stays on the server. The gateway accepts only pre-defined Australian horse-racing reads, checks the free-plan credit balance before paid calls, and is never polled automatically. The access code is stored for the browser session. Anyone with that code can spend API credits, so keep it private. There is no shared server-side cache or durable quota counter on the free static setup.

[PuntersEdge's current data licence](https://puntersedge.online/terms) limits Free/Hobby/Standard keys to personal use and excludes showing their prices to other people. This gateway is for the site owner's private research only. Do not share the access code or publish provider snapshots or prices on the public research page under a personal-use plan. The public Cup analysis is editorial and source-linked independently; the other nine race fields can be inspected privately through the protected card after setup.

The browser-saved journal and race board do not sync between devices. Clearing site data removes them unless you exported a backup. Final results settle straightforward paper outcomes; dead heats, scratchings, deductions and unclear terms are marked for manual review. Historical backtesting requires separately collected point-in-time form and odds, including all selections that were considered but skipped.

## Phone app mode

The site includes a manifest, service worker and responsive navigation. On iPhone, open the HTTPS site in Safari, choose **Share → Add to Home Screen**, then open the saved icon. On Android, choose **Install app** or **Add to Home screen**. Standalone mode opens without ordinary browser tabs; a site opened in a normal Safari or Chrome tab cannot hide that browser's controls.

The private localhost application's `.env`, API key, SQLite database and raw acceptance snapshots are excluded from this public repository.
