import { AbiCoder } from 'ethers'
import { bufferToHex, rlp } from 'ethereumjs-util'
import { deployInitializedContracts } from '../helpers/deployerNew.js'
import { expect } from 'chai'
import { syncState } from '../helpers/utils.js'
import { submitCheckpoint } from '../helpers/checkpoint.js'

const abi = new AbiCoder()

contract('RootChainManager shared GOLD route', (accounts) => {
  const buildExitPayload = (headerNumber, checkpointData, receipt, logIndex = 0) =>
    bufferToHex(
      rlp.encode([
        headerNumber,
        bufferToHex(Buffer.concat(checkpointData.proof)),
        checkpointData.number,
        checkpointData.timestamp,
        bufferToHex(checkpointData.transactionsRoot),
        bufferToHex(checkpointData.receiptsRoot),
        bufferToHex(checkpointData.receipt),
        bufferToHex(rlp.encode(checkpointData.receiptParentNodes)),
        bufferToHex(checkpointData.path),
        logIndex
      ])
    )

  const runRoute = async ({ route, tokenId }) => {
    const contracts = await deployInitializedContracts(accounts)
    const rootChainManager = contracts.root.rootChainManager
    const physicalGold1155 = contracts.child.physicalGold1155
    const depositReceiver = accounts[0]
    const rootAmount = 2n
    const rootToken = route === 'paxg' ? contracts.root.dummyPaxgERC20 : contracts.root.dummyXautERC20
    const routeConfig = await physicalGold1155.bridgeRoutePrecision(tokenId)
    const childAmount = (rootAmount * routeConfig.scaleNumerator) / routeConfig.scaleDenominator

    const oldRootBalance = await rootToken.balanceOf(depositReceiver)

    await rootToken.approve(contracts.root.scaledERC1155Predicate.target, rootAmount)
    const depositTx = await rootChainManager.depositFor(
      depositReceiver,
      rootToken.target,
      abi.encode(['uint256', 'uint256'], [tokenId.toString(), rootAmount.toString()])
    )
    const depositReceipt = await depositTx.wait()
    const syncTxs = await syncState(depositReceipt)
    await Promise.all(syncTxs.map((tx) => tx.wait()))

    expect(await physicalGold1155.balanceOf(depositReceiver, tokenId)).to.equal(childAmount)

    const withdrawTx = await physicalGold1155.withdrawSingle(tokenId, childAmount)
    await withdrawTx.wait()
    const withdrawReceipt = await web3.eth.getTransactionReceipt(withdrawTx.hash)

    const checkpointData = await submitCheckpoint(contracts.root.checkpointManager, withdrawReceipt)
    const headerNumber = await contracts.root.checkpointManager.currentCheckpointNumber()
    const exitData = buildExitPayload(headerNumber, checkpointData, withdrawReceipt, 0)

    await rootChainManager.exit(exitData)

    expect(await rootToken.balanceOf(depositReceiver)).to.equal(oldRootBalance)
  }

  it('Should reject deposits with the wrong GOLD token id', async () => {
    const contracts = await deployInitializedContracts(accounts)
    await contracts.root.dummyPaxgERC20.approve(contracts.root.scaledERC1155Predicate.target, 1)

    await expect(
      contracts.root.rootChainManager.depositFor(
        accounts[0],
        contracts.root.dummyPaxgERC20.target,
        abi.encode(['uint256', 'uint256'], ['2', '1'])
      )
    ).to.be.revertedWith('RootChainManager: INVALID_GOLD_TOKEN_ID')
  })

  it('Should bridge PAXG through the shared GOLD contract', async () => {
    await runRoute({
      route: 'paxg',
      tokenId: 1n
    })
  })

  it('Should bridge XAUT through the shared GOLD contract', async () => {
    await runRoute({
      route: 'xaut',
      tokenId: 2n
    })
  })
})
