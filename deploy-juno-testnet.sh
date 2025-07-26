#!/bin/bash

set -e

echo "🚀 Deploying to Juno Testnet..."

# Check if junod is installed
if ! command -v junod &> /dev/null; then
    echo "❌ junod not found. Please install Juno CLI first:"
    echo "   curl -sSfL https://get.juno.sh | sh"
    exit 1
fi

# Build contracts
echo "📦 Building contracts..."
cd cosmos-contracts

# Build each contract
for contract in escrow resolver simple-test; do
    echo "Building $contract..."
    cd $contract
    cargo wasm
    cd ..
done

# Create artifacts directory
mkdir -p artifacts

# Copy wasm files to artifacts
echo "📁 Copying wasm files..."
find . -name "*.wasm" -exec cp {} artifacts/ \;

# List artifacts
echo "📋 Available artifacts:"
ls -la artifacts/

# Deploy to Juno testnet
echo "🌐 Deploying to Juno testnet..."

# Deploy simple-test contract
echo "Deploying simple-test contract..."
junod tx wasm store artifacts/simple_test.wasm \
    --from wallet \
    --chain-id uni-6 \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 5000ujunox \
    --node https://juno-testnet-rpc.polkachu.com:443 \
    --yes

echo "✅ Deployment complete!"
echo "📝 Contract addresses will be shown in the transaction output above." 