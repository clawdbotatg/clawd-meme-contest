// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock ERC20 for local testing. Mints 1B tokens to deployer.
contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD", "CLAWD") {
        _mint(msg.sender, 1_000_000_000 * 1e18);
    }

    /// @notice Anyone can mint for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
