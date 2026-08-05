pragma solidity ^0.5.2;

import {IERC20} from "../common/oz/token/ERC20/IERC20.sol";
import {IDepositManager} from "../root/depositManager/IDepositManager.sol";

contract ContractWithFallback {
    function deposit(address depositManager, address token, uint256 amount) public {
        IERC20(token).approve(depositManager, amount);
        IDepositManager(depositManager).depositERC20(token, amount);
    }

    function() external payable {}
}

contract ContractWithoutFallback {
    function deposit(address depositManager, address token, uint256 amount) public {
        IERC20(token).approve(depositManager, amount);
        IDepositManager(depositManager).depositERC20(token, amount);
    }
}

contract ContractWitRevertingFallback {
    function deposit(address depositManager, address token, uint256 amount) public {
        IERC20(token).approve(depositManager, amount);
        IDepositManager(depositManager).depositERC20(token, amount);
    }

    function() external payable {
        revert("not implemented");
    }
}
