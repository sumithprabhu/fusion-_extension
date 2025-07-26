# Cosmos Contracts

This directory contains the Rust CosmWasm smart contracts for the Cosmos extension of 1inch Fusion+.

## Structure

```
cosmos-contracts/
├── escrow/          # HTLC Escrow Contract
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs       # Main contract logic
│       ├── msg.rs       # Message types
│       ├── state.rs     # State management
│       ├── error.rs     # Error handling
│       └── schema.rs    # Schema generation
└── resolver/        # Cross-Chain Resolver Contract
    ├── Cargo.toml
    └── src/
        ├── lib.rs       # Main contract logic
        ├── msg.rs       # Message types
        ├── state.rs     # State management
        ├── error.rs     # Error handling
        └── schema.rs    # Schema generation
```

## Contracts

### 1. Escrow Contract (`escrow/`)

The HTLC (Hash Time Locked Contract) escrow contract that handles:
- **Create Escrow**: Lock funds with hashlock and timelock
- **Claim**: Withdraw funds using the correct preimage
- **Refund**: Return funds to maker after timelock expires

**Key Features:**
- Cryptographic hashlock verification
- Time-based locks for security
- State management for escrow lifecycle
- Access control for maker/taker operations

### 2. Resolver Contract (`resolver/`)

The cross-chain resolver contract that handles:
- **Deploy Source Escrow**: Create escrow on source chain
- **Deploy Destination Escrow**: Create escrow on destination chain
- **Withdraw**: Process withdrawals from escrows
- **Cancel**: Cancel escrows after timelock

**Key Features:**
- Cross-chain order resolution
- Ownership management with cw-ownable
- Integration with escrow contracts
- Event logging for tracking

## Building Contracts

### Prerequisites

1. **Install Rust**: https://rustup.rs/
2. **Install wasm-pack**: `cargo install wasm-pack`
3. **Install cosmwasm-opt**: `cargo install cosmwasm-opt`

### Build Commands

```bash
# Build escrow contract
cd cosmos-contracts/escrow
cargo build --target wasm32-unknown-unknown --release

# Build resolver contract
cd ../resolver
cargo build --target wasm32-unknown-unknown --release

# Optimize wasm files
cosmwasm-opt target/wasm32-unknown-unknown/release/cosmos_escrow.wasm -o target/wasm32-unknown-unknown/release/cosmos_escrow_opt.wasm
cosmwasm-opt target/wasm32-unknown-unknown/release/cosmos_resolver.wasm -o target/wasm32-unknown-unknown/release/cosmos_resolver_opt.wasm
```

## Deployment

### Testnet Deployment (Juno)

1. **Upload Contracts**:
```bash
# Upload escrow contract
junod tx wasm store target/wasm32-unknown-unknown/release/cosmos_escrow_opt.wasm \
  --from <your-key> \
  --chain-id uni-5 \
  --gas-prices 0.025ujunox \
  --gas auto \
  --gas-adjustment 1.3

# Upload resolver contract
junod tx wasm store target/wasm32-unknown-unknown/release/cosmos_resolver_opt.wasm \
  --from <your-key> \
  --chain-id uni-5 \
  --gas-prices 0.025ujunox \
  --gas auto \
  --gas-adjustment 1.3
```

2. **Instantiate Contracts**:
```bash
# Instantiate escrow contract
junod tx wasm instantiate <escrow-code-id> '{"owner": "<owner-address>"}' \
  --from <your-key> \
  --chain-id uni-5 \
  --gas-prices 0.025ujunox \
  --gas auto \
  --gas-adjustment 1.3 \
  --label "cosmos-escrow"

# Instantiate resolver contract
junod tx wasm instantiate <resolver-code-id> '{"resolver_address": "<resolver-address>"}' \
  --from <your-key> \
  --chain-id uni-5 \
  --gas-prices 0.025ujunox \
  --gas auto \
  --gas-adjustment 1.3 \
  --label "cosmos-resolver"
```

## Testing

### Unit Tests

```bash
# Test escrow contract
cd cosmos-contracts/escrow
cargo test

# Test resolver contract
cd ../resolver
cargo test
```

### Integration Tests

The contracts are tested through the TypeScript integration in `tests/cosmos/`.

## Configuration

After deployment, update the configuration in `tests/cosmos/config.ts`:

```typescript
export const cosmosConfig: CosmosChainConfig = {
  chainId: "uni-5", // Juno testnet
  rpcEndpoint: "https://rpc.uni.juno.deuslabs.fi",
  prefix: "juno",
  feeDenom: "ujunox",
  gasPrice: 0.025,
  escrowFactory: "juno1...", // Deployed escrow contract address
  resolver: "juno1...", // Deployed resolver contract address
  tokens: {
    USDC: {
      address: "ibc/...", // IBC USDC token address
      donor: "juno1..." // Funded donor account
    }
  }
};
```

## Security Considerations

1. **Access Control**: Only authorized resolvers can deploy escrows
2. **Timelock Validation**: Ensure timelocks are appropriate for the target chain
3. **Preimage Security**: Use cryptographically secure random preimages
4. **Fund Safety**: Implement proper emergency withdrawal mechanisms
5. **Contract Verification**: Verify deployed contracts on block explorers

## Development

### Adding New Features

1. **Update Message Types** (`msg.rs`): Add new execute/query messages
2. **Update State** (`state.rs`): Add new storage structures
3. **Update Logic** (`lib.rs`): Implement new functionality
4. **Update Errors** (`error.rs`): Add new error types
5. **Update Tests**: Add unit tests for new features

### Schema Generation

```bash
# Generate schema for escrow contract
cd cosmos-contracts/escrow
cargo run --example schema

# Generate schema for resolver contract
cd ../resolver
cargo run --example schema
```

## Integration with TypeScript

The contracts integrate with the TypeScript code in `tests/cosmos/` through:

- **Message Formatting**: Convert TypeScript objects to Rust contract messages
- **State Queries**: Query contract state for escrow information
- **Event Processing**: Handle contract events for cross-chain communication
- **Error Handling**: Map contract errors to TypeScript exceptions 