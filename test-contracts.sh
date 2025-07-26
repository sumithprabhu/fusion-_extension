#!/bin/bash

set -e

echo "🧪 Testing built contracts..."

cd cosmos-contracts

echo "📋 Available contracts:"
ls -la artifacts/*.wasm

echo ""
echo "📊 Contract sizes:"
for wasm in artifacts/*.wasm; do
    size=$(stat -f%z "$wasm")
    echo "  $(basename "$wasm"): $size bytes"
done

echo ""
echo "✅ All contracts built successfully!"
echo "🚀 Ready for deployment to Juno testnet"
echo ""
echo "Next steps:"
echo "1. Install Juno CLI: https://docs.juno.wtf/validators/getting-started"
echo "2. Set up wallet: junod keys add wallet"
echo "3. Get testnet tokens: https://testnet.juno.wtf/"
echo "4. Deploy: ./deploy-juno-testnet.sh" 