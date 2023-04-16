import {
  cooldownDays,
  deployer,
  dest,
  initFixture,
  migrationContract,
  migrationContractAddress,
  orbsToken,
  src,
} from "./fixture";
import { orbsTokenAbi, stakingContractAbi } from "./abis";
import BN from "bignumber.js";
import { contract, maxUint256 } from "@defi.org/web3-candies";
import { expect } from "chai";
import { expectRevert, impersonate, mineBlock, setBalance } from "@defi.org/web3-candies/dist/hardhat";

const stakingContractAddress = "0x01D59Af68E2dcb44e04C50e05F62E7043F2656C3";
const migrationManagerAddress = "0xb7d1068f267aB092973108f0F8CD914830cC1795";
// @ts-ignore
const stakingContract = contract(stakingContractAbi, stakingContractAddress);

async function setUp() {
  await impersonate(migrationManagerAddress);
  await setBalance(migrationManagerAddress, 2 * 10e18);
  await stakingContract.methods
      .addMigrationDestination(migrationContractAddress)
      .send({ from: migrationManagerAddress });
  await expectRevert(
      () => stakingContract.methods.migrateStakedTokens(migrationContractAddress, 1).send({ from: src }),
      /unknown account/
  );
  await impersonate(src);
  await setBalance(src, 2 * 10e18);
}

describe("StakingMigrationContract", async () => {
  beforeEach(() => initFixture());
  beforeEach(() => setUp());

  it("sanity", async () => {
    expect(await migrationContract.methods.token().call()).eq(orbsToken);
    expect(await migrationContract.methods.cooldownDays().call()).eq(cooldownDays);
    expect(await migrationContract.methods.srcAddress().call()).eq(src);
    expect(await migrationContract.methods.destAddress().call()).eq(dest);
    expect(await migrationContract.methods.totalStakedAmount().call()).eq(0);
    await expectRevert(
        () => stakingContract.methods.migrateStakedTokens(migrationContractAddress, 1).send({ from: deployer }),
        /StakingContract::migrateStakedTokens - no staked tokens/
    );
    await expectRevert(
        () => stakingContract.methods.migrateStakedTokens(migrationContractAddress, maxUint256).send({ from: src }),
        /amount exceeds staked token balance/
    );
    await expectRevert(
        () => migrationContract.methods.recoverTokens().send({ from: src }),
        /Need to call acceptMigration first/
    );
  });

  it("migrate full amount", async () => {
    const stakeBalance = await stakingContract.methods.getStakeBalanceOf(src).call();
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, stakeBalance).send({ from: src }); // 206237134462835322367340743
    expect(await migrationContract.methods.totalStakedAmount().call()).eq(stakeBalance);
    expect(await stakingContract.methods.getStakeBalanceOf(src).call()).eq("0");
  });

  it("migrate in 2 batches", async () => {
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: src }); // 206237134462835322367340743
    const cooldown = await migrationContract.methods.cooldownExpiry().call();
    expect(await migrationContract.methods.totalStakedAmount().call()).eq("10000000000000000000");
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: src }); // 206237134462835322367340743
    expect(await migrationContract.methods.totalStakedAmount().call()).eq("20000000000000000000");
    expect(await migrationContract.methods.cooldownExpiry().call()).not.eq(cooldown);
  });

  it.only("recover tokens", async () => {
    await stakingContract.methods.migrateStakedTokens(migrationContractAddress, BN(10e18)).send({ from: src }); // 206237134462835322367340743
    expect(await migrationContract.methods.totalStakedAmount().call()).eq("10000000000000000000");
    await expectRevert(
        () => migrationContract.methods.recoverTokens().send({ from: src }),
        /Cooldown hasn't finished yet/
    );
    await mineBlock(14 * 24 * 60 * 60);
    await migrationContract.methods.recoverTokens().send({ from: src });

    // @ts-ignore
    const orbsTokenContract = contract(orbsTokenAbi, orbsToken);
    expect(await migrationContract.methods.totalStakedAmount().call()).eq("0");
    expect(await orbsTokenContract.methods.balanceOf(dest).call(), "10000000000000000000");
  });
});
