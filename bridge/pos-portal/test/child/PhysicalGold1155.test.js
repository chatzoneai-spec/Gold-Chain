import { AbiCoder } from 'ethers'
import { deployFreshChildContracts } from '../helpers/deployerNew.js'
import { expect } from 'chai'

const abi = new AbiCoder()

contract('PhysicalGold1155', (accounts) => {
  describe('deposit and withdrawSingle', () => {
    const rootAmount = 2n
    const tokenId = 1n
    let physicalGold1155

    before(async () => {
      const contracts = await deployFreshChildContracts(accounts)
      physicalGold1155 = contracts.physicalGold1155
    })

    it('Should mint scaled ERC1155 GOLD on deposit', async () => {
      const depositData = abi.encode(['uint256', 'uint256'], [tokenId.toString(), rootAmount.toString()])
      await physicalGold1155.deposit(accounts[1], depositData)
      expect(await physicalGold1155.balanceOf(accounts[1], tokenId)).to.equal(2000n)
    })

    it('Should reject non exact withdraw amounts', async () => {
      await expect(
        physicalGold1155.connect(await ethers.getSigner(accounts[1])).withdrawSingle(tokenId, 1999)
      ).to.be.revertedWith('non exact withdraw')
    })

    it('Should allow exact withdraw amounts', async () => {
      await expect(
        physicalGold1155.connect(await ethers.getSigner(accounts[1])).withdrawSingle(tokenId, 1000)
      ).to.not.be.reverted
    })
  })
})
