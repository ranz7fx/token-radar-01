# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ranz7fx/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ranz7fx/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01) ($1,325 top-10 split).

A token launch radar: it reads one frozen DefiLlama snapshot (758 protocols, fetched
2026-11-14), finds the protocols that record no token, and ranks them by an implied launch
value, priced from the market's own comparables. The dashboard shows the ranked board, a
detail view for every protocol with its model breakdown and farm plan, and the live-token
protocols whose market caps set the multiples.

## What the radar finds

Of the 758 protocols in the snapshot, 342 record no token (no market cap, no CoinGecko id,
no symbol). Most are not launches waiting to happen, so the board applies the exclusion
rule on the snapshot's own fields: out go the bridges, liquid staking and restaking
products, the CEX products, the versioned pools, the names carrying a whole word wrapped,
staked or staking, and the names beginning with an exchange's name. That keeps WBTC,
Binance staked ETH, USDT0 and the bridges off the board. Twenty protocols at or above the
$50M floor pass those tests yet are not on the snapshot's watchlist; they read as product
lines of larger protocols (Sentora Curator, Circle Gateway, USDCx), so the board leaves
them out too and says so. What remains is 178 rows: the 40 watchlist protocols and 138
early finds below the floor.

## The value model (radar-2-comps)

    implied = TVL x multiple(category) x growth x maturity x breadth

- **Multiple.** Median market cap / TVL of the live-token protocols in the same category
  with at least $10M of TVL, each ratio capped at 3.0, shrunk toward the market median,
  clamped to 0.02 to 1.50. A category with fewer than 3 such names takes the market
  median (0.19x) instead. Below $10M of TVL a token can trade hundreds of times above
  the TVL DefiLlama counts, and it says nothing about a large protocol's token.
- **Growth.** 1 + 0.4 x 7-day TVL change, change clamped to -50% to +100%.
- **Maturity.** 0.70 + 0.30 x age / 3y. Longer-running protocols without a token count
  for more.
- **Breadth.** 1 + 0.04 per extra chain, capped at 4 extra chains.

No protocol name is special-cased: the same function scores every row. The dashboard's
model panel shows the comparables table the multiples came from, and each protocol's
detail view shows its own five factors. The page recomputes the value and the farm plan
from the snapshot figures and checks them against the board.

The implied value is the entry's own claim about what a token would be worth if the
protocol's record stayed as it is. It does not predict whether or when a token is issued,
and it is not investment advice. "No token" means the record carries none, not proof
that none exists.

## Farm plans

Every row carries six steps: a fresh wallet, the category's action with a capital sized
to the protocol's TVL, one qualifying action a week, a hold sized to the protocol's age,
claiming only from the protocol's own points page, and a farm log. Each step names what
it costs and how long it takes.

## Running it

Node 22, standard library only. The program reads the sealed snapshot from
`/input/snapshot.json` (or `--input`), writes the ranked board to `/output/board.json`,
the dashboard's data to `/output/data.js`, copies `dashboard/` and `screenshots/` to
`/output`, and writes `/output/dossier.json` with the vendored make.fun library.

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

## Layout

- `main.ts` — entrypoint, reads the snapshot, writes the outputs.
- `lib/model.ts` — the snapshot parser, the comparables model, the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`, plus the
  self-hosted Console theme tokens (`tokens.css`, `base.css`) and fonts.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.

## License

MIT. See `LICENSE`.
