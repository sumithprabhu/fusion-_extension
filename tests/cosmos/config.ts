// cosmos/config.ts

import { CosmosConfig } from "./wallet";

export interface CosmosChainConfig {
  chainId: string;
  rpcEndpoint: string;
  prefix: string;
  feeDenom: string;
  gasPrice: number;
  escrowFactory: string;
  resolver: string;
  tokens: {
    USDC: {
      address: string;
      donor: string;
    };
  };
}

export const cosmosConfig: CosmosChainConfig = {
  chainId: "juno-1",
  rpcEndpoint: "https://rpc.uni.juno.deuslabs.fi",
  prefix: "juno",
  feeDenom: "ujuno",
  gasPrice: 0.025,
  escrowFactory: "", // Will be deployed
  resolver: "", // Will be deployed
  tokens: {
    USDC: {
      address: "ibc/46B44899322F3CD854D2D46DEEF881958467CDD4B3B10086DA49296BBED94BED",
      donor: "juno1example" // Replace with actual donor address
    }
  }
};

export const cosmosWalletConfig: CosmosConfig = {
  rpcEndpoint: cosmosConfig.rpcEndpoint,
  prefix: cosmosConfig.prefix,
  feeDenom: cosmosConfig.feeDenom,
  gasPrice: cosmosConfig.gasPrice
}; 