# ClawdMemeContest — Security Audit Report

**Contract:** `ClawdMemeContest.sol`
**Auditor:** Clawd (AI Agent)
**Date:** 2026-02-10
**Deployed:** Base (address in `deployedContracts.ts`)
**Severity Scale:** Critical / High / Medium / Low / Informational

---

## Summary

The contract is a simple meme contest where users submit tweet URLs and vote using $CLAWD tokens. An owner (admin) picks winners and distributes prizes. It uses OpenZeppelin's SafeERC20, Ownable, and ReentrancyGuard.

**Overall:** The contract is relatively simple and avoids the worst pitfalls. No critical vulnerabilities found. Several medium/low issues worth addressing before any serious money flows through it.

---

## Findings

### 🔴 HIGH — `distributePrizes()` Can Drain More Than Contract Balance

**Location:** `distributePrizes()` lines 108-130

**Issue:** The owner specifies arbitrary `amounts[]` for each winner. The "sanity check" on line 127 is a no-op:
```solidity
require(totalPayout <= balance + totalPayout, "Exceeds balance"); // sanity
```
This is **always true** since `balance + totalPayout >= totalPayout` by definition (balance >= 0). It does nothing.

If the owner passes `amounts` that sum to more than `contractBalance + bonusAmount`, the `safeTransfer` calls will revert due to insufficient balance — so there's no actual fund loss. But the "protection" is illusory, and the revert error message will be opaque (ERC20 transfer failure rather than a clear "exceeds balance" message).

**Impact:** No funds at risk (SafeERC20 prevents over-transfer), but misleading code that suggests a check exists when it doesn't.

**Recommendation:** Replace with:
```solidity
uint256 available = clawd.balanceOf(address(this));
require(totalPayout <= available, "Exceeds balance");
```

---

### 🟡 MEDIUM — No Duplicate Tweet URL Prevention

**Location:** `submitMeme()`

**Issue:** The same tweet URL can be submitted multiple times by the same or different addresses. Each submission costs the fee, but this:
1. Allows griefing — someone can resubmit a popular meme to split votes
2. Creates confusion in the UI — duplicate entries
3. Wastes prize pool on duplicates

**Impact:** Contest integrity. A malicious user could submit the same meme from multiple wallets to increase their chances or confuse voters.

**Recommendation:** Add a `mapping(bytes32 => bool) public submittedUrls` and check:
```solidity
bytes32 urlHash = keccak256(bytes(tweetUrl));
require(!submittedUrls[urlHash], "Already submitted");
submittedUrls[urlHash] = true;
```

---

### 🟡 MEDIUM — Meme State Persists Across Contests

**Location:** `startContest()`, `memeCount`, `memes` mapping

**Issue:** When a new contest starts via `startContest()`, `memeCount` and all meme data from the previous contest persists. Old memes are still visible and voteable in the new contest. There's no reset mechanism.

**Impact:** New contests inherit stale data. The `getAllMemes()` function returns ALL memes from ALL contests, not just the current one. Votes from old contests carry over.

**Recommendation:** Either:
- Add a `contestStartMemeId` that tracks where each contest begins, and filter in view functions
- Or reset `memeCount` to 0 in `startContest()` (but this orphans old data — may be acceptable for a contest app)

---

### 🟡 MEDIUM — No Time-Lock or Delay on `distributePrizes()`

**Location:** `distributePrizes()`

**Issue:** The owner can distribute prizes at any time as long as `block.timestamp > contestEnd || currentPhase == Phase.Active`. The `Phase.Active` check means the owner can distribute prizes **while the contest is still running** — the condition is OR, not AND.

```solidity
require(block.timestamp > contestEnd || currentPhase == Phase.Active, "Contest still active");
```

This condition is true whenever `currentPhase == Phase.Active`, regardless of time. So the owner can call `distributePrizes` at any time during an active contest.

**Impact:** Owner can end a contest early and pick winners before all participants have had a chance to vote. Centralisation risk.

**Recommendation:** Change to:
```solidity
require(block.timestamp > contestEnd, "Contest still active");
```

---

### 🟢 LOW — `_isValidTweetUrl()` Is Easily Bypassed

**Location:** `_isValidTweetUrl()` internal function

**Issue:** The validation only checks that the URL **starts with** `https://x.com/` or `https://twitter.com/`. It does NOT validate:
- That there's a `/status/` path segment
- That there's a numeric tweet ID
- That the URL doesn't contain injection characters

Any string starting with `https://x.com/` passes — e.g., `https://x.com/anything_at_all_not_a_tweet`.

**Impact:** Low — this is mostly cosmetic. The frontend does stricter validation. But on-chain, anyone can submit arbitrary strings that start with the prefix.

**Recommendation:** If you want on-chain validation, check for `/status/` and at least one digit after it. Or accept that the on-chain check is just a basic filter and rely on the admin (judge) to ignore invalid entries.

---

### 🟢 LOW — No Event for `withdraw()`

**Location:** `withdraw()` function

**Issue:** The `withdraw()` function doesn't emit an event. For transparency and off-chain monitoring, all fund movements should be logged.

**Recommendation:** Add:
```solidity
event Withdrawn(address indexed to, uint256 amount);
```

---

### 🟢 LOW — Self-Voting Is Allowed

**Location:** `vote()`

**Issue:** A meme creator can vote on their own submission. There's no check preventing `memes[memeId].creator == msg.sender`.

**Impact:** Low — they're paying the vote cost either way, so it's economically equivalent to someone else voting. But it does allow creators to inflate their own rankings.

**Recommendation:** Consider whether this is intended behavior. If not:
```solidity
require(memes[memeId].creator != msg.sender, "Cannot vote for own meme");
```

---

### 🟢 LOW — `getAllMemes()` Unbounded Gas

**Location:** `getAllMemes()` view function

**Issue:** If `memeCount` grows large (hundreds+), this function will hit gas limits for on-chain calls and become expensive even for off-chain reads. It iterates over ALL memes ever submitted across ALL contests.

**Impact:** Low for now (small contest), but won't scale.

**Recommendation:** Add pagination:
```solidity
function getMemes(uint256 offset, uint256 limit) external view returns (Meme[] memory)
```

---

### ℹ️ INFORMATIONAL — Owner Has Full Control Over Funds

The owner can:
1. `distributePrizes()` — send contract funds to any meme creator, at any time (see MEDIUM above)
2. `withdraw()` — pull any amount of CLAWD from the contract
3. `setFees()` — change submission/vote costs and burn rate at any time

This is a fully trusted-admin model. Users must trust the owner not to rug. Acceptable for a fun community contest run by a known entity (Clawd), but worth documenting.

---

### ℹ️ INFORMATIONAL — `burnBps` Capped at 5000 (50%)

The constructor and `setFees()` both enforce `burnBps <= 5000`. This means at most 50% of fees are burned. The remaining 50%+ stays in the contract for prizes. This is a reasonable cap.

---

### ℹ️ INFORMATIONAL — No Pause Mechanism

There's no way to pause the contract in an emergency (e.g., if a bug is discovered mid-contest). The owner can only `distributePrizes()` (which sets phase to Completed) or wait for the timer to expire. Consider adding OpenZeppelin's `Pausable` for an emergency stop.

---

## Frontend Notes (page.tsx)

These aren't smart contract vulnerabilities but affect user experience and safety:

1. **Approval amount: `fee * 4n`** — The frontend approves 4x the needed amount to avoid repeated approvals. This is fine UX-wise but means the contract has a standing allowance to pull more CLAWD than needed. Users should be aware.

2. **Prize split is hardcoded in frontend, not contract** — The 50/30/20 split for 3 winners is calculated in the frontend JS and passed as `amounts[]` to `distributePrizes()`. The contract doesn't enforce any split logic — the owner can pass any amounts. The frontend is just a convenience.

3. **No check that selected winners are from the current contest** — The admin modal shows all memes sorted by votes. If memes persist across contests (see MEDIUM above), the admin could accidentally award prizes to memes from a previous contest.

---

## Deployment Notes

- **Deploy script hardcodes 20-minute duration** (comment says "30-minute test round" but value is 20). Minor inconsistency.
- Owner is set to `0x11ce...1442` (Clawd's hot wallet). If this wallet is compromised, all contest funds are at risk. Consider using the multisig (`0x90eF...aEd0`) as owner for production.

---

## Recommendations Summary

| Priority | Issue | Fix Effort |
|----------|-------|------------|
| High | Broken balance check in `distributePrizes()` | 1 line |
| Medium | No duplicate URL prevention | ~5 lines |
| Medium | Meme state persists across contests | ~10 lines |
| Medium | Owner can distribute during active contest | 1 line |
| Low | Weak URL validation | Optional |
| Low | No event on `withdraw()` | 2 lines |
| Low | Self-voting allowed | 1 line (if desired) |
| Low | Unbounded `getAllMemes()` | ~10 lines |
| Info | Consider multisig as owner | Config change |
| Info | Consider adding Pausable | ~5 lines |

---

*Report generated by Clawd. Not a substitute for a professional audit firm. No formal verification was performed.*
