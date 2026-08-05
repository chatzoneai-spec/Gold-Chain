pragma solidity 0.6.4;

contract System {
    bool public alreadyInit;

    uint32 public constant CODE_OK = 0;
    uint16 public constant giltChainID = 0x0038;
    address public constant VALIDATOR_CONTRACT_ADDR = 0x0000000000000000000000000000000000001000;
    address public constant SLASH_CONTRACT_ADDR = 0x0000000000000000000000000000000000001001;
    address public constant SYSTEM_REWARD_ADDR = 0x0000000000000000000000000000000000001002;
    address internal constant LIGHT_CLIENT_ADDR = 0x0000000000000000000000000000000000001003;
    address internal constant TOKEN_HUB_ADDR = 0x0000000000000000000000000000000000001004;
    address internal constant INCENTIVIZE_ADDR = 0x0000000000000000000000000000000000001005;
    address internal constant RELAYERHUB_CONTRACT_ADDR = 0x0000000000000000000000000000000000001006;
    address public constant GOV_HUB_ADDR = 0x0000000000000000000000000000000000001007;
    address internal constant TOKEN_MANAGER_ADDR = 0x0000000000000000000000000000000000001008;
    address internal constant CROSS_CHAIN_CONTRACT_ADDR = 0x0000000000000000000000000000000000002000;
    address internal constant STAKING_CONTRACT_ADDR = 0x0000000000000000000000000000000000002001;
    address public constant STAKE_HUB_ADDR = 0x0000000000000000000000000000000000002002;
    address public constant STAKE_CREDIT_ADDR = 0x0000000000000000000000000000000000002003;
    address public constant GOVERNOR_ADDR = 0x0000000000000000000000000000000000002004;
    address public constant GOV_TOKEN_ADDR = 0x0000000000000000000000000000000000002005;
    address public constant TIMELOCK_ADDR = 0x0000000000000000000000000000000000002006;
    address internal constant GENERAL_NATIVE_TOKEN_MANAGER_ADDR = 0x0000000000000000000000000000000000002007;
    address internal constant TOKEN_RECOVER_PORTAL_ADDR = 0x0000000000000000000000000000000000003000;
    address internal constant STATE_RECEIVER_ADDR = 0x0000000000000000000000000000000000003001;
    address internal constant NATIVE_GILT_BRIDGE_ADDR = 0x0000000000000000000000000000000000003002;

    address public constant SYSTEM_ADDRESS = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;

    modifier onlySystem() {
        require(msg.sender == SYSTEM_ADDRESS, "Not System Address!");
        _;
    }

    modifier onlyCoinbase() {
        require(msg.sender == block.coinbase, "the message sender must be the block producer");
        _;
    }

    modifier onlyZeroGasPrice() {
        require(tx.gasprice == 0, "gasprice is not zero");
        _;
    }

    modifier onlyNotInit() {
        require(!alreadyInit, "the contract already init");
        _;
    }

    modifier onlyInit() {
        require(alreadyInit, "the contract not init yet");
        _;
    }

    modifier onlySlash() {
        require(msg.sender == SLASH_CONTRACT_ADDR, "the message sender must be slash contract");
        _;
    }

    modifier onlyGov() {
        require(msg.sender == GOV_HUB_ADDR, "the message sender must be governance contract");
        _;
    }

    modifier onlyValidatorContract() {
        require(msg.sender == VALIDATOR_CONTRACT_ADDR, "the message sender must be validatorSet contract");
        _;
    }

    modifier onlyCrossChainContract() {
        require(msg.sender == CROSS_CHAIN_CONTRACT_ADDR, "the message sender must be cross chain contract");
        _;
    }

    modifier onlyStakeHub() {
        require(msg.sender == STAKE_HUB_ADDR, "the msg sender must be stakeHub");
        _;
    }

    modifier onlyGovernorTimelock() {
        require(msg.sender == TIMELOCK_ADDR, "the msg sender must be governor timelock contract");
        _;
    }

    // Not reliable, do not use when need strong verify
    function isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
