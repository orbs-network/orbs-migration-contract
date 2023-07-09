import {
  deployArtifact,
  impersonate,
  resetNetworkFork,
  setBalance,
  tag,
  useChaiBigNumber,
} from "@defi.org/web3-candies/dist/hardhat";
import { account, contract, chainId, networks } from "@defi.org/web3-candies";
import type { StakingMigrationContract } from "../typechain-hardhat/contracts";
import { orbsTokenAbi, stakingContractAbi, stakingRewardsAbi } from "./abis";

useChaiBigNumber();

export let OrbsWhale;
export let randomDelegator;
export let dest;
export let deployer;
export let orbsToken;
export let orbsTokenContract;
export const cooldownDays = "14";
export let stakingContractAddress;
export let stakingContract;
let stakingRewardsContractAddress;
export let stakingRewardsContract;
export let migrationManagerAddress;
export let migrationContract: StakingMigrationContract;
export let migrationContract2: StakingMigrationContract;
export let migrationContractAddress;
export let migrationContractAddress2;

export async function initFixture(blockNumber?: number | "latest") {
  await resetNetworkFork(blockNumber);
  await initAccounts();

  switch (await chainId()) {
    case networks.eth.id:
      OrbsWhale = "0xAe4e8FcbD07459789D6126B1917746D66db7eA0c";
      randomDelegator = "0x6498Ed4e7577584a59e621e42De4ED0dCE80c136";
      orbsToken = "0xff56Cc6b1E6dEd347aA0B7676C85AB0B3D08B0FA";
      stakingContractAddress = "0x01D59Af68E2dcb44e04C50e05F62E7043F2656C3";
      stakingRewardsContractAddress = "0xB5303c22396333D9D27Dc45bDcC8E7Fc502b4B32";
      break;
    case networks.poly.id:
      OrbsWhale = "0x2fA676f4D6BdbBa48A52069C58A986b9B9EFE3fe";
      randomDelegator = "0x148a4E7f62C62d63912E23A65dDAC40f6EBE6389";
      orbsToken = "0x614389EaAE0A6821DC49062D56BDA3d9d45Fa2ff";
      stakingContractAddress = "0xEeAE6791F684117B7028b48Cb5dD21186dF80B9c";
      stakingRewardsContractAddress = "0x295d1982b1b20Cc0c02A0Da7285826c69EF71Fac";
      break;
  }
  // @ts-ignore
  stakingContract = contract(stakingContractAbi, stakingContractAddress);
  // @ts-ignore
  stakingRewardsContract = contract(stakingRewardsAbi, stakingRewardsContractAddress);
  // @ts-ignore
  orbsTokenContract = contract(orbsTokenAbi, orbsToken);

  migrationContract = await deployArtifact<StakingMigrationContract>("StakingMigrationContract", { from: deployer }, [
    orbsToken,
    OrbsWhale,
    dest,
    stakingContractAddress,
    cooldownDays,
  ]);

  migrationContract2 = await deployArtifact<StakingMigrationContract>("StakingMigrationContract", { from: deployer }, [
    orbsToken,
    OrbsWhale,
    dest,
    stakingContractAddress,
    1,
  ]);

  migrationContractAddress = migrationContract.options.address;
  migrationContractAddress2 = migrationContract2.options.address;

  migrationManagerAddress = await stakingContract.methods.migrationManager().call();
  await impersonate(migrationManagerAddress);
  await setBalance(migrationManagerAddress, 2 * 10e18);
  await stakingContract.methods
    .addMigrationDestination(migrationContractAddress)
    .send({ from: migrationManagerAddress });
  await impersonate(OrbsWhale);
  await setBalance(OrbsWhale, 10 * 10e18);
}

async function initAccounts() {
  deployer = await account(1);
  dest = await account(2);
  tag(deployer, "deployer");
  tag(OrbsWhale, "OrbsWhale");
  tag(dest, "dest");
}
