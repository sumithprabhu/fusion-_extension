// cosmos/cosmosWallet.ts

import { 
    SigningStargateClient, 
    DeliverTxResponse, 
    coins, 
    StdFee 
  } from "@cosmjs/stargate";
  import { SigningCosmWasmClient, ExecuteResult } from "@cosmjs/cosmwasm-stargate";
  import { DirectSecp256k1HdWallet, OfflineSigner } from "@cosmjs/proto-signing";
  import { toUtf8 } from "@cosmjs/encoding";
  
  export interface CosmosConfig {
    rpcEndpoint: string;      // e.g. "https://rpc.uni.juno.deuslabs.fi"
    prefix: string;           // e.g. "juno"
    feeDenom: string;         // e.g. "ujuno"
    gasPrice: number;         // e.g. 0.025
  }
  
  // Helper: build a StdFee from gas & price
  function makeFee(gas: number, price: number, denom: string): StdFee {
    const amount = Math.ceil(gas * price);
    return {
      amount: coins(amount, denom),
      gas: gas.toString(),
    };
  }
  
  export class CosmosWallet {
    public client: SigningStargateClient;
    public wasmClient: SigningCosmWasmClient;
    public signer: OfflineSigner;
    public address: string;
    private cfg: CosmosConfig;
  
    private constructor(
      client: SigningStargateClient,
      wasmClient: SigningCosmWasmClient,
      signer: OfflineSigner,
      address: string,
      cfg: CosmosConfig
    ) {
      this.client = client;
      this.wasmClient = wasmClient;
      this.signer = signer;
      this.address = address;
      this.cfg = cfg;
    }
  
    /** Create from a BIP‑39 mnemonic */
    public static async fromMnemonic(
      mnemonic: string,
      cfg: CosmosConfig
    ): Promise<CosmosWallet> {
      const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: cfg.prefix,
      });
      const [account] = await signer.getAccounts();
      const client = await SigningStargateClient.connectWithSigner(
        cfg.rpcEndpoint,
        signer
      );
      const wasmClient = await SigningCosmWasmClient.connectWithSigner(
        cfg.rpcEndpoint,
        signer
      );
      return new CosmosWallet(client, wasmClient, signer, account.address, cfg);
    }
  
    /** Impersonate or use an existing address via local fork */
    public static async fromAddress(
      address: string,
      cfg: CosmosConfig
    ): Promise<CosmosWallet> {
      // If using a local wasmd fork, you can impersonate by RPC call:
      await fetch(cfg.rpcEndpoint, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "wasm_impersonateAccount",
          params: [address],
        }),
      });
      // Then retrieve signer - this is a placeholder for actual implementation
      const signer = await DirectSecp256k1HdWallet.fromMnemonic(
        "test test test test test test test test test test test junk",
        { prefix: cfg.prefix }
      );
      const client = await SigningStargateClient.connectWithSigner(
        cfg.rpcEndpoint,
        signer
      );
      const wasmClient = await SigningCosmWasmClient.connectWithSigner(
        cfg.rpcEndpoint,
        signer
      );
      return new CosmosWallet(client, wasmClient, signer, address, cfg);
    }
  
    /** Query native token balance */
    public async getBalance(denom: string): Promise<string> {
      const res = await this.client.getBalance(this.address, denom);
      return res.amount;
    }
  
    /** Send native tokens to another address */
    public async sendTokens(
      recipient: string,
      amount: number,
      denom: string
    ): Promise<DeliverTxResponse> {
      const fee = makeFee(200_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.client.sendTokens(
        this.address,
        recipient,
        coins(amount, denom),
        fee,
        "send tokens"
      );
    }
  
    /** Top up from a "donor" address on localnet by direct send */
    public async topUpFromDonor(
      donorMnemonic: string,
      amount: number,
      denom: string
    ): Promise<DeliverTxResponse> {
      const donor = await CosmosWallet.fromMnemonic(donorMnemonic, this.cfg);
      return donor.sendTokens(this.address, amount, denom);
    }
  
        /** Execute `lock_funds` on your HTLC contract */
    public async lockFunds(
      contractAddress: string,
      recipient: string,
      hashlock: string,
      timelock: number,
      amount: number
    ): Promise<ExecuteResult> {
      const msg = {
        lock_funds: {
          recipient,
          hashlock,
          timelock,
        },
      };
      const fee = makeFee(500_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.wasmClient.execute(
        this.address,
        contractAddress,
        msg,
        fee,
        "lock funds",
        coins(amount, this.cfg.feeDenom)
      );
    }

    /** Execute `claim` on HTLC contract */
    public async claim(
      contractAddress: string,
      preimage: string
    ): Promise<ExecuteResult> {
      const msg = { claim: { preimage } };
      const fee = makeFee(200_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.wasmClient.execute(
        this.address,
        contractAddress,
        msg,
        fee,
        "claim funds"
      );
    }

    /** Execute `refund` on HTLC contract */
    public async refund(
      contractAddress: string,
      hashlock: string
    ): Promise<ExecuteResult> {
      const msg = { refund: { hashlock } };
      const fee = makeFee(200_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.wasmClient.execute(
        this.address,
        contractAddress,
        msg,
        fee,
        "refund funds"
      );
    }

    /** Transfer native tokens */
    public async transfer(recipient: string, amount: string): Promise<DeliverTxResponse> {
      const fee = makeFee(100_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.client.sendTokens(
        this.address,
        recipient,
        coins(parseInt(amount), this.cfg.feeDenom),
        fee,
        "transfer tokens"
      );
    }

    /** Approve tokens for spending (placeholder for Cosmos) */
    public async unlimitedApprove(tokenAddress: string, spender: string): Promise<void> {
      // In Cosmos, token approvals work differently than in EVM
      // This is a placeholder implementation
      console.log(`Approving ${tokenAddress} for ${spender} on Cosmos`);
    }

    /** Get token balance (for Cosmos tokens) */
    public async tokenBalance(tokenAddress: string): Promise<string> {
      return this.getBalance(tokenAddress);
    }
  }
  