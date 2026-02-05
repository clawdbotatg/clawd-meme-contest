//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployMemeContest } from "./DeployMemeContest.s.sol";

contract DeployScript is ScaffoldETHDeploy {
  function run() external {
    DeployMemeContest deployMemeContest = new DeployMemeContest();
    deployMemeContest.run();
  }
}
