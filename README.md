# GLOOMHASH

*One lit screen in a dark room: a live Solana market terminal.*

[![Live site](https://img.shields.io/badge/live-gloomhash.fun-brightgreen)](https://gloomhash.fun)
![Chain](https://img.shields.io/badge/chain-Solana-black)

**Chain:** Solana mainnet (`https://solana-rpc.publicnode.com`)
**Contract address:** `CA_PLACEHOLDER` (not stated yet)

## Overview

GLOOMHASH pairs a Solana token with a market board. The board ranks the
most-boosted Solana tokens from Dexscreener in real time and keeps row one
pinned for the GLOOMHASH contract. The site asks for no wallet, sets no cookies
and runs no trackers.

## Features

- **Live board**: top ten boosted Solana tokens, price, 24h change, volume and
  liquidity, refreshed every minute and paused while the tab is hidden.
- **Pinned row**: row one switches from a dimmed placeholder to live data the
  moment a contract address is stated. Dexscreener and pump.fun are queried in
  parallel and neither blocks the other.
- **Ticker** fed by the same live data.
- **Resilient feed**: exponential backoff, last good data kept on failure.
- **Register pattern**: every external fact (contract, links, sources) is one
  record in `src/register.json` with a state of `stated`, `absent` or
  `unconfirmed`. Absent records render inert, with no link and no copy handler.
- **Address checker**: compares a pasted address to the registry and never
  rejects on shape alone.
- Reduced-motion users get no animation at all.

## Build

```bash
npm install
npm run build          # writes dist/
npm run preview        # static preview of dist/
npm run prove          # build both gate branches and assert them
npm run prove -- --mutate
```

State the contract address at build time:

```bash
GLOOM_CA=<mint address> npm run build
```

PowerShell: `$env:GLOOM_CA = "<mint address>"; npm run build`

The deploy output is `dist/`. Colour literals live only in
`src/styles/tokens.css`, with provenance for each value.

## Links

- Site: https://gloomhash.fun
- X: https://x.com/usegloom
- GitHub: not published yet
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## License

MIT, see [LICENSE](LICENSE).
