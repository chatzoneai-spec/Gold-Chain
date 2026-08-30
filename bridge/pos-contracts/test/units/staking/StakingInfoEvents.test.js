import { expect } from 'chai'
import { ethers } from 'hardhat'
import { StakingInfo, Registry } from '../helpers/artifacts.js'
import ethUtils from 'ethereumjs-util'

describe('StakingInfo jail/slash events', function () {
  let stakingInfo
  let registry
  let stakeManager
  let governance

  beforeEach(async function () {
    const [owner, stakeManagerSigner] = await ethers.getSigners()
    stakeManager = stakeManagerSigner

    governance = owner
    registry = await Registry.deploy(governance.address)
    await registry.updateContractMap(ethUtils.keccak256('stakeManager'), stakeManager.address)
    stakingInfo = await StakingInfo.deploy(registry.address)
  })

  it('emits Slashed with Go ABI-compatible fields', async function () {
    const nonce = 7
    const amount = ethers.utils.parseEther('1000')

    await expect(stakingInfo.connect(stakeManager).logSlashed(nonce, amount))
      .to.emit(stakingInfo, 'Slashed')
      .withArgs(nonce, amount)
  })

  it('rejects logSlashed from non-StakeManager', async function () {
    const [, , other] = await ethers.getSigners()
    await expect(stakingInfo.connect(other).logSlashed(1, 1)).to.be.revertedWith(
      'Invalid sender, not stake manager'
    )
  })

  it('does not increment validatorNonce on logSlashed', async function () {
    const validatorId = 3
    await stakingInfo.updateNonce([validatorId], [5])
    await stakingInfo.connect(stakeManager).logSlashed(99, 10)
    expect(await stakingInfo.validatorNonce(validatorId)).to.equal(5)
  })

  it('emits UnJailed with Go ABI-compatible fields', async function () {
    const validatorId = 4
    const signer = (await ethers.getSigners())[3].address

    await expect(stakingInfo.connect(stakeManager).logUnJailed(validatorId, signer))
      .to.emit(stakingInfo, 'UnJailed')
      .withArgs(validatorId, signer)
  })

  it('rejects logUnJailed from non-StakeManager', async function () {
    const [, , other] = await ethers.getSigners()
    await expect(stakingInfo.connect(other).logUnJailed(1, other.address)).to.be.revertedWith(
      'Invalid sender, not stake manager'
    )
  })

  it('does not increment validatorNonce on logUnJailed', async function () {
    const validatorId = 2
    await stakingInfo.updateNonce([validatorId], [11])
    await stakingInfo.connect(stakeManager).logUnJailed(validatorId, stakeManager.address)
    expect(await stakingInfo.validatorNonce(validatorId)).to.equal(11)
  })

  it('increments validatorNonce on stake-mutating logs', async function () {
    const validatorId = 1
    const signer = stakeManager.address
    const signerPubkey = '0x010203'

    await stakingInfo.connect(stakeManager).logStaked(signer, signerPubkey, validatorId, 10, 100, 100)
    expect(await stakingInfo.validatorNonce(validatorId)).to.equal(1)

    await stakingInfo.connect(stakeManager).logUnstakeInit(signer, validatorId, 20, 50)
    expect(await stakingInfo.validatorNonce(validatorId)).to.equal(2)

    await stakingInfo.connect(stakeManager).logSignerChange(validatorId, signer, signer, signerPubkey)
    expect(await stakingInfo.validatorNonce(validatorId)).to.equal(3)
  })
})
