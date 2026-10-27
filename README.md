# votes26

Local dashboard for the 26th Knesset election (27 October 2026): raw vote counts,
seat allocation by the Bader-Ofer method with surplus agreements, and published polls.

## Run

```
npm start      # http://localhost:8026
npm run dev    # restarts on server code changes
npm test
```

Node.js 20+ and no dependencies.

## Data sources

- **Official results** - the Central Elections Committee per-ballot file
  `https://media26.bechirot.gov.il/files/expb.csv`. Before counting starts it holds
  only a header row, and the dashboard shows "waiting". The server polls it at most
  every 30 seconds. Select the 25th Knesset (2022) to see the dashboard with real data.
- **Turnout** - the Central Elections Committee turnout map files
  (`mapvotes.bechirot.gov.il/data/votes/latest/{municipal,kalpi}_data.json`), with the
  hourly national estimates from gov.il kept in `data/elections.json` (gov.il itself
  blocks scripted requests).
- **Surplus agreements** - Yalkut HaPirsumim 15045 (19 October 2026), linked from the
  committee's candidate lists page.
- **Exit polls** - the public `live-results.json` of the JDN "Barometer" site, empty
  until polls close. Unknown party ids are shown as unmatched lists.
- **Polls** - the seat projection tables on the English Wikipedia page
  "Opinion polling for the 2026 Israeli legislative election" (N12, Kan 11, Channel 13,
  Maariv, Channel 14 and others), cached for 10 minutes.
- **Manual simulation** - enter percentages or votes per list (e.g. from an exit poll),
  or load a poll from the polls tab. Poll seats are converted to estimated vote shares.

## Relay

The elections committee blocks some data-center addresses: from such a server
the 2026 results file and the turnout map files fail, while the 2022 archive,
the exit polls and the polls still work. The relay runs on a machine that can
reach those sites (e.g. a home computer in Israel), downloads them and uploads
each changed file to the server:

1. Put the same `RELAY_TOKEN` in `.env` on both machines (see `.env.example`).
2. On the server, restart the dashboard so it reads `.env`.
3. On the relay machine, set `RELAY_URL` to the server and run `npm run relay`.

The server validates every upload, keeps the latest copy in `var/relay/` and
prefers relay data newer than three minutes; otherwise it downloads directly.

## Seat allocation

`public/lib/allocation.js` implements section 81 of the Knesset Elections Law:
3.25% threshold, general quota, remaining seats by highest average where a pair of
lists with a surplus agreement counts as one list, then the pair's seats are split
between its two lists. The test suite checks that the 2022 national totals reproduce
the official 25th Knesset result exactly.

## Configuration

`data/elections.json` maps ballot letters to list names and blocs, lists the surplus
agreements, and holds the Wikipedia column names used to read the poll tables.
The 2026 agreements were taken from Hebrew Wikipedia; verify them against the
Elections Committee before relying on the numbers.
