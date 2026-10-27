# votes26

Local dashboard for the 26th Knesset election (27 October 2026): raw vote counts,
seat allocation by the Bader-Ofer method with surplus agreements, and published polls.

## Run

```
npm start      # http://localhost:8026
npm test
```

Node.js 20+ and no dependencies.

## Data sources

- **Official results** - the Central Elections Committee per-ballot file
  `https://media26.bechirot.gov.il/files/expb.csv`. Before counting starts it holds
  only a header row, and the dashboard shows "waiting". The server polls it at most
  every 30 seconds. Select the 25th Knesset (2022) to see the dashboard with real data.
- **Polls** - the seat projection tables on the English Wikipedia page
  "Opinion polling for the 2026 Israeli legislative election" (N12, Kan 11, Channel 13,
  Maariv, Channel 14 and others), cached for 10 minutes.
- **Manual simulation** - enter percentages or votes per list (e.g. from an exit poll),
  or load a poll from the polls tab. Poll seats are converted to estimated vote shares.

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
