// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ClawdMemeContest is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable clawd;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ============ Contest Config ============
    uint256 public submissionFee;
    uint256 public voteFee;
    uint256 public burnBps; // basis points, 1000 = 10%

    // ============ Contest Lifecycle ============
    enum Phase { Inactive, Submission, Voting, Judging, Completed }
    Phase public currentPhase;
    uint256 public submissionEnd;
    uint256 public votingEnd;
    uint256 public contestId;

    // ============ Submissions ============
    struct Meme {
        uint256 id;
        address creator;
        string imageUri;
        string title;
        uint256 totalVotes;
        uint256 submittedAt;
        bool winner;
        uint256 prizeAmount;
    }

    uint256 public memeCount;
    mapping(uint256 => Meme) public memes;
    mapping(address => uint256[]) public creatorMemes;
    mapping(uint256 => mapping(address => uint256)) public votes;

    // ============ Prize Pool ============
    uint256 public prizePool;
    uint256 public collectedFees;
    uint256 public totalBurned;

    // ============ Events ============
    event ContestStarted(uint256 indexed contestId, uint256 submissionEnd, uint256 votingEnd);
    event MemeSubmitted(uint256 indexed memeId, address indexed creator, string imageUri, string title);
    event VoteCast(uint256 indexed memeId, address indexed voter, uint256 amount);
    event PrizesDistributed(uint256 indexed contestId, uint256 totalDistributed);
    event WinnerSelected(uint256 indexed memeId, address indexed creator, uint256 prizeAmount);
    event PhaseChanged(Phase newPhase);
    event FeesUpdated(uint256 submissionFee, uint256 voteFee, uint256 burnBps);
    event PrizePoolFunded(address indexed funder, uint256 amount);

    constructor(
        address _clawd,
        uint256 _submissionFee,
        uint256 _voteFee,
        uint256 _burnBps,
        address _owner,
        uint256 _durationHours
    ) Ownable(_owner) {
        require(_clawd != address(0), "Invalid token");
        require(_burnBps <= 5000, "Burn too high"); // max 50%
        require(_durationHours > 0, "Invalid duration");
        clawd = IERC20(_clawd);
        submissionFee = _submissionFee;
        voteFee = _voteFee;
        burnBps = _burnBps;

        // Auto-start contest — open for submissions + voting immediately
        contestId = 1;
        submissionEnd = block.timestamp + (_durationHours * 1 hours);
        votingEnd = submissionEnd;
        currentPhase = Phase.Submission;

        emit ContestStarted(1, submissionEnd, votingEnd);
        emit PhaseChanged(Phase.Submission);
    }

    // ============ Admin Functions ============

    function startContest(uint256 _submissionDays, uint256 _votingDays) external onlyOwner {
        require(currentPhase == Phase.Inactive || currentPhase == Phase.Completed, "Contest in progress");
        require(_submissionDays > 0 && _votingDays > 0, "Invalid durations");

        contestId++;
        submissionEnd = block.timestamp + (_submissionDays * 1 days);
        votingEnd = submissionEnd + (_votingDays * 1 days);
        currentPhase = Phase.Submission;

        emit ContestStarted(contestId, submissionEnd, votingEnd);
        emit PhaseChanged(Phase.Submission);
    }

    function fundPrizePool(uint256 amount) external {
        require(amount > 0, "Zero amount");
        clawd.safeTransferFrom(msg.sender, address(this), amount);
        prizePool += amount;
        emit PrizePoolFunded(msg.sender, amount);
    }

    function advanceToVoting() external onlyOwner {
        require(currentPhase == Phase.Submission, "Not in submission phase");
        currentPhase = Phase.Voting;
        submissionEnd = block.timestamp; // close submissions now
        emit PhaseChanged(Phase.Voting);
    }

    function advanceToJudging() external onlyOwner {
        require(currentPhase == Phase.Voting, "Not in voting phase");
        currentPhase = Phase.Judging;
        votingEnd = block.timestamp; // close voting now
        emit PhaseChanged(Phase.Judging);
    }

    function distributePrizes(uint256[] calldata memeIds, uint256[] calldata amounts) external onlyOwner nonReentrant {
        require(currentPhase == Phase.Judging, "Not in judging phase");
        require(memeIds.length == amounts.length, "Length mismatch");
        require(memeIds.length > 0, "No winners");

        uint256 totalPayout;
        for (uint256 i = 0; i < memeIds.length; i++) {
            Meme storage meme = memes[memeIds[i]];
            require(meme.id != 0, "Meme does not exist");
            require(!meme.winner, "Already awarded");
            require(amounts[i] > 0, "Zero prize");

            meme.winner = true;
            meme.prizeAmount = amounts[i];
            totalPayout += amounts[i];

            clawd.safeTransfer(meme.creator, amounts[i]);
            emit WinnerSelected(memeIds[i], meme.creator, amounts[i]);
        }

        require(totalPayout <= prizePool, "Exceeds prize pool");
        prizePool -= totalPayout;
        currentPhase = Phase.Completed;

        emit PrizesDistributed(contestId, totalPayout);
        emit PhaseChanged(Phase.Completed);
    }

    function setFees(uint256 _submissionFee, uint256 _voteFee, uint256 _burnBps) external onlyOwner {
        require(_burnBps <= 5000, "Burn too high");
        submissionFee = _submissionFee;
        voteFee = _voteFee;
        burnBps = _burnBps;
        emit FeesUpdated(_submissionFee, _voteFee, _burnBps);
    }

    function withdrawPrizePool(uint256 amount) external onlyOwner {
        require(amount <= prizePool, "Exceeds prize pool");
        prizePool -= amount;
        clawd.safeTransfer(owner(), amount);
    }

    // ============ User Functions ============

    function submitMeme(string calldata imageUri, string calldata title) external nonReentrant {
        require(currentPhase == Phase.Submission, "Not in submission phase");
        require(block.timestamp <= submissionEnd, "Submission period ended");
        require(bytes(imageUri).length > 0, "Empty image URI");
        require(bytes(title).length > 0 && bytes(title).length <= 100, "Invalid title");

        // Transfer fee
        clawd.safeTransferFrom(msg.sender, address(this), submissionFee);

        // Burn portion
        uint256 burnAmount = (submissionFee * burnBps) / 10000;
        if (burnAmount > 0) {
            clawd.safeTransfer(DEAD, burnAmount);
            totalBurned += burnAmount;
        }
        collectedFees += (submissionFee - burnAmount);

        // Create meme
        memeCount++;
        memes[memeCount] = Meme({
            id: memeCount,
            creator: msg.sender,
            imageUri: imageUri,
            title: title,
            totalVotes: 0,
            submittedAt: block.timestamp,
            winner: false,
            prizeAmount: 0
        });
        creatorMemes[msg.sender].push(memeCount);

        emit MemeSubmitted(memeCount, msg.sender, imageUri, title);
    }

    function vote(uint256 memeId, uint256 amount) external nonReentrant {
        require(
            currentPhase == Phase.Submission || currentPhase == Phase.Voting,
            "Voting not active"
        );
        if (currentPhase == Phase.Voting) {
            require(block.timestamp <= votingEnd, "Voting period ended");
        }
        require(memeId > 0 && memeId <= memeCount, "Invalid meme");
        require(amount >= voteFee, "Below minimum vote");

        // Transfer vote amount
        clawd.safeTransferFrom(msg.sender, address(this), amount);

        // Burn portion
        uint256 burnAmount = (amount * burnBps) / 10000;
        if (burnAmount > 0) {
            clawd.safeTransfer(DEAD, burnAmount);
            totalBurned += burnAmount;
        }

        uint256 voteValue = amount - burnAmount;
        votes[memeId][msg.sender] += voteValue;
        memes[memeId].totalVotes += voteValue;
        collectedFees += voteValue;

        emit VoteCast(memeId, msg.sender, amount);
    }

    // ============ View Functions ============

    function getMeme(uint256 memeId) external view returns (Meme memory) {
        require(memeId > 0 && memeId <= memeCount, "Invalid meme");
        return memes[memeId];
    }

    function getAllMemes() external view returns (Meme[] memory) {
        Meme[] memory allMemes = new Meme[](memeCount);
        for (uint256 i = 1; i <= memeCount; i++) {
            allMemes[i - 1] = memes[i];
        }
        return allMemes;
    }

    function getMemesByCreator(address creator) external view returns (uint256[] memory) {
        return creatorMemes[creator];
    }

    function getContestInfo()
        external
        view
        returns (
            Phase phase,
            uint256 _memeCount,
            uint256 _prizePool,
            uint256 _submissionEnd,
            uint256 _votingEnd,
            uint256 _contestId
        )
    {
        return (currentPhase, memeCount, prizePool, submissionEnd, votingEnd, contestId);
    }

    function getVote(uint256 memeId, address voter) external view returns (uint256) {
        return votes[memeId][voter];
    }
}
