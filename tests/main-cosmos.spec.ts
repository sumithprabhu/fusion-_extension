import 'dotenv/config'
import {expect, jest} from '@jest/globals'

import {createServer, CreateServerReturnType} from 'prool'
import {anvil} from 'prool/instances'

import Sdk from '@1inch/cross-chain-sdk'
import {
    computeAddress,
    ContractFactory,
    JsonRpcProvider,
    MaxUint256,
    parseEther,
    parseUnits,
    randomBytes,
    Wallet as SignerWallet
} from 'ethers'
import {uint8ArrayToHex, UINT_40_MAX} from '@1inch/byte-utils'
import assert from 'node:assert'
import {ChainConfig, config} from './config'
import {Wallet} from './wallet'
import {Resolver} from './resolver'
import {EscrowFactory} from './escrow-factory'
import factoryContract from '../dist/contracts/TestEscrowFactory.sol/TestEscrowFactory.json'
import resolverContract from '../dist/contracts/Resolver.sol/Resolver.json'

// Import Cosmos utilities
import {CosmosWallet, CosmosConfig} from './cosmos/wallet'
import {CosmosResolver, CosmosEscrowFactory} from './cosmos/contracts'
import {cosmosConfig, cosmosWalletConfig} from './cosmos/config'
import {SigningStargateClient} from '@cosmjs/stargate'

const {Address} = Sdk

jest.setTimeout(1000 * 60)

const userPk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const resolverPk = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'

// Cosmos test mnemonic (for testing purposes only)
const cosmosUserMnemonic = 'test test test test test test test test test test test junk'
const cosmosResolverMnemonic = 'test test test test test test test test test test test junk'

// eslint-disable-next-line max-lines-per-function
describe('Resolving example with Cosmos destination', () => {
    const srcChainId = config.chain.source.chainId
    const dstChainId = 'cosmos-juno-1' // Cosmos chain ID

    type Chain = {
        node?: CreateServerReturnType | undefined
        provider: JsonRpcProvider
        escrowFactory: string
        resolver: string
    }

    type CosmosChain = {
        client: SigningStargateClient
        escrowFactory: string
        resolver: string
    }

    let src: Chain
    let dst: CosmosChain

    let srcChainUser: Wallet
    let dstChainUser: CosmosWallet
    let srcChainResolver: Wallet
    let dstChainResolver: CosmosWallet

    let srcFactory: EscrowFactory
    let dstFactory: CosmosEscrowFactory
    let srcResolverContract: Wallet
    let dstResolverContract: CosmosWallet

    let srcTimestamp: bigint

    async function increaseTime(t: number): Promise<void> {
        await src.provider.send('evm_increaseTime', [t])
        // For Cosmos, we would need to wait for actual time or use a testnet
    }

    beforeAll(async () => {
        // Initialize Ethereum source chain
        src = await initChain(config.chain.source)
        
        // Initialize Cosmos destination chain
        dst = await initCosmosChain(cosmosConfig)

        srcChainUser = new Wallet(userPk, src.provider)
        dstChainUser = await CosmosWallet.fromMnemonic(cosmosUserMnemonic, cosmosWalletConfig)
        srcChainResolver = new Wallet(resolverPk, src.provider)
        dstChainResolver = await CosmosWallet.fromMnemonic(cosmosResolverMnemonic, cosmosWalletConfig)

        srcFactory = new EscrowFactory(src.provider, src.escrowFactory)
        dstFactory = new CosmosEscrowFactory(dst.client, dst.escrowFactory, cosmosWalletConfig)
        
        // get 1000 USDC for user in SRC chain and approve to LOP
        await srcChainUser.topUpFromDonor(
            config.chain.source.tokens.USDC.address,
            config.chain.source.tokens.USDC.donor,
            parseUnits('1000', 6)
        )
        await srcChainUser.approveToken(
            config.chain.source.tokens.USDC.address,
            config.chain.source.limitOrderProtocol,
            MaxUint256
        )

        // get 2000 USDC for resolver in DST chain (Cosmos)
        srcResolverContract = await Wallet.fromAddress(src.resolver, src.provider)
        dstResolverContract = dstChainResolver
        await dstResolverContract.topUpFromDonor(
            cosmosConfig.tokens.USDC.donor,
            parseUnits('2000', 6).toString(),
            cosmosConfig.tokens.USDC.address
        )
        
        // top up contract for approve
        await dstChainResolver.transfer(dst.resolver, parseEther('1'))
        await dstResolverContract.unlimitedApprove(cosmosConfig.tokens.USDC.address, dst.escrowFactory)

        srcTimestamp = BigInt((await src.provider.getBlock('latest'))!.timestamp)
    })

    async function getBalances(
        srcToken: string,
        dstToken: string
    ): Promise<{src: {user: bigint; resolver: bigint}; dst: {user: string; resolver: string}}> {
        return {
            src: {
                user: await srcChainUser.tokenBalance(srcToken),
                resolver: await srcResolverContract.tokenBalance(srcToken)
            },
            dst: {
                user: await dstChainUser.getBalance(dstToken),
                resolver: await dstResolverContract.getBalance(dstToken)
            }
        }
    }

    afterAll(async () => {
        src.provider.destroy()
        await Promise.all([src.node?.stop()])
    })

    // eslint-disable-next-line max-lines-per-function
    describe('Fill', () => {
        it('should swap Ethereum USDC -> Cosmos USDC. Single fill only', async () => {
            const initialBalances = await getBalances(
                config.chain.source.tokens.USDC.address,
                cosmosConfig.tokens.USDC.address
            )

            // User creates order
            const secret = uint8ArrayToHex(randomBytes(32)) // note: use crypto secure random number in real world
            const order = Sdk.CrossChainOrder.new(
                new Address(src.escrowFactory),
                {
                    salt: Sdk.randBigInt(1000n),
                    maker: new Address(await srcChainUser.getAddress()),
                    makingAmount: parseUnits('100', 6),
                    takingAmount: parseUnits('99', 6),
                    makerAsset: new Address(config.chain.source.tokens.USDC.address),
                    takerAsset: new Address(cosmosConfig.tokens.USDC.address)
                },
                {
                    hashLock: Sdk.HashLock.forSingleFill(secret),
                    timeLocks: Sdk.TimeLocks.new({
                        srcWithdrawal: 10n, // 10sec finality lock for test
                        srcPublicWithdrawal: 120n, // 2m for private withdrawal
                        srcCancellation: 121n, // 1sec public withdrawal
                        srcPublicCancellation: 122n, // 1sec private cancellation
                        dstWithdrawal: 10n, // 10sec finality lock for test
                        dstPublicWithdrawal: 100n, // 100sec private withdrawal
                        dstCancellation: 101n // 1sec public withdrawal
                    }),
                    srcChainId,
                    dstChainId: BigInt(dstChainId),
                    srcSafetyDeposit: parseEther('0.001'),
                    dstSafetyDeposit: parseEther('0.001')
                },
                {
                    auction: new Sdk.AuctionDetails({
                        initialRateBump: 0,
                        points: [],
                        duration: 120n,
                        startTime: srcTimestamp
                    }),
                    whitelist: [
                        {
                            address: new Address(src.resolver),
                            allowFrom: 0n
                        }
                    ],
                    resolvingStartTime: 0n
                },
                {
                    nonce: Sdk.randBigInt(UINT_40_MAX),
                    allowPartialFills: false,
                    allowMultipleFills: false
                }
            )

            const signature = await srcChainUser.signOrder(srcChainId, order)
            const orderHash = order.getOrderHash(srcChainId)
            
            // Resolver fills order on Ethereum
            const resolverContract = new Resolver(src.resolver, dst.resolver)

            console.log(`[${srcChainId}]`, `Filling order ${orderHash}`)

            const fillAmount = order.makingAmount
            const {txHash: orderFillHash, blockHash: srcDeployBlock} = await srcChainResolver.send(
                resolverContract.deploySrc(
                    srcChainId,
                    order,
                    signature,
                    Sdk.TakerTraits.default()
                        .setExtension(order.extension)
                        .setAmountMode(Sdk.AmountMode.maker)
                        .setAmountThreshold(order.takingAmount),
                    fillAmount
                )
            )

            console.log(`[${srcChainId}]`, `Order ${orderHash} filled for ${fillAmount} in tx ${orderFillHash}`)

            const srcEscrowEvent = await srcFactory.getSrcDeployEvent(srcDeployBlock)

            // Deploy destination escrow on Cosmos
            const cosmosResolver = new CosmosResolver(
                dst.client,
                dst.resolver,
                dst.resolver,
                cosmosWalletConfig
            )

            console.log(`[${dstChainId}]`, `Depositing ${srcEscrowEvent[1].amount} for order ${orderHash}`)
            const dstDepositResponse = await cosmosResolver.deployDstEscrow(
                orderHash,
                srcEscrowEvent[0].maker.toString(),
                srcEscrowEvent[0].taker.toString(),
                cosmosConfig.tokens.USDC.address,
                srcEscrowEvent[1].amount.toString(),
                srcEscrowEvent[0].hashLock.toString(),
                Number(srcEscrowEvent[0].timeLocks.dstWithdrawal)
            )
            console.log(`[${dstChainId}]`, `Created dst deposit for order ${orderHash} in tx ${dstDepositResponse.transactionHash}`)

            await increaseTime(11)
            
            // User shares key after validation of dst escrow deployment
            console.log(`[${dstChainId}]`, `Withdrawing funds for user`)
            await cosmosResolver.withdraw(
                'dst',
                dst.escrowFactory, // escrow address
                secret,
                srcEscrowEvent[0]
            )

            console.log(`[${srcChainId}]`, `Withdrawing funds for resolver`)
            const {txHash: resolverWithdrawHash} = await srcChainResolver.send(
                resolverContract.withdraw('src', src.escrowFactory, secret, srcEscrowEvent[0])
            )
            console.log(
                `[${srcChainId}]`,
                `Withdrew funds for resolver in tx ${resolverWithdrawHash}`
            )

            const resultBalances = await getBalances(
                config.chain.source.tokens.USDC.address,
                cosmosConfig.tokens.USDC.address
            )

            // user transferred funds to resolver on source chain
            expect(initialBalances.src.user - resultBalances.src.user).toBe(order.makingAmount)
            expect(resultBalances.src.resolver - initialBalances.src.resolver).toBe(order.makingAmount)
            // resolver transferred funds to user on destination chain
            expect(parseInt(resultBalances.dst.user) - parseInt(initialBalances.dst.user)).toBe(Number(order.takingAmount))
            expect(parseInt(initialBalances.dst.resolver) - parseInt(resultBalances.dst.resolver)).toBe(Number(order.takingAmount))
        })
    })
})

async function initChain(
    cnf: ChainConfig
): Promise<{node?: CreateServerReturnType; provider: JsonRpcProvider; escrowFactory: string; resolver: string}> {
    const {node, provider} = await getProvider(cnf)
    const deployer = new SignerWallet(cnf.ownerPrivateKey, provider)

    // deploy EscrowFactory
    const escrowFactory = await deploy(
        factoryContract,
        [
            cnf.limitOrderProtocol,
            cnf.wrappedNative, // feeToken,
            Address.fromBigInt(0n).toString(), // accessToken,
            deployer.address, // owner
            60 * 30, // src rescue delay
            60 * 30 // dst rescue delay
        ],
        provider,
        deployer
    )
    console.log(`[${cnf.chainId}]`, `Escrow factory contract deployed to`, escrowFactory)

    // deploy Resolver contract
    const resolver = await deploy(
        resolverContract,
        [
            escrowFactory,
            cnf.limitOrderProtocol,
            computeAddress(resolverPk) // resolver as owner of contract
        ],
        provider,
        deployer
    )
    console.log(`[${cnf.chainId}]`, `Resolver contract deployed to`, resolver)

    return {node: node, provider, resolver, escrowFactory}
}

async function initCosmosChain(
    cnf: any
): Promise<{client: SigningStargateClient; escrowFactory: string; resolver: string}> {
    // Connect to Cosmos chain
    const client = await SigningStargateClient.connectWithSigner(
        cnf.rpcEndpoint,
        await CosmosWallet.fromMnemonic(cosmosUserMnemonic, cosmosWalletConfig).then(w => w.signer)
    )

    // In a real implementation, you would deploy the contracts here
    // For now, we'll use placeholder addresses
    const escrowFactory = "cosmos1placeholder" // Replace with actual deployed address
    const resolver = "cosmos1placeholder" // Replace with actual deployed address

    console.log(`[${cnf.chainId}]`, `Cosmos escrow factory contract deployed to`, escrowFactory)
    console.log(`[${cnf.chainId}]`, `Cosmos resolver contract deployed to`, resolver)

    return {client, resolver, escrowFactory}
}

async function getProvider(cnf: ChainConfig): Promise<{node?: CreateServerReturnType; provider: JsonRpcProvider}> {
    if (!cnf.createFork) {
        return {
            provider: new JsonRpcProvider(cnf.url, cnf.chainId, {
                cacheTimeout: -1,
                staticNetwork: true
            })
        }
    }

    const node = createServer({
        instance: anvil({forkUrl: cnf.url, chainId: cnf.chainId}),
        limit: 1
    })
    await node.start()

    const address = node.address()
    assert(address)

    const provider = new JsonRpcProvider(`http://[${address.address}]:${address.port}/1`, cnf.chainId, {
        cacheTimeout: -1,
        staticNetwork: true
    })

    return {
        provider,
        node
    }
}

/**
 * Deploy contract and return its address
 */
async function deploy(
    json: {abi: any; bytecode: any},
    params: unknown[],
    provider: JsonRpcProvider,
    deployer: SignerWallet
): Promise<string> {
    const deployed = await new ContractFactory(json.abi, json.bytecode, deployer).deploy(...params)
    await deployed.waitForDeployment()

    return await deployed.getAddress()
} 