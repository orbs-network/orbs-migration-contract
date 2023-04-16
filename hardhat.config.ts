import "dotenv/config";
import {HardhatUserConfig} from "hardhat/config";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-etherscan";
import {hardhatDefaultConfig} from "@defi.org/web3-candies/dist/hardhat";
import _ from "lodash";

export default _.merge(hardhatDefaultConfig(), {
    networks: {
        hardhat: {
            blockGasLimit: 15e6,
        },
    },
    mocha: {
        bail: true,
    },
    tracer: {
        enabled: true
    }
} as HardhatUserConfig);
