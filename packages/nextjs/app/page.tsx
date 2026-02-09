"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

/* ═══════════════════════════════════════════
   CONSTANTS & TYPES
   ═══════════════════════════════════════════ */
const PHASE_LABELS = ["CLOSED", "ACCEPTING MEMES", "VOTING IS LIVE", "THE LOBSTER JUDGES", "WINNERS CROWNED"] as const;
const PHASE_COLORS = ["#555", "#39ff14", "#ff00ff", "#ffd700", "#ffd700"];

// Ticker flavor lines — concise, no emoji spam
const FLAVOR_LINES = [
  "judged by an AI lobster with a crypto wallet",
  "submit memes. receive CLAWD. simple as.",
  "vote with your bags, not your feelings",
  "bad memes get zero votes. skill issue.",
  "this entire app was built by an AI. cope.",
  "your meme → the arena → glory or dust",
];

type Meme = {
  id: bigint;
  creator: string;
  imageUri: string;
  title: string;
  totalVotes: bigint;
  submittedAt: bigint;
  winner: boolean;
  prizeAmount: bigint;
};

type SortMode = "top" | "new" | "winners";

/* ═══════════════════════════════════════════
   FORMATTERS
   ═══════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════
   TICKER MARQUEE
   ═══════════════════════════════════════════ */
function Ticker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden bg-[#060606] border-b border-white/[0.03] py-1.5">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="text-[11px] font-mono text-gray-500 whitespace-nowrap px-6">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MEME CARD — image-first, dense, personality
   ═══════════════════════════════════════════ */
function MemeCard({
  meme,
  rank,
  maxVotes,
  phase,
  onPreview,
  onVote,
  voteAmount,
  setVoteAmount,
  votingMemeId,
  isVoteApproving,
}: {
  meme: Meme;
  rank: number;
  maxVotes: bigint;
  phase: number;
  onPreview: (m: Meme) => void;
  onVote: (id: number) => void;
  voteAmount: string;
  setVoteAmount: (id: number, v: string) => void;
  votingMemeId: number | null;
  isVoteApproving: boolean;
}) {
  const pct = maxVotes > 0n ? Math.min(Number((meme.totalVotes * 100n) / maxVotes), 100) : 0;
  const isVoting = votingMemeId === Number(meme.id);

  return (
    <div
      className={`meme-card ${meme.winner ? "winner-card winner-glow" : ""}`}
      onClick={() => onPreview(meme)}
    >
      {/* Image — fills card, no padding */}
      <div className="relative aspect-[4/3] bg-[#080808] overflow-hidden">
        {meme.imageUri ? (
          <img
            src={meme.imageUri}
            alt={meme.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={e => {
              (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect fill='%23080808' width='400' height='300'/><text x='200' y='155' text-anchor='middle' fill='%23222' font-size='12' font-family='monospace'>NO IMAGE</text></svg>`;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-800 font-mono text-xs">NO IMAGE</div>
        )}

        {/* Rank badge */}
        {rank < 3 && (
          <div
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black font-mono"
            style={{
              backgroundColor: rank === 0 ? "#ffd700" : rank === 1 ? "#aaa" : "#8b6914",
              color: "#000",
            }}
          >
            {rank + 1}
          </div>
        )}

        {/* Winner badge */}
        {meme.winner && (
          <div className="absolute top-2 right-2 bg-[#ffd700] text-black text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
            WINNER
          </div>
        )}

        {/* Vote bar at bottom of image */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
          <div className="h-full vote-bar" style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
      </div>

      {/* Info strip — compact */}
      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-bold text-white truncate leading-tight">{meme.title}</h3>
            <a
              href={`https://basescan.org/address/${meme.creator}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-600 font-mono hover:text-gray-400 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              {meme.creator.slice(0, 6)}...{meme.creator.slice(-4)}
            </a>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[13px] font-black font-mono text-[#39ff14]">{fmtC(meme.totalVotes)}</div>
            <div className="text-[9px] text-gray-600 font-mono">CLAWD</div>
          </div>
        </div>

        {/* Prize won */}
        {meme.winner && meme.prizeAmount > 0n && (
          <div className="mt-1.5 text-center bg-[#ffd700]/10 rounded py-1">
            <span className="text-[11px] font-black text-[#ffd700] font-mono">{fmtC(meme.prizeAmount)} CLAWD</span>
          </div>
        )}

        {/* Inline vote — compact */}
        {(phase === 1 || phase === 2) && (
          <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={voteAmount}
              onChange={e => setVoteAmount(Number(meme.id), e.target.value)}
              className="flex-1 min-w-0 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] font-mono text-white placeholder-gray-700 focus:outline-none focus:border-[#ff00ff]/30"
              placeholder="amount"
            />
            <button
              onClick={() => onVote(Number(meme.id))}
              disabled={isVoting}
              className="btn-vote px-3 py-1.5 text-[10px] font-black shrink-0"
            >
              {isVoting ? (isVoteApproving ? "..." : "...") : "VOTE"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */
const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [showAdmin, setShowAdmin] = useState(false);
  const [previewMeme, setPreviewMeme] = useState<Meme | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [imageUri, setImageUri] = useState("");
  const [title, setTitle] = useState("");
  const [voteAmounts, setVoteAmounts] = useState<Record<number, string>>({});
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [votingMemeId, setVotingMemeId] = useState<number | null>(null);
  const [isVoteApproving, setIsVoteApproving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("top");

  // Admin states
  const [submissionDays, setSubmissionDays] = useState("5");
  const [votingDays, setVotingDays] = useState("3");
  const [fundAmount, setFundAmount] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isFundApproving, setIsFundApproving] = useState(false);
  const [isAdvancingVoting, setIsAdvancingVoting] = useState(false);
  const [isAdvancingJudging, setIsAdvancingJudging] = useState(false);
  const [winnerIds, setWinnerIds] = useState("");
  const [winnerAmounts, setWinnerAmounts] = useState("");
  const [isDistributing, setIsDistributing] = useState(false);

  /* ═══ Contract reads ═══ */
  const { data: contestInfo } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "getContestInfo",
  });
  const { data: allMemes } = useScaffoldReadContract({
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
  const { data: voteFee } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "voteFee",
  });
  const { data: contractOwner } = useScaffoldReadContract({
    contractName: "ClawdMemeContest",
    functionName: "owner",
  });
  const { data: contractInfo2 } = useDeployedContractInfo("ClawdMemeContest");
  const contestAddress = contractInfo2?.address;
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [connectedAddress],
  });
  const { data: clawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [connectedAddress, contestAddress],
  });

  /* ═══ Contract writes ═══ */
  const { writeContractAsync: writeContest } = useScaffoldWriteContract("ClawdMemeContest");
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract("CLAWD");

  /* ═══ Derived ═══ */
  const phase = contestInfo ? Number(contestInfo[0]) : 0;
  const memeCount = contestInfo ? Number(contestInfo[1]) : 0;
  const prizePool = contestInfo ? contestInfo[2] : 0n;
  const submissionEnd = contestInfo ? Number(contestInfo[3]) : 0;
  const votingEnd = contestInfo ? Number(contestInfo[4]) : 0;
  const contestId = contestInfo ? Number(contestInfo[5]) : 0;
  const isAdmin = connectedAddress && contractOwner && connectedAddress.toLowerCase() === contractOwner.toLowerCase();

  /* ═══ Sort memes ═══ */
  const sortedMemes = useMemo(() => {
    if (!allMemes) return [];
    const memes = [...allMemes];
    switch (sortMode) {
      case "top":
        return memes.sort((a, b) => Number(b.totalVotes - a.totalVotes));
      case "new":
        return memes.sort((a, b) => Number(b.submittedAt - a.submittedAt));
      case "winners":
        return memes.filter(m => m.winner).sort((a, b) => Number(b.prizeAmount - a.prizeAmount));
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

  const countdown = (end: number) => {
    const diff = end - now;
    if (diff <= 0) return "TIME'S UP";
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const activeEnd = phase === 1 ? submissionEnd : phase === 2 ? votingEnd : 0;

  /* ═══ Ticker items — mix real stats with unhinged flavor ═══ */
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    items.push(`PRIZE POOL: ${fmtC(prizePool)} CLAWD`);
    const shuffled = [...FLAVOR_LINES].sort(() => Math.random() - 0.5);
    items.push(shuffled[0]);
    items.push(`${memeCount} MEMES IN THE ARENA`);
    items.push(shuffled[1]);
    items.push(`${fmtC(totalBurned)} CLAWD BURNED`);
    items.push(shuffled[2]);
    if (activeEnd > 0) items.push(`${countdown(activeEnd)} REMAINING`);
    items.push(`PRIZES: 40 / 25 / 15 / 10 / 10%`);
    if (submissionFee) items.push(`ENTRY: ${fmtC(submissionFee)} CLAWD`);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prizePool, memeCount, totalBurned, activeEnd, submissionFee]);

  /* ═══════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════ */
  const handleSubmitMeme = async () => {
    if (!imageUri || !title) return;
    const fee = submissionFee || 0n;
    const currentAllowance = clawdAllowance || 0n;

    if (currentAllowance < fee) {
      setIsApproving(true);
      try {
        await writeClawd({ functionName: "approve", args: [contestAddress, fee] });
      } catch {
        notification.error("Approval failed");
        setIsApproving(false);
        return;
      }
      setIsApproving(false);
    }

    setIsSubmitting(true);
    try {
      await writeContest({ functionName: "submitMeme", args: [imageUri, title] });
      notification.success("Meme submitted!");
      setShowSubmit(false);
      setImageUri("");
      setTitle("");
    } catch {
      notification.error("Submission failed");
    }
    setIsSubmitting(false);
  };

  const handleVote = async (memeId: number) => {
    const amountStr = voteAmounts[memeId] || "";
    if (!amountStr || Number(amountStr) <= 0) {
      notification.error("Enter a vote amount");
      return;
    }
    const amount = parseEther(amountStr);
    const currentAllowance = clawdAllowance || 0n;

    if (currentAllowance < amount) {
      setVotingMemeId(memeId);
      setIsVoteApproving(true);
      try {
        await writeClawd({ functionName: "approve", args: [contestAddress, amount] });
      } catch {
        notification.error("Approval failed");
        setIsVoteApproving(false);
        setVotingMemeId(null);
        return;
      }
      setIsVoteApproving(false);
    }

    setVotingMemeId(memeId);
    try {
      await writeContest({ functionName: "vote", args: [BigInt(memeId), amount] });
      notification.success("Vote cast!");
      setVoteAmounts(prev => ({ ...prev, [memeId]: "" }));
    } catch {
      notification.error("Vote failed");
    }
    setVotingMemeId(null);
  };

  /* Admin handlers */
  const handleStartContest = async () => {
    setIsStarting(true);
    try {
      await writeContest({ functionName: "startContest", args: [BigInt(submissionDays), BigInt(votingDays)] });
      notification.success("Contest started!");
    } catch {
      notification.error("Failed to start");
    }
    setIsStarting(false);
  };

  const handleFundPrizePool = async () => {
    if (!fundAmount) return;
    const amount = parseEther(fundAmount);
    const currentAllowance = clawdAllowance || 0n;
    if (currentAllowance < amount) {
      setIsFundApproving(true);
      try {
        await writeClawd({ functionName: "approve", args: [contestAddress, amount] });
      } catch {
        notification.error("Approval failed");
        setIsFundApproving(false);
        return;
      }
      setIsFundApproving(false);
    }
    setIsFunding(true);
    try {
      await writeContest({ functionName: "fundPrizePool", args: [amount] });
      notification.success("Prize pool funded!");
      setFundAmount("");
    } catch {
      notification.error("Funding failed");
    }
    setIsFunding(false);
  };

  const handleAdvanceToVoting = async () => {
    setIsAdvancingVoting(true);
    try {
      await writeContest({ functionName: "advanceToVoting" });
      notification.success("Voting phase started!");
    } catch {
      notification.error("Failed");
    }
    setIsAdvancingVoting(false);
  };

  const handleAdvanceToJudging = async () => {
    setIsAdvancingJudging(true);
    try {
      await writeContest({ functionName: "advanceToJudging" });
      notification.success("Judging phase started!");
    } catch {
      notification.error("Failed");
    }
    setIsAdvancingJudging(false);
  };

  const handleDistributePrizes = async () => {
    if (!winnerIds || !winnerAmounts) return;
    setIsDistributing(true);
    try {
      const ids = winnerIds.split(",").map(s => BigInt(s.trim()));
      const amounts = winnerAmounts.split(",").map(s => parseEther(s.trim()));
      await writeContest({ functionName: "distributePrizes", args: [ids, amounts] });
      notification.success("Prizes distributed!");
    } catch {
      notification.error("Distribution failed");
    }
    setIsDistributing(false);
  };

  /* ═══════════════════════════════════════
     RENDER
     ═══════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-black text-white scanlines">
      {/* ═══ TOP NAV ═══ */}
      <nav className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-white/[0.04]">
        <div className="max-w-[1600px] mx-auto px-3 py-2.5 flex items-center justify-between gap-3">
          {/* Left: brand + phase */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:block">
              <span className="font-black text-sm tracking-wider font-mono">
                <span className="text-[#ff00ff]">MEME</span>
                <span className="text-white/80">ARENA</span>
              </span>
            </div>

            {/* Phase pill */}
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-full shrink-0"
              style={{ background: PHASE_COLORS[phase] + "12", border: `1px solid ${PHASE_COLORS[phase]}30` }}
            >
              <div className="live-dot" style={{ background: PHASE_COLORS[phase] }} />
              <span className="text-[10px] font-black tracking-wider" style={{ color: PHASE_COLORS[phase] }}>
                {PHASE_LABELS[phase]}
              </span>
              {activeEnd > 0 && (
                <span className="text-[11px] font-mono font-bold flicker" style={{ color: PHASE_COLORS[phase] }}>
                  {countdown(activeEnd)}
                </span>
              )}
            </div>
          </div>

          {/* Right: stats + submit + connect */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Prize pool inline */}
            <div className="hidden md:flex items-center gap-1 px-2.5 py-1 bg-white/[0.02] rounded-lg border border-white/[0.04]">
              <span className="text-[9px] text-gray-600 font-mono">PRIZE</span>
              <span className="text-[11px] font-black font-mono text-[#ffd700]">{fmtC(prizePool)}</span>
            </div>

            {/* Burned inline */}
            <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 bg-white/[0.02] rounded-lg border border-white/[0.04]">
              <span className="text-[9px] text-gray-600 font-mono">BURN</span>
              <span className="text-[11px] font-black font-mono text-[#ff3366]">{fmtC(totalBurned)}</span>
            </div>

            {/* Submit button */}
            {phase === 1 && (
              <button onClick={() => setShowSubmit(true)} className="btn-hot px-3 py-1.5 text-[10px]">
                SUBMIT
              </button>
            )}

            {/* Admin */}
            {isAdmin && (
              <button onClick={() => setShowAdmin(!showAdmin)} className="text-gray-600 hover:text-[#ffd700] transition-colors text-[10px] font-mono">
                ADM
              </button>
            )}

            {/* Connect */}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <div {...(!mounted && { style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const } })}>
                    {!connected ? (
                      <button onClick={openConnectModal} className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] font-bold text-white transition-all">
                        Connect
                      </button>
                    ) : chain?.unsupported ? (
                      <button onClick={openChainModal} className="bg-red-600/20 border border-red-500/30 rounded-lg px-3 py-1.5 text-[11px] font-bold text-red-400">
                        Wrong Chain
                      </button>
                    ) : (
                      <button onClick={openAccountModal} className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] rounded-lg px-2.5 py-1.5 transition-all">
                        <span className="text-[10px] font-mono text-[#39ff14]">{fmtC(clawdBalance)}</span>
                        <span className="text-[11px] font-mono text-gray-400">{account.displayName}</span>
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </nav>

      {/* ═══ SCROLLING TICKER ═══ */}
      <Ticker items={tickerItems} />

      {/* ═══ SORT TABS + COUNT ═══ */}
      <div className="max-w-[1600px] mx-auto px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className={`sort-tab ${sortMode === "top" ? "active" : ""}`} onClick={() => setSortMode("top")}>
            TOP
          </button>
          <button className={`sort-tab ${sortMode === "new" ? "active" : ""}`} onClick={() => setSortMode("new")}>
            NEW
          </button>
          <button className={`sort-tab ${sortMode === "winners" ? "active" : ""}`} onClick={() => setSortMode("winners")}>
            WINNERS
          </button>
        </div>
        <div className="text-[11px] text-gray-600 font-mono">
          {sortedMemes.length} meme{sortedMemes.length !== 1 ? "s" : ""}
          {contestId > 0 && <span className="ml-2 text-gray-700">szn {contestId}</span>}
        </div>
      </div>

      {/* ═══ THE GALLERY — THIS IS THE PAGE ═══ */}
      {sortedMemes.length > 0 ? (
        <div className="max-w-[1600px] mx-auto px-2 pb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
            {sortedMemes.map((meme, rank) => (
              <MemeCard
                key={Number(meme.id)}
                meme={meme}
                rank={rank}
                maxVotes={maxVotes}
                phase={phase}
                onPreview={setPreviewMeme}
                onVote={handleVote}
                voteAmount={voteAmounts[Number(meme.id)] || ""}
                setVoteAmount={(id, v) => setVoteAmounts(prev => ({ ...prev, [id]: v }))}
                votingMemeId={votingMemeId}
                isVoteApproving={isVoteApproving}
              />
            ))}
          </div>
        </div>
      ) : (
        /* ═══ EMPTY STATE — with personality ═══ */
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          {phase === 0 ? (
            <>
              <h2 className="text-2xl font-black text-gray-500 mb-2 font-mono">ARENA CLOSED</h2>
              <p className="text-gray-700 font-mono text-xs">
                No active contest. Check back later.
              </p>
            </>
          ) : phase === 1 ? (
            <>
              <h2 className="text-2xl font-black text-white mb-2 font-mono">NO MEMES YET</h2>
              <p className="text-gray-600 font-mono text-xs mb-6">
                The arena is open. Be first.
              </p>
              <button onClick={() => setShowSubmit(true)} className="btn-hot px-8 py-3 text-sm">
                SUBMIT FIRST
              </button>
            </>
          ) : phase === 4 && sortMode === "winners" ? (
            <>
              <h2 className="text-2xl font-black text-gray-500 mb-2 font-mono">NO WINNERS YET</h2>
              <p className="text-gray-600 font-mono text-xs">
                Switch to TOP to see all entries.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-gray-600 mb-2 font-mono">EMPTY</h2>
              <p className="text-gray-700 font-mono text-xs">
                Try a different tab.
              </p>
            </>
          )}
        </div>
      )}

      {/* ═══ FOOTER — compact, personality ═══ */}
      <footer className="border-t border-white/[0.03] py-5 mt-8">
        <div className="max-w-[1600px] mx-auto px-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] text-gray-700 font-mono flex-wrap justify-center">
            <span>prizes: 40/25/15/10/10%</span>
            <span className="text-gray-800">·</span>
            <span>10% burned</span>
            <span className="text-gray-800">·</span>
            <span>submit → vote → judge → win</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-700 font-mono flex-wrap justify-center">
            {contestAddress && (
              <span className="text-gray-700">{contestAddress.slice(0, 6)}...{contestAddress.slice(-4)}</span>
            )}
            <span className="text-gray-800">·</span>
            <a
              href="https://clawdbotatg.eth.limo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff00ff]/40 hover:text-[#ff00ff] transition-colors"
            >
              built by clawd
            </a>
            <span className="text-gray-800">·</span>
            <span className="text-gray-800">unaudited. degen responsibly.</span>
          </div>
        </div>
      </footer>

      {/* ═══ ADMIN MODAL ═══ */}
      {showAdmin && isAdmin && (
        <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4" onClick={() => setShowAdmin(false)}>
          <div className="bg-[#0a0a0a] border border-[#ffd700]/20 rounded-xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-[#ffd700] font-mono tracking-wider uppercase">ADMIN</h3>
              <button onClick={() => setShowAdmin(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
              {(phase === 0 || phase === 4) && (
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">Start Contest</div>
                  <div className="flex gap-2 mb-2">
                    <input type="number" value={submissionDays} onChange={e => setSubmissionDays(e.target.value)} className="bg-black border border-white/10 rounded px-2 py-1.5 w-16 text-white text-xs font-mono focus:outline-none focus:border-[#ffd700]/50" />
                    <span className="text-gray-600 self-center text-[10px]">sub</span>
                    <input type="number" value={votingDays} onChange={e => setVotingDays(e.target.value)} className="bg-black border border-white/10 rounded px-2 py-1.5 w-16 text-white text-xs font-mono focus:outline-none focus:border-[#ffd700]/50" />
                    <span className="text-gray-600 self-center text-[10px]">vote</span>
                  </div>
                  <button onClick={handleStartContest} disabled={isStarting} className="btn-hot w-full py-2 text-xs bg-[#39ff14] hover:bg-[#44ff22]" style={{ boxShadow: "0 3px 0 #1a8a0a" }}>
                    {isStarting ? "Starting..." : "START"}
                  </button>
                </div>
              )}

              <div className="bg-white/[0.03] rounded-lg p-3">
                <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">Fund Prize Pool</div>
                <input type="text" value={fundAmount} onChange={e => setFundAmount(e.target.value)} className="bg-black border border-white/10 rounded px-2 py-1.5 w-full text-white text-xs font-mono mb-2 focus:outline-none focus:border-[#ffd700]/50" placeholder="CLAWD" />
                <button onClick={handleFundPrizePool} disabled={isFunding || isFundApproving} className="btn-hot w-full py-2 text-xs bg-[#ffd700] hover:bg-[#ffdd33] text-black" style={{ boxShadow: "0 3px 0 #b39600" }}>
                  {isFundApproving ? "Approving..." : isFunding ? "Funding..." : "FUND"}
                </button>
              </div>

              {phase === 1 && (
                <button onClick={handleAdvanceToVoting} disabled={isAdvancingVoting} className="btn-hot w-full py-2 text-xs">
                  {isAdvancingVoting ? "..." : "ADVANCE TO VOTING"}
                </button>
              )}
              {phase === 2 && (
                <button onClick={handleAdvanceToJudging} disabled={isAdvancingJudging} className="btn-hot w-full py-2 text-xs bg-[#ffd700] text-black" style={{ boxShadow: "0 3px 0 #b39600" }}>
                  {isAdvancingJudging ? "..." : "ADVANCE TO JUDGING"}
                </button>
              )}

              {phase === 3 && (
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">Distribute Prizes</div>
                  <input type="text" value={winnerIds} onChange={e => setWinnerIds(e.target.value)} className="bg-black border border-white/10 rounded px-2 py-1.5 w-full text-white text-xs font-mono mb-1.5 focus:outline-none" placeholder="IDs: 1,3,5" />
                  <input type="text" value={winnerAmounts} onChange={e => setWinnerAmounts(e.target.value)} className="bg-black border border-white/10 rounded px-2 py-1.5 w-full text-white text-xs font-mono mb-2 focus:outline-none" placeholder="Amounts: 1000000,500000" />
                  <button onClick={handleDistributePrizes} disabled={isDistributing} className="btn-hot w-full py-2 text-xs bg-[#ffd700] text-black" style={{ boxShadow: "0 3px 0 #b39600" }}>
                    {isDistributing ? "..." : "DISTRIBUTE"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SUBMIT MODAL ═══ */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4" onClick={() => setShowSubmit(false)}>
          <div className="bg-[#0a0a0a] border border-[#ff00ff]/20 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-black text-white font-mono tracking-wider uppercase">SUBMIT MEME</h3>
              <button onClick={() => setShowSubmit(false)} className="text-gray-500 hover:text-white transition-colors">✕</button>
            </div>
            <p className="text-[10px] text-gray-600 font-mono mb-4">
              judged by an AI lobster. choose wisely.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1 block">Image URL</label>
                <input
                  type="text"
                  value={imageUri}
                  onChange={e => setImageUri(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#ff00ff]/40 placeholder-gray-700"
                  placeholder="https://..."
                />
              </div>

              {imageUri && (
                <div className="bg-[#080808] rounded-lg overflow-hidden border border-white/[0.04]">
                  <img src={imageUri} alt="Preview" className="max-h-40 mx-auto" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1 flex justify-between">
                  <span>Title (make it count)</span>
                  <span className="text-gray-700">{title.length}/100</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value.slice(0, 100))}
                  className="w-full bg-black border border-white/10 rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#ff00ff]/40 placeholder-gray-700"
                  placeholder="Name your meme"
                />
              </div>

              <div className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2.5">
                <span className="text-[10px] text-gray-500 font-mono">Entry fee</span>
                <div className="text-right">
                  <span className="text-sm font-black font-mono text-[#ff00ff]">{fmtCFull(submissionFee)} CLAWD</span>
                  <span className="text-[9px] text-gray-600 font-mono ml-1.5">(10% burned)</span>
                </div>
              </div>

              {!connectedAddress ? (
                <ConnectButton.Custom>
                  {({ openConnectModal, mounted }) => (
                    <button
                      onClick={openConnectModal}
                      disabled={!mounted}
                      className="btn-hot w-full py-3 text-sm bg-white/10 hover:bg-white/20"
                      style={{ boxShadow: "0 3px 0 #333" }}
                    >
                      CONNECT WALLET
                    </button>
                  )}
                </ConnectButton.Custom>
              ) : (
                <button
                  onClick={handleSubmitMeme}
                  disabled={!imageUri || !title || isApproving || isSubmitting}
                  className="btn-hot w-full py-3 text-sm"
                >
                  {isApproving ? "APPROVING..." : isSubmitting ? "SUBMITTING..." : "SUBMIT"}
                </button>
              )}

              <p className="text-center text-[9px] text-gray-700 font-mono">
                no refunds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PREVIEW MODAL — FULL SCREEN ═══ */}
      {previewMeme && (
        <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-2 md:p-4" onClick={() => setPreviewMeme(null)}>
          <div className="relative max-w-4xl w-full max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button
              onClick={() => setPreviewMeme(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/70 backdrop-blur-sm border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-all text-sm"
            >
              ✕
            </button>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center overflow-hidden rounded-t-xl bg-[#050505]">
              <img
                src={previewMeme.imageUri}
                alt={previewMeme.title}
                className="max-w-full max-h-[70vh] object-contain"
                onError={e => {
                  (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect fill='%23080808' width='400' height='400'/><text x='200' y='205' text-anchor='middle' fill='%23222' font-size='12' font-family='monospace'>NO IMAGE</text></svg>`;
                }}
              />
            </div>

            {/* Bottom info bar */}
            <div className="bg-[#0a0a0a] border-t border-white/[0.04] rounded-b-xl px-5 py-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-white truncate">{previewMeme.title}</h3>
                  <a
                    href={`https://basescan.org/address/${previewMeme.creator}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-gray-600 font-mono mt-0.5 block hover:text-gray-400 transition-colors"
                  >
                    {previewMeme.creator.slice(0, 6)}...{previewMeme.creator.slice(-4)}
                  </a>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-xl font-black font-mono text-[#39ff14]">{fmtCFull(previewMeme.totalVotes)}</div>
                    <div className="text-[9px] text-gray-600 font-mono">CLAWD VOTED</div>
                  </div>
                  {previewMeme.winner && previewMeme.prizeAmount > 0n && (
                    <div className="text-right">
                      <div className="text-xl font-black font-mono text-[#ffd700] neon-gold">{fmtC(previewMeme.prizeAmount)}</div>
                      <div className="text-[9px] text-gray-600 font-mono">PRIZE WON</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Vote in modal */}
              {(phase === 1 || phase === 2) && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={voteAmounts[Number(previewMeme.id)] || ""}
                    onChange={e => setVoteAmounts(prev => ({ ...prev, [Number(previewMeme.id)]: e.target.value }))}
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#ff00ff]/30 placeholder-gray-700"
                    placeholder={`min ${fmtC(voteFee)} CLAWD`}
                  />
                  <button
                    onClick={() => handleVote(Number(previewMeme.id))}
                    disabled={votingMemeId === Number(previewMeme.id)}
                    className="btn-hot px-6 py-2.5 text-sm"
                  >
                    {votingMemeId === Number(previewMeme.id) ? "..." : "VOTE"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
