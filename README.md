# Staking Migration Contract

This is a Solidity smart contract that implements the `IMigratableStakingContract` interface for migrating staked ORBS tokens from the staking contract into a new contract.

### Installation

1. Clone the repository:
`git clone https://github.com/orbs-network/orbs-migration-contract.git`

2. Install the required dependencies:
`npm install`

3. Build using `npm run build`

### Testing

This project comes with a suite of unit tests. To run the tests, run the following command:
`npm test`

The tests are implemented using [Hardhat](https://hardhat.org/).

You need to create a `.env` file, with a `NETWORK_URL_ETH` entry inside (Ethereum RPC URL).

You can customize the Hardhat configuration in the `hardhat.config.js` file.

### Deployment
Deploy the contract, passing the ORBS token address, the source address, the destination address, and the cooldown period (in days) as constructor arguments.

Using the migrationManager wallet, add the newly deployed contrat (`addMigrationDestination`) .

### Usage
This contract allows users to migrate their staked ORBS tokens from one address to another. The steps to use this contract are as follows:

1. Recommended: go to https://staking.orbs.network and Claim pending rewards.
2. Call the `migrateStakedTokens` function in the [original staking contract](https://etherscan.io/address/0x01D59Af68E2dcb44e04C50e05F62E7043F2656C3), passing the stake owner address and the amount of tokens to be migrated. This function will transfer the tokens to the contract.
3. Wait for the cooldown period to finish.
4. Call the `recoverTokens` function to transfer the migrated tokens to the destination address.

Note that the `recoverTokens` function can be called by anyone, but it will only transfer the tokens if the cooldown period has finished.
