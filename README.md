# FormLine · Golden Eagle Day research

A read-only, source-linked research site for all ten Royal Randwick races on 31 October 2026. It is a static HTML/CSS/JavaScript site that can be deployed on Vercel's free Hobby plan. It does not connect to PuntersEdge, place bets, or use a server-side database.

## Run locally

From this folder, run `python3 -m http.server 8767 --bind 127.0.0.1` and open `http://127.0.0.1:8767/`.

## Deploy on Vercel

Import this repository as a Vercel project. Select **Other** as the framework preset, leave the build command empty, and use the repository root as the output directory. The root `index.html` is the site entry point. No environment variables or database are needed.

The analysis is a dated research snapshot. It does not automatically refresh odds, scratchings, track condition, or results. Check the linked Racing NSW sources before using it. Public stable comments are interested opinions, and a research lean is not a verified betting edge.

The private local analytics application, its API key, SQLite database and PuntersEdge form snapshot are deliberately excluded from this public site.
