// cosmos/contracts.ts

import { 
    SigningStargateClient, 
    DeliverTxResponse, 
    coins, 
    StdFee 
  } from "@cosmjs/stargate";
  import { SigningCosmWasmClient, ExecuteResult } from "@cosmjs/cosmwasm-stargate";
  import { CosmosWallet, CosmosConfig } from "./wallet";
  
  // Helper: build a StdFee from gas & price
  function makeFee(gas: number, price: number, denom: string): StdFee {
    const amount = Math.ceil(gas * price);
    return {
      amount: coins(amount, denom),
      gas: gas.toString(),
    };
  }
  
  export interface CosmosEscrowEvent {
    orderHash: string;
    hashlock: string;
    maker: string;
    taker: string;
    token: string;
    amount: string;
    safetyDeposit: string;
    timelocks: {
      srcWithdrawal: number;
      srcPublicWithdrawal: number;
      srcCancellation: number;
      srcPublicCancellation: number;
      dstWithdrawal: number;
      dstPublicWithdrawal: number;
      dstCancellation: number;
    };
  }
  
  export class CosmosEscrowFactory {
    private client: SigningStargateClient;
    private wasmClient: SigningCosmWasmClient;
    private address: string;
    private cfg: CosmosConfig;
  
    constructor(
      client: SigningStargateClient,
      wasmClient: SigningCosmWasmClient,
      address: string,
      cfg: CosmosConfig
    ) {
      this.client = client;
      this.wasmClient = wasmClient;
      this.address = address;
      this.cfg = cfg;
    }
  
    /** Get source implementation address */
    public async getSourceImpl(): Promise<string> {
      const queryMsg = { get_source_impl: {} };
      const response = await this.wasmClient.queryContractSmart(this.address, queryMsg);
      return response.address;
    }
  
    /** Get destination implementation address */
    public async getDestinationImpl(): Promise<string> {
      const queryMsg = { get_destination_impl: {} };
      const response = await this.wasmClient.queryContractSmart(this.address, queryMsg);
      return response.address;
    }
  
    /** Get source escrow deployment event from block */
    public async getSrcDeployEvent(blockHash: string): Promise<[CosmosEscrowEvent, any]> {
      // Query the contract for the latest escrow creation event
      const queryMsg = { get_latest_src_escrow: {} };
      const response = await this.wasmClient.queryContractSmart(this.address, queryMsg);
      
      const event: CosmosEscrowEvent = {
        orderHash: response.order_hash,
        hashlock: response.hashlock,
        maker: response.maker,
        taker: response.taker,
        token: response.token,
        amount: response.amount,
        safetyDeposit: response.safety_deposit,
        timelocks: response.timelocks
      };
      
      const complement = {
        maker: response.complement?.maker || response.maker,
        amount: response.complement?.amount || response.amount,
        token: response.complement?.token || response.token,
        safetyDeposit: response.complement?.safety_deposit || response.safety_deposit
      };
      
      return [event, complement];
    }
  }
  
  export class CosmosResolver {
    private client: SigningStargateClient;
    private wasmClient: SigningCosmWasmClient;
    private srcAddress: string;
    private dstAddress: string;
    private cfg: CosmosConfig;
  
    constructor(
      client: SigningStargateClient,
      wasmClient: SigningCosmWasmClient,
      srcAddress: string,
      dstAddress: string,
      cfg: CosmosConfig
    ) {
      this.client = client;
      this.wasmClient = wasmClient;
      this.srcAddress = srcAddress;
      this.dstAddress = dstAddress;
      this.cfg = cfg;
    }
  
    /** Deploy source escrow */
    public async deploySrc(
      orderHash: string,
      hashlock: string,
      maker: string,
      taker: string,
      token: string,
      amount: string,
      safetyDeposit: string,
      timelocks: any,
      signature: string,
      fillAmount: string
    ): Promise<ExecuteResult> {
      const msg = {
        deploy_src_escrow: {
          order: {
            order_hash: orderHash,
            maker,
            taker,
            token,
            amount,
            hashlock: Buffer.from(hashlock, 'hex'),
            timelock: timelocks.dstWithdrawal
          }
        }
      };
      
      const fee = makeFee(500_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.wasmClient.execute(
        await this.getSignerAddress(),
        this.srcAddress,
        msg,
        fee,
        "deploy source escrow"
      );
    }
  
    /** Deploy destination escrow */
    public async deployDst(
      immutables: CosmosEscrowEvent,
      complement: any
    ): Promise<ExecuteResult> {
      const msg = {
        deploy_dst_escrow: {
          order: {
            order_hash: immutables.orderHash,
            maker: immutables.maker,
            taker: immutables.taker,
            token: immutables.token,
            amount: complement.amount,
            hashlock: Buffer.from(immutables.hashlock, 'hex'),
            timelock: immutables.timelocks.dstWithdrawal
          }
        }
      };
      
      const fee = makeFee(500_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.wasmClient.execute(
        await this.getSignerAddress(),
        this.dstAddress,
        msg,
        fee,
        "deploy destination escrow"
      );
    }

    /** Deploy destination escrow with specific parameters */
    public async deployDstEscrow(
      orderHash: string,
      maker: string,
      taker: string,
      token: string,
      amount: string,
      hashlock: string,
      timelock: number
    ): Promise<ExecuteResult> {
      const msg = {
        deploy_dst_escrow: {
          order: {
            order_hash: orderHash,
            maker,
            taker,
            token,
            amount,
            hashlock: Buffer.from(hashlock, 'hex'),
            timelock
          }
        }
      };
      
      const fee = makeFee(500_000, this.cfg.gasPrice, this.cfg.feeDenom);
      return this.wasmClient.execute(
        await this.getSignerAddress(),
        this.dstAddress,
        msg,
        fee,
        "deploy destination escrow"
      );
    }
  
    /** Withdraw funds from escrow */
    public async withdraw(
      side: 'src' | 'dst',
      escrowAddress: string,
      secret: string,
      immutables: CosmosEscrowEvent
    ): Promise<ExecuteResult> {
      const msg = {
        withdraw: {
          side,
          escrow_address: escrowAddress,
          secret,
          immutables: JSON.stringify(immutables)
        }
      };
      
      const fee = makeFee(200_000, this.cfg.gasPrice, this.cfg.feeDenom);
      const contractAddress = side === 'src' ? this.srcAddress : this.dstAddress;
      
      return this.wasmClient.execute(
        await this.getSignerAddress(),
        contractAddress,
        msg,
        fee,
        `withdraw from ${side} escrow`
      );
    }
  
    /** Cancel escrow */
    public async cancel(
      side: 'src' | 'dst',
      escrowAddress: string,
      immutables: CosmosEscrowEvent
    ): Promise<ExecuteResult> {
      const msg = {
        cancel: {
          side,
          escrow_address: escrowAddress,
          immutables: JSON.stringify(immutables)
        }
      };
      
      const fee = makeFee(200_000, this.cfg.gasPrice, this.cfg.feeDenom);
      const contractAddress = side === 'src' ? this.srcAddress : this.dstAddress;
      
      return this.wasmClient.execute(
        await this.getSignerAddress(),
        contractAddress,
        msg,
        fee,
        `cancel ${side} escrow`
      );
    }
  
    private async getSignerAddress(): Promise<string> {
      // For now, return a placeholder - in real implementation, get from signer
      return "cosmos1placeholder";
    }
  } 