import {
  cooldownDays,
  deployer,
  dest,
  initFixture,
  migrationContract,
  migrationContractAddress,
  orbsToken,
  OrbsWhale,
} from "./fixture";
import { orbsTokenAbi, stakingContractAbi } from "./abis";
import BN from "bignumber.js";
import {contract, maxUint256, parseEvents} from "@defi.org/web3-candies";
import { expect } from "chai";
import { expectRevert, impersonate, mineBlock, setBalance } from "@defi.org/web3-candies/dist/hardhat";

const stakingContractAddress = "0x01D59Af68E2dcb44e04C50e05F62E7043F2656C3";
// @ts-ignore
const stakingContract = contract(stakingContractAbi, stakingContractAddress);
// @ts-ignore
const orbsTokenContract = contract(orbsTokenAbi, orbsToken);

async function setUp() {
  const migrationManagerAddress = await stakingContract.methods.migrationManager().call();
  await impersonate(migrationManagerAddress);
  await setBalance(migrationManagerAddress, 2 * 10e18);
  await stakingContract.methods
    .addMigrationDestination(migrationContractAddress)
    .send({ from: migrationManagerAddress });
  await expectRevert(
    () => stakingContract.methods.migrateStakedTokens(migrationContractAddress, 1).send({ from: OrbsWhale }),
    /unknown account/
  );
  await impersonate(OrbsWhale);
  await setBalance(OrbsWhale, 2 * 10e18);
}

describe("StakingMigrationContract", async () => {
  beforeEach(() => initFixture());
  beforeEach(() => setUp());

  it("sanity", async () => {
    expect(await migrationContract.methods.token().call()).eq(orbsToken);
    expect(await migrationContract.methods.cooldownDays().call()).eq(cooldownDays);
    expect(await migrationContract.methods.stakeOwner().call()).eq(OrbsWhale);
    expect(await migrationContract.methods.destAddress().call()).eq(dest);
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

  it("migrate full amount", async () => {
    const stakeBalance = await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call();
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, stakeBalance).send({ from: OrbsWhale });
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call(), stakeBalance);
    expect(await stakingContract.methods.getStakeBalanceOf(OrbsWhale).call()).bignumber.zero;
  });

  it("migrate in 2 batches", async () => {
    let tx = await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: OrbsWhale });
    const cooldown = await migrationContract.methods.cooldownExpiry().call();

    let events = parseEvents(tx, migrationContract);
    expect(events[0].event).eq("AcceptedMigration");
    expect(events[0].returnValues[0]).eq(OrbsWhale);
    expect(events[0].returnValues[1]).bignumber.eq(10e18);
    expect(events[0].returnValues[2]).bignumber.eq(10e18);
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(10e18);

    tx = await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: OrbsWhale });
    events = parseEvents(tx, migrationContract);
    expect(events[0].event).eq("AcceptedMigration");
    expect(events[0].returnValues[0]).eq(OrbsWhale);
    expect(events[0].returnValues[1]).bignumber.eq(10e18);
    expect(events[0].returnValues[2]).bignumber.eq(20e18);

    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(20e18);
    expect(await migrationContract.methods.cooldownExpiry().call()).not.eq(cooldown);
  });

  it("recover tokens", async () => {
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: OrbsWhale });
    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.eq(10e18);
    await expectRevert(() => migrationContract.methods.recoverTokens().send({ from: OrbsWhale }), /Cooldown/);
    await mineBlock(14 * 24 * 60 * 60);
    await migrationContract.methods.recoverTokens().send({ from: OrbsWhale });

    expect(await orbsTokenContract.methods.balanceOf(migrationContractAddress).call()).bignumber.zero;
    expect(await orbsTokenContract.methods.balanceOf(dest).call()).bignumber.eq(10e18);
  });
});
