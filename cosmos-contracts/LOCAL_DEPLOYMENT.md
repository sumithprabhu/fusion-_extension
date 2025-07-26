# Local Cosmos Testnet Deployment

This guide shows how to deploy the Cosmos contracts on a local wasmd testnet instead of Juno.

## Prerequisites

### 1. Install wasmd
```bash
# Install wasmd binary
curl -L https://github.com/CosmWasm/wasmd/releases/download/v0.50.0/wasmd-v0.50.0-linux-x86_64 -o wasmd
chmod +x wasmd
sudo mv wasmd /usr/local/bin/

# Or use Go to install
go install github.com/CosmWasm/wasmd/cmd/wasmd@latest
```

### 2. Install Rust and wasm-pack
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install wasm-pack
cargo install wasm-pack

# Install cosmwasm-opt
cargo install cosmwasm-opt
```

## Setup Local Testnet

### 1. Initialize Local Chain
```bash
# Create a new directory for your local chain
mkdir ~/local-cosmos-testnet
cd ~/local-cosmos-testnet

# Initialize wasmd
wasmd init local-testnet --chain-id local-testnet

# Add your key
wasmd keys add my-key --keyring-backend test

# Add genesis account
wasmd add-genesis-account $(wasmd keys show my-key -a --keyring-backend test) 1000000000stake,1000000000ucosm

# Create validator
wasmd gentx my-key 70000000stake --chain-id local-testnet --keyring-backend test

# Collect genesis transactions
wasmd collect-gentxs

# Start the local chain
wasmd start --rpc.laddr tcp://0.0.0.0:26657 --api.enable true
```

### 2. Alternative: Use Docker (Recommended)
```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  wasmd:
    image: cosmwasm/wasmd:v0.50.0
    container_name: wasmd
    ports:
      - "26657:26657"
      - "26656:26656"
      - "1317:1317"
    volumes:
      - ./wasmd-data:/root/.wasmd
    command: >
      sh -c "
        wasmd init local-testnet --chain-id local-testnet &&
        wasmd keys add my-key --keyring-backend test &&
        wasmd add-genesis-account \$(wasmd keys show my-key -a --keyring-backend test) 1000000000stake,1000000000ucosm &&
        wasmd gentx my-key 70000000stake --chain-id local-testnet --keyring-backend test &&
        wasmd collect-gentxs &&
        wasmd start --rpc.laddr tcp://0.0.0.0:26657 --api.enable true
      "
EOF

# Start the local chain
docker-compose up -d
```

## Build Contracts

### 1. Build Escrow Contract
```bash
cd cosmos-contracts/escrow

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Optimize the wasm file
cosmwasm-opt target/wasm32-unknown-unknown/release/cosmos_escrow.wasm -o target/wasm32-unknown-unknown/release/cosmos_escrow_opt.wasm
```

### 2. Build Resolver Contract
```bash
cd ../resolver

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Optimize the wasm file
cosmwasm-opt target/wasm32-unknown-unknown/release/cosmos_resolver.wasm -o target/wasm32-unknown-unknown/release/cosmos_resolver_opt.wasm
```

## Deploy Contracts

### 1. Set Environment Variables
```bash
# Set your local chain configuration
export CHAIN_ID=local-testnet
export RPC_ENDPOINT=http://localhost:26657
export KEY_NAME=my-key
export KEYRING_BACKEND=test
```

### 2. Upload Escrow Contract
```bash
cd cosmos-contracts/escrow

# Upload the contract
wasmd tx wasm store target/wasm32-unknown-unknown/release/cosmos_escrow_opt.wasm \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas-prices 0.025stake \
  --gas auto \
  --gas-adjustment 1.3 \
  --keyring-backend $KEYRING_BACKEND \
  --node $RPC_ENDPOINT \
  -y

# Get the code ID from the response
export ESCROW_CODE_ID=<code-id-from-response>
```

### 3. Upload Resolver Contract
```bash
cd ../resolver

# Upload the contract
wasmd tx wasm store target/wasm32-unknown-unknown/release/cosmos_resolver_opt.wasm \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas-prices 0.025stake \
  --gas auto \
  --gas-adjustment 1.3 \
  --keyring-backend $KEYRING_BACKEND \
  --node $RPC_ENDPOINT \
  -y

# Get the code ID from the response
export RESOLVER_CODE_ID=<code-id-from-response>
```

### 4. Instantiate Contracts
```bash
# Get your address
export MY_ADDRESS=$(wasmd keys show $KEY_NAME -a --keyring-backend $KEYRING_BACKEND)

# Instantiate escrow contract
wasmd tx wasm instantiate $ESCROW_CODE_ID '{"owner": "'$MY_ADDRESS'"}' \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas-prices 0.025stake \
  --gas auto \
  --gas-adjustment 1.3 \
  --keyring-backend $KEYRING_BACKEND \
  --node $RPC_ENDPOINT \
  --label "cosmos-escrow" \
  -y

# Get escrow contract address
export ESCROW_ADDRESS=$(wasmd query wasm list-contract-by-code $ESCROW_CODE_ID --node $RPC_ENDPOINT --output json | jq -r '.contracts[-1]')

# Instantiate resolver contract
wasmd tx wasm instantiate $RESOLVER_CODE_ID '{"resolver_address": "'$MY_ADDRESS'"}' \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas-prices 0.025stake \
  --gas auto \
  --gas-adjustment 1.3 \
  --keyring-backend $KEYRING_BACKEND \
  --node $RPC_ENDPOINT \
  --label "cosmos-resolver" \
  -y

# Get resolver contract address
export RESOLVER_ADDRESS=$(wasmd query wasm list-contract-by-code $RESOLVER_CODE_ID --node $RPC_ENDPOINT --output json | jq -r '.contracts[-1]')
```

## Update Configuration

### 1. Update TypeScript Configuration
```typescript
// tests/cosmos/config.ts
export const cosmosConfig: CosmosChainConfig = {
  chainId: "local-testnet",
  rpcEndpoint: "http://localhost:26657",
  prefix: "wasm",
  feeDenom: "stake",
  gasPrice: 0.025,
  escrowFactory: ESCROW_ADDRESS, // From deployment
  resolver: RESOLVER_ADDRESS, // From deployment
  tokens: {
    USDC: {
      address: "stake", // Use native stake token for testing
      donor: MY_ADDRESS // Your address
    }
  }
};
```

### 2. Create Environment File
```bash
# Create .env.local file
cat > .env.local << EOF
COSMOS_CHAIN_ID=local-testnet
COSMOS_RPC_ENDPOINT=http://localhost:26657
COSMOS_ESCROW_FACTORY=$ESCROW_ADDRESS
COSMOS_RESOLVER=$RESOLVER_ADDRESS
COSMOS_USDC_ADDRESS=stake
COSMOS_DONOR_ADDRESS=$MY_ADDRESS
EOF
```

## Test the Deployment

### 1. Query Contract State
```bash
# Query escrow contract
wasmd query wasm contract $ESCROW_ADDRESS --node $RPC_ENDPOINT

# Query resolver contract
wasmd query wasm contract $RESOLVER_ADDRESS --node $RPC_ENDPOINT
```

### 2. Test Contract Functions
```bash
# Test creating an escrow
wasmd tx wasm execute $ESCROW_ADDRESS '{"create_escrow":{"escrow":{"order_hash":"test123","maker":"'$MY_ADDRESS'","taker":"'$MY_ADDRESS'","token":"stake","amount":"1000","hashlock":[1,2,3,4],"timelock":'$(($(date +%s) + 3600))',"is_active":true,"is_claimed":false,"is_refunded":false}}}' \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas-prices 0.025stake \
  --gas auto \
  --gas-adjustment 1.3 \
  --keyring-backend $KEYRING_BACKEND \
  --node $RPC_ENDPOINT \
  -y
```

## Run Tests

### 1. Start Local Chain
```bash
# If using Docker
docker-compose up -d

# If using local wasmd
wasmd start --rpc.laddr tcp://0.0.0.0:26657 --api.enable true
```

### 2. Run Cosmos Tests
```bash
# Run the Cosmos extension tests
npm test tests/main-cosmos.spec.ts
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Change ports in docker-compose.yml
2. **Gas errors**: Increase gas limit or adjust gas prices
3. **Contract upload fails**: Check wasm file size and optimization
4. **Query fails**: Ensure chain is running and RPC endpoint is correct

### Useful Commands

```bash
# Check chain status
wasmd status --node $RPC_ENDPOINT

# Check account balance
wasmd query bank balances $MY_ADDRESS --node $RPC_ENDPOINT

# List all contracts
wasmd query wasm list-code --node $RPC_ENDPOINT

# Get contract info
wasmd query wasm contract $ESCROW_ADDRESS --node $RPC_ENDPOINT
```

## Cleanup

```bash
# Stop Docker containers
docker-compose down

# Remove data
rm -rf wasmd-data

# Or stop local wasmd
pkill wasmd
``` 