# Cross-chain Resolver Example

This is an example of 1inch cross chain resolver with **Cosmos extension** support.

## Project Structure

```
├── contracts/              # EVM Solidity contracts
│   ├── lib/               # Dependencies
│   └── src/               # Solidity source files
├── cosmos-contracts/       # Cosmos Rust contracts
│   ├── escrow/            # HTLC Escrow contract
│   └── resolver/          # Cross-chain Resolver contract
├── tests/                 # Test files
│   ├── cosmos/            # Cosmos integration tests
│   └── main.spec.ts       # EVM tests
└── dist/                  # Compiled contracts
```

## Features

- ✅ **EVM Support**: Original Ethereum ↔ BSC cross-chain swaps
- ✅ **Cosmos Extension**: Ethereum ↔ Cosmos cross-chain swaps
- ✅ **HTLC Logic**: Hashlock and timelock functionality
- ✅ **Bidirectional**: Swaps in both directions
- ✅ **Security**: Full access controls and safety mechanisms

## Installation

Install example deps

```shell
pnpm install
```

Install [foundry](https://book.getfoundry.sh/getting-started/installation)

```shell
curl -L https://foundry.paradigm.xyz | bash
```

Install contract deps

```shell
forge install
```

## Running

### EVM Tests (Ethereum ↔ BSC)

To run EVM tests you need to provide fork urls for Ethereum and BSC:

```shell
SRC_CHAIN_RPC=ETH_FORK_URL DST_CHAIN_RPC=BNB_FORK_URL pnpm test
```

### Cosmos Tests (Ethereum ↔ Cosmos)

To run Cosmos extension tests:

```shell
# Build Rust contracts first
cd cosmos-contracts/escrow && cargo build --target wasm32-unknown-unknown --release
cd ../resolver && cargo build --target wasm32-unknown-unknown --release

# Run Cosmos tests
pnpm test tests/main-cosmos.spec.ts
```

### Public rpc

| Chain    | Url                          |
|----------|------------------------------|
| Ethereum | https://eth.merkle.io        |
| BSC      | wss://bsc-rpc.publicnode.com |

## Test accounts

### Available Accounts

```
(0) 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" Owner of EscrowFactory
(1) 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" User
(2) 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" Resolver
```
