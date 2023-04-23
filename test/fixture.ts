import { deployArtifact, resetNetworkFork, tag, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import { account } from "@defi.org/web3-candies";
import type { StakingMigrationContract } from "../typechain-hardhat/contracts";

useChaiBigNumber();

export const OrbsWhale: string = "0xAe4e8FcbD07459789D6126B1917746D66db7eA0c";
export let dest: string;
export let deployer: string;
export const orbsToken = "0xff56Cc6b1E6dEd347aA0B7676C85AB0B3D08B0FA";
export const cooldownDays = "14";

export let migrationContract: StakingMigrationContract;
export let migrationContractAddress;

export async function initFixture(blockNumber?: number | "latest") {
  await resetNetworkFork(blockNumber);
  await initAccounts();

  migrationContract = await deployArtifact<StakingMigrationContract>("StakingMigrationContract", { from: deployer }, [
    orbsToken,
    OrbsWhale,
    dest,
    cooldownDays,
  ]);

  migrationContractAddress = migrationContract.options.address;
}

async function initAccounts() {
  deployer = await account(1);
  dest = await account(2);
  tag(deployer, "deployer");
  tag(OrbsWhale, "OrbsWhale");
  tag(dest, "dest");
}
