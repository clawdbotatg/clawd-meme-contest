// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdMemeContest.sol";
import "../contracts/MockERC20.sol";

contract DeployMemeContest is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // Deploy mock CLAWD token for local testing
        MockCLAWD mockClawd = new MockCLAWD();

        uint256 submissionFee = 615_000 * 1e18; // 615,000 CLAWD
        uint256 voteFee = 308_000 * 1e18;       // 308,000 CLAWD
        uint256 burnBps = 1000;                   // 10%

        ClawdMemeContest contest = new ClawdMemeContest(
            address(mockClawd),
            submissionFee,
            voteFee,
            burnBps,
            deployer
        );

        // Fund deployer and approve for testing convenience
        // MockCLAWD already minted 1B to deployer in constructor,
        // but deployer here is the ScaffoldETH deployer address (not this script contract).
        // Transfer some tokens to deployer for testing
        mockClawd.mint(deployer, 100_000_000 * 1e18);

        console.logString(
            string.concat(
                "ClawdMemeContest deployed at: ",
                vm.toString(address(contest)),
                " | MockCLAWD at: ",
                vm.toString(address(mockClawd))
            )
        );
    }
}
