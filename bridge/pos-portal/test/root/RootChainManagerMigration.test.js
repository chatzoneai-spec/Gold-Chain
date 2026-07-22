import { deployInitializedContracts } from '../helpers/deployerNew.js'
import { expect } from 'chai'

contract('RootChainManager migration allowlist', (accounts) => {
  let contracts
  let rootChainManager
  let migrationManagerRole

  beforeEach(async () => {
    contracts = await deployInitializedContracts(accounts)
    rootChainManager = contracts.root.rootChainManager
    migrationManagerRole = await rootChainManager.MIGRATION_MANAGER_ROLE()
    await rootChainManager.grantRole(migrationManagerRole, accounts[1])
  })

  it('Should keep both gold routes mapped to one child GOLD contract', async () => {
    expect(await rootChainManager.rootToChildToken(contracts.root.dummyPaxgERC20.target)).to.equal(
      contracts.child.physicalGold1155.target
    )
    expect(await rootChainManager.rootToChildToken(contracts.root.dummyXautERC20.target)).to.equal(
      contracts.child.physicalGold1155.target
    )
    expect(await rootChainManager.goldRootTokenByChildTokenId(contracts.child.physicalGold1155.target, 1)).to.equal(
      contracts.root.dummyPaxgERC20.target
    )
    expect(await rootChainManager.goldRootTokenByChildTokenId(contracts.child.physicalGold1155.target, 2)).to.equal(
      contracts.root.dummyXautERC20.target
    )
  })

  it('Should allow migration status updates only for approved migration tokens', async () => {
    await expect(
      rootChainManager
        .connect(await ethers.getSigner(accounts[1]))
        .updateTokenMigrationStatus(contracts.root.dummyPaxgERC20.target, true, false, 0)
    ).to.be.revertedWith('RootChainManager: TOKEN_NOT_MIGRATION_MANAGED')

    await rootChainManager.setTokenMigrationManager(contracts.root.dummyPaxgERC20.target, true)

    await expect(
      rootChainManager
        .connect(await ethers.getSigner(accounts[1]))
        .updateTokenMigrationStatus(contracts.root.dummyPaxgERC20.target, true, false, 0)
    ).to.not.be.reverted
  })

  it('Should block clean for approved migration tokens', async () => {
    await rootChainManager.setTokenMigrationManager(contracts.root.dummyPaxgERC20.target, true)

    await expect(
      rootChainManager.cleanMapToken(contracts.root.dummyPaxgERC20.target, contracts.child.physicalGold1155.target)
    ).to.be.revertedWith('RootChainManager: MIGRATION_TOKEN_LOCKED')
  })
})
