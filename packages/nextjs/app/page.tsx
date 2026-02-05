"use client";

import { useState, useEffect, useMemo } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { Address } from "@scaffold-ui/components";
import { notification } from "~~/utils/scaffold-eth";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const PHASE_NAMES = ["INACTIVE", "SUBMISSIONS OPEN", "VOTING LIVE", "JUDGING", "COMPLETED"] as const;
const PHASE_EMOJIS = ["💤", "🔥", "⚡", "🧑‍⚖️", "🏆"];
const PHASE_COLORS = ["#666", "#39ff14", "#ff00ff", "#ffd700", "#ffd700"];

const EMOJIS = ["🦞", "🔥", "💀", "🎭", "👑", "⚡", "🌶️", "💎", "🧪", "🎪"];

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

/* ═══════════════════════════════════════════
   FORMATTERS
   ═══════════════════════════════════════════ */
const fmtClawd = (val: bigint | undefined) => {
  if (!val) return "0";
  const num = Number(formatEther(val));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toFixed(0);
};

const fmtClawdFull = (val: bigint | undefined) => {
  if (!val) return "0";
  return Number(formatEther(val)).toLocaleString();
};

/* ═══════════════════════════════════════════
   EMOJI PARTICLES COMPONENT
   ═══════════════════════════════════════════ */
function EmojiParticles() {
  const [particles, setParticles] = useState<Array<{ id: number; emoji: string; left: number; delay: number; duration: number }>>([]);

  useEffect(() => {
    const p = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      emoji: EMOJIS[i % EMOJIS.length],
      left: Math.random() * 100,
      delay: Math.random() * 20,
      duration: 15 + Math.random() * 20,
    }));
    setParticles(p);
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="emoji-particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.emoji}
        </div>
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════
   MEME CARD COMPONENT
   ═══════════════════════════════════════════ */
function MemeCard({
  meme,
  rank,
  maxVotes,
  phase,
  onPreview,
  onVote,
  voteAmount,
  onVoteAmountChange,
  votingMemeId,
  isVoteApproving,
}: {
  meme: Meme;
  rank: number;
  maxVotes: bigint;
  phase: number;
  onPreview: (meme: Meme) => void;
  onVote: (id: number) => void;
  voteAmount: string;
  onVoteAmountChange: (id: number, val: string) => void;
  votingMemeId: number | null;
  isVoteApproving: boolean;
}) {
  const powerPct = maxVotes > 0n
    ? Math.min(Number((meme.totalVotes * 100n) / maxVotes), 100)
    : 0;

  const getRankBadge = () => {
    if (meme.winner) {
      if (rank === 0) return "🥇";
      if (rank === 1) return "🥈";
      if (rank === 2) return "🥉";
      return "🏆";
    }
    if (rank < 3) return `#${rank + 1}`;
    return null;
  };

  const badge = getRankBadge();

  return (
    <div
      className={`holo-border group cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:z-10 ${
        meme.winner ? "winner-glow" : ""
      }`}
      onClick={() => onPreview(meme)}
    >
      <div className="relative bg-[#0a0a0a] rounded-[14px] overflow-hidden">
        {/* Image */}
        <div className="relative aspect-square bg-black/50 overflow-hidden">
          {meme.imageUri ? (
            <img
              src={meme.imageUri}
              alt={meme.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect fill='%23111' width='400' height='400'/><text x='200' y='200' text-anchor='middle' fill='%23333' font-size='80'>🦞</text></svg>`;
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">🦞</div>
          )}

          {/* Rank Badge */}
          {badge && (
            <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-sm rounded-full w-10 h-10 flex items-center justify-center text-lg font-black border border-white/10">
              {badge}
            </div>
          )}

          {/* Winner Badge */}
          {meme.winner && (
            <div className="absolute top-3 right-3 bg-[#ffd700] text-black font-black text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider rotate-3 shadow-lg">
              ✨ DANK ✨
            </div>
          )}

          {/* Bottom gradient overlay with title */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent pt-16 pb-3 px-4">
            <h3 className="font-black text-white text-base truncate">{meme.title}</h3>
            <div className="flex items-center gap-1 mt-1 opacity-70">
              <span className="text-[10px] text-gray-400">by</span>
              <span className="text-[10px] text-[#00ffff] font-mono">
                {meme.creator.slice(0, 6)}...{meme.creator.slice(-4)}
              </span>
            </div>
          </div>
        </div>

        {/* Power Level Bar */}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono">Power Level</span>
            <span className="text-sm font-black text-[#ff00ff] font-mono">{fmtClawd(meme.totalVotes)}</span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full power-bar rounded-full transition-all duration-700"
              style={{ width: `${Math.max(powerPct, 2)}%` }}
            />
          </div>
        </div>

        {/* Prize Display */}
        {meme.winner && meme.prizeAmount > 0n && (
          <div className="mx-4 mb-3 bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-lg py-2 text-center">
            <span className="text-[#ffd700] font-black text-sm neon-gold">
              🏆 {fmtClawd(meme.prizeAmount)} CLAWD
            </span>
          </div>
        )}

        {/* Vote Area */}
        {(phase === 1 || phase === 2) && (
          <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              <input
                type="text"
                value={voteAmount}
                onChange={(e) => onVoteAmountChange(Number(meme.id), e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[#ff00ff]/50 transition-colors"
                placeholder="CLAWD"
              />
              <button
                onClick={() => onVote(Number(meme.id))}
                disabled={votingMemeId === Number(meme.id)}
                className="btn-vote px-4 py-2 text-xs font-black uppercase tracking-wider"
              >
                {votingMemeId === Number(meme.id)
                  ? isVoteApproving ? "..." : "..."
                  : "⚡"}
              </button>
            </div>
            <div className="flex gap-1 mt-1.5">
              {["308000", "500000", "1000000"].map((amt) => (
                <button
                  key={amt}
                  onClick={() => onVoteAmountChange(Number(meme.id), amt)}
                  className="flex-1 bg-white/5 hover:bg-[#ff00ff]/10 border border-white/5 hover:border-[#ff00ff]/30 text-gray-400 hover:text-white text-[10px] py-1 rounded transition-all font-mono"
                >
                  {Number(amt) >= 1000000 ? `${Number(amt) / 1000000}M` : `${Number(amt) / 1000}K`}
                </button>
              ))}
            </div>
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
  const [imageUri, setImageUri] = useState("");
  const [title, setTitle] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [voteAmounts, setVoteAmounts] = useState<Record<number, string>>({});
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [votingMemeId, setVotingMemeId] = useState<number | null>(null);
  const [isVoteApproving, setIsVoteApproving] = useState(false);

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

  // Contract reads
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

  // Contract writes
  const { writeContractAsync: writeContest } = useScaffoldWriteContract("ClawdMemeContest");
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract("CLAWD");

  // Parse contest info
  const phase = contestInfo ? Number(contestInfo[0]) : 0;
  const memeCount = contestInfo ? Number(contestInfo[1]) : 0;
  const prizePool = contestInfo ? contestInfo[2] : 0n;
  const submissionEnd = contestInfo ? Number(contestInfo[3]) : 0;
  const votingEnd = contestInfo ? Number(contestInfo[4]) : 0;
  const contestId = contestInfo ? Number(contestInfo[5]) : 0;

  const isAdmin = connectedAddress && contractOwner && connectedAddress.toLowerCase() === contractOwner.toLowerCase();

  // Sort memes by votes
  const sortedMemes = useMemo(() => {
    if (!allMemes) return [];
    return [...allMemes].sort((a, b) => Number(b.totalVotes - a.totalVotes));
  }, [allMemes]);

  const maxVotes = sortedMemes.length > 0 ? sortedMemes[0].totalVotes : 0n;

  // Countdown
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const getCountdown = (endTime: number) => {
    const diff = endTime - now;
    if (diff <= 0) return "ENDED";
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const activeCountdown = phase === 1 ? getCountdown(submissionEnd) : phase === 2 ? getCountdown(votingEnd) : null;

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
      notification.success("🦞 MEME DEPLOYED TO THE ARENA!");
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
      notification.error("Enter vote amount");
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
      notification.success("⚡ POWER LEVEL INCREASED!");
      setVoteAmounts((prev) => ({ ...prev, [memeId]: "" }));
    } catch {
      notification.error("Vote failed");
    }
    setVotingMemeId(null);
  };

  // Admin handlers
  const handleStartContest = async () => {
    setIsStarting(true);
    try {
      await writeContest({ functionName: "startContest", args: [BigInt(submissionDays), BigInt(votingDays)] });
      notification.success("🔥 ARENA OPENED!");
    } catch { notification.error("Failed"); }
    setIsStarting(false);
  };

  const handleFundPrizePool = async () => {
    if (!fundAmount) return;
    const amount = parseEther(fundAmount);
    const currentAllowance = clawdAllowance || 0n;
    if (currentAllowance < amount) {
      setIsFundApproving(true);
      try { await writeClawd({ functionName: "approve", args: [contestAddress, amount] }); }
      catch { notification.error("Approval failed"); setIsFundApproving(false); return; }
      setIsFundApproving(false);
    }
    setIsFunding(true);
    try {
      await writeContest({ functionName: "fundPrizePool", args: [amount] });
      notification.success("💰 Prize pool funded!");
      setFundAmount("");
    } catch { notification.error("Funding failed"); }
    setIsFunding(false);
  };

  const handleAdvanceToVoting = async () => {
    setIsAdvancingVoting(true);
    try { await writeContest({ functionName: "advanceToVoting" }); notification.success("⚡ VOTING PHASE!"); }
    catch { notification.error("Failed"); }
    setIsAdvancingVoting(false);
  };

  const handleAdvanceToJudging = async () => {
    setIsAdvancingJudging(true);
    try { await writeContest({ functionName: "advanceToJudging" }); notification.success("🧑‍⚖️ JUDGING!"); }
    catch { notification.error("Failed"); }
    setIsAdvancingJudging(false);
  };

  const handleDistributePrizes = async () => {
    if (!winnerIds || !winnerAmounts) return;
    setIsDistributing(true);
    try {
      const ids = winnerIds.split(",").map((s) => BigInt(s.trim()));
      const amounts = winnerAmounts.split(",").map((s) => parseEther(s.trim()));
      await writeContest({ functionName: "distributePrizes", args: [ids, amounts] });
      notification.success("🏆 PRIZES DISTRIBUTED!");
    } catch { notification.error("Distribution failed"); }
    setIsDistributing(false);
  };

  /* ═══════════════════════════════════════
     RENDER
     ═══════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-black text-white scanlines noise relative">
      {/* Emoji Particles */}
      <EmojiParticles />

      {/* ═══ NAVIGATION BAR ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl float">🦞</span>
            <span className="font-black text-sm md:text-base tracking-[0.15em] uppercase">
              <span className="text-[#ff00ff]">MEME</span>
              <span className="text-white">ARENA</span>
            </span>
            {contestId > 0 && (
              <span className="text-[10px] font-mono text-gray-600 hidden sm:block">#{contestId}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className="text-gray-500 hover:text-[#ffd700] transition-colors text-lg"
                title="Admin"
              >
                🔧
              </button>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <div {...(!mounted && { style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const } })}>
                    {!connected ? (
                      <button
                        onClick={openConnectModal}
                        className="btn-arena px-4 py-2 text-xs"
                      >
                        CONNECT
                      </button>
                    ) : chain?.unsupported ? (
                      <button onClick={openChainModal} className="btn-arena px-4 py-2 text-xs bg-red-600">
                        WRONG NETWORK
                      </button>
                    ) : (
                      <button
                        onClick={openAccountModal}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 transition-all"
                      >
                        <span className="text-[10px] font-mono text-[#00ffff]">
                          {account.displayBalance}
                        </span>
                        <span className="text-xs font-mono text-white">
                          {account.displayName}
                        </span>
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </nav>

      {/* Spacer for fixed nav */}
      <div className="h-16" />

      {/* ═══ HERO SECTION ═══ */}
      <section className="relative py-16 md:py-24 px-4 text-center overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#ff00ff]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00ffff]/5 rounded-full blur-[120px]" />

        {/* Title */}
        <div className="relative z-10">
          <div className="text-6xl md:text-8xl mb-4 float-slow">🦞</div>
          <h1
            className="glitch-text text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none mb-4"
            data-text="MEME ARENA"
          >
            <span className="bg-gradient-to-r from-[#ff00ff] via-[#ff3366] to-[#ff00ff] bg-clip-text text-transparent">
              MEME
            </span>
            <br />
            <span className="text-white">ARENA</span>
          </h1>

          <p className="text-gray-500 text-sm md:text-base tracking-[0.3em] uppercase font-mono mb-8">
            Where $CLAWD meets dank memes on Base
          </p>

          {/* Phase indicator */}
          <div className="inline-flex flex-col items-center gap-3">
            <div
              className="flex items-center gap-3 px-6 py-3 rounded-full border"
              style={{
                borderColor: PHASE_COLORS[phase] + "40",
                backgroundColor: PHASE_COLORS[phase] + "10",
              }}
            >
              <div
                className="w-3 h-3 rounded-full pulse-ring"
                style={{ backgroundColor: PHASE_COLORS[phase] }}
              />
              <span
                className="text-sm md:text-base font-black tracking-[0.2em] uppercase"
                style={{ color: PHASE_COLORS[phase] }}
              >
                {PHASE_EMOJIS[phase]} {PHASE_NAMES[phase]}
              </span>
              {activeCountdown && (
                <span
                  className="font-mono font-bold text-lg md:text-xl flicker"
                  style={{ color: PHASE_COLORS[phase] }}
                >
                  {activeCountdown}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <section className="max-w-5xl mx-auto px-4 mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "PRIZE POOL", value: fmtClawd(prizePool), icon: "🏆", color: "#ffd700" },
            { label: "SUBMISSIONS", value: String(memeCount), icon: "🖼️", color: "#ff00ff" },
            { label: "BURNED", value: fmtClawd(totalBurned), icon: "🔥", color: "#ff3366" },
            { label: "YOUR CLAWD", value: fmtClawd(clawdBalance), icon: "🦞", color: "#00ffff" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card-dark p-4 text-center hover:border-white/10 transition-all group"
            >
              <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">{stat.icon}</div>
              <div className="text-2xl md:text-3xl font-black font-mono" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ PRIZE POOL BREAKDOWN ═══ */}
      <section className="max-w-3xl mx-auto px-4 mb-16">
        <div className="card-dark p-6 md:p-8 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-mono mb-3">
            Total Prize Pool
          </div>
          <div className="prize-pulse text-4xl md:text-6xl font-black font-mono text-[#ffd700] mb-6">
            {fmtClawdFull(prizePool)} <span className="text-lg md:text-2xl text-[#ffd700]/60">CLAWD</span>
          </div>

          <div className="grid grid-cols-5 gap-2 md:gap-4">
            {[
              { place: "🥇", pct: "40%", label: "1ST" },
              { place: "🥈", pct: "25%", label: "2ND" },
              { place: "🥉", pct: "15%", label: "3RD" },
              { place: "4️⃣", pct: "10%", label: "4TH" },
              { place: "5️⃣", pct: "10%", label: "5TH" },
            ].map((p) => (
              <div key={p.label} className="text-center">
                <div className="text-2xl md:text-3xl mb-1">{p.place}</div>
                <div className="text-lg md:text-xl font-black text-white">{p.pct}</div>
                <div className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SUBMIT SECTION ═══ */}
      {phase === 1 && (
        <section className="max-w-3xl mx-auto px-4 mb-16 text-center">
          <button
            onClick={() => setShowSubmit(true)}
            className="btn-arena px-10 py-5 text-xl md:text-2xl tracking-wider group relative overflow-hidden"
          >
            <span className="relative z-10">🚀 LAUNCH YOUR MEME 🚀</span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#ff00ff] via-[#ff3366] to-[#ff00ff] opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <p className="text-gray-600 text-xs mt-3 font-mono">
            Cost: {fmtClawdFull(submissionFee)} CLAWD • 10% burned 🔥
          </p>
        </section>
      )}

      {/* ═══ GALLERY — THE STAR ═══ */}
      {sortedMemes.length > 0 ? (
        <section className="max-w-7xl mx-auto px-4 mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">
              {phase === 4 ? (
                <span className="neon-gold">🏆 HALL OF DANK 🏆</span>
              ) : (
                <>
                  <span className="text-[#ff00ff]">THE</span>{" "}
                  <span className="text-white">GALLERY</span>
                </>
              )}
            </h2>
            <p className="text-gray-500 text-xs mt-2 font-mono tracking-[0.2em] uppercase">
              {sortedMemes.length} specimen{sortedMemes.length !== 1 ? "s" : ""} • sorted by power level
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
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
                onVoteAmountChange={(id, val) => setVoteAmounts((prev) => ({ ...prev, [id]: val }))}
                votingMemeId={votingMemeId}
                isVoteApproving={isVoteApproving}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="max-w-3xl mx-auto px-4 mb-16 text-center py-20">
          <div className="text-8xl mb-6 float-slow">🦞</div>
          <h2 className="text-3xl font-black text-gray-600 mb-2">THE ARENA AWAITS</h2>
          <p className="text-gray-700 font-mono text-sm">
            {phase === 0
              ? "Contest hasn't started yet..."
              : phase === 1
              ? "Be the first gladiator to enter!"
              : "No submissions this round."}
          </p>
        </section>
      )}

      {/* ═══ LEADERBOARD — ARCADE STYLE ═══ */}
      {sortedMemes.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 mb-16">
          <div className="card-dark overflow-hidden">
            {/* Arcade header */}
            <div className="bg-gradient-to-r from-[#ff00ff]/20 via-[#00ffff]/20 to-[#ff00ff]/20 border-b border-white/5 px-6 py-4">
              <h3 className="text-center font-black text-xl md:text-2xl tracking-[0.2em] uppercase">
                <span className="rainbow-text">HIGH SCORES</span>
              </h3>
              <div className="text-center text-[10px] text-gray-500 font-mono tracking-[0.3em] uppercase mt-1">
                INSERT COIN TO CONTINUE
              </div>
            </div>

            {/* Scores */}
            <div className="divide-y divide-white/5">
              {sortedMemes.map((meme, rank) => (
                <div
                  key={Number(meme.id)}
                  className={`flex items-center gap-4 px-4 md:px-6 py-3 hover:bg-white/[0.02] transition-colors ${
                    meme.winner ? "bg-[#ffd700]/5" : ""
                  }`}
                >
                  {/* Rank */}
                  <div className="w-10 text-center">
                    {rank === 0 ? (
                      <span className="text-2xl">🥇</span>
                    ) : rank === 1 ? (
                      <span className="text-2xl">🥈</span>
                    ) : rank === 2 ? (
                      <span className="text-2xl">🥉</span>
                    ) : (
                      <span className="text-lg font-mono text-gray-600">{rank + 1}</span>
                    )}
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate text-white">{meme.title}</div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {meme.creator.slice(0, 6)}...{meme.creator.slice(-4)}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <div className="font-mono font-black text-[#ff00ff] text-sm md:text-base">
                      {fmtClawd(meme.totalVotes)}
                    </div>
                    <div className="text-[9px] text-gray-600 font-mono uppercase">clawd</div>
                  </div>

                  {/* Prize */}
                  {meme.winner && meme.prizeAmount > 0n && (
                    <div className="text-right hidden sm:block">
                      <div className="font-mono font-black text-[#ffd700] text-sm">
                        {fmtClawd(meme.prizeAmount)}
                      </div>
                      <div className="text-[9px] text-gray-600 font-mono uppercase">prize</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="max-w-4xl mx-auto px-4 mb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-black">
            <span className="text-gray-500">HOW</span> <span className="text-white">IT WORKS</span>
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { step: "01", emoji: "🖼️", title: "SUBMIT", desc: "Upload your meme & pay the entry fee" },
            { step: "02", emoji: "⚡", title: "VOTE", desc: "Stake CLAWD on your favorites" },
            { step: "03", emoji: "🧑‍⚖️", title: "JUDGE", desc: "Clawd reviews + community votes" },
            { step: "04", emoji: "🏆", title: "WIN", desc: "Top memes split the prize pool" },
          ].map((s) => (
            <div key={s.step} className="card-dark p-5 text-center group hover:border-white/10 transition-all">
              <div className="text-[10px] font-mono text-gray-600 mb-2">{s.step}</div>
              <div className="text-4xl mb-3 group-hover:scale-125 transition-transform">{s.emoji}</div>
              <div className="font-black text-sm text-white tracking-wider mb-1">{s.title}</div>
              <div className="text-[11px] text-gray-500 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-[#ff3366] text-xs mt-4 font-mono">
          🔥 10% of ALL fees are burned forever. The more you meme, the more we burn! 🔥
        </p>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/5 py-8 text-center">
        <p className="text-gray-600 text-xs font-mono">
          Built by{" "}
          <a href="https://clawdbotatg.eth.limo" target="_blank" rel="noopener noreferrer" className="text-[#ff00ff] hover:text-[#ff33aa] transition-colors">
            Clawd
          </a>
          {" "}🦞 an AI agent with a wallet
        </p>
        {contestAddress && (
          <div className="flex items-center justify-center gap-2 mt-2 text-gray-700 text-[10px] font-mono">
            <span>contract:</span>
            <Address address={contestAddress} />
          </div>
        )}
        <p className="text-gray-700 text-[10px] mt-2">
          Creator:{" "}
          <a href="https://x.com/austingriffith" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">
            @austingriffith
          </a>
        </p>
      </footer>

      {/* ═══ ADMIN PANEL (hidden) ═══ */}
      {showAdmin && isAdmin && (
        <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4" onClick={() => setShowAdmin(false)}>
          <div className="bg-[#0a0a0a] border border-[#ffd700]/30 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-[#ffd700]">🔧 Admin</h3>
              <button onClick={() => setShowAdmin(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-4">
              {/* Start Contest */}
              {(phase === 0 || phase === 4) && (
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Start Contest</div>
                  <div className="flex gap-2 mb-3">
                    <input type="number" value={submissionDays} onChange={(e) => setSubmissionDays(e.target.value)} className="bg-black border border-white/10 rounded-lg px-3 py-2 w-20 text-white text-sm font-mono focus:outline-none focus:border-[#ffd700]/50" />
                    <span className="text-gray-500 self-center text-xs">sub</span>
                    <input type="number" value={votingDays} onChange={(e) => setVotingDays(e.target.value)} className="bg-black border border-white/10 rounded-lg px-3 py-2 w-20 text-white text-sm font-mono focus:outline-none focus:border-[#ffd700]/50" />
                    <span className="text-gray-500 self-center text-xs">vote</span>
                  </div>
                  <button onClick={handleStartContest} disabled={isStarting} className="btn-arena w-full py-2.5 text-sm bg-gradient-to-r from-[#39ff14] to-[#00cc00]">
                    {isStarting ? "Starting..." : "🚀 Start"}
                  </button>
                </div>
              )}

              {/* Fund */}
              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Fund Prize Pool</div>
                <input type="text" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} className="bg-black border border-white/10 rounded-lg px-3 py-2 w-full text-white text-sm font-mono mb-3 focus:outline-none focus:border-[#ffd700]/50" placeholder="CLAWD amount" />
                <button onClick={handleFundPrizePool} disabled={isFunding || isFundApproving} className="btn-arena w-full py-2.5 text-sm bg-gradient-to-r from-[#ffd700] to-[#ff8800]">
                  {isFundApproving ? "Approving..." : isFunding ? "Funding..." : "💰 Fund"}
                </button>
              </div>

              {/* Phase Advances */}
              {phase === 1 && (
                <button onClick={handleAdvanceToVoting} disabled={isAdvancingVoting} className="btn-arena w-full py-3 text-sm bg-gradient-to-r from-[#ff00ff] to-[#cc00cc]">
                  {isAdvancingVoting ? "..." : "⚡ Advance to Voting"}
                </button>
              )}
              {phase === 2 && (
                <button onClick={handleAdvanceToJudging} disabled={isAdvancingJudging} className="btn-arena w-full py-3 text-sm bg-gradient-to-r from-[#ffd700] to-[#ff8800]">
                  {isAdvancingJudging ? "..." : "🧑‍⚖️ Advance to Judging"}
                </button>
              )}

              {/* Distribute */}
              {phase === 3 && (
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Distribute Prizes</div>
                  <input type="text" value={winnerIds} onChange={(e) => setWinnerIds(e.target.value)} className="bg-black border border-white/10 rounded-lg px-3 py-2 w-full text-white text-sm font-mono mb-2 focus:outline-none focus:border-[#ffd700]/50" placeholder="IDs: 1,3,5" />
                  <input type="text" value={winnerAmounts} onChange={(e) => setWinnerAmounts(e.target.value)} className="bg-black border border-white/10 rounded-lg px-3 py-2 w-full text-white text-sm font-mono mb-3 focus:outline-none focus:border-[#ffd700]/50" placeholder="Amounts: 1000000,500000,250000" />
                  <button onClick={handleDistributePrizes} disabled={isDistributing} className="btn-arena w-full py-2.5 text-sm bg-gradient-to-r from-[#ffd700] to-[#ff8800]">
                    {isDistributing ? "..." : "🏆 Distribute"}
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
          <div className="bg-[#0a0a0a] border border-[#ff00ff]/30 rounded-2xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">
                <span className="text-[#ff00ff]">🚀</span> LAUNCH MEME
              </h3>
              <button onClick={() => setShowSubmit(false)} className="text-gray-500 hover:text-white text-xl transition-colors">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono mb-2 block">Image URL</label>
                <input
                  type="text"
                  value={imageUri}
                  onChange={(e) => setImageUri(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#ff00ff]/50 transition-colors placeholder-gray-700"
                  placeholder="https://..."
                />
              </div>

              {imageUri && (
                <div className="bg-black rounded-xl overflow-hidden border border-white/5">
                  <img
                    src={imageUri}
                    alt="Preview"
                    className="max-h-48 mx-auto"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono mb-2 flex justify-between">
                  <span>Title</span>
                  <span className="text-gray-700">{title.length}/100</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#ff00ff]/50 transition-colors placeholder-gray-700"
                  placeholder="My spicy meme"
                />
              </div>

              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono mb-1">Entry Fee</div>
                <div className="text-2xl font-black text-[#ff00ff] font-mono">
                  {fmtClawdFull(submissionFee)} CLAWD
                </div>
                <div className="text-[10px] text-[#ff3366] font-mono mt-1">10% burned 🔥</div>
              </div>

              <button
                onClick={handleSubmitMeme}
                disabled={!imageUri || !title || isApproving || isSubmitting}
                className="btn-arena w-full py-4 text-lg"
              >
                {isApproving ? "APPROVING..." : isSubmitting ? "LAUNCHING..." : "🚀 DEPLOY TO ARENA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PREVIEW MODAL — FULL SCREEN ═══ */}
      {previewMeme && (
        <div
          className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-2 md:p-4"
          onClick={() => setPreviewMeme(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setPreviewMeme(null)}
              className="absolute -top-2 -right-2 md:top-2 md:right-2 z-10 w-10 h-10 bg-black/80 border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:border-[#ff00ff]/50 transition-all text-lg"
            >
              ✕
            </button>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center overflow-hidden rounded-t-2xl bg-black/50">
              <img
                src={previewMeme.imageUri}
                alt={previewMeme.title}
                className="max-w-full max-h-[70vh] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect fill='%23111' width='400' height='400'/><text x='200' y='200' text-anchor='middle' fill='%23333' font-size='80'>🦞</text></svg>`;
                }}
              />
            </div>

            {/* Info overlay */}
            <div className="bg-[#0a0a0a]/95 border-t border-white/5 rounded-b-2xl px-6 py-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-white">{previewMeme.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">by</span>
                    <Address address={previewMeme.creator} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-2xl font-black font-mono text-[#ff00ff]">
                      {fmtClawdFull(previewMeme.totalVotes)}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono uppercase">Power Level</div>
                  </div>
                  {previewMeme.winner && previewMeme.prizeAmount > 0n && (
                    <div className="text-right">
                      <div className="text-2xl font-black font-mono text-[#ffd700] neon-gold">
                        {fmtClawd(previewMeme.prizeAmount)}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono uppercase">Prize Won</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Vote in modal */}
              {(phase === 1 || phase === 2) && (
                <div className="flex gap-2 mt-4">
                  <input
                    type="text"
                    value={voteAmounts[Number(previewMeme.id)] || ""}
                    onChange={(e) => setVoteAmounts((prev) => ({ ...prev, [Number(previewMeme.id)]: e.target.value }))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#ff00ff]/50 transition-colors placeholder-gray-600"
                    placeholder={`Min ${fmtClawd(voteFee)} CLAWD`}
                  />
                  <button
                    onClick={() => handleVote(Number(previewMeme.id))}
                    disabled={votingMemeId === Number(previewMeme.id)}
                    className="btn-arena px-8 py-3 text-sm"
                  >
                    {votingMemeId === Number(previewMeme.id) ? "..." : "⚡ VOTE"}
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
