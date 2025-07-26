#!/bin/bash

# Local Cosmos Testnet Setup Script
# This script sets up a local wasmd testnet and deploys the Cosmos contracts

set -e

echo "🚀 Setting up local Cosmos testnet..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq is not installed. Installing...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq
    else
        sudo apt-get install jq
    fi
fi

# Create local testnet directory
echo -e "${GREEN}📁 Creating local testnet directory...${NC}"
mkdir -p ~/local-cosmos-testnet
cd ~/local-cosmos-testnet

# Create docker-compose.yml with corrected wasmd commands
echo -e "${GREEN}🐳 Creating Docker Compose configuration...${NC}"
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  wasmd:
    image: cosmwasm/wasmd:latest
    platform: linux/amd64
    container_name: wasmd
    ports:
      - "26657:26657"
      - "26656:26656"
      - "1317:1317"
    volumes:
      - ./wasmd-data:/root/.wasmd
    command: >
      sh -c "
        if [ ! -f /root/.wasmd/config/genesis.json ]; then
          echo 'Initializing wasmd chain...'
          wasmd init local-testnet --chain-id local-testnet
          wasmd keys add my-key --keyring-backend test
          wasmd genesis add-genesis-account \$(wasmd keys show my-key -a --keyring-backend test) 1000000000stake,1000000000ucosm
          wasmd genesis gentx my-key 70000000stake --chain-id local-testnet --keyring-backend test
          wasmd genesis collect-gentxs
        fi
        echo 'Starting wasmd chain...'
        wasmd start --rpc.laddr tcp://0.0.0.0:26657 --api.enable
      "
EOF

# Start the local chain
echo -e "${GREEN}🚀 Starting local wasmd chain...${NC}"
docker-compose up -d

# Wait for chain to start
echo -e "${YELLOW}⏳ Waiting for chain to start...${NC}"
sleep 15

# Check if chain is running
if ! curl -s http://localhost:26657/status > /dev/null; then
    echo -e "${RED}❌ Chain is not running. Check Docker logs:${NC}"
    docker-compose logs
    exit 1
fi

echo -e "${GREEN}✅ Local chain is running!${NC}"

# Set environment variables
export CHAIN_ID=local-testnet
export RPC_ENDPOINT=http://localhost:26657
export KEY_NAME=my-key
export KEYRING_BACKEND=test

# Get account address
echo -e "${GREEN}📝 Getting account address...${NC}"
MY_ADDRESS=$(docker exec wasmd wasmd keys show $KEY_NAME -a --keyring-backend $KEYRING_BACKEND)
echo -e "${GREEN}✅ Account address: $MY_ADDRESS${NC}"

# Build and optimize all contracts
echo -e "${GREEN}🔨 Building and optimizing Rust contracts...${NC}"
cd /Users/sumith/Personal/Projects/cross-chain-resolver-example/cosmos-contracts

# Build all contracts
RUSTFLAGS='-C link-arg=-s -C target-feature=-bulk-memory,-reference-types -C target-cpu=native' cargo build --target wasm32-unknown-unknown --release

# Copy built wasm files to artifacts directory
echo -e "${GREEN}📁 Copying built wasm files...${NC}"
mkdir -p artifacts
cp target/wasm32-unknown-unknown/release/*.wasm artifacts/

cd /Users/sumith/Personal/Projects/cross-chain-resolver-example

# Deploy contracts
echo -e "${GREEN}🚀 Deploying contracts...${NC}"

# Copy wasm files to container
echo -e "${GREEN}📤 Copying wasm files to container...${NC}"
docker cp /Users/sumith/Personal/Projects/cross-chain-resolver-example/cosmos-contracts/artifacts/simple_test.wasm wasmd:/root/
docker cp /Users/sumith/Personal/Projects/cross-chain-resolver-example/cosmos-contracts/artifacts/cosmos_escrow.wasm wasmd:/root/
docker cp /Users/sumith/Personal/Projects/cross-chain-resolver-example/cosmos-contracts/artifacts/cosmos_resolver.wasm wasmd:/root/

# Upload simple test contract first
echo -e "${GREEN}📤 Uploading simple test contract...${NC}"
SIMPLE_RESPONSE=$(docker exec wasmd wasmd tx wasm store /root/simple_test.wasm \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas auto \
  --fees 500000stake \
  --keyring-backend test \
  --yes \
  --output json)

echo "Simple test contract response: $SIMPLE_RESPONSE"

# Extract contract address
SIMPLE_CODE_ID=$(echo $SIMPLE_RESPONSE | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo -e "${GREEN}✅ Simple test contract uploaded with code ID: $SIMPLE_CODE_ID${NC}"

# Upload escrow contract
echo -e "${GREEN}📤 Uploading escrow contract...${NC}"
ESCROW_RESPONSE=$(docker exec wasmd wasmd tx wasm store /root/cosmos_escrow.wasm \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas auto \
  --fees 500000stake \
  --keyring-backend test \
  --yes \
  --output json)

echo "Escrow contract response: $ESCROW_RESPONSE"

# Extract contract address
ESCROW_CODE_ID=$(echo $ESCROW_RESPONSE | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo -e "${GREEN}✅ Escrow contract uploaded with code ID: $ESCROW_CODE_ID${NC}"

# Upload resolver contract
echo -e "${GREEN}📤 Uploading resolver contract...${NC}"
RESOLVER_RESPONSE=$(docker exec wasmd wasmd tx wasm store /root/cosmos_resolver.wasm \
  --from $KEY_NAME \
  --chain-id $CHAIN_ID \
  --gas auto \
  --fees 500000stake \
  --keyring-backend test \
  --yes \
  --output json)

echo "Resolver contract response: $RESOLVER_RESPONSE"

# Extract contract address
RESOLVER_CODE_ID=$(echo $RESOLVER_RESPONSE | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo -e "${GREEN}✅ Resolver contract uploaded with code ID: $RESOLVER_CODE_ID${NC}"

# Instantiate escrow contract
echo -e "${GREEN}🔧 Instantiating escrow contract...${NC}"
docker exec wasmd wasmd tx wasm instantiate $ESCROW_CODE_ID '{"owner": "'$MY_ADDRESS'"}' \
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
ESCROW_ADDRESS=$(docker exec wasmd wasmd query wasm list-contract-by-code $ESCROW_CODE_ID --node $RPC_ENDPOINT --output json | jq -r '.contracts[-1]')
echo -e "${GREEN}✅ Escrow contract address: $ESCROW_ADDRESS${NC}"

# Instantiate resolver contract
echo -e "${GREEN}🔧 Instantiating resolver contract...${NC}"
docker exec wasmd wasmd tx wasm instantiate $RESOLVER_CODE_ID '{"resolver_address": "'$MY_ADDRESS'"}' \
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
RESOLVER_ADDRESS=$(docker exec wasmd wasmd query wasm list-contract-by-code $RESOLVER_CODE_ID --node $RPC_ENDPOINT --output json | jq -r '.contracts[-1]')
echo -e "${GREEN}✅ Resolver contract address: $RESOLVER_ADDRESS${NC}"

# Create environment file
echo -e "${GREEN}📝 Creating environment file...${NC}"
cd /Users/sumith/Personal/Projects/cross-chain-resolver-example

cat > .env.local << EOF
COSMOS_CHAIN_ID=local-testnet
COSMOS_RPC_ENDPOINT=http://localhost:26657
COSMOS_ESCROW_FACTORY=$ESCROW_ADDRESS
COSMOS_RESOLVER=$RESOLVER_ADDRESS
COSMOS_USDC_ADDRESS=stake
COSMOS_DONOR_ADDRESS=$MY_ADDRESS
EOF

echo -e "${GREEN}✅ Environment file created: .env.local${NC}"

# Update TypeScript configuration
echo -e "${GREEN}📝 Updating TypeScript configuration...${NC}"
cat > tests/cosmos/config-local.ts << EOF
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
  chainId: "local-testnet",
  rpcEndpoint: "http://localhost:26657",
  prefix: "wasm",
  feeDenom: "stake",
  gasPrice: 0.025,
  escrowFactory: "$ESCROW_ADDRESS",
  resolver: "$RESOLVER_ADDRESS",
  tokens: {
    USDC: {
      address: "stake",
      donor: "$MY_ADDRESS"
    }
  }
};

export const cosmosWalletConfig: CosmosConfig = {
  rpcEndpoint: cosmosConfig.rpcEndpoint,
  prefix: cosmosConfig.prefix,
  feeDenom: cosmosConfig.feeDenom,
  gasPrice: cosmosConfig.gasPrice
};
EOF

echo -e "${GREEN}✅ TypeScript configuration updated: tests/cosmos/config-local.ts${NC}"

# Test the deployment
echo -e "${GREEN}🧪 Testing contract deployment...${NC}"
docker exec wasmd wasmd query wasm contract $ESCROW_ADDRESS --node $RPC_ENDPOINT > /dev/null
docker exec wasmd wasmd query wasm contract $RESOLVER_ADDRESS --node $RPC_ENDPOINT > /dev/null

echo -e "${GREEN}✅ Contract deployment test successful!${NC}"

# Summary
echo -e "${GREEN}🎉 Local Cosmos testnet setup complete!${NC}"
echo ""
echo -e "${YELLOW}📋 Summary:${NC}"
echo -e "  Chain ID: local-testnet"
echo -e "  RPC Endpoint: http://localhost:26657"
echo -e "  Account: $MY_ADDRESS"
echo -e "  Escrow Contract: $ESCROW_ADDRESS"
echo -e "  Resolver Contract: $RESOLVER_ADDRESS"
echo ""
echo -e "${YELLOW}🚀 Next steps:${NC}"
echo -e "  1. Run tests: npm test tests/main-cosmos.spec.ts"
echo -e "  2. Stop chain: cd ~/local-cosmos-testnet && docker-compose down"
echo -e "  3. View logs: docker-compose logs -f"
echo ""
echo -e "${GREEN}✨ Happy testing!${NC}" 