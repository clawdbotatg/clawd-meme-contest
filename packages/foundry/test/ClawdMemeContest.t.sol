// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ClawdMemeContest.sol";
import "../contracts/MockCLAWD.sol";

contract ClawdMemeContestTest is Test {
    ClawdMemeContest public contest;
    MockCLAWD public token;
    
    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    
    uint256 submissionFee = 615_000 * 1e18;
    uint256 voteFee = 308_000 * 1e18;
    uint256 burnBps = 1000; // 10%
    uint256 durationHours = 24;

    function setUp() public {
        token = new MockCLAWD();
        contest = new ClawdMemeContest(
            address(token),
            submissionFee,
            voteFee,
            burnBps,
            owner,
            durationHours
        );
        
        // Fund users
        token.mint(alice, 100_000_000 * 1e18);
        token.mint(bob, 100_000_000 * 1e18);
        token.mint(owner, 100_000_000 * 1e18);
    }

    // ============ Constructor ============

    function test_constructorSetsValues() public view {
        assertEq(address(contest.clawd()), address(token));
        assertEq(contest.submissionFee(), submissionFee);
        assertEq(contest.voteFee(), voteFee);
        assertEq(contest.burnBps(), burnBps);
        assertEq(contest.owner(), owner);
        assertEq(uint256(contest.currentPhase()), uint256(ClawdMemeContest.Phase.Submission));
        assertEq(contest.contestId(), 1);
    }

    // ============ Submit Meme ============

    function test_submitMeme() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Test Meme");
        vm.stopPrank();

        assertEq(contest.memeCount(), 1);
        ClawdMemeContest.Meme memory m = contest.getMeme(1);
        assertEq(m.creator, alice);
        assertEq(m.title, "Test Meme");
        assertEq(m.imageUri, "https://img.com/meme.jpg");
        assertEq(m.totalVotes, 0);
        assertFalse(m.winner);
    }

    function test_submitMeme_burnsPortion() public {
        uint256 deadBefore = token.balanceOf(contest.DEAD());
        
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Burn Test");
        vm.stopPrank();

        uint256 expectedBurn = (submissionFee * burnBps) / 10000;
        assertEq(token.balanceOf(contest.DEAD()) - deadBefore, expectedBurn);
        assertEq(contest.totalBurned(), expectedBurn);
    }

    function test_submitMeme_revertsWhenNotSubmissionPhase() public {
        // Advance to voting
        contest.advanceToVoting();
        
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.expectRevert("Not in submission phase");
        contest.submitMeme("https://img.com/meme.jpg", "Late Meme");
        vm.stopPrank();
    }

    function test_submitMeme_revertsEmptyUri() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.expectRevert("Empty image URI");
        contest.submitMeme("", "No Image");
        vm.stopPrank();
    }

    function test_submitMeme_revertsEmptyTitle() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.expectRevert("Invalid title");
        contest.submitMeme("https://img.com/meme.jpg", "");
        vm.stopPrank();
    }

    function test_submitMeme_revertsTitleTooLong() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        // 101 chars
        string memory longTitle = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        vm.expectRevert("Invalid title");
        contest.submitMeme("https://img.com/meme.jpg", longTitle);
        vm.stopPrank();
    }

    function test_submitMeme_revertsAfterDeadline() public {
        vm.warp(block.timestamp + durationHours * 1 hours + 1);
        
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.expectRevert("Submission period ended");
        contest.submitMeme("https://img.com/meme.jpg", "Too Late");
        vm.stopPrank();
    }

    // ============ Vote ============

    function test_vote() public {
        // Submit a meme first
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Votable Meme");
        vm.stopPrank();

        // Vote
        uint256 voteAmount = 1_000_000 * 1e18;
        vm.startPrank(bob);
        token.approve(address(contest), voteAmount);
        contest.vote(1, voteAmount);
        vm.stopPrank();

        uint256 expectedBurn = (voteAmount * burnBps) / 10000;
        uint256 expectedVoteValue = voteAmount - expectedBurn;
        
        ClawdMemeContest.Meme memory m = contest.getMeme(1);
        assertEq(m.totalVotes, expectedVoteValue);
        assertEq(contest.getVote(1, bob), expectedVoteValue);
    }

    function test_vote_revertsInvalidMeme() public {
        vm.startPrank(bob);
        token.approve(address(contest), voteFee);
        vm.expectRevert("Invalid meme");
        contest.vote(999, voteFee);
        vm.stopPrank();
    }

    function test_vote_revertsBelowMinimum() public {
        // Submit meme
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Meme");
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(contest), voteFee - 1);
        vm.expectRevert("Below minimum vote");
        contest.vote(1, voteFee - 1);
        vm.stopPrank();
    }

    // ============ Phase Transitions ============

    function test_advanceToVoting() public {
        contest.advanceToVoting();
        assertEq(uint256(contest.currentPhase()), uint256(ClawdMemeContest.Phase.Voting));
    }

    function test_advanceToVoting_revertsIfNotSubmission() public {
        contest.advanceToVoting();
        vm.expectRevert("Not in submission phase");
        contest.advanceToVoting();
    }

    function test_advanceToJudging() public {
        contest.advanceToVoting();
        contest.advanceToJudging();
        assertEq(uint256(contest.currentPhase()), uint256(ClawdMemeContest.Phase.Judging));
    }

    function test_advanceToJudging_revertsIfNotVoting() public {
        vm.expectRevert("Not in voting phase");
        contest.advanceToJudging();
    }

    // ============ Prize Distribution ============

    function test_distributePrizes() public {
        // Submit meme
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Winner Meme");
        vm.stopPrank();

        // Fund prize pool
        uint256 prizeAmount = 10_000_000 * 1e18;
        token.approve(address(contest), prizeAmount);
        contest.fundPrizePool(prizeAmount);

        // Advance phases
        contest.advanceToVoting();
        contest.advanceToJudging();

        // Distribute
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5_000_000 * 1e18;

        uint256 aliceBefore = token.balanceOf(alice);
        contest.distributePrizes(ids, amounts);

        assertEq(token.balanceOf(alice) - aliceBefore, 5_000_000 * 1e18);
        ClawdMemeContest.Meme memory m = contest.getMeme(1);
        assertTrue(m.winner);
        assertEq(m.prizeAmount, 5_000_000 * 1e18);
        assertEq(uint256(contest.currentPhase()), uint256(ClawdMemeContest.Phase.Completed));
    }

    function test_distributePrizes_revertsIfNotJudging() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.expectRevert("Not in judging phase");
        contest.distributePrizes(ids, amounts);
    }

    function test_distributePrizes_revertsExceedsPool() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Meme");
        vm.stopPrank();

        contest.advanceToVoting();
        contest.advanceToJudging();

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18; // No prize pool funded

        vm.expectRevert("Exceeds prize pool");
        contest.distributePrizes(ids, amounts);
    }

    // ============ Admin Functions ============

    function test_startNewContest() public {
        // End current contest
        contest.advanceToVoting();
        contest.advanceToJudging();
        // Distribute with no winners to complete
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.stopPrank();
        // Can't distribute empty, let's just check we can start after completed
        // We need at least one meme to distribute...let's just test from Inactive
        // Actually the contract allows starting from Completed state
        // Let's submit, fund, distribute, then start new
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.stopPrank();
        
        // Rewind — just deploy fresh
        ClawdMemeContest fresh = new ClawdMemeContest(
            address(token), submissionFee, voteFee, burnBps, owner, durationHours
        );
        // Submit
        vm.startPrank(alice);
        token.approve(address(fresh), submissionFee);
        fresh.submitMeme("https://img.com/a.jpg", "A");
        vm.stopPrank();
        // Fund
        token.approve(address(fresh), 1e18);
        fresh.fundPrizePool(1e18);
        // Advance and distribute
        fresh.advanceToVoting();
        fresh.advanceToJudging();
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;
        fresh.distributePrizes(ids, amounts);
        
        assertEq(uint256(fresh.currentPhase()), uint256(ClawdMemeContest.Phase.Completed));
        
        // Start new contest
        fresh.startContest(5, 3);
        assertEq(fresh.contestId(), 2);
        assertEq(uint256(fresh.currentPhase()), uint256(ClawdMemeContest.Phase.Submission));
    }

    function test_fundPrizePool() public {
        uint256 amount = 5_000_000 * 1e18;
        token.approve(address(contest), amount);
        contest.fundPrizePool(amount);
        assertEq(contest.prizePool(), amount);
    }

    function test_setFees() public {
        contest.setFees(1e18, 1e18, 500);
        assertEq(contest.submissionFee(), 1e18);
        assertEq(contest.voteFee(), 1e18);
        assertEq(contest.burnBps(), 500);
    }

    function test_setFees_revertsBurnTooHigh() public {
        vm.expectRevert("Burn too high");
        contest.setFees(1e18, 1e18, 5001);
    }

    function test_withdrawPrizePool() public {
        uint256 amount = 5_000_000 * 1e18;
        token.approve(address(contest), amount);
        contest.fundPrizePool(amount);
        
        uint256 before = token.balanceOf(owner);
        contest.withdrawPrizePool(amount);
        assertEq(token.balanceOf(owner) - before, amount);
    }

    function test_onlyOwnerFunctions() public {
        vm.startPrank(alice);
        vm.expectRevert();
        contest.advanceToVoting();
        vm.expectRevert();
        contest.setFees(1, 1, 1);
        vm.stopPrank();
    }

    // ============ View Functions ============

    function test_getAllMemes() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee * 2);
        contest.submitMeme("https://img.com/1.jpg", "Meme 1");
        contest.submitMeme("https://img.com/2.jpg", "Meme 2");
        vm.stopPrank();

        ClawdMemeContest.Meme[] memory all = contest.getAllMemes();
        assertEq(all.length, 2);
        assertEq(all[0].title, "Meme 1");
        assertEq(all[1].title, "Meme 2");
    }

    function test_getContestInfo() public view {
        (
            ClawdMemeContest.Phase phase,
            uint256 mc,
            uint256 pp,
            uint256 se,
            uint256 ve,
            uint256 cid
        ) = contest.getContestInfo();
        
        assertEq(uint256(phase), uint256(ClawdMemeContest.Phase.Submission));
        assertEq(mc, 0);
        assertEq(pp, 0);
        assertTrue(se > 0);
        assertEq(ve, se); // submission and voting end same in constructor
        assertEq(cid, 1);
    }

    function test_getMemesByCreator() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee * 2);
        contest.submitMeme("https://img.com/1.jpg", "A1");
        contest.submitMeme("https://img.com/2.jpg", "A2");
        vm.stopPrank();

        uint256[] memory aliceMemes = contest.getMemesByCreator(alice);
        assertEq(aliceMemes.length, 2);
        assertEq(aliceMemes[0], 1);
        assertEq(aliceMemes[1], 2);
    }

    // ============ Events ============

    function test_emitsMemeSubmitted() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        vm.expectEmit(true, true, false, true);
        emit ClawdMemeContest.MemeSubmitted(1, alice, "https://img.com/meme.jpg", "Event Test");
        contest.submitMeme("https://img.com/meme.jpg", "Event Test");
        vm.stopPrank();
    }

    function test_emitsVoteCast() public {
        vm.startPrank(alice);
        token.approve(address(contest), submissionFee);
        contest.submitMeme("https://img.com/meme.jpg", "Votable");
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(contest), voteFee);
        vm.expectEmit(true, true, false, true);
        emit ClawdMemeContest.VoteCast(1, bob, voteFee);
        contest.vote(1, voteFee);
        vm.stopPrank();
    }
}
