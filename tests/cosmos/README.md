# Cosmos Extension for 1inch Cross-Chain Swap (Fusion+)

This directory contains the Cosmos implementation for extending 1inch Fusion+ to support cross-chain swaps between Ethereum and Cosmos chains.

## Overview

The Cosmos extension enables bidirectional swaps between Ethereum and Cosmos chains while preserving the hashlock and timelock functionality of the original Fusion+ protocol.

## Architecture

### Components

1. **CosmosWallet** (`wallet.ts`)
   - Handles Cosmos wallet operations
   - Manages account creation, token transfers, and contract interactions
   - Supports both mnemonic and address-based wallet creation

2. **CosmosResolver** (`contracts.ts`)
   - Manages cross-chain order resolution
   - Handles escrow deployment on Cosmos chains
   - Processes withdrawals and cancellations

3. **CosmosEscrowFactory** (`contracts.ts`)
   - Manages escrow contract deployments
   - Handles source and destination implementation queries
   - Processes escrow creation events

4. **Smart Contracts** (`../contracts/src/`)
   - `CosmosEscrow.sol`: HTLC escrow contract for Cosmos
   - `CosmosResolver.sol`: Cross-chain resolver contract

## Configuration

### Cosmos Chain Configuration (`config.ts`)

```typescript
export const cosmosConfig: CosmosChainConfig = {
  chainId: "juno-1",
  rpcEndpoint: "https://rpc.uni.juno.deuslabs.fi",
  prefix: "juno",
  feeDenom: "ujuno",
  gasPrice: 0.025,
  escrowFactory: "", // Deployed contract address
  resolver: "", // Deployed contract address
  tokens: {
    USDC: {
      address: "ibc/46B44899322F3CD854D2D46DEEF881958467CDD4B3B10086DA49296BBED94BED",
      donor: "juno1example" // Replace with actual donor address
    }
  }
};
```

## Usage

### Running Tests

```bash
# Run the Cosmos extension tests
npm test -- tests/main-cosmos.spec.ts
```

### Key Features

1. **Bidirectional Swaps**: Support for both Ethereum → Cosmos and Cosmos → Ethereum swaps
2. **HTLC Logic**: Preserves hashlock and timelock functionality
3. **Cross-Chain Resolution**: Handles order resolution across different blockchain architectures
4. **Token Support**: Supports both native tokens and IBC tokens on Cosmos

### Test Scenarios

1. **Single Fill**: Complete order fulfillment in one transaction
2. **Multiple Fills**: Partial order fulfillment with multiple transactions
3. **Cancellation**: Order cancellation after timelock expiration

## Implementation Details

### Hashlock and Timelock

The implementation preserves the original Fusion+ hashlock and timelock mechanisms:

- **Hashlock**: Uses cryptographic hashes to secure funds until the correct preimage is provided
- **Timelock**: Implements time-based locks for both source and destination chains
- **Withdrawal**: Supports both private (with preimage) and public (after timelock) withdrawals

### Cross-Chain Communication

1. **Order Creation**: User creates order on source chain (Ethereum)
2. **Source Escrow**: Resolver deploys source escrow with locked funds
3. **Destination Escrow**: Resolver deploys destination escrow on Cosmos
4. **Preimage Sharing**: User shares preimage to unlock funds
5. **Fund Transfer**: Resolver withdraws funds from both escrows

## Dependencies

- `@cosmjs/stargate`: Cosmos SDK for blockchain interactions
- `@cosmjs/proto-signing`: Protocol buffer signing utilities
- `@cosmjs/encoding`: Encoding utilities for Cosmos

## Deployment

### Prerequisites

1. Cosmos chain RPC endpoint
2. Valid Cosmos account with funds
3. Deployed escrow and resolver contracts

### Contract Deployment

1. Deploy `CosmosEscrow.sol` on the target Cosmos chain
2. Deploy `CosmosResolver.sol` with the escrow contract address
3. Update configuration with deployed contract addresses

## Security Considerations

1. **Preimage Security**: Ensure preimages are cryptographically secure
2. **Timelock Validation**: Verify timelock values are appropriate for the target chain
3. **Contract Verification**: Verify deployed contracts on Cosmos block explorers
4. **Fund Safety**: Implement proper access controls and emergency withdrawal mechanisms

## Future Enhancements

1. **Relayer Integration**: Implement automated relayer for cross-chain communication
2. **Multi-Chain Support**: Extend to other Cosmos chains (Osmosis, Cosmos Hub, etc.)
3. **Advanced HTLC**: Implement more sophisticated HTLC variants
4. **Gas Optimization**: Optimize gas usage for Cosmos transactions
5. **Monitoring**: Add comprehensive monitoring and alerting systems 