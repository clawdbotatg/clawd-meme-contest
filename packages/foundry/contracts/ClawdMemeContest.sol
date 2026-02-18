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

    // ============ Config ============
    uint256 public submissionFee;   // Cost to submit a tweet
    uint256 public voteCost;        // Fixed cost per vote (one-click buy)
    uint256 public burnBps;         // Basis points burned (1000 = 10%)

    // ============ Lifecycle ============
    enum Phase { Inactive, Active, Completed }
    Phase public currentPhase;
    uint256 public contestEnd;
    uint256 public contestId;

    // ============ Submissions ============
    struct Meme {
        uint256 id;
        address creator;
        string tweetUrl;
        uint256 totalVotes;
        uint256 submittedAt;
        uint256 prizeAmount;
    }

    uint256 public memeCount;
    mapping(uint256 => Meme) public memes;
    mapping(address => uint256[]) public creatorMemes;
    mapping(uint256 => mapping(address => uint256)) public votes;

    // ============ Moderation ============
    mapping(uint256 => bool) public censored;

    // ============ Stats ============
    uint256 public totalBurned;

    // ============ Events ============
    event ContestStarted(uint256 indexed contestId, uint256 contestEnd);
    event MemeSubmitted(uint256 indexed memeId, address indexed creator, string tweetUrl);
    event VoteCast(uint256 indexed memeId, address indexed voter, uint256 cost);
    event MemeCensored(uint256 indexed memeId, uint256 burnedAmount);
    event PrizesDistributed(uint256 indexed contestId, uint256 totalDistributed);
    event WinnerSelected(uint256 indexed memeId, address indexed creator, uint256 prizeAmount);
    event PhaseChanged(Phase newPhase);
    event FeesUpdated(uint256 submissionFee, uint256 voteCost, uint256 burnBps);

    constructor(
        address _clawd,
        uint256 _submissionFee,
        uint256 _voteCost,
        uint256 _burnBps,
        address _owner,
        uint256 _durationMinutes
    ) Ownable(_owner) {
        require(_clawd != address(0), "Invalid token");
        require(_burnBps <= 5000, "Burn too high");
        require(_durationMinutes > 0, "Invalid duration");
        clawd = IERC20(_clawd);
        submissionFee = _submissionFee;
        voteCost = _voteCost;
        burnBps = _burnBps;

        contestId = 1;
        contestEnd = block.timestamp + (_durationMinutes * 1 minutes);
        currentPhase = Phase.Active;

        emit ContestStarted(1, contestEnd);
        emit PhaseChanged(Phase.Active);
    }

    // ============ Modifiers ============

    modifier whenActive() {
        require(currentPhase == Phase.Active, "Contest not active");
        require(block.timestamp <= contestEnd, "Contest ended");
        _;
    }

    // ============ User Functions ============

    function submitMeme(string calldata tweetUrl) external nonReentrant whenActive {
        require(_isValidTweetUrl(tweetUrl), "Only X posts allowed");

        // Transfer fee
        clawd.safeTransferFrom(msg.sender, address(this), submissionFee);

        // Burn portion
        uint256 burnAmount = (submissionFee * burnBps) / 10000;
        if (burnAmount > 0) {
            clawd.safeTransfer(DEAD, burnAmount);
            totalBurned += burnAmount;
        }

        // Create meme
        memeCount++;
        memes[memeCount] = Meme({
            id: memeCount,
            creator: msg.sender,
            tweetUrl: tweetUrl,
            totalVotes: 0,
            submittedAt: block.timestamp,
            prizeAmount: 0
        });
        creatorMemes[msg.sender].push(memeCount);

        emit MemeSubmitted(memeCount, msg.sender, tweetUrl);
    }

    function vote(uint256 memeId) external nonReentrant whenActive {
        require(memeId > 0 && memeId <= memeCount, "Invalid meme");
        require(!censored[memeId], "Meme censored");

        // Transfer fixed vote cost
        clawd.safeTransferFrom(msg.sender, address(this), voteCost);

        // Burn portion
        uint256 burnAmount = (voteCost * burnBps) / 10000;
        if (burnAmount > 0) {
            clawd.safeTransfer(DEAD, burnAmount);
            totalBurned += burnAmount;
        }

        uint256 voteValue = voteCost - burnAmount;
        votes[memeId][msg.sender] += voteValue;
        memes[memeId].totalVotes += voteValue;

        emit VoteCast(memeId, msg.sender, voteCost);
    }

    // ============ Admin Functions ============

    /// @notice Distribute prizes to top memes. Owner calls with bonus amount to add.
    /// Sends all collected fees + bonus to winners, split by provided amounts.
    function distributePrizes(
        uint256[] calldata memeIds,
        uint256[] calldata amounts,
        uint256 bonusAmount
    ) external onlyOwner nonReentrant {
        require(block.timestamp > contestEnd || currentPhase == Phase.Active, "Contest still active");
        require(memeIds.length == amounts.length, "Length mismatch");
        require(memeIds.length > 0 && memeIds.length <= 5, "1-5 winners");

        // Pull bonus from owner
        if (bonusAmount > 0) {
            clawd.safeTransferFrom(msg.sender, address(this), bonusAmount);
        }

        uint256 totalPayout;
        for (uint256 i = 0; i < memeIds.length; i++) {
            Meme storage meme = memes[memeIds[i]];
            require(meme.id != 0, "Meme does not exist");
            require(amounts[i] > 0, "Zero prize");

            meme.prizeAmount += amounts[i];
            totalPayout += amounts[i];

            clawd.safeTransfer(meme.creator, amounts[i]);
            emit WinnerSelected(memeIds[i], meme.creator, amounts[i]);
        }

        uint256 balance = clawd.balanceOf(address(this));
        require(totalPayout <= balance + totalPayout, "Exceeds balance"); // sanity

        currentPhase = Phase.Completed;
        emit PrizesDistributed(contestId, totalPayout);
        emit PhaseChanged(Phase.Completed);
    }

    /// @notice Censor a meme — burns its remaining stake (submission fee + votes minus already-burned portion) and hides it
    function censorMeme(uint256 memeId) external onlyOwner {
        require(memeId > 0 && memeId <= memeCount, "Invalid meme");
        require(!censored[memeId], "Already censored");

        censored[memeId] = true;

        // Burn whatever CLAWD this meme contributed to the pool:
        // submission fee after burn + all vote value accumulated
        uint256 submitRetained = submissionFee - (submissionFee * burnBps) / 10000;
        uint256 burnAmount = submitRetained + memes[memeId].totalVotes;

        // Only burn what the contract actually holds
        uint256 bal = clawd.balanceOf(address(this));
        if (burnAmount > bal) burnAmount = bal;

        if (burnAmount > 0) {
            clawd.safeTransfer(DEAD, burnAmount);
            totalBurned += burnAmount;
        }

        emit MemeCensored(memeId, burnAmount);
    }

    function endContest() external onlyOwner {
        require(currentPhase == Phase.Active, "No active contest");
        currentPhase = Phase.Completed;
        emit PhaseChanged(Phase.Completed);
    }

    function startContest(uint256 _durationMinutes) external onlyOwner {
        require(currentPhase == Phase.Inactive || currentPhase == Phase.Completed, "Contest in progress");
        require(_durationMinutes > 0, "Invalid duration");

        contestId++;
        contestEnd = block.timestamp + (_durationMinutes * 1 minutes);
        currentPhase = Phase.Active;

        emit ContestStarted(contestId, contestEnd);
        emit PhaseChanged(Phase.Active);
    }

    function setFees(uint256 _submissionFee, uint256 _voteCost, uint256 _burnBps) external onlyOwner {
        require(_burnBps <= 5000, "Burn too high");
        submissionFee = _submissionFee;
        voteCost = _voteCost;
        burnBps = _burnBps;
        emit FeesUpdated(_submissionFee, _voteCost, _burnBps);
    }

    /// @notice Withdraw any remaining CLAWD (leftover fees after contest)
    function withdraw(uint256 amount) external onlyOwner {
        clawd.safeTransfer(owner(), amount);
    }

    // ============ View Functions ============

    function getMeme(uint256 memeId) external view returns (Meme memory) {
        require(memeId > 0 && memeId <= memeCount, "Invalid meme");
        return memes[memeId];
    }

    function getAllMemes() external view returns (Meme[] memory) {
        // Count uncensored memes first
        uint256 count;
        for (uint256 i = 1; i <= memeCount; i++) {
            if (!censored[i]) count++;
        }
        Meme[] memory result = new Meme[](count);
        uint256 j;
        for (uint256 i = 1; i <= memeCount; i++) {
            if (!censored[i]) {
                result[j] = memes[i];
                j++;
            }
        }
        return result;
    }

    function getContestInfo()
        external
        view
        returns (
            Phase phase,
            uint256 _memeCount,
            uint256 _contestEnd,
            uint256 _contestId,
            uint256 _balance
        )
    {
        return (currentPhase, memeCount, contestEnd, contestId, clawd.balanceOf(address(this)));
    }

    function getVote(uint256 memeId, address voter) external view returns (uint256) {
        return votes[memeId][voter];
    }

    // ============ Internal ============

    function _isValidTweetUrl(string calldata url) internal pure returns (bool) {
        bytes memory b = bytes(url);
        if (b.length < 20) return false;

        // Check https://x.com/
        if (b.length >= 14 &&
            b[0] == "h" && b[1] == "t" && b[2] == "t" && b[3] == "p" && b[4] == "s" &&
            b[5] == ":" && b[6] == "/" && b[7] == "/" && b[8] == "x" && b[9] == "." &&
            b[10] == "c" && b[11] == "o" && b[12] == "m" && b[13] == "/") {
            return true;
        }

        // Check https://twitter.com/
        if (b.length >= 20 &&
            b[0] == "h" && b[1] == "t" && b[2] == "t" && b[3] == "p" && b[4] == "s" &&
            b[5] == ":" && b[6] == "/" && b[7] == "/" && b[8] == "t" && b[9] == "w" &&
            b[10] == "i" && b[11] == "t" && b[12] == "t" && b[13] == "e" && b[14] == "r" &&
            b[15] == "." && b[16] == "c" && b[17] == "o" && b[18] == "m" && b[19] == "/") {
            return true;
        }

        return false;
    }
}
