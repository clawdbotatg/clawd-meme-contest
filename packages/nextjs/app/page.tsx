"use client";

import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { Address } from "@scaffold-ui/components";
import { notification } from "~~/utils/scaffold-eth";

// Phase enum matching contract
const PHASE_NAMES = ["Inactive", "Submission", "Voting", "Judging", "Completed"] as const;
const PHASE_EMOJIS = ["💤", "🖼️", "🗳️", "🧑‍⚖️", "🏆"];
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

const formatClawd = (val: bigint | undefined) => {
  if (!val) return "0";
  const num = Number(formatEther(val));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toFixed(0);
};

const formatClawdFull = (val: bigint | undefined) => {
  if (!val) return "0";
  return Number(formatEther(val)).toLocaleString();
};

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewMeme, setPreviewMeme] = useState<Meme | null>(null);
  const [imageUri, setImageUri] = useState("");
  const [title, setTitle] = useState("");
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

  // CLAWD token reads
  const { data: contractInfo } = useDeployedContractInfo("ClawdMemeContest");
  const contestAddress = contractInfo?.address;

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
  const sortedMemes = allMemes
    ? [...allMemes].sort((a, b) => Number(b.totalVotes - a.totalVotes))
    : [];

  // Countdown timer
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
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  // Submit meme handler
  const handleSubmitMeme = async () => {
    if (!imageUri || !title) return;
    const fee = submissionFee || 0n;
    const currentAllowance = clawdAllowance || 0n;

    if (currentAllowance < fee) {
      setIsApproving(true);
      try {
        await writeClawd({
          functionName: "approve",
          args: [contestAddress, fee],
        });
      } catch (e) {
        console.error(e);
        notification.error("Approval failed");
        setIsApproving(false);
        return;
      }
      setIsApproving(false);
    }

    setIsSubmitting(true);
    try {
      await writeContest({
        functionName: "submitMeme",
        args: [imageUri, title],
      });
      notification.success("🦞 Meme submitted! CERTIFIED DANK!");
      setShowSubmitModal(false);
      setImageUri("");
      setTitle("");
    } catch (e) {
      console.error(e);
      notification.error("Submission failed");
    }
    setIsSubmitting(false);
  };

  // Vote handler
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
        await writeClawd({
          functionName: "approve",
          args: [contestAddress, amount],
        });
      } catch (e) {
        console.error(e);
        notification.error("Approval failed");
        setIsVoteApproving(false);
        setVotingMemeId(null);
        return;
      }
      setIsVoteApproving(false);
    }

    setVotingMemeId(memeId);
    try {
      await writeContest({
        functionName: "vote",
        args: [BigInt(memeId), amount],
      });
      notification.success("🗳️ Vote cast! The meme-o-meter goes UP!");
      setVoteAmounts(prev => ({ ...prev, [memeId]: "" }));
    } catch (e) {
      console.error(e);
      notification.error("Vote failed");
    }
    setVotingMemeId(null);
  };

  // Admin handlers
  const handleStartContest = async () => {
    setIsStarting(true);
    try {
      await writeContest({
        functionName: "startContest",
        args: [BigInt(submissionDays), BigInt(votingDays)],
      });
      notification.success("🚀 Contest started! Let the memes flow!");
    } catch (e) {
      console.error(e);
      notification.error("Failed to start contest");
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
        await writeClawd({
          functionName: "approve",
          args: [contestAddress, amount],
        });
      } catch (e) {
        console.error(e);
        notification.error("Approval failed");
        setIsFundApproving(false);
        return;
      }
      setIsFundApproving(false);
    }

    setIsFunding(true);
    try {
      await writeContest({
        functionName: "fundPrizePool",
        args: [amount],
      });
      notification.success("💰 Prize pool funded! The dankness grows!");
      setFundAmount("");
    } catch (e) {
      console.error(e);
      notification.error("Funding failed");
    }
    setIsFunding(false);
  };

  const handleAdvanceToVoting = async () => {
    setIsAdvancingVoting(true);
    try {
      await writeContest({ functionName: "advanceToVoting" });
      notification.success("🗳️ Voting phase started!");
    } catch (e) {
      console.error(e);
    }
    setIsAdvancingVoting(false);
  };

  const handleAdvanceToJudging = async () => {
    setIsAdvancingJudging(true);
    try {
      await writeContest({ functionName: "advanceToJudging" });
      notification.success("🧑‍⚖️ Judging phase started!");
    } catch (e) {
      console.error(e);
    }
    setIsAdvancingJudging(false);
  };

  const handleDistributePrizes = async () => {
    if (!winnerIds || !winnerAmounts) return;
    setIsDistributing(true);
    try {
      const ids = winnerIds.split(",").map(s => BigInt(s.trim()));
      const amounts = winnerAmounts.split(",").map(s => parseEther(s.trim()));
      await writeContest({
        functionName: "distributePrizes",
        args: [ids, amounts],
      });
      notification.success("🏆 Prizes distributed! Winners announced!");
    } catch (e) {
      console.error(e);
      notification.error("Distribution failed");
    }
    setIsDistributing(false);
  };

  // Get rank badge
  const getRankBadge = (rank: number, isWinner: boolean) => {
    if (isWinner) {
      if (rank === 0) return "🥇";
      if (rank === 1) return "🥈";
      if (rank === 2) return "🥉";
      return "🏆";
    }
    if (rank < 3) return `#${rank + 1}`;
    return "";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
      {/* Phase Banner */}
      <div
        className={`w-full py-3 text-center font-bold text-lg border-b-2 ${
          phase === 0 ? "bg-gray-800 border-gray-600 text-gray-400" :
          phase === 1 ? "bg-green-900/50 border-green-500 text-green-400" :
          phase === 2 ? "bg-purple-900/50 border-purple-500 text-purple-400" :
          phase === 3 ? "bg-orange-900/50 border-orange-500 text-orange-400" :
          "bg-yellow-900/50 border-yellow-500 text-yellow-400"
        }`}
      >
        <span className="text-2xl mr-2">{PHASE_EMOJIS[phase]}</span>
        {PHASE_NAMES[phase]} Phase
        {phase === 1 && submissionEnd > 0 && (
          <span className="ml-4 text-sm font-mono">⏰ {getCountdown(submissionEnd)}</span>
        )}
        {phase === 2 && votingEnd > 0 && (
          <span className="ml-4 text-sm font-mono">⏰ {getCountdown(votingEnd)}</span>
        )}
        {contestId > 0 && (
          <span className="ml-4 text-sm opacity-60">Contest #{contestId}</span>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/80 rounded-xl p-4 border border-green-500/30 text-center">
            <div className="text-green-400 text-sm font-bold mb-1">🏆 PRIZE POOL</div>
            <div className="text-2xl font-bold text-white">{formatClawd(prizePool)} CLAWD</div>
          </div>
          <div className="bg-gray-800/80 rounded-xl p-4 border border-purple-500/30 text-center">
            <div className="text-purple-400 text-sm font-bold mb-1">🖼️ SUBMISSIONS</div>
            <div className="text-2xl font-bold text-white">{memeCount}</div>
          </div>
          <div className="bg-gray-800/80 rounded-xl p-4 border border-orange-500/30 text-center">
            <div className="text-orange-400 text-sm font-bold mb-1">🔥 TOTAL BURNED</div>
            <div className="text-2xl font-bold text-white">{formatClawd(totalBurned)} CLAWD</div>
          </div>
          <div className="bg-gray-800/80 rounded-xl p-4 border border-cyan-500/30 text-center">
            <div className="text-cyan-400 text-sm font-bold mb-1">🦞 YOUR CLAWD</div>
            <div className="text-2xl font-bold text-white">{formatClawd(clawdBalance)}</div>
          </div>
        </div>

        {/* Admin Panel */}
        {isAdmin && (
          <div className="bg-gray-800/60 rounded-xl p-4 mb-8 border border-yellow-500/30">
            <h3 className="text-yellow-400 font-bold mb-3">🤖 Admin Controls (Clawd Only)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Start Contest */}
              {(phase === 0 || phase === 4) && (
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-sm text-gray-400 mb-2">Start New Contest</div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      value={submissionDays}
                      onChange={(e) => setSubmissionDays(e.target.value)}
                      className="bg-gray-800 text-white rounded px-3 py-1 w-20 border border-gray-600"
                      placeholder="Sub days"
                    />
                    <span className="text-gray-400 self-center text-sm">sub days</span>
                    <input
                      type="number"
                      value={votingDays}
                      onChange={(e) => setVotingDays(e.target.value)}
                      className="bg-gray-800 text-white rounded px-3 py-1 w-20 border border-gray-600"
                      placeholder="Vote days"
                    />
                    <span className="text-gray-400 self-center text-sm">vote days</span>
                  </div>
                  <button
                    onClick={handleStartContest}
                    disabled={isStarting}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg w-full"
                  >
                    {isStarting ? "Starting..." : "🚀 Start Contest"}
                  </button>
                </div>
              )}

              {/* Fund Prize Pool */}
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-sm text-gray-400 mb-2">Fund Prize Pool</div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="bg-gray-800 text-white rounded px-3 py-1 flex-1 border border-gray-600"
                    placeholder="Amount (CLAWD)"
                  />
                </div>
                <button
                  onClick={handleFundPrizePool}
                  disabled={isFunding || isFundApproving}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg w-full"
                >
                  {isFundApproving ? "Approving..." : isFunding ? "Funding..." : "💰 Fund the Dankness"}
                </button>
              </div>

              {/* Phase Advances */}
              {phase === 1 && (
                <button
                  onClick={handleAdvanceToVoting}
                  disabled={isAdvancingVoting}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {isAdvancingVoting ? "Advancing..." : "🗳️ Advance to Voting"}
                </button>
              )}
              {phase === 2 && (
                <button
                  onClick={handleAdvanceToJudging}
                  disabled={isAdvancingJudging}
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {isAdvancingJudging ? "Advancing..." : "🧑‍⚖️ Advance to Judging"}
                </button>
              )}

              {/* Distribute Prizes */}
              {phase === 3 && (
                <div className="bg-gray-900/50 rounded-lg p-3 col-span-full">
                  <div className="text-sm text-gray-400 mb-2">Distribute Prizes</div>
                  <input
                    type="text"
                    value={winnerIds}
                    onChange={(e) => setWinnerIds(e.target.value)}
                    className="bg-gray-800 text-white rounded px-3 py-1 w-full mb-2 border border-gray-600"
                    placeholder="Meme IDs (comma-separated): 1,3,5"
                  />
                  <input
                    type="text"
                    value={winnerAmounts}
                    onChange={(e) => setWinnerAmounts(e.target.value)}
                    className="bg-gray-800 text-white rounded px-3 py-1 w-full mb-2 border border-gray-600"
                    placeholder="Amounts in CLAWD (comma-separated): 1000000,500000,250000"
                  />
                  <button
                    onClick={handleDistributePrizes}
                    disabled={isDistributing}
                    className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg w-full"
                  >
                    {isDistributing ? "Distributing..." : "🏆 Distribute Prizes"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mint CLAWD for testing */}
        {connectedAddress && (
          <div className="mb-6 text-center">
            <button
              onClick={async () => {
                try {
                  await writeClawd({
                    functionName: "mint",
                    args: [connectedAddress, parseEther("10000000")],
                  });
                  notification.success("🦞 Minted 10M CLAWD for testing!");
                } catch (e) {
                  console.error(e);
                }
              }}
              className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-400 text-sm py-1 px-4 rounded-full"
            >
              🧪 Mint 10M Test CLAWD
            </button>
          </div>
        )}

        {/* Submit Button */}
        {phase === 1 && (
          <div className="text-center mb-8">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold text-xl py-4 px-8 rounded-2xl shadow-lg shadow-green-500/25 transition-all hover:scale-105 active:scale-95"
            >
              🖼️ Submit Your Spiciest Meme 🌶️
            </button>
            <p className="text-gray-500 text-sm mt-2">
              Cost: {formatClawdFull(submissionFee)} CLAWD (10% burned 🔥)
            </p>
          </div>
        )}

        {/* Meme Gallery */}
        {sortedMemes.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-4 text-center">
              {phase === 4 ? "🏆 Winners Gallery 🏆" : "🦞 Meme Gallery 🦞"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              {sortedMemes.map((meme, rank) => (
                <div
                  key={Number(meme.id)}
                  className={`bg-gray-800/80 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] cursor-pointer ${
                    meme.winner
                      ? "border-yellow-500 shadow-lg shadow-yellow-500/20"
                      : rank < 3
                      ? "border-purple-500/50"
                      : "border-gray-700"
                  }`}
                  onClick={() => {
                    setPreviewMeme(meme);
                    setShowPreviewModal(true);
                  }}
                >
                  {/* Image */}
                  <div className="relative h-48 bg-gray-900 flex items-center justify-center overflow-hidden">
                    {meme.imageUri ? (
                      <img
                        src={meme.imageUri}
                        alt={meme.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect fill='%231a1a2e' width='400' height='300'/><text x='200' y='150' text-anchor='middle' fill='%23666' font-size='40'>🦞</text><text x='200' y='190' text-anchor='middle' fill='%23444' font-size='14'>Image failed to load</text></svg>`;
                        }}
                      />
                    ) : (
                      <span className="text-6xl">🦞</span>
                    )}
                    {/* Rank badge */}
                    {(meme.winner || rank < 3) && (
                      <div className="absolute top-2 left-2 bg-black/70 rounded-full px-2 py-1 text-lg">
                        {getRankBadge(rank, meme.winner)}
                      </div>
                    )}
                    {/* CERTIFIED DANK badge */}
                    {meme.winner && (
                      <div className="absolute top-2 right-2 bg-yellow-500/90 text-black font-bold text-xs px-2 py-1 rounded-full rotate-12">
                        ✨ CERTIFIED DANK ✨
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-white truncate text-sm">{meme.title}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-gray-400 text-xs">by</span>
                      <Address address={meme.creator} size="xs" />
                    </div>

                    {/* Meme-o-meter */}
                    <div className="mt-2 bg-gray-900 rounded-lg p-2">
                      <div className="text-xs text-gray-500 mb-1">MEME-O-METER 📊</div>
                      <div className="text-lg font-bold text-purple-400">
                        {formatClawd(meme.totalVotes)} CLAWD
                      </div>
                      {/* Bar */}
                      <div className="w-full h-2 bg-gray-700 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                          style={{
                            width: `${
                              sortedMemes[0]?.totalVotes > 0n
                                ? Math.min(
                                    (Number(meme.totalVotes) / Number(sortedMemes[0].totalVotes)) * 100,
                                    100
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Prize display for winners */}
                    {meme.winner && meme.prizeAmount > 0n && (
                      <div className="mt-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-center">
                        <span className="text-yellow-400 font-bold text-sm">
                          🏆 Won {formatClawd(meme.prizeAmount)} CLAWD
                        </span>
                      </div>
                    )}

                    {/* Vote button */}
                    {(phase === 1 || phase === 2) && (
                      <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={voteAmounts[Number(meme.id)] || ""}
                          onChange={(e) =>
                            setVoteAmounts((prev) => ({
                              ...prev,
                              [Number(meme.id)]: e.target.value,
                            }))
                          }
                          className="bg-gray-900 text-white rounded px-2 py-1 w-full text-sm border border-gray-600"
                          placeholder={`Min ${formatClawd(voteFee)}`}
                        />
                        <button
                          onClick={() => handleVote(Number(meme.id))}
                          disabled={votingMemeId === Number(meme.id)}
                          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-1 px-3 rounded text-sm whitespace-nowrap"
                        >
                          {votingMemeId === Number(meme.id)
                            ? isVoteApproving
                              ? "Approving..."
                              : "Voting..."
                            : "🗳️ Vote"}
                        </button>
                      </div>
                    )}
                    {(phase === 1 || phase === 2) && (
                      <div className="flex gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                        {["308000", "500000", "1000000"].map((amt) => (
                          <button
                            key={amt}
                            onClick={() =>
                              setVoteAmounts((prev) => ({
                                ...prev,
                                [Number(meme.id)]: amt,
                              }))
                            }
                            className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-0.5 px-2 rounded flex-1"
                          >
                            {Number(amt) >= 1000000 ? `${Number(amt) / 1000000}M` : `${Number(amt) / 1000}K`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🦞</div>
            <h2 className="text-2xl font-bold text-gray-400 mb-2">No memes yet!</h2>
            <p className="text-gray-500">
              {phase === 0
                ? "Waiting for the contest to start..."
                : phase === 1
                ? "Be the first to submit a meme!"
                : "No submissions in this contest."}
            </p>
          </div>
        )}

        {/* Leaderboard */}
        {sortedMemes.length > 0 && (
          <div className="bg-gray-800/60 rounded-xl p-4 mb-8 border border-purple-500/20">
            <h3 className="text-xl font-bold text-white mb-3 text-center">📊 Leaderboard</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="py-2 text-left">Rank</th>
                    <th className="py-2 text-left">Meme</th>
                    <th className="py-2 text-left">Creator</th>
                    <th className="py-2 text-right">Votes (CLAWD)</th>
                    <th className="py-2 text-right">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMemes.map((meme, rank) => (
                    <tr
                      key={Number(meme.id)}
                      className={`border-b border-gray-700/50 ${
                        meme.winner ? "bg-yellow-500/5" : ""
                      }`}
                    >
                      <td className="py-2 text-lg">
                        {getRankBadge(rank, meme.winner) || rank + 1}
                      </td>
                      <td className="py-2 font-medium text-white">{meme.title}</td>
                      <td className="py-2">
                        <Address address={meme.creator} size="xs" />
                      </td>
                      <td className="py-2 text-right text-purple-400 font-mono">
                        {formatClawdFull(meme.totalVotes)}
                      </td>
                      <td className="py-2 text-right text-yellow-400 font-mono">
                        {meme.winner ? `${formatClawd(meme.prizeAmount)} 🏆` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-gray-800/40 rounded-xl p-6 mb-8 border border-gray-700">
          <h3 className="text-xl font-bold text-white mb-4 text-center">🦞 How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { emoji: "🖼️", title: "Submit", desc: "Upload your dankest meme and pay CLAWD to enter" },
              { emoji: "🗳️", title: "Vote", desc: "Stake CLAWD on your favorite memes" },
              { emoji: "🧑‍⚖️", title: "Clawd Judges", desc: "Clawd reviews memes + community votes" },
              { emoji: "🏆", title: "Win CLAWD", desc: "Winners get prizes from the pool!" },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl mb-2">{step.emoji}</div>
                <div className="font-bold text-white">{step.title}</div>
                <div className="text-gray-400 text-sm">{step.desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-orange-400 text-sm mt-4">
            🔥 10% of ALL fees are burned forever. The more you meme, the more we burn! 🔥
          </p>
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSubmitModal(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl border border-green-500/30 p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">🖼️ Submit Your Meme</h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <label className="text-gray-400 text-sm mb-1 block">Image URL</label>
              <input
                type="text"
                value={imageUri}
                onChange={(e) => setImageUri(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-4 py-2 w-full border border-gray-600 focus:border-green-500 outline-none"
                placeholder="https://example.com/meme.jpg"
              />
            </div>

            {imageUri && (
              <div className="mb-4 bg-gray-800 rounded-lg p-2">
                <img
                  src={imageUri}
                  alt="Preview"
                  className="max-h-48 mx-auto rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="mb-4">
              <label className="text-gray-400 text-sm mb-1 block">
                Title / Caption <span className="text-gray-600">({title.length}/100)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                className="bg-gray-800 text-white rounded-lg px-4 py-2 w-full border border-gray-600 focus:border-green-500 outline-none"
                placeholder="My spicy meme title"
              />
            </div>

            <div className="bg-gray-800 rounded-lg p-3 mb-4 text-center">
              <div className="text-gray-400 text-sm">Submission Fee</div>
              <div className="text-xl font-bold text-green-400">
                {formatClawdFull(submissionFee)} CLAWD
              </div>
              <div className="text-gray-500 text-xs">10% burned to the void 🔥</div>
            </div>

            <button
              onClick={handleSubmitMeme}
              disabled={!imageUri || !title || isApproving || isSubmitting}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-xl w-full text-lg"
            >
              {isApproving
                ? "Approving CLAWD..."
                : isSubmitting
                ? "Submitting..."
                : "🚀 Submit & Pay"}
            </button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {showPreviewModal && previewMeme && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl border border-purple-500/30 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white truncate flex-1">{previewMeme.title}</h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-gray-400 hover:text-white text-2xl ml-4"
              >
                ✕
              </button>
            </div>

            {/* Full-size image */}
            <div className="mb-4 bg-gray-800 rounded-lg overflow-hidden">
              <img
                src={previewMeme.imageUri}
                alt={previewMeme.title}
                className="w-full max-h-[60vh] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect fill='%231a1a2e' width='400' height='300'/><text x='200' y='150' text-anchor='middle' fill='%23666' font-size='40'>🦞</text></svg>`;
                }}
              />
            </div>

            {/* Meme details */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Creator</div>
                <Address address={previewMeme.creator} />
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Votes</div>
                <div className="text-xl font-bold text-purple-400">
                  {formatClawdFull(previewMeme.totalVotes)} CLAWD
                </div>
              </div>
            </div>

            {previewMeme.winner && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 text-center">
                <span className="text-yellow-400 font-bold text-lg">
                  🏆 Winner — {formatClawd(previewMeme.prizeAmount)} CLAWD
                </span>
              </div>
            )}

            {/* Vote in modal */}
            {(phase === 1 || phase === 2) && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voteAmounts[Number(previewMeme.id)] || ""}
                  onChange={(e) =>
                    setVoteAmounts((prev) => ({
                      ...prev,
                      [Number(previewMeme.id)]: e.target.value,
                    }))
                  }
                  className="bg-gray-800 text-white rounded-lg px-4 py-2 flex-1 border border-gray-600"
                  placeholder={`Min ${formatClawd(voteFee)} CLAWD`}
                />
                <button
                  onClick={() => handleVote(Number(previewMeme.id))}
                  disabled={votingMemeId === Number(previewMeme.id)}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg"
                >
                  {votingMemeId === Number(previewMeme.id)
                    ? isVoteApproving
                      ? "Approving..."
                      : "Voting..."
                    : "🗳️ Vote"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
