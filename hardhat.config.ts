import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import '@openzeppelin/hardhat-upgrades';
import dotenv from "dotenv"
import { ethers } from "ethers";

dotenv.config()

const MNEMONIC_SEPOLIA = process.env.MNEMONIC_SEPOLIA || "";
const MNEMONIC_BLAST = process.env.MNEMONIC_BLAST || "";
const BLASTSCAN_API_KEY = process.env.BLASTSCAN_API_KEY || "";
const GAS_REFUND_SIGNER_MNEMONIC = process.env.GAS_REFUND_MNEMONIC || "";

const ETH_RPC_URI = process.env.ETH_RPC_URI || "";
const BLAST_RPC_URI = process.env.BLAST_RPC_URI || "";
const SEPOLIA_RPC_URI = process.env.SEPOLIA_RPC_URI || "";


const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        }
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        }
      }
    ]
  },
  networks: {
    hardhat: {
      forking: {
        url: BLAST_RPC_URI,
        blockNumber: 3831616,
      },
      allowUnlimitedContractSize: false,
    },
    sepolia: {
      url: SEPOLIA_RPC_URI,
      accounts: {
        mnemonic: MNEMONIC_SEPOLIA,
      }
    },
    blast: {
      url: BLAST_RPC_URI,
      chainId: 81457,
      accounts: [
        ethers.Wallet.fromPhrase(MNEMONIC_BLAST).privateKey,
        ethers.Wallet.fromPhrase(GAS_REFUND_SIGNER_MNEMONIC).privateKey,
      ]
    }
  },
  etherscan: {
    apiKey: {
      blast: BLASTSCAN_API_KEY,
    },
    customChains: [
      {
        network: "blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io"
        }
      }
    ]
  },
  namedAccounts: {
    deployer: 0,
    gasSigner: 1,
  }
};

export default config;
