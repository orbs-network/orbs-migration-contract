import {
  deployer,
  dest,
  initFixture,
  migrationContract,
  migrationContractAddress,
  migrationContractAddress2,
  migrationManagerAddress,
  orbsToken,
  orbsTokenContract,
  randomDelegator,
  OrbsWhale,
  stakingContract,
  stakingContractAddress,
  stakingRewardsContract,
} from "./fixture";
import BN from "bignumber.js";
import { maxUint256, parseEvents } from "@defi.org/web3-candies";
import { expect } from "chai";
import { expectRevert, impersonate, mineBlock, setBalance } from "@defi.org/web3-candies/dist/hardhat";

describe("StakingMigrationContract", async () => {
  beforeEach(() => initFixture());

  it("Sanity", async () => {
    expect(await migrationContract.methods.token().call()).eq(orbsToken);
    expect(await migrationContract.methods.stakeOwner().call()).eq(OrbsWhale);
    expect(await migrationContract.methods.destAddress().call()).eq(dest);
    expect(await migrationContract.methods.stakingContractAddress().call()).eq(stakingContractAddress);
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call(), "0");

    await expectRevert(
      () => stakingContract.methods.migrateStakedTokens(migrationContractAddress, 1).send({ from: deployer }),
      /StakingContract::migrateStakedTokens - no staked tokens/
    );
    await expectRevert(
      () => stakingContract.methods.migrateStakedTokens(migrationContractAddress, maxUint256).send({ from: OrbsWhale }),
      /amount exceeds staked token balance/
    );
    await expectRevert(
      () => migrationContract.methods.recoverTokens().send({ from: OrbsWhale }),
      /No tokens to recover/
    );
  });

  it("Add/remove migration destinations", async () => {
    await expectRevert(
      async () =>
        await stakingContract.methods.addMigrationDestination(migrationContractAddress).send({ from: OrbsWhale }),
      /caller is not the migration manager/
    );
    await expectRevert(
      async () =>
        await stakingContract.methods.migrateStakedTokens(migrationContractAddress2, 1).send({ from: OrbsWhale }),
      /migration destination wasn't approved/
    );

    await expectRevert(
      async () =>
        await stakingContract.methods
          .removeMigrationDestination(migrationContractAddress2)
          .send({ from: migrationManagerAddress }),
      /staking contract doesn't exist/
    );
    await expectRevert(async () => await stakingContract.methods.approvedStakingContracts(1).call(), /invalid opcode/);
    const tx = await stakingContract.methods
      .addMigrationDestination(migrationContractAddress2)
      .send({ from: migrationManagerAddress });

    const events = parseEvents(tx, stakingContract);
    expect(events[0].event).eq("MigrationDestinationAdded");
    expect(events[0].returnValues[0]).eq(migrationContractAddress2);

    expect(await stakingContract.methods.isApprovedStakingContract(migrationContractAddress).call()).to.be.true;
    expect(await stakingContract.methods.isApprovedStakingContract(migrationContractAddress2).call()).to.be.true;
    expect(await stakingContract.methods.approvedStakingContracts(0).call()).eq(migrationContractAddress);
    expect(await stakingContract.methods.approvedStakingContracts(1).call()).eq(migrationContractAddress2);

    await stakingContract.methods
      .removeMigrationDestination(migrationContractAddress2)
      .send({ from: migrationManagerAddress });
    expect(await stakingContract.methods.isApprovedStakingContract(migrationContractAddress2).call()).to.be.false;
  });

  it("Migrate full amount", async () => {
    let stakeBalance = await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call();
    await stakingContract.methods.unstake(stakeBalance).send({ from: OrbsWhale });
    await stakingRewardsContract.methods.claimStakingRewards(OrbsWhale).send({ from: OrbsWhale });
    stakeBalance = await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call();
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, stakeBalance).send({ from: OrbsWhale });
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call(), stakeBalance);
    expect(await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call()).bignumber.zero;
    await expectRevert(() => migrationContract.methods.recoverTokens().send({ from: OrbsWhale }), /Cooldown/);
    await mineBlock(14 * 24 * 60 * 60);
    const tx = await migrationContract.methods.recoverTokens().send({ from: OrbsWhale });

    const events = parseEvents(tx, migrationContract);
    expect(events[0].event).eq("TokensRecovered");
    expect(events[0].returnValues[0]).eq(OrbsWhale);
    expect(events[0].returnValues[1]).eq(dest);
    expect(events[0].returnValues[2]).bignumber.eq(stakeBalance);

    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.zero;
    expect(await orbsTokenContract.methods.balanceOf(dest).call()).bignumber.eq(stakeBalance);
  });

  it("Migrate in 2 batches", async () => {
    let tx = await stakingContract.methods
      .migrateStakedTokens(migrationContractAddress, BN(10e18))
      .send({ from: OrbsWhale });

    let events = parseEvents(tx, migrationContract);
    expect(events[0].event).eq("AcceptedMigration");
    expect(events[0].returnValues[0]).eq(OrbsWhale);
    expect(events[0].returnValues[1]).bignumber.eq(10e18);
    expect(events[0].returnValues[2]).bignumber.eq(10e18);
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(10e18);

    tx = await stakingContract.methods
      .migrateStakedTokens(migrationContractAddress, BN(10e18))
      .send({ from: OrbsWhale });
    events = parseEvents(tx, migrationContract);
    expect(events[0].event).eq("AcceptedMigration");
    expect(events[0].returnValues[0]).eq(OrbsWhale);
    expect(events[0].returnValues[1]).bignumber.eq(10e18);
    expect(events[0].returnValues[2]).bignumber.eq(20e18);

    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(20e18);
  });

  it("Should not migrate unstaked tokens", async () => {
    const originalStakeBalance = BN(await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call());
    await stakingContract.methods.unstake(originalStakeBalance).send({ from: OrbsWhale });
    expect(await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call()).bignumber.zero;
    await expectRevert(
      async () =>
        await stakingContract.methods
          .migrateStakedTokens(migrationContractAddress, originalStakeBalance)
          .send({ from: OrbsWhale }),
      /no staked tokens/
    );
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.zero;
  });

  it("Should stake/unstake normally", async () => {
    const orbsBalance = await orbsTokenContract.methods.balanceOf(OrbsWhale).call();
    const testAmount = BN(10e18);

    await orbsTokenContract.methods
      .approve(stakingContractAddress, "99999999999999999999999999999999999999")
      .send({ from: OrbsWhale });
    await stakingContract.methods.stake(orbsBalance).send({ from: OrbsWhale });
    const stakeBalance = BN(await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call());
    await stakingContract.methods.unstake(testAmount).send({ from: OrbsWhale });
    await mineBlock(14 * 24 * 60 * 60);
    await stakingContract.methods.withdraw().send({ from: OrbsWhale });
    expect(await orbsTokenContract.methods.balanceOf(OrbsWhale).call()).bignumber.eq(testAmount);

    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, testAmount).send({ from: OrbsWhale });
    await stakingContract.methods.stake(testAmount).send({ from: OrbsWhale });
    await stakingContract.methods
      .removeMigrationDestination(migrationContractAddress)
      .send({ from: migrationManagerAddress });
    await stakingContract.methods.unstake(testAmount).send({ from: OrbsWhale });
    await mineBlock(14 * 24 * 60 * 60);
    await stakingContract.methods.withdraw().send({ from: OrbsWhale });

    expect(await orbsTokenContract.methods.balanceOf(OrbsWhale).call()).bignumber.eq(testAmount);
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(testAmount);
    expect(await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call()).bignumber.eq(
      stakeBalance.minus(testAmount.multipliedBy(2))
    );
  });

  it("Shouldn't affect guardian", async () => {
    const neoply = "0x9520f53fd81c668e8088ae194c40e3f977b73d28";

    const stakingRewardsBalance = await stakingRewardsContract.methods.getStakingRewardsBalance(OrbsWhale).call();
    // checking the delegator's guardian balances
    const guardianStakingRewardsBalance = await stakingRewardsContract.methods.getStakingRewardsBalance(neoply).call();
    const guardianStakeBalance = await stakingContract.methods.getStakeBalanceOf(neoply).call();

    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: OrbsWhale });
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(10e18);
    await mineBlock(14 * 24 * 60 * 60);
    await migrationContract.methods.recoverTokens().send({ from: OrbsWhale });

    const newStakingRewardsBalance = await stakingRewardsContract.methods.getStakingRewardsBalance(OrbsWhale).call();
    expect(BN(newStakingRewardsBalance.delegatorStakingRewardsBalance)).bignumber.greaterThan(
      BN(stakingRewardsBalance.delegatorStakingRewardsBalance)
    );
    const newGuardianStakingRewardsBalance = await stakingRewardsContract.methods
      .getStakingRewardsBalance(neoply)
      .call();
    expect(BN(newGuardianStakingRewardsBalance.delegatorStakingRewardsBalance)).bignumber.greaterThan(
      BN(guardianStakingRewardsBalance.delegatorStakingRewardsBalance)
    );
    expect(BN(newGuardianStakingRewardsBalance.guardianStakingRewardsBalance)).bignumber.greaterThan(
      BN(guardianStakingRewardsBalance.guardianStakingRewardsBalance)
    );
    const newGuardianStakeBalance = await stakingContract.methods.getStakeBalanceOf(neoply).call();
    expect(guardianStakeBalance).eq(newGuardianStakeBalance);
  });

  it("Shouldn't affect other delegators", async () => {
    await impersonate(randomDelegator);
    await setBalance(randomDelegator, 10 * 10e18);

    const orbsBalance = await orbsTokenContract.methods.balanceOf(randomDelegator).call();

    const testAmount = BN(10e18);
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, testAmount).send({ from: OrbsWhale });

    await orbsTokenContract.methods
      .approve(stakingContractAddress, "99999999999999999999999999999999999999")
      .send({ from: randomDelegator });
    await stakingContract.methods.stake(orbsBalance).send({ from: randomDelegator });
    const stakeBalance = BN(await stakingContract.methods.getStakeBalanceOf(randomDelegator).call());

    await stakingContract.methods
      .removeMigrationDestination(migrationContractAddress)
      .send({ from: migrationManagerAddress });

    await stakingContract.methods.unstake(stakeBalance).send({ from: randomDelegator });
    await mineBlock(14 * 24 * 60 * 60);
    await stakingContract.methods.withdraw().send({ from: randomDelegator });

    expect(await orbsTokenContract.methods.balanceOf(randomDelegator).call()).bignumber.eq(stakeBalance);
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(testAmount);
    expect(await stakingContract.methods.getStakeBalanceOf(randomDelegator).call()).bignumber.eq(0);
  });

  it("Shouldn't allow direct call of acceptMigration", async () => {
    await expectRevert(
      () => migrationContract.methods.acceptMigration(OrbsWhale, BN(10e18)).send({ from: OrbsWhale }),
      /Unauthorized caller/
    );
  });
});
