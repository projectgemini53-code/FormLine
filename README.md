# FormLine · Melbourne Cup Day research

A static, source-linked research site for all ten Flemington races on 3 November 2026, with 24 Melbourne Cup runner dossiers and a dated Inside track section. It can deploy to Vercel's free Hobby plan. It does not use PuntersEdge, place bets, or require a server database. Cup favourite and placement marks save in the visitor's browser.

## Run locally

From this folder, run `python3 -m http.server 8767 --bind 127.0.0.1` and open `http://127.0.0.1:8767/`.

## Deploy on Vercel

Import this repository as a Vercel project. Select **Other** as the framework preset, leave the build command empty, and use the repository root as the output directory. No environment variables or database are needed.

## Phone app mode

The site includes a web app manifest, service worker, and responsive navigation drawer. On iPhone, open the HTTPS site in Safari and choose **Share → Add to Home Screen**. On Android, choose **Install app** or **Add to Home screen**. Launch from the saved icon to use standalone mode without ordinary browser tabs. A website cannot hide Safari or Chrome controls while it remains in a normal tab.

The analysis and Inside track reports are dated snapshots. They do not automatically refresh odds, scratchings, ground or results. Check the linked VRC, Racing.com and Bureau of Meteorology sources before each race. A stable comment is an interested opinion and a form watchlist is not a verified betting edge.

The private local analytics application, its API key, full acceptance snapshot and SQLite database are excluded from this public repository.
