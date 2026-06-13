require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

const {
  AMOY_RPC_URL,
  AMOY_PRIVATE_KEY,
  AMOY_GAS_PRICE_GWEI
} = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.27",
  networks: {

    localhost: {
      url: "http://127.0.0.1:8545"
    },
    polygonAmoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: AMOY_PRIVATE_KEY ? [AMOY_PRIVATE_KEY] : undefined,
      // Pin the gas price: Amoy's base fee is ~0 and the enforced minimum tip
      // is 25 gwei, but RPCs suggest ~59 gwei — paying that doubles the cost.
      gasPrice: (parseInt(AMOY_GAS_PRICE_GWEI, 10) || 30) * 1e9
    }
  }
};
