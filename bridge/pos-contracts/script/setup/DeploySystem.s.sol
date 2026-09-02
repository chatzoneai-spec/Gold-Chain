// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import {StakingInfo} from "../../scripts/helpers/interfaces/StakingInfo.generated.sol";
import {Registry} from "../../scripts/helpers/interfaces/Registry.generated.sol";
import {Governance} from "../../scripts/helpers/interfaces/Governance.generated.sol";
import {GovernanceProxy} from "../../scripts/helpers/interfaces/GovernanceProxy.generated.sol";
import {GiltMigration} from "../../scripts/helpers/interfaces/GiltMigration.generated.sol";
import {ERC20Permit} from "../../scripts/helpers/interfaces/ERC20Permit.generated.sol";
import {WGILT} from "../../scripts/helpers/interfaces/WGILT.generated.sol";

import {RootChain} from "../../scripts/helpers/interfaces/RootChain.generated.sol";
import {RootChainProxy} from "../../scripts/helpers/interfaces/RootChainProxy.generated.sol";
import {StateSender} from "../../scripts/helpers/interfaces/StateSender.generated.sol";
import {ValidatorSetCommitment} from "../../scripts/helpers/interfaces/ValidatorSetCommitment.generated.sol";
import {ValidatorSetCommitmentProxy} from "../../scripts/helpers/interfaces/ValidatorSetCommitmentProxy.generated.sol";

import {ArtifactPath} from "./ArtifactPath.sol";

import "forge-std/Script.sol";

interface IChainIdMixin {
    function CHAINID() external view returns (uint256);
}

contract DeploySystem is Script, ArtifactPath {
    uint256 internal constant GOLD_CHAIN_ID = 714;

    Governance governance;
    Registry registry;
    ERC20Permit polToken;
    WGILT legacyToken;
    GiltMigration giltMigration;
    StakingInfo stakingInfo;
    RootChain rootChain;
    ValidatorSetCommitment validatorSetCommitment;
    address owner;

    address governanceProxy;

    function run() public {}

    function deployAll() public {
        owner = vm.envAddress("GOVERNANCE_MULTISIG");
        require(owner != address(0), "GOVERNANCE_MULTISIG not set");

        address governanceImpl = deployCode(GovernancePath);
        governanceProxy = deployCode(GovernanceProxyPath, abi.encode(governanceImpl));
        governance = Governance(governanceProxy);

        registry = Registry(deployCode(RegistryPath, abi.encode(governanceProxy)));

        legacyToken = WGILT(deployCode(WGILTPath));
        polToken = ERC20Permit(deployCode(ERC20PermitPath, abi.encode("Pol Token", "POL", "1.1.0")));
        updateRegistryContractMap("pol", address(polToken));

        giltMigration =
            GiltMigration(deployCode(GiltMigrationPath, abi.encode(address(legacyToken), address(polToken))));

        stakingInfo = StakingInfo(deployCode(StakingInfoPath, abi.encode(registry)));

        address rootChainImpl = deployCode(RootChainPath);
        rootChain = RootChain(deployCode(RootChainProxyPath, abi.encode(rootChainImpl, registry, "giltconsensus-P5rXwg")));
        require(IChainIdMixin(address(rootChain)).CHAINID() == GOLD_CHAIN_ID, "ChainIdMixin CHAINID must be 714");

        address validatorSetCommitmentImpl = deployCode(ValidatorSetCommitmentPath);
        address validatorSetCommitmentProxy =
            deployCode(ValidatorSetCommitmentProxyPath, abi.encode(validatorSetCommitmentImpl));
        validatorSetCommitment = ValidatorSetCommitment(validatorSetCommitmentProxy);
        _initializeGenesisCommitment(validatorSetCommitmentProxy);
        updateRegistryContractMap("validatorSetCommitment", validatorSetCommitmentProxy);

        address stateSender = deployCode(StateSenderPath);
        updateRegistryContractMap("stateSender", stateSender);
    }

    function _initializeGenesisCommitment(address commitmentAddr) internal {
        address genesisValidator = address(0x1111111111111111111111111111111111111111);
        address[] memory consensusAddresses = new address[](1);
        consensusAddresses[0] = genesisValidator;

        bytes[] memory voteKeys = new bytes[](1);
        voteKeys[0] = new bytes(48);
        for (uint256 i = 0; i < 48; ++i) {
            voteKeys[0][i] = bytes1(uint8(i + 1));
        }

        uint256[] memory votingPowers = new uint256[](1);
        votingPowers[0] = 1000 * 10 ** 18;

        ValidatorSetCommitment(commitmentAddr)
            .initialize(GOLD_CHAIN_ID, consensusAddresses, voteKeys, votingPowers);
    }

    function setTestConfig() public {
        uint256 defaultTokenAmount = 5 * 10 ** 9 * 10 ** 18;
        legacyToken.mint(address(giltMigration), defaultTokenAmount);
        polToken.mint(address(giltMigration), defaultTokenAmount);
    }

    function governanceUpdateCall(address _target, bytes memory _callData) public {
        vm.prank(governance.owner());
        governance.update(_target, _callData);
    }

    function updateRegistryContractMap(string memory _key, address _value) public {
        governanceUpdateCall(
            address(registry), abi.encodeCall(Registry.updateContractMap, (keccak256(abi.encodePacked(_key)), _value))
        );
    }

    function fundAddr(address _address, uint256 _amount) public {
        polToken.mint(_address, _amount);
    }

    function fundAddrLegacyToken(address _address, uint256 _amount) public {
        legacyToken.mint(_address, _amount);
    }
}
