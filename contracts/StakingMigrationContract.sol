// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./IMigratableStakingContract.sol";

/// @title Orbs staking migration smart contract.
contract StakingMigrationContract is IMigratableStakingContract {
    using SafeMath for uint256;

    // The address of the ORBS token.
    IERC20 public token;

    address public srcAddress;
    address public destAddress;
    uint8 public cooldownDays;
    uint256 public cooldownExpiry;
    uint256 public totalStakedAmount = 0;

    /// @dev Initializes the staking contract.
    /// @param _srcAddress address The original address which staked the tokens
    /// @param _destAddress address The target address for the tokens after recovery
    /// tokens back to their owners.
    /// @param _cooldownDays uint8 The period (in days) between a stake owner's request to stop staking and being
    /// able to withdraw them.
    /// @param _token IERC20 The address of the ORBS token.
    constructor(IERC20 _token, address _srcAddress, address _destAddress, uint8 _cooldownDays) {
        require(address(_token) != address(0), "ORBS token must not be 0");
        require(address(_srcAddress) != address(0), "src address must not be 0");
        require(address(_destAddress) != address(0), "dest address must not be 0");
        token = _token;
        srcAddress = _srcAddress;
        destAddress = _destAddress;
        cooldownDays = _cooldownDays;
    }

    /// @dev Stakes ORBS tokens on behalf of msg.sender. This method assumes that the user has already approved at least
    /// the required amount using ERC20 approve.
    /// @param _stakeOwner address The specified stake owner.
    /// @param _amount uint256 The amount of tokens to stake.
    function acceptMigration(address _stakeOwner, uint256 _amount) external override {
        require(_amount > 0, "Amount must be greater than zero");
        require(_stakeOwner == srcAddress, "Stake owner is not the allowed address");

        require(token.transferFrom(msg.sender, address(this), _amount), "acceptMigration: couldn't transfer tokens");

        totalStakedAmount += _amount;

        // set cooldown
        cooldownExpiry = block.timestamp + (cooldownDays * 1 days);

        emit AcceptedMigration(_stakeOwner, _amount, totalStakedAmount);
    }

    /// @dev Sends the migrated tokens to staker's destination address.
    /// Anyone can call this function. It will only send the tokens if cooldown has finished.
    function recoverTokens() public {
        require(totalStakedAmount > 0, "Need to call acceptMigration first");
        require(block.timestamp > cooldownExpiry, "Cooldown hasn't finished yet");
        require(token.transfer(destAddress, totalStakedAmount), "recoverTokens: couldn't transfer tokens");
        totalStakedAmount = 0;
    }

    /// @dev Returns the address of the underlying staked token.
    /// @return IERC20 The address of the token.
    function getToken() external view override returns (IERC20) {
        return token;
    }
}
