import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";

const FEE_MEDIUM = 3000;
const TICK_SPACING = 60;
const SQRT_PRICE_X96 = BigNumber.from(2).pow(96);

function sortTokens(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function getMinTick(tickSpacing: number): number {
  return Math.ceil(-887272 / tickSpacing) * tickSpacing;
}

function getMaxTick(tickSpacing: number): number {
  return Math.floor(887272 / tickSpacing) * tickSpacing;
}

async function deployV3Stack() {
  const [deployer] = await ethers.getSigners();

  const weth9Factory = await ethers.getContractFactory("WETH9");
  const wgilt = await weth9Factory.deploy();
  await wgilt.deployed();

  const factoryFactory = await ethers.getContractFactory("UniswapV3Factory");
  const factory = await factoryFactory.deploy();
  await factory.deployed();

  const swapRouterFactory = await ethers.getContractFactory("SwapRouter");
  const swapRouter = await swapRouterFactory.deploy(factory.address, wgilt.address);
  await swapRouter.deployed();

  const nftDescriptorLibraryFactory = await ethers.getContractFactory("NFTDescriptor");
  const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy();
  await nftDescriptorLibrary.deployed();

  const positionDescriptorFactory = await ethers.getContractFactory(
    "NonfungibleTokenPositionDescriptor",
    {
      libraries: {
        NFTDescriptor: nftDescriptorLibrary.address,
      },
    }
  );
  const positionDescriptor = await positionDescriptorFactory.deploy(
    wgilt.address,
    "0x47494c5400000000000000000000000000000000000000000000000000000000"
  );
  await positionDescriptor.deployed();

  const positionManagerFactory = await ethers.getContractFactory("NonfungiblePositionManager");
  const nftPositionManager = await positionManagerFactory.deploy(
    factory.address,
    wgilt.address,
    positionDescriptor.address
  );
  await nftPositionManager.deployed();

  const tokenFactory = await ethers.getContractFactory("MockERC20");
  const tokenA = await tokenFactory.deploy("Token A", "TKA", 18);
  await tokenA.deployed();
  const tokenB = await tokenFactory.deploy("Token B", "TKB", 18);
  await tokenB.deployed();

  const mintAmount = ethers.utils.parseEther("1000000");
  await tokenA.mint(deployer.address, mintAmount);
  await tokenB.mint(deployer.address, mintAmount);

  return {
    deployer,
    factory,
    swapRouter,
    nftPositionManager,
    positionDescriptor,
    wgilt,
    tokenA,
    tokenB,
    mintAmount,
  };
}

describe("Uniswap V3 vendored stack", function () {
  it("reports hardhat chainId 714", async function () {
    const network = await ethers.provider.getNetwork();
    expect(network.chainId).to.equal(714);
  });

  it("deploys factory with owner equal to deployer", async function () {
    const { factory, deployer } = await deployV3Stack();
    expect(await factory.owner()).to.equal(deployer.address);
  });

  it("creates a pool via factory.createPool for two mock ERC20s", async function () {
    const { factory, tokenA, tokenB } = await deployV3Stack();
    const [token0, token1] = sortTokens(tokenA.address, tokenB.address);

    await factory.createPool(token0, token1, FEE_MEDIUM);
    const pool = await factory.getPool(token0, token1, FEE_MEDIUM);
    expect(pool).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(pool).to.not.equal(constants.AddressZero);
  });

  it("mints liquidity via NonfungiblePositionManager and mints position NFT to caller", async function () {
    const { deployer, nftPositionManager, tokenA, tokenB, mintAmount } = await deployV3Stack();
    const [token0, token1] = sortTokens(tokenA.address, tokenB.address);

    await tokenA.approve(nftPositionManager.address, constants.MaxUint256);
    await tokenB.approve(nftPositionManager.address, constants.MaxUint256);

    await nftPositionManager.createAndInitializePoolIfNecessary(
      token0,
      token1,
      FEE_MEDIUM,
      SQRT_PRICE_X96
    );

    const liquidityAmount = mintAmount.div(10);
    const mintTx = await nftPositionManager.mint({
      token0,
      token1,
      fee: FEE_MEDIUM,
      tickLower: getMinTick(TICK_SPACING),
      tickUpper: getMaxTick(TICK_SPACING),
      amount0Desired: liquidityAmount,
      amount1Desired: liquidityAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    });
    await mintTx.wait();

    const tokenId = await nftPositionManager.tokenOfOwnerByIndex(deployer.address, 0);
    expect(await nftPositionManager.ownerOf(tokenId)).to.equal(deployer.address);
  });

  it("swaps via SwapRouter.exactInputSingle with expected balance changes", async function () {
    const { deployer, factory, swapRouter, nftPositionManager, tokenA, tokenB, mintAmount } =
      await deployV3Stack();
    const [token0, token1] = sortTokens(tokenA.address, tokenB.address);

    await tokenA.approve(nftPositionManager.address, constants.MaxUint256);
    await tokenB.approve(nftPositionManager.address, constants.MaxUint256);

    await nftPositionManager.createAndInitializePoolIfNecessary(
      token0,
      token1,
      FEE_MEDIUM,
      SQRT_PRICE_X96
    );

    const liquidityAmount = mintAmount.div(10);
    await nftPositionManager.mint({
      token0,
      token1,
      fee: FEE_MEDIUM,
      tickLower: getMinTick(TICK_SPACING),
      tickUpper: getMaxTick(TICK_SPACING),
      amount0Desired: liquidityAmount,
      amount1Desired: liquidityAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    });

    const amountIn = ethers.utils.parseEther("100");
    const token0Contract = token0 === tokenA.address ? tokenA : tokenB;
    const token1Contract = token1 === tokenA.address ? tokenA : tokenB;

    await token0Contract.approve(swapRouter.address, amountIn);

    const balanceInBefore = await token0Contract.balanceOf(deployer.address);
    const balanceOutBefore = await token1Contract.balanceOf(deployer.address);

    await swapRouter.exactInputSingle({
      tokenIn: token0,
      tokenOut: token1,
      fee: FEE_MEDIUM,
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      amountIn,
      amountOutMinimum: 1,
      sqrtPriceLimitX96: BigNumber.from("4295128740"),
    });

    const balanceInAfter = await token0Contract.balanceOf(deployer.address);
    const balanceOutAfter = await token1Contract.balanceOf(deployer.address);

    const inputSpent = balanceInBefore.sub(balanceInAfter);
    const outputReceived = balanceOutAfter.sub(balanceOutBefore);

    expect(inputSpent.gt(0)).to.equal(true);
    expect(outputReceived.gte(1)).to.equal(true);
    expect(inputSpent.lte(amountIn)).to.equal(true);
  });

  it("decreases liquidity and collects fees without revert", async function () {
    const { deployer, swapRouter, nftPositionManager, tokenA, tokenB, mintAmount } =
      await deployV3Stack();
    const [token0, token1] = sortTokens(tokenA.address, tokenB.address);

    await tokenA.approve(nftPositionManager.address, constants.MaxUint256);
    await tokenB.approve(nftPositionManager.address, constants.MaxUint256);

    await nftPositionManager.createAndInitializePoolIfNecessary(
      token0,
      token1,
      FEE_MEDIUM,
      SQRT_PRICE_X96
    );

    const liquidityAmount = mintAmount.div(10);
    const mintTx = await nftPositionManager.mint({
      token0,
      token1,
      fee: FEE_MEDIUM,
      tickLower: getMinTick(TICK_SPACING),
      tickUpper: getMaxTick(TICK_SPACING),
      amount0Desired: liquidityAmount,
      amount1Desired: liquidityAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    });
    await mintTx.wait();
    const tokenId = await nftPositionManager.tokenOfOwnerByIndex(deployer.address, 0);

    const swapAmount = ethers.utils.parseEther("10");
    await tokenA.approve(swapRouter.address, swapAmount);
    const tokenIn = tokenA.address.toLowerCase() === token0.toLowerCase() ? token0 : token1;
    const tokenOut = tokenIn === token0 ? token1 : token0;
    const sqrtPriceLimitX96 =
      tokenIn.toLowerCase() < tokenOut.toLowerCase()
        ? BigNumber.from("4295128740")
        : BigNumber.from("1461446703485210103287273052203988822378723970341");

    await swapRouter.exactInputSingle({
      tokenIn,
      tokenOut,
      fee: FEE_MEDIUM,
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      amountIn: swapAmount,
      amountOutMinimum: 1,
      sqrtPriceLimitX96,
    });

    const position = await nftPositionManager.positions(tokenId);
    const liquidityToRemove = position.liquidity.div(2);

    await nftPositionManager.decreaseLiquidity({
      tokenId,
      liquidity: liquidityToRemove,
      amount0Min: 0,
      amount1Min: 0,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    });

    const maxUint128 = BigNumber.from(2).pow(128).sub(1);
    await nftPositionManager.collect({
      tokenId,
      recipient: deployer.address,
      amount0Max: maxUint128,
      amount1Max: maxUint128,
    });
  });
});
