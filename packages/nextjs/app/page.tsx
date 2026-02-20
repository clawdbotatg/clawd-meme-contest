"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { Address as AddressComponent } from "@scaffold-ui/components";
import { notification } from "~~/utils/scaffold-eth";

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

/** On mobile, redirect the user to their wallet app to sign the pending tx */
const WALLET_DEEP_LINKS: Record<string, string> = {
  metamask: "https://metamask.app.link/",
  rainbow: "https://rnbwapp.com/",
  coinbase: "https://go.cb-w.com/",
  trust: "https://link.trustwallet.com/",
  phantom: "https://phantom.app/ul/browse/",
};

const openWalletForSigning = (connectorName?: string) => {
  if (typeof window === "undefined") return;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!isMobile) return;
  // Skip if we're already inside a wallet's in-app browser
  if (window.ethereum) return;

  // Check connector name, recent connector, and WalletConnect session data
  const parts = [connectorName || ""];
  try {
    const recent = localStorage.getItem("wagmi.recentConnectorId");
    if (recent) parts.push(recent);
    const wcKey = Object.keys(localStorage).find(k => k.startsWith("wc@2:client"));
    if (wcKey) parts.push(localStorage.getItem(wcKey) || "");
  } catch { /* private browsing */ }
  const search = parts.join(" ").toLowerCase();

  const link = Object.entries(WALLET_DEEP_LINKS).find(([k]) => search.includes(k))?.[1];
  if (link) {
    window.open(link, "_self");
  }
};

const fmtC = (val: bigint | undefined) => {
  if (!val) return "0";
  const num = Number(formatEther(val));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toFixed(0);
};

const fmtCFull = (val: bigint | undefined) => {
  if (!val) return "0";
  return Number(formatEther(val)).toLocaleString();
};

let _clawdPriceUsd: number | null = null;
const fmtUsd = (clawdAmount: bigint | undefined) => {
  if (!clawdAmount || !_clawdPriceUsd) return "";
  const usd = Number(formatEther(clawdAmount)) * _clawdPriceUsd;
  if (usd < 0.01) return "";
  return `(~$${usd < 1 ? usd.toFixed(2) : usd < 100 ? usd.toFixed(1) : Math.round(usd).toLocaleString()})`;
};

/** Extract tweet ID from an x.com or twitter.com URL */
function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

/** Validate tweet URL format */
function isValidTweetUrl(url: string): boolean {
  return /^https:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url);
}

type Meme = {
  id: bigint;
  creator: string;
  tweetUrl: string;
  totalVotes: bigint;
  submittedAt: bigint;
  prizeAmount: bigint;
};

type SortMode = "top" | "new";

/* ═══════════════════════════════════════════
   TWEET EMBED COMPONENT
   ═══════════════════════════════════════════ */
function TweetEmbed({ tweetId, className }: { tweetId: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !tweetId) return;
    const el = containerRef.current;
    el.innerHTML = "";

    // Load Twitter widgets.js if not already loaded
    const win = window as unknown as {
      twttr?: {
        widgets: { createTweet: (id: string, el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLElement> };
      };
    };
    const render = () => {
      win
        .twttr!.widgets.createTweet(tweetId, el, {
          theme: "dark",
          dnt: true,
          conversation: "none",
          align: "center",
        })
        .then(() => setLoaded(true));
    };

    if (win.twttr?.widgets) {
      render();
    } else {
      // Load the script
      if (!document.getElementById("twitter-wjs")) {
        const s = document.createElement("script");
        s.id = "twitter-wjs";
        s.src = "https://platform.twitter.com/widgets.js";
        s.async = true;
        s.onload = () => {
          // widgets.js sets window.twttr after a tick
          const wait = setInterval(() => {
            if (win.twttr?.widgets) {
              clearInterval(wait);
              render();
            }
          }, 50);
        };
        document.head.appendChild(s);
      } else {
        // Script tag exists but maybe still loading
        const wait = setInterval(() => {
          if (win.twttr?.widgets) {
            clearInterval(wait);
            render();
          }
        }, 50);
      }
    }
  }, [tweetId]);

  return (
    <div className={className} style={{ background: "#15202b", minHeight: loaded ? undefined : 200 }}>
      <div ref={containerRef} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   MEME CARD
   ═══════════════════════════════════════════ */
function MemeCard({
  meme,
  rank,
  maxVotes,
  isActive,
  isConnected,
  onBuy,
  isBuying,
}: {
  meme: Meme;
  rank: number;
  maxVotes: bigint;
  isActive: boolean;
  isConnected: boolean;
  onBuy: (id: number) => void;
  isBuying: boolean;
}) {
  const tweetId = extractTweetId(meme.tweetUrl);
  const pct = maxVotes > 0n ? Math.min(Number((meme.totalVotes * 100n) / maxVotes), 100) : 0;
  const hasPrize = meme.prizeAmount > 0n;

  return (
    <div className={`meme-card ${hasPrize ? "winner-card winner-glow" : ""}`}>
      {/* Rank badge */}
      {rank < 3 && (
        <div
          className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black font-mono"
          style={{
            backgroundColor: rank === 0 ? "#ffd700" : rank === 1 ? "#aaa" : "#8b6914",
            color: "#000",
          }}
        >
          {rank + 1}
        </div>
      )}

      {/* Prize badge — big overlay */}
      {hasPrize && (
        <div className="absolute top-3 right-3 z-10 bg-[#ffd700] text-black text-lg font-black px-4 py-2 rounded-lg uppercase tracking-wider shadow-lg shadow-[#ffd700]/30">
          🏆 {fmtC(meme.prizeAmount)} CLAWD {fmtUsd(meme.prizeAmount)}
        </div>
      )}

      {/* Tweet embed */}
      <div className="min-h-[150px]" style={{ background: "#000", overflow: "hidden" }}>
        {tweetId ? (
          <TweetEmbed tweetId={tweetId} />
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-600 text-xs font-mono px-3 text-center break-all">
            {meme.tweetUrl}
          </div>
        )}
      </div>

      {/* Vote bar */}
      <div className="h-1 bg-white/5">
        <div className="h-full vote-bar" style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>

      {/* Info + action strip */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <a
            href={`https://basescan.org/address/${meme.creator}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-600 font-mono hover:text-gray-400 transition-colors"
          >
            {meme.creator.slice(0, 6)}...{meme.creator.slice(-4)}
          </a>
          <div className="text-right">
            <span className="text-[13px] font-black font-mono text-[#39ff14]">{fmtC(meme.totalVotes)}</span>
            <span className="text-[9px] text-gray-600 font-mono ml-1">CLAWD</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 mt-2">
          <a
            href={meme.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded px-2 py-1.5 text-[10px] font-mono text-gray-400 hover:text-white transition-all"
          >
            VIEW ON 𝕏
          </a>
          {isActive && isConnected && (
            <button
              onClick={() => onBuy(Number(meme.id))}
              disabled={isBuying}
              className="btn-vote flex-1 px-3 py-1.5 text-[10px] font-black"
            >
              {isBuying ? "..." : "BUY 🔥"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */
const Home: NextPage = () => {
  const { address: connectedAddress, isConnected, connector } = useAccount();
  const [showSubmit, setShowSubmit] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [tweetUrl, setTweetUrl] = useState("");
  const [tweetUrlError, setTweetUrlError] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buyingMemeId, setBuyingMemeId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("top");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [clawdPriceUsd, setClawdPriceUsd] = useState<number | null>(null); // triggers re-render when price loads

  // Fetch CLAWD price from DexScreener
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07");
        const data = await res.json();
        const pair = data.pairs?.[0];
        if (pair?.priceUsd) {
          const price = parseFloat(pair.priceUsd);
          _clawdPriceUsd = price;
          setClawdPriceUsd(price);
        }
      } catch { /* silent */ }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Admin states
  const [bonusAmount, setBonusAmount] = useState("");
  const [isDistributing, setIsDistributing] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState<number[]>([]);

  /* ═══ Contract reads ═══ */
  const { data: contestInfo, refetch: refetchContest } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "getContestInfo",
  });
  const { data: allMemes, refetch: refetchMemes } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "getAllMemes",
  });
  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "totalBurned",
  });
  const { data: submissionFee } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "submissionFee",
  });
  const { data: voteCost } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "voteCost",
  });
  const { data: contractOwner } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "owner",
  });
  const { data: contractInfo2 } = useDeployedContractInfo({ contractName: "ClawdMemeContest" });
  const contestAddress = contractInfo2?.address;

  // clawdBalance displayed in SE2 header
  useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [connectedAddress],
  });
  const { data: clawdAllowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [connectedAddress, contestAddress],
  });

  /* ═══ Contract writes ═══ */
  const { writeContractAsync: writeContest } = useScaffoldWriteContract({ contractName: "ClawdMemeContest" });
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const publicClient = usePublicClient();

  /** Approve tokens and wait for the tx to be mined before returning */
  const approveAndWait = async (amount: bigint) => {
    openWalletForSigning(connector?.name);
    const txHash = await writeClawd({ functionName: "approve", args: [contestAddress, amount] });
    if (publicClient && txHash) {
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await refetchAllowance();
    }
  };

  /* ═══ Derived ═══ */
  // Phase: 0=Inactive, 1=Active, 2=Completed
  const phase = contestInfo ? Number(contestInfo[0]) : 0;
  const contestEnd = contestInfo ? Number(contestInfo[2]) : 0;
  const _contestId = contestInfo ? Number(contestInfo[3]) : 0; // eslint-disable-line @typescript-eslint/no-unused-vars
  const contractBalance = contestInfo ? contestInfo[4] : 0n;
  const isAdmin = connectedAddress && contractOwner && connectedAddress.toLowerCase() === contractOwner.toLowerCase();
  const isActive = phase === 1;
  const isCompleted = phase === 2;

  /* ═══ Sort memes ═══ */
  const sortedMemes = useMemo(() => {
    if (!allMemes) return [];
    // Deduplicate by meme id (prevents double-render on refetch race)
    const seen = new Set<string>();
    const memes = ([...allMemes] as Meme[]).filter(m => {
      const key = m.id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    switch (sortMode) {
      case "top":
        return memes.sort((a, b) => (b.totalVotes > a.totalVotes ? 1 : b.totalVotes < a.totalVotes ? -1 : 0));
      case "new":
        return memes.sort((a, b) => (b.submittedAt > a.submittedAt ? 1 : b.submittedAt < a.submittedAt ? -1 : 0));
      default:
        return memes;
    }
  }, [allMemes, sortMode]);

  const maxVotes = useMemo(() => {
    if (!allMemes || allMemes.length === 0) return 0n;
    return [...allMemes].reduce((max, m) => (m.totalVotes > max ? m.totalVotes : max), 0n);
  }, [allMemes]);

  /* ═══ Countdown ═══ */
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const isEnded = isActive && now > contestEnd;

  const countdown = (end: number) => {
    const diff = end - now;
    if (diff <= 0) return "TIME'S UP";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  /* ═══ (connect handled by SE2 Header) ═══ */

  /* ═══════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════ */

  const handleSubmitMeme = async () => {
    if (!tweetUrl) return;
    if (!isValidTweetUrl(tweetUrl)) {
      setTweetUrlError("Only X posts allowed — paste a tweet URL like https://x.com/user/status/123");
      return;
    }
    setTweetUrlError("");

    const fee = submissionFee || 0n;
    const currentAllowance = clawdAllowance || 0n;

    if (currentAllowance < fee) {
      setIsApproving(true);
      try {
        await approveAndWait(fee * 4n);
      } catch {
        notification.error("Approval failed");
        setIsApproving(false);
        return;
      }
      setIsApproving(false);
    }

    setIsSubmitting(true);
    try {
      openWalletForSigning(connector?.name);
      await writeContest({ functionName: "submitMeme", args: [tweetUrl] });
      notification.success("Meme submitted! 🦞");
      setShowSubmit(false);
      setTweetUrl("");
      // Small delay before refetch to let chain state settle
      setTimeout(() => {
        refetchMemes();
        refetchContest();
      }, 3000);
    } catch {
      notification.error("Submission failed");
    }
    setIsSubmitting(false);
  };

  const handleBuy = async (memeId: number) => {
    const cost = voteCost || 0n;
    const currentAllowance = clawdAllowance || 0n;

    if (currentAllowance < cost) {
      setBuyingMemeId(memeId);
      try {
        await approveAndWait(cost * 4n);
      } catch {
        notification.error("Approval failed");
        setBuyingMemeId(null);
        return;
      }
    }

    setBuyingMemeId(memeId);
    try {
      openWalletForSigning(connector?.name);
      await writeContest({ functionName: "vote", args: [BigInt(memeId)] });
      notification.success("Bought! 🔥");
      setTimeout(() => {
        refetchMemes();
        refetchContest();
      }, 3000);
    } catch {
      notification.error("Buy failed");
    }
    setBuyingMemeId(null);
  };

  const toggleWinner = (memeId: number) => {
    setSelectedWinners(prev => {
      if (prev.includes(memeId)) return prev.filter(id => id !== memeId);
      if (prev.length >= 3) {
        notification.error("Max 3 winners");
        return prev;
      }
      return [...prev, memeId];
    });
  };

  const handleDistribute = async () => {
    if (selectedWinners.length === 0) {
      notification.error("Select 1-3 winners");
      return;
    }

    setIsDistributing(true);
    try {
      // Calculate split: contract balance + bonus, split among winners
      // Top winner gets most, etc. Simple split: 50/30/20 for 3, 60/40 for 2, 100 for 1
      const bonus = bonusAmount ? parseEther(bonusAmount) : 0n;
      const total = (contractBalance || 0n) + bonus;

      let amounts: bigint[];
      if (selectedWinners.length === 1) {
        amounts = [total];
      } else if (selectedWinners.length === 2) {
        amounts = [(total * 60n) / 100n, (total * 40n) / 100n];
      } else {
        amounts = [(total * 50n) / 100n, (total * 30n) / 100n, (total * 20n) / 100n];
      }

      // Approve bonus if needed
      if (bonus > 0n) {
        const currentAllowance = clawdAllowance || 0n;
        if (currentAllowance < bonus) {
          await approveAndWait(bonus);
        }
      }

      const ids = selectedWinners.map(id => BigInt(id));
      openWalletForSigning(connector?.name);
      await writeContest({
        functionName: "distributePrizes",
        args: [ids, amounts, bonus > 0n ? bonus : 0n],
      });
      notification.success("Prizes distributed! 🏆");
      setSelectedWinners([]);
      setBonusAmount("");
      refetchMemes();
      refetchContest();
    } catch (e: any) {
      notification.error("Distribution failed: " + (e?.message?.slice(0, 100) || "unknown error"));
    }
    setIsDistributing(false);
  };

  /* ═══════════════════════════════════════
     RENDER
     ═══════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-black text-white scanlines">
      {/* ═══ STATUS BAR ═══ */}
      <div className="max-w-[1400px] mx-auto px-3 py-2 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          {/* Phase + countdown */}
          {isActive && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#39ff14]/10 border border-[#39ff14]/20">
              <div className="live-dot" style={{ background: "#39ff14" }} />
              <span className="text-[10px] font-black tracking-wider text-[#39ff14]">
                {isEnded ? "TIME'S UP" : "LIVE"}
              </span>
              {!isEnded && contestEnd > 0 && (
                <span className="text-[11px] font-mono font-bold text-[#39ff14] flicker">{countdown(contestEnd)}</span>
              )}
            </div>
          )}
          {isCompleted && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#ffd700]/10 border border-[#ffd700]/20">
              <span className="text-[10px] font-black tracking-wider text-[#ffd700]">WINNERS CROWNED 🏆</span>
            </div>
          )}

          {/* Stats */}
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 bg-white/[0.02] rounded-lg border border-white/[0.04]">
            <span className="text-[9px] text-gray-600 font-mono">POOL</span>
            <span className="text-[11px] font-black font-mono text-[#ffd700]">{fmtC(contractBalance)} <span className="text-gray-600 font-normal">{fmtUsd(contractBalance)}</span></span>
          </div>
          <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 bg-white/[0.02] rounded-lg border border-white/[0.04]">
            <span className="text-[9px] text-gray-600 font-mono">BURN</span>
            <span className="text-[11px] font-black font-mono text-[#ff3366]">{fmtC(totalBurned)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Submit */}
          {isActive && !isEnded && isConnected && (
            <button onClick={() => setShowSubmit(true)} className="btn-hot px-3 py-1.5 text-[10px]">
              SUBMIT MEME
            </button>
          )}

          {/* Admin */}
          {isAdmin && (isEnded || isCompleted) && (
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className="text-[#ffd700] hover:text-[#ffdd33] transition-colors text-[10px] font-mono font-bold border border-[#ffd700]/30 px-2 py-1 rounded"
            >
              JUDGE
            </button>
          )}
        </div>
      </div>

      {/* ═══ SORT TABS + COUNT ═══ */}
      {sortedMemes.length > 0 && (
        <div className="max-w-[1400px] mx-auto px-3 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button className={`sort-tab ${sortMode === "top" ? "active" : ""}`} onClick={() => setSortMode("top")}>
              TOP
            </button>
            <button className={`sort-tab ${sortMode === "new" ? "active" : ""}`} onClick={() => setSortMode("new")}>
              NEW
            </button>
          </div>
          <div className="text-[11px] text-gray-600 font-mono">
            {sortedMemes.length} meme{sortedMemes.length !== 1 ? "s" : ""}
            {voteCost && <span className="ml-2 text-gray-700">buy = {fmtC(voteCost)} CLAWD {fmtUsd(voteCost)}</span>}
          </div>
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      {sortedMemes.length > 0 ? (
        /* ═══ MEME GRID ═══ */
        <div className="max-w-[1400px] mx-auto px-2 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {sortedMemes.map((meme, rank) => (
              <MemeCard
                key={Number(meme.id)}
                meme={meme as Meme}
                rank={rank}
                maxVotes={maxVotes}
                isActive={isActive && !isEnded}
                isConnected={isConnected}
                onBuy={handleBuy}
                isBuying={buyingMemeId === Number(meme.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* ═══ NO MEMES YET ═══ */
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          {isActive && !isEnded ? (
            <>
              <h2 className="text-3xl font-black text-white mb-3 font-mono">THE ARENA IS EMPTY</h2>
              <p className="text-gray-500 font-mono text-sm mb-6">
                Be the first to submit a meme. Post your meme as a tweet, then paste the URL here.
              </p>
              {isConnected ? (
                <button onClick={() => setShowSubmit(true)} className="btn-hot px-8 py-3 text-sm">
                  SUBMIT FIRST MEME
                </button>
              ) : (
                <RainbowKitCustomConnectButton />
              )}
              <p className="text-gray-700 font-mono text-[10px] mt-3">costs {fmtC(submissionFee)} CLAWD {fmtUsd(submissionFee)} · 10% burned</p>
            </>
          ) : isCompleted ? (
            <>
              <h2 className="text-2xl font-black text-[#ffd700] mb-2 font-mono">CONTEST COMPLETE</h2>
              <p className="text-gray-600 font-mono text-xs">Winners have been crowned. Next contest coming soon.</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-gray-500 mb-2 font-mono">NO ACTIVE CONTEST</h2>
              <p className="text-gray-700 font-mono text-xs">Check back later.</p>
            </>
          )}
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/[0.03] py-5 mt-8">
        <div className="max-w-[1400px] mx-auto px-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-[10px] text-gray-700 font-mono">
            submit: {fmtC(submissionFee)} CLAWD · buy: {fmtC(voteCost)} CLAWD · 10% burned · top 3 win
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-700 font-mono">
            {contestAddress && (
              <AddressComponent address={contestAddress} size="xs" />
            )}
            <span className="text-gray-800">·</span>
            <a
              href="https://clawdbotatg.eth.link"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff00ff]/40 hover:text-[#ff00ff] transition-colors"
            >
              built by clawd 🦞
            </a>
          </div>
        </div>
      </footer>

      {/* Bottom padding so content is scrollable past fold on mobile */}
      <div className="pb-32" />

      {/* ═══ SUBMIT MODAL ═══ */}
      {showSubmit && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setShowSubmit(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-[#ff00ff]/20 rounded-xl p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-black text-white font-mono tracking-wider uppercase">SUBMIT MEME</h3>
              <button onClick={() => setShowSubmit(false)} className="text-gray-500 hover:text-white transition-colors">
                ✕
              </button>
            </div>
            <p className="text-[10px] text-gray-600 font-mono mb-4">
              Post your meme on X first, then paste the tweet URL here.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1 block">
                  Tweet URL
                </label>
                <input
                  type="text"
                  value={tweetUrl}
                  onChange={e => {
                    setTweetUrl(e.target.value);
                    setTweetUrlError("");
                  }}
                  className={`w-full bg-black border rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none placeholder-gray-700 ${
                    tweetUrlError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-white/10 focus:border-[#ff00ff]/40"
                  }`}
                  placeholder="https://x.com/you/status/123456789"
                />
                {tweetUrlError && <p className="text-red-400 text-[10px] font-mono mt-1">{tweetUrlError}</p>}
                <p className="text-gray-700 text-[9px] font-mono mt-1">Only X (twitter.com / x.com) posts allowed</p>
              </div>

              {/* Tweet preview */}
              {tweetUrl && isValidTweetUrl(tweetUrl) && extractTweetId(tweetUrl) && (
                <div className="bg-[#080808] rounded-lg overflow-hidden border border-white/[0.04] max-h-[500px] overflow-y-auto">
                  <TweetEmbed tweetId={extractTweetId(tweetUrl)!} />
                </div>
              )}

              <div className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2.5">
                <span className="text-[10px] text-gray-500 font-mono">Entry fee</span>
                <div className="text-right">
                  <span className="text-sm font-black font-mono text-[#ff00ff]">{fmtCFull(submissionFee)} CLAWD <span className="text-gray-500 font-normal text-xs">{fmtUsd(submissionFee)}</span></span>
                  <span className="text-[9px] text-gray-600 font-mono ml-1.5">(10% burned)</span>
                </div>
              </div>

              {!isConnected ? (
                <div className="flex justify-center py-3">
                  <RainbowKitCustomConnectButton />
                </div>
              ) : (
                <button
                  onClick={handleSubmitMeme}
                  disabled={!tweetUrl || isApproving || isSubmitting}
                  className="btn-hot w-full py-3 text-sm"
                >
                  {isApproving ? "APPROVING..." : isSubmitting ? "SUBMITTING..." : "SUBMIT"}
                </button>
              )}

              <p className="text-center text-[9px] text-gray-700 font-mono">no refunds. choose wisely.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADMIN / JUDGE MODAL ═══ */}
      {showAdmin && isAdmin && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setShowAdmin(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-[#ffd700]/20 rounded-xl p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-[#ffd700] font-mono tracking-wider uppercase">🦞 PICK WINNERS</h3>
              <button onClick={() => setShowAdmin(false)} className="text-gray-500 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-[11px] text-gray-500 font-mono mb-4">
              Select up to 3 winning memes. Prize split:{" "}
              {selectedWinners.length === 1 ? "100%" : selectedWinners.length === 2 ? "60/40" : "50/30/20"}. All CLAWD
              in the contract ({fmtCFull(contractBalance)}) + your bonus goes to winners.
            </p>

            {/* Meme list for selection */}
            <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
              {[...(allMemes || [])]
                .sort((a: any, b: any) => (b.totalVotes > a.totalVotes ? 1 : b.totalVotes < a.totalVotes ? -1 : 0))
                .map((meme: any) => {
                  const isSelected = selectedWinners.includes(Number(meme.id));
                  return (
                    <div
                      key={Number(meme.id)}
                      onClick={() => toggleWinner(Number(meme.id))}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                        isSelected
                          ? "bg-[#ffd700]/10 border-[#ffd700]/30"
                          : "bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${
                            isSelected ? "bg-[#ffd700] text-black" : "bg-white/[0.05] text-gray-600"
                          }`}
                        >
                          {isSelected ? selectedWinners.indexOf(Number(meme.id)) + 1 : ""}
                        </div>
                        <span className="text-[11px] font-mono text-gray-400 truncate">{meme.tweetUrl}</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-[#39ff14] shrink-0 ml-2">
                        {fmtC(meme.totalVotes)}
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Bonus amount */}
            <div className="bg-white/[0.03] rounded-lg p-3 mb-3">
              <label className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1 block">
                Bonus CLAWD from your wallet (optional)
              </label>
              <input
                type="text"
                value={bonusAmount}
                onChange={e => setBonusAmount(e.target.value)}
                className="w-full bg-black border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#ffd700]/50 placeholder-gray-700"
                placeholder="0"
              />
              <p className="text-[9px] text-gray-700 font-mono mt-1">
                This gets pulled from your wallet and added to the prize pool before distribution.
              </p>
            </div>

            {/* Summary */}
            {selectedWinners.length > 0 && (
              <div className="bg-white/[0.03] rounded-lg p-3 mb-3">
                <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-2">
                  Prize Split Preview
                </div>
                {(() => {
                  const bonus = bonusAmount ? parseEther(bonusAmount) : 0n;
                  const total = (contractBalance || 0n) + bonus;
                  const splits =
                    selectedWinners.length === 1 ? [100n] : selectedWinners.length === 2 ? [60n, 40n] : [50n, 30n, 20n];
                  return selectedWinners.map((id, i) => (
                    <div key={id} className="flex justify-between text-[11px] font-mono py-0.5">
                      <span className="text-gray-400">
                        #{i + 1} (meme {id})
                      </span>
                      <span className="text-[#ffd700] font-bold">{fmtCFull((total * splits[i]) / 100n)} CLAWD</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            <button
              onClick={handleDistribute}
              disabled={selectedWinners.length === 0 || isDistributing}
              className="btn-hot w-full py-3 text-sm bg-[#ffd700] hover:bg-[#ffdd33] text-black"
              style={{ boxShadow: "0 3px 0 #b39600" }}
            >
              {isDistributing
                ? "DISTRIBUTING..."
                : `DISTRIBUTE TO ${selectedWinners.length} WINNER${selectedWinners.length !== 1 ? "S" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
