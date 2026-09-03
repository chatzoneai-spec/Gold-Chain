import { ethers } from "hardhat";
import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

const MANIFEST_VERSION = 1;
const NATIVE_CURRENCY_LABEL_BYTES =
  "0x47494c5400000000000000000000000000000000000000000000000000000000"; // "GILT"

function deploymentsPath(filename: string): string {
  return path.join(__dirname, "..", "..", "..", "..", "deployments", filename);
}

async function resolveWgiltAddress(networkName: string): Promise<string> {
  if (networkName === "hardhat") {
    const weth9Factory = await ethers.getContractFactory("WETH9");
    const wgilt = await weth9Factory.deploy();
    await wgilt.deployed();
    return wgilt.address;
  }

  const roughnetPath = deploymentsPath("goldchain-roughnet.json");
  const roughnet = JSON.parse(fs.readFileSync(roughnetPath, "utf8"));
  if (!roughnet.wgilt) {
    throw new Error(`wgilt not found in ${roughnetPath}`);
  }
  return roughnet.wgilt;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const wgilt = await resolveWgiltAddress(hre.network.name);

  const factoryFactory = await ethers.getContractFactory("UniswapV3Factory");
  const factory = await factoryFactory.deploy();
  await factory.deployed();

  const swapRouterFactory = await ethers.getContractFactory("SwapRouter");
  const swapRouter = await swapRouterFactory.deploy(factory.address, wgilt);
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
    wgilt,
    NATIVE_CURRENCY_LABEL_BYTES
  );
  await positionDescriptor.deployed();

  const positionManagerFactory = await ethers.getContractFactory("NonfungiblePositionManager");
  const nftPositionManager = await positionManagerFactory.deploy(
    factory.address,
    wgilt,
    positionDescriptor.address
  );
  await nftPositionManager.deployed();

  const manifest = {
    manifestVersion: MANIFEST_VERSION,
    chainId: network.chainId,
    deployer: deployer.address,
    addresses: {
      factory: factory.address,
      swapRouter: swapRouter.address,
      nftPositionManager: nftPositionManager.address,
      positionDescriptor: positionDescriptor.address,
      wgilt,
    },
    createdAt: new Date().toISOString(),
  };

  const manifestPath = deploymentsPath("goldchain-uniswap-v3-core.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("Uniswap V3 core stack deployed");
  console.log(`  chainId: ${manifest.chainId}`);
  console.log(`  deployer: ${manifest.deployer}`);
  console.log(`  factory: ${manifest.addresses.factory}`);
  console.log(`  swapRouter: ${manifest.addresses.swapRouter}`);
  console.log(`  nftPositionManager: ${manifest.addresses.nftPositionManager}`);
  console.log(`  positionDescriptor: ${manifest.addresses.positionDescriptor}`);
  console.log(`  wgilt: ${manifest.addresses.wgilt}`);
  console.log(`Manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
