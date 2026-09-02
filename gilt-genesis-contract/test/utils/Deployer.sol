pragma solidity ^0.8.10;

import "forge-std/Test.sol";

import "./interface/IGiltValidatorSet.sol";
import "./interface/IGovHub.sol";
import "./interface/ISlashIndicator.sol";
import "./interface/ISystemReward.sol";
import "./interface/IStakeHub.sol";
import "./interface/IStakeCredit.sol";
import "./interface/IGiltGovernor.sol";
import "./interface/IGovToken.sol";
import "./interface/IGiltTimelock.sol";
import "./RLPEncode.sol";
import "./RLPDecode.sol";

contract Deployer is Test {
    using RLPEncode for *;

    // system contract address
    address payable public constant VALIDATOR_CONTRACT_ADDR = payable(0x0000000000000000000000000000000000001000);
    address public constant SLASH_CONTRACT_ADDR = payable(0x0000000000000000000000000000000000001001);
    address payable public constant SYSTEM_REWARD_ADDR = payable(0x0000000000000000000000000000000000001002);
    address public constant GOV_HUB_ADDR = payable(0x0000000000000000000000000000000000001007);
    address payable public constant STAKE_HUB_ADDR = payable(0x0000000000000000000000000000000000002002);
    address public constant STAKE_HUB_VALIDATORS_MODULE_ADDR = 0x0000000000000000000000000000000000002010;
    address public constant STAKE_HUB_GILT_STAKING_MODULE_ADDR = 0x0000000000000000000000000000000000002011;
    address public constant STAKE_HUB_GOLD_STAKING_MODULE_ADDR = 0x0000000000000000000000000000000000002012;
    address public constant STAKE_HUB_REWARDS_MODULE_ADDR = 0x0000000000000000000000000000000000002013;
    address public constant STAKE_HUB_INFLATION_MODULE_ADDR = 0x0000000000000000000000000000000000002014;
    address public constant STAKE_HUB_SLASHING_MODULE_ADDR = 0x0000000000000000000000000000000000002015;
    address public constant STAKE_HUB_MIGRATION_MODULE_ADDR = 0x0000000000000000000000000000000000002016;
    address public constant STAKE_HUB_PARAMS_MODULE_ADDR = 0x0000000000000000000000000000000000002017;
    address public constant STAKE_HUB_VALIDATOR_VIEWS_MODULE_ADDR = 0x0000000000000000000000000000000000002018;
    address public constant STATE_RECEIVER_ADDR = 0x0000000000000000000000000000000000003001;
    address payable public constant STAKE_CREDIT_ADDR = payable(0x0000000000000000000000000000000000002003);
    address payable public constant GOVERNOR_ADDR = payable(0x0000000000000000000000000000000000002004);
    address public constant GOV_TOKEN_ADDR = payable(0x0000000000000000000000000000000000002005);
    address payable public constant TIMELOCK_ADDR = payable(0x0000000000000000000000000000000000002006);
    address payable public constant BLOCK_PRODUCER_ADDR = payable(0x000000000000000000000000000000000000FEE1);
    uint256 internal constant SLOT_VALIDATOR_SET_ALREADY_INIT = 0;
    uint256 internal constant SLOT_CURRENT_VALIDATOR_SET = 1;
    uint256 internal constant SLOT_CURRENT_VALIDATOR_SET_MAP = 4;
    uint256 internal constant SLOT_MAX_NUM_OF_MAINTAINING = 8;
    uint256 internal constant SLOT_MAINTAIN_SLASH_SCALE = 10;
    uint256 internal constant SLOT_VALIDATOR_EXTRA_SET = 11;
    uint256 internal constant SLOT_MAX_NUM_OF_CANDIDATES = 13;
    uint256 internal constant SLOT_PREVIOUS_VOTE_ADDR_FULL_SET = 18;
    uint256 internal constant SLOT_CURRENT_VOTE_ADDR_FULL_SET = 19;
    uint256 internal constant SLOT_TURN_LENGTH = 23;
    uint256 internal constant SLOT_VALIDATOR_BOOTSTRAP_HASH = 28;
    uint256 internal constant SLOT_STAKE_HUB_TOKEN_B_REWARD_SPLIT_BPS = 86;
    uint256 internal constant SLOT_STAKE_HUB_INFLATION_ENABLED = 87;
    uint256 internal constant SLOT_STAKE_HUB_INFLATION_START_DAY_INDEX = 88;
    uint256 internal constant SLOT_STAKE_HUB_INFLATION_RATE_INITIAL_BPS = 89;
    uint256 internal constant SLOT_STAKE_HUB_INFLATION_RATE_MIN_BPS = 90;
    uint256 internal constant SLOT_STAKE_HUB_INFLATION_DECAY_BPS_PER_YEAR = 91;
    uint256 internal constant SLOT_STAKE_HUB_INFLATION_BASE_SUPPLY = 92;
    uint256 internal constant VALIDATOR_STRUCT_SIZE = 4;
    uint256 internal constant VALIDATOR_EXTRA_STRUCT_SIZE = 22;
    uint256 internal constant TEST_BOOTSTRAP_VALIDATOR_COUNT = 21;

    uint8 public constant BIND_CHANNELID = 0x01;
    uint8 public constant TRANSFER_IN_CHANNELID = 0x02;
    uint8 public constant TRANSFER_OUT_CHANNELID = 0x03;
    uint8 public constant MIRROR_CHANNELID = 0x04;
    uint8 public constant SYNC_CHANNELID = 0x05;
    uint8 public constant STAKING_CHANNELID = 0x08;
    uint8 public constant GOV_CHANNELID = 0x09;
    uint8 public constant SLASH_CHANNELID = 0x0b;
    uint8 public constant CROSS_STAKE_CHANNELID = 0x10;
    uint8 public constant BC_FUSION_CHANNELID = 0x11;

    GiltValidatorSet public giltValidatorSet;
    SlashIndicator public slashIndicator;
    SystemReward public systemReward;
    GovHub public govHub;
    StakeHub public stakeHub;
    StakeCredit public stakeCredit;
    GiltGovernor public governor;
    GovToken public govToken;
    GiltTimelock public timelock;

    address payable public relayer;

    bytes32 internal nextUser = keccak256(abi.encodePacked("user address"));

    event paramChange(string key, bytes value);

    constructor() {
        // please use the following command to run the test on mainnet fork instead: forge test --rpc-url ${fork_url}
        // vm.createSelectFork("gilt");
        assertEq(block.chainid, 56);

        // setup system contracts
        giltValidatorSet = GiltValidatorSet(VALIDATOR_CONTRACT_ADDR);
        vm.label(address(giltValidatorSet), "Validator");
        slashIndicator = SlashIndicator(SLASH_CONTRACT_ADDR);
        vm.label(address(slashIndicator), "SlashIndicator");
        systemReward = SystemReward(SYSTEM_REWARD_ADDR);
        vm.label(address(systemReward), "SystemReward");
        govHub = GovHub(GOV_HUB_ADDR);
        vm.label(address(govHub), "GovHub");
        stakeHub = StakeHub(STAKE_HUB_ADDR);
        vm.label(address(stakeHub), "StakeHub");
        stakeCredit = StakeCredit(STAKE_CREDIT_ADDR);
        vm.label(address(stakeCredit), "StakeCredit");
        governor = GiltGovernor(GOVERNOR_ADDR);
        vm.label(address(governor), "GiltGovernor");
        govToken = GovToken(GOV_TOKEN_ADDR);
        vm.label(address(govToken), "GovToken");
        timelock = GiltTimelock(TIMELOCK_ADDR);
        vm.label(address(timelock), "GiltTimelock");

        // set the latest code
        bytes memory deployedCode = vm.getDeployedCode("GiltValidatorSet.sol:GiltValidatorSet");
        vm.etch(VALIDATOR_CONTRACT_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("SlashIndicator.sol:SlashIndicator");
        vm.etch(SLASH_CONTRACT_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("SystemReward.sol:SystemReward");
        vm.etch(SYSTEM_REWARD_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("GovHub.sol:GovHub");
        vm.etch(GOV_HUB_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHub.sol:StakeHub");
        vm.etch(STAKE_HUB_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubValidators.sol:StakeHubValidators");
        vm.etch(STAKE_HUB_VALIDATORS_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubGiltStaking.sol:StakeHubGiltStaking");
        vm.etch(STAKE_HUB_GILT_STAKING_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubGoldStaking.sol:StakeHubGoldStaking");
        vm.etch(STAKE_HUB_GOLD_STAKING_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubRewards.sol:StakeHubRewards");
        vm.etch(STAKE_HUB_REWARDS_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubInflation.sol:StakeHubInflation");
        vm.etch(STAKE_HUB_INFLATION_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubSlashing.sol:StakeHubSlashing");
        vm.etch(STAKE_HUB_SLASHING_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubMigration.sol:StakeHubMigration");
        vm.etch(STAKE_HUB_MIGRATION_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubParams.sol:StakeHubParams");
        vm.etch(STAKE_HUB_PARAMS_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeHubValidatorViews.sol:StakeHubValidatorViews");
        vm.etch(STAKE_HUB_VALIDATOR_VIEWS_MODULE_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("StakeCredit.sol:StakeCredit");
        vm.etch(STAKE_CREDIT_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("GiltGovernor.sol:GiltGovernor");
        vm.etch(GOVERNOR_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("GovToken.sol:GovToken");
        vm.etch(GOV_TOKEN_ADDR, deployedCode);
        deployedCode = vm.getDeployedCode("GiltTimelock.sol:GiltTimelock");
        vm.etch(TIMELOCK_ADDR, deployedCode);

        vm.coinbase(BLOCK_PRODUCER_ADDR);

        _seedGeneratedValidatorSetForTests();
        giltValidatorSet.init();
        slashIndicator.init();

        vm.startPrank(block.coinbase);
        govToken.initialize();
        stakeHub.initialize();
        timelock.initialize();
        governor.initialize();
        vm.stopPrank();
        _seedStakeHubLaunchEconomicsForTests();

        vm.prank(VALIDATOR_CONTRACT_ADDR);
        systemReward.claimRewards(payable(address(0)), 0);
        vm.store(address(governor), bytes32(uint256(405)), bytes32(uint256(806400)));
        vm.store(address(governor), bytes32(uint256(655)), bytes32(uint256(115200)));
        vm.store(address(governor), bytes32(uint256(706)), bytes32(uint256(1)));

        // Seed the slash contract with the mainnet-like governance values used by the tests.
        vm.startPrank(address(TIMELOCK_ADDR));
        govHub.updateParam("addOperator", abi.encodePacked(address(slashIndicator)), address(systemReward));
        govHub.updateParam("felonyThreshold", abi.encode(uint256(600)), address(slashIndicator));
        govHub.updateParam("misdemeanorThreshold", abi.encode(uint256(200)), address(slashIndicator));
        vm.stopPrank();

        // Advance through enough blocks so local blockhash-based slash tests have recent history.
        for (uint256 i; i < 64; ++i) {
            vm.roll(block.number + 1);
        }

        relayer = payable(0xb005741528b86F5952469d80A8614591E3c5B632);
        vm.label(relayer, "relayer");
    }

    function _seedGeneratedValidatorSetForTests() internal {
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_CURRENT_VALIDATOR_SET), _storageWord(TEST_BOOTSTRAP_VALIDATOR_COUNT));
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_VALIDATOR_EXTRA_SET), _storageWord(TEST_BOOTSTRAP_VALIDATOR_COUNT));
        vm.store(
            VALIDATOR_CONTRACT_ADDR,
            _storageSlot(SLOT_PREVIOUS_VOTE_ADDR_FULL_SET),
            _storageWord(TEST_BOOTSTRAP_VALIDATOR_COUNT)
        );
        vm.store(
            VALIDATOR_CONTRACT_ADDR,
            _storageSlot(SLOT_CURRENT_VOTE_ADDR_FULL_SET),
            _storageWord(TEST_BOOTSTRAP_VALIDATOR_COUNT)
        );

        for (uint256 i; i < TEST_BOOTSTRAP_VALIDATOR_COUNT; ++i) {
            address consensusAddress = address(uint160(uint256(keccak256(abi.encodePacked("bootstrap-consensus", i)))));
            bytes memory voteAddress = _bootstrapVoteAddress(i);
            uint256 validatorBase = uint256(keccak256(abi.encode(SLOT_CURRENT_VALIDATOR_SET))) + i * VALIDATOR_STRUCT_SIZE;
            uint256 validatorExtraBase =
                uint256(keccak256(abi.encode(SLOT_VALIDATOR_EXTRA_SET))) + i * VALIDATOR_EXTRA_STRUCT_SIZE;

            vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(validatorBase), _storageWord(uint160(consensusAddress)));
            vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(validatorBase + 1), _storageWord(uint160(consensusAddress)));
            vm.store(
                VALIDATOR_CONTRACT_ADDR,
                _storageSlot(validatorBase + 2),
                _storageWord(uint160(consensusAddress) + (uint256(100) << 160))
            );
            vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(validatorBase + 3), _storageWord(0));
            vm.store(
                VALIDATOR_CONTRACT_ADDR,
                keccak256(abi.encode(consensusAddress, SLOT_CURRENT_VALIDATOR_SET_MAP)),
                _storageWord(i + 1)
            );

            _storeValidatorSetBytes(validatorExtraBase + 2, voteAddress);
            _storeValidatorSetBytes(uint256(keccak256(abi.encode(SLOT_PREVIOUS_VOTE_ADDR_FULL_SET))) + i, voteAddress);
            _storeValidatorSetBytes(uint256(keccak256(abi.encode(SLOT_CURRENT_VOTE_ADDR_FULL_SET))) + i, voteAddress);
        }

        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_MAX_NUM_OF_MAINTAINING), _storageWord(3));
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_MAINTAIN_SLASH_SCALE), _storageWord(2));
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_MAX_NUM_OF_CANDIDATES), _storageWord(15));
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_TURN_LENGTH), _storageWord(16));
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_VALIDATOR_BOOTSTRAP_HASH), bytes32(uint256(1)));
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(SLOT_VALIDATOR_SET_ALREADY_INIT), _storageWord(0));
    }

    function _seedStakeHubLaunchEconomicsForTests() internal {
        vm.store(STAKE_HUB_ADDR, _storageSlot(SLOT_STAKE_HUB_TOKEN_B_REWARD_SPLIT_BPS), _storageWord(2_000));
        vm.store(STAKE_HUB_ADDR, _storageSlot(SLOT_STAKE_HUB_INFLATION_ENABLED), _storageWord(1));
        vm.store(
            STAKE_HUB_ADDR,
            _storageSlot(SLOT_STAKE_HUB_INFLATION_START_DAY_INDEX),
            _storageWord(block.timestamp / 1 days)
        );
        vm.store(STAKE_HUB_ADDR, _storageSlot(SLOT_STAKE_HUB_INFLATION_RATE_INITIAL_BPS), _storageWord(1_000));
        vm.store(STAKE_HUB_ADDR, _storageSlot(SLOT_STAKE_HUB_INFLATION_RATE_MIN_BPS), _storageWord(150));
        vm.store(STAKE_HUB_ADDR, _storageSlot(SLOT_STAKE_HUB_INFLATION_DECAY_BPS_PER_YEAR), _storageWord(1_500));
        vm.store(
            STAKE_HUB_ADDR,
            _storageSlot(SLOT_STAKE_HUB_INFLATION_BASE_SUPPLY),
            _storageWord(3_000_000_000 ether)
        );
    }

    function _bootstrapVoteAddress(
        uint256 index
    ) internal pure returns (bytes memory) {
        return bytes.concat(keccak256(abi.encodePacked("bootstrap-vote-a", index)), bytes16(keccak256(abi.encodePacked("bootstrap-vote-b", index))));
    }

    function _storeValidatorSetBytes(uint256 slotNumber, bytes memory value) internal {
        require(value.length == 48, "bootstrap vote address must be 48 bytes");
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(slotNumber), _storageWord(value.length * 2 + 1));

        uint256 dataSlot = uint256(keccak256(abi.encode(slotNumber)));
        bytes32 firstWord;
        bytes32 secondWord;
        assembly {
            firstWord := mload(add(value, 32))
            secondWord := mload(add(value, 64))
        }
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(dataSlot), firstWord);
        vm.store(VALIDATOR_CONTRACT_ADDR, _storageSlot(dataSlot + 1), secondWord);
    }

    function _storageSlot(
        uint256 slotNumber
    ) internal pure returns (bytes32) {
        return bytes32(slotNumber);
    }

    function _storageWord(
        uint256 value
    ) internal pure returns (bytes32) {
        return bytes32(value);
    }

    function _getNextUserAddress() internal returns (address payable) {
        address payable user = payable(address(uint160(uint256(nextUser))));
        nextUser = keccak256(abi.encodePacked(nextUser));
        vm.deal(user, 10_000 ether);
        return user;
    }

    function _updateParamByGovHub(
        bytes memory key,
        bytes memory value,
        address addr
    ) internal {
        vm.startPrank(address(TIMELOCK_ADDR));
        govHub.updateParam(string(key), value, addr);
        vm.stopPrank();
    }

    function _createValidator(
        uint256 delegation
    ) internal returns (address operatorAddress, address consensusAddress, address credit, bytes memory voteAddress) {
        uint256 toLock = stakeHub.LOCK_AMOUNT();

        operatorAddress = _getNextUserAddress();
        StakeHub.Commission memory commission = StakeHub.Commission({ rate: 10, maxRate: 100, maxChangeRate: 5 });
        StakeHub.Description memory description = StakeHub.Description({
            moniker: string.concat("T", vm.toString(uint24(uint160(operatorAddress)))),
            identity: vm.toString(operatorAddress),
            website: vm.toString(operatorAddress),
            details: vm.toString(operatorAddress)
        });
        voteAddress = bytes.concat(
            hex"00000000000000000000000000000000000000000000000000000000", abi.encodePacked(operatorAddress)
        );
        bytes memory blsProof = new bytes(96);
        consensusAddress = address(uint160(uint256(keccak256(voteAddress))));

        vm.prank(operatorAddress);
        stakeHub.createValidator{ value: delegation + toLock }(
            consensusAddress, voteAddress, blsProof, commission, description
        );

        credit = stakeHub.getValidatorCreditContract(operatorAddress);
    }

    function _batchCreateValidators(
        uint256 number
    )
        internal
        returns (
            address[] memory operatorAddrs,
            address[] memory consensusAddrs,
            uint64[] memory votingPowers,
            bytes[] memory voteAddrs
        )
    {
        operatorAddrs = new address[](number);
        consensusAddrs = new address[](number);
        votingPowers = new uint64[](number);
        voteAddrs = new bytes[](number);

        address operatorAddress;
        address consensusAddress;
        uint64 votingPower;
        bytes memory voteAddress;
        for (uint256 i; i < number; ++i) {
            votingPower = 2000 * 1e8;
            (operatorAddress, consensusAddress,, voteAddress) = _createValidator(uint256(votingPower) * 1e10);

            operatorAddrs[i] = operatorAddress;
            consensusAddrs[i] = consensusAddress;
            votingPowers[i] = votingPower;
            voteAddrs[i] = voteAddress;
        }
    }
}
