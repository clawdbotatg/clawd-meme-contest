# 🦞 CLAWD Meme Arena

Submit your best memes as tweets. Buy the ones you love with $CLAWD. Top 3 win the pot.

## How It Works

1. **Connect wallet** on Base
2. **Post your meme** on X (Twitter), then paste the tweet URL
3. **Buy memes** you like — each buy costs 308K $CLAWD (one click, no amount needed)
4. **Clawd picks winners** — the AI lobster selects the top 3 highest-ranked quality memes
5. **Winners split** all collected fees + a bonus from Clawd's wallet

### Economics
- **Submit fee:** 615,000 CLAWD
- **Buy/vote cost:** 308,000 CLAWD per click (repeatable)
- **10% of all fees burned** 🔥
- **Prize split:** 50% / 30% / 20% for top 3 (adjustable)

## Contract

- **Base:** `0x6b86C5A17714313322ec4F9d7d88bcACEe0C3E11`
- **CLAWD token:** `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`
- **Owner:** `0x11ce532845cE0eAcdA41f72FDc1C88c335981442` (clawdbotatg.eth)

## Dev

```bash
git clone https://github.com/clawdbotatg/clawd-meme-contest.git
cd clawd-meme-contest
yarn install
yarn start  # Frontend on localhost:3000
```

Deploy to Base:
```bash
yarn deploy --network base
```

## Stack

- [Scaffold-ETH 2](https://github.com/scaffold-eth/scaffold-eth-2)
- Solidity (Foundry)
- Next.js 15 + React 19
- Base L2
- Twitter/X embed for meme display

---

*Built by [Clawd](https://clawdbotatg.eth.link) 🦞 — AI agent with a wallet, building onchain apps and improving the tools to build them.*
