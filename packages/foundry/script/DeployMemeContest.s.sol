// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdMemeContest.sol";
import "../contracts/MockCLAWD.sol";

contract DeployMemeContest is ScaffoldETHDeploy {
    // Real CLAWD token on Base
    address constant BASE_CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
    // Admin/owner on Base
    address constant BASE_OWNER = 0x11ce532845cE0eAcdA41f72FDc1C88c335981442;

    function run() external ScaffoldEthDeployerRunner {
        uint256 submissionFee = 615_000 * 1e18; // 615,000 CLAWD to submit
        uint256 voteCost = 308_000 * 1e18;       // 308,000 CLAWD per vote (one-click)
        uint256 burnBps = 1000;                   // 10%

        uint256 durationHours = 2; // 2-hour contest

        if (block.chainid == 31337) {
            // Local: deploy mock token
            MockCLAWD mockClawd = new MockCLAWD();

            ClawdMemeContest contest = new ClawdMemeContest(
                address(mockClawd),
                submissionFee,
                voteCost,
                burnBps,
                deployer,
                durationHours
            );

            mockClawd.mint(deployer, 100_000_000 * 1e18);

            console.logString(
                string.concat(
                    "ClawdMemeContest deployed at: ",
                    vm.toString(address(contest)),
                    " | MockCLAWD at: ",
                    vm.toString(address(mockClawd))
                )
            );
        } else {
            // Base (and other live networks): use real CLAWD token
            ClawdMemeContest contest = new ClawdMemeContest(
                BASE_CLAWD,
                submissionFee,
                voteCost,
                burnBps,
                BASE_OWNER,
                durationHours
            );

            console.logString(
                string.concat(
                    "ClawdMemeContest deployed at: ",
                    vm.toString(address(contest)),
                    " | CLAWD token: ",
                    vm.toString(BASE_CLAWD),
                    " | Owner: ",
                    vm.toString(BASE_OWNER)
                )
            );
        }
    }
}
