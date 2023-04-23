// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./IMigratableStakingContract.sol";

/// @title Orbs staking migration smart contract.
contract StakingMigrationContract is IMigratableStakingContract {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // The address of the ORBS token.
    IERC20 public token;

    address public stakeOwner;
    address public destAddress;
    uint8 public cooldownDays;
    uint256 public cooldownExpiry;

    /// @dev Initializes the migration contract.
    /// @param _stakeOwner address The original address which staked the tokens
    /// @param _destAddress address The target address for the tokens after recovery
    /// tokens back to their owners.
    /// @param _cooldownDays uint8 The period (in days) between a stake owner's request to stop staking and being
    /// able to withdraw them.
    /// @param _token IERC20 The address of the ORBS token.
    constructor(IERC20 _token, address _stakeOwner, address _destAddress, uint8 _cooldownDays) {
        require(address(_token) != address(0), "null address");
        require(address(_stakeOwner) != address(0), "null address");
        require(address(_destAddress) != address(0), "null address");
        token = _token;
        stakeOwner = _stakeOwner;
        destAddress = _destAddress;
        cooldownDays = _cooldownDays;
    }

    /// @dev Migrates ORBS tokens on behalf of msg.sender.
    /// @param _stakeOwner address The specified stake owner.
    /// @param _amount uint256 The amount of tokens to migrate.
    function acceptMigration(address _stakeOwner, uint256 _amount) external override {
        require(_amount > 0, "Amount is 0");
        require(_stakeOwner == stakeOwner, "Stake owner is not allowed");

        token.safeTransferFrom(msg.sender, address(this), _amount);

        // set cooldown
        cooldownExpiry = block.timestamp + (cooldownDays * 1 days);

        emit AcceptedMigration(_stakeOwner, _amount, token.balanceOf(address(this)));
    }

    /// @dev Sends the migrated tokens to staker's destination address.
    /// Anyone can call this function. It will only send the tokens if cooldown has finished.
    function recoverTokens() public {
        uint256 orbsBalance = token.balanceOf(address(this));
        require(orbsBalance > 0, "No tokens to recover");
        require(block.timestamp > cooldownExpiry, "Cooldown");
        token.safeTransfer(destAddress, orbsBalance);
    }

    /// @dev Returns the address of the underlying staked token.
    /// @return IERC20 The address of the token.
    function getToken() external view override returns (IERC20) {
        return token;
    }
}
