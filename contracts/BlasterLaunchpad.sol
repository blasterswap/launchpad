// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBlasterswapV2Router02} from "./interfaces/IBlasterswapV2Router02.sol";
import {IBlasterswapV2Factory} from "./interfaces/IBlasterswapV2Factory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBlasterLaunchpad} from "./interfaces/IBlasterLaunchpad.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICoin} from "./interfaces/ICoin.sol";
import {Coin} from "./Coin.sol";

contract BlasterLaunchpad is IBlasterLaunchpad, ReentrancyGuard {
    mapping(bytes32 => LockInfo) private lockInfos;
    mapping(address => bool) public coins;
    mapping(address => uint) public locksNonce;

    address public immutable WETH;
    IBlasterswapV2Router02 public immutable blasterRouter;
    IBlasterswapV2Factory public immutable blasterFactory;

    constructor(address _router, address _weth) {
        blasterRouter = IBlasterswapV2Router02(_router);
        blasterFactory = IBlasterswapV2Factory(
            IBlasterswapV2Router02(_router).factory()
        );

        WETH = _weth;
    }

    function createCoin(
        CreateCoinArguments memory _createCoinArguments
    ) external payable {
        require(
            _createCoinArguments.lockPeriod != 0,
            "BlasterLaunchpad: lock period is 0"
        );
        require(
            _createCoinArguments.lpAmount != 0,
            "BlasterLaunchpad: lp amount tokens is 0"
        );
        require(
            _createCoinArguments.lpAmountETH != 0,
            "BlasterLaunchpad: lp amount eth is 0"
        );
        if (_createCoinArguments.supply - _createCoinArguments.lpAmount != 0) {
            require(
                _createCoinArguments.vestingPeriod != 0,
                "BlasterLaunchpad: vesting period is 0"
            );
        }

        bool success;
        // send excess eth back to sender
        if (_createCoinArguments.lpAmountETH < msg.value) {
            (success, ) = msg.sender.call{
                value: msg.value - _createCoinArguments.lpAmountETH
            }("");
            require(success, "BlasterLaunchpad: transfer failed");
        }

        Coin coin = new Coin(
            _createCoinArguments.name,
            _createCoinArguments.symbol,
            _createCoinArguments.supply,
            _createCoinArguments.buyTaxBasisPoints,
            _createCoinArguments.sellTaxBasisPoints,
            _createCoinArguments.burnBasisPoints,
            _createCoinArguments.maxTokensPerWallet,
            _createCoinArguments.limitPerTransaction,
            _createCoinArguments.antisnipePeriod,
            _createCoinArguments.feeReceiver,
            address(this)
        );
        coin.disableBurnAndTaxes();

        address pair;
        // avoid stack too deep
        {
            uint liquidityTokens;
            uint amountToken;

            if (_createCoinArguments.lpAmount != 0) {
                success = coin.approve(
                    address(blasterRouter),
                    _createCoinArguments.lpAmount
                );
                require(success, "BlasterLaunchpad: approve failed");
                uint amountETH;

                (amountToken, amountETH, liquidityTokens) = blasterRouter
                    .addLiquidityETH{value: _createCoinArguments.lpAmountETH}(
                    address(coin),
                    _createCoinArguments.lpAmount,
                    _createCoinArguments.lpAmount,
                    _createCoinArguments.lpAmountETH,
                    address(this),
                    block.timestamp
                );
            }

            (address token0, address token1) = sortTokens(address(coin), WETH);
            pair = IBlasterswapV2Factory(blasterRouter.factory()).getPair(
                token0,
                token1
            );
            uint coinSupplyMinusLPAmount = _createCoinArguments.supply -
                amountToken;

            // lock lp tokens
            uint256 lockId = _lockTokens(
                pair,
                liquidityTokens,
                _createCoinArguments.lockPeriod
            );
            emit TokensLocked(msg.sender, lockId, pair, liquidityTokens, 1);

            // lock creator's allocation
            lockId = _lockTokens(
                address(coin),
                coinSupplyMinusLPAmount,
                _createCoinArguments.vestingPeriod
            );
            emit TokensLocked(
                msg.sender,
                lockId,
                address(coin),
                coinSupplyMinusLPAmount,
                0
            );
        }

        coin.enableBurnAndTaxes();
        coin.addSupportedPair(pair, true);

        coins[address(coin)] = true;
        emit CoinCreated(
            address(coin),
            msg.sender,
            _createCoinArguments.coinId,
            _createCoinArguments.lockPeriod,
            _createCoinArguments.vestingPeriod,
            _createCoinArguments.lpAmount,
            _createCoinArguments.lpAmountETH
        );
    }

    function removeLiquidityETH(
        address _coin,
        address _token,
        uint _liquidity,
        uint _amountTokenMin,
        uint _amountETHMin,
        address _to
    ) external payable nonReentrant {
        (address token0, address token1) = sortTokens(_coin, WETH);
        require(
            _token == blasterFactory.getPair(token0, token1),
            "BlasterLaunchpad: not lp token"
        );

        ICoin(_coin).disableBurnAndTaxes();

        bool success = IERC20(_token).transferFrom(
            msg.sender,
            address(this),
            _liquidity
        );
        require(success, "BlasterLaunchpad: transfer failed");

        success = IERC20(_token).approve(address(blasterRouter), _liquidity);
        require(success, "BlasterLaunchpad: approve to router failed");

        (uint amountToken, uint amountETH) = blasterRouter.removeLiquidityETH(
            _coin,
            _liquidity,
            _amountTokenMin,
            _amountETHMin,
            address(this),
            block.timestamp
        );

        success = IERC20(_coin).transfer(_to, amountToken);
        require(success, "BlasterLaunchpad: transfer failed");

        ICoin(_coin).enableBurnAndTaxes();

        (success, ) = _to.call{value: amountETH}("");
        require(success, "BlasterLaunchpad: transfer failed");
    }

    function addLiquidityETH(
        address _coin,
        uint _amountTokenDesired,
        uint _amountTokenMin,
        uint _amountETHMin
    ) external payable {
        addLiquidityAndRefundExcess(
            _coin,
            _amountTokenDesired,
            _amountTokenMin,
            _amountETHMin
        );
    }

    function addLiquidityETHWithLock(
        address _coin,
        uint _amountTokenDesired,
        uint _amountTokenMin,
        uint _amountETHMin,
        uint _lockPeriod
    ) external payable {
        uint liquidityTokens = addLiquidityAndRefundExcess(
            _coin,
            _amountTokenDesired,
            _amountTokenMin,
            _amountETHMin
        );

        (address token0, address token1) = sortTokens(address(_coin), WETH);
        address lpToken = IBlasterswapV2Factory(blasterRouter.factory())
            .getPair(token0, token1);
        uint lockId = _lockTokens(lpToken, liquidityTokens, _lockPeriod);
        emit TokensLocked(msg.sender, lockId, lpToken, liquidityTokens, 1);
    }

    function claimToken(uint _lockId) external {
        LockInfo memory li = lockInfos[bytes32(_lockId)];
        require(li.owner == msg.sender, "BlasterLaunchpad: not owner");

        uint claimAmount;
        uint timePassedSinceCreation = block.timestamp - li.createdDate;

        if (li.period < timePassedSinceCreation) {
            claimAmount = li.amountLeft;
            bool success = IERC20(li.token).transfer(msg.sender, li.amountLeft);
            require(success, "BlasterLaunchpad: transfer failed");
            delete lockInfos[bytes32(_lockId)];
        } else {
            uint timePassed = block.timestamp - li.lastClaimDate;
            claimAmount = (timePassed * li.amount) / li.period;

            bool success = IERC20(li.token).transfer(msg.sender, claimAmount);
            require(success, "BlasterLaunchpad: transfer failed");

            lockInfos[bytes32(_lockId)].lastClaimDate = block.timestamp;
            lockInfos[bytes32(_lockId)].amountLeft -= claimAmount;
        }

        emit TokenClaimed(
            li.token,
            msg.sender,
            claimAmount,
            timePassedSinceCreation
        );
    }

    function getLockInfo(
        uint256 _lockId
    ) external view returns (LockInfo memory) {
        return lockInfos[bytes32(_lockId)];
    }

    function getClaimAvailiable(
        uint256 _lockId
    ) external view returns (uint256) {
        LockInfo memory li = lockInfos[bytes32(_lockId)];
        uint claimAmount;
        uint timePassedSinceCreation = block.timestamp - li.createdDate;

        if (li.period < timePassedSinceCreation) {
            claimAmount = li.amountLeft;
        } else {
            uint timePassed = block.timestamp - li.lastClaimDate;
            claimAmount = (timePassed * li.amount) / li.period;
        }

        return claimAmount;
    }

    function lockTokens(
        address _token,
        uint _amount,
        uint _lockPeriod,
        uint8 _lpOrNot
    ) external {
        bool success = IERC20(_token).transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        require(success, "BlasterLaunchpad: transfer failed");

        uint lockId = _lockTokens(_token, _amount, _lockPeriod);
        emit TokensLocked(msg.sender, lockId, _token, _amount, _lpOrNot);
    }

    function addLiquidityAndRefundExcess(
        address _coin,
        uint _amountTokenDesired,
        uint _amountTokenMin,
        uint _amountETHMin
    ) internal returns (uint256) {
        ICoin(_coin).disableBurnAndTaxes();

        bool success = IERC20(_coin).transferFrom(
            msg.sender,
            address(this),
            _amountTokenDesired
        );
        require(success, "BlasterLaunchpad: transfer failed");

        success = IERC20(_coin).approve(
            address(blasterRouter),
            _amountTokenDesired
        );
        require(success, "BlasterLaunchpad: approve to router failed");

        (uint amountToken, uint amountETH, uint liquidityTokens) = blasterRouter
            .addLiquidityETH{value: msg.value}(
            _coin,
            _amountTokenDesired,
            _amountTokenMin,
            _amountETHMin,
            address(this),
            block.timestamp
        );

        if (_amountTokenDesired > amountToken) {
            success = IERC20(_coin).transfer(
                msg.sender,
                _amountTokenDesired - amountToken
            );
            require(success, "BlasterLaunchpad: transfer failed");
        }
        ICoin(_coin).enableBurnAndTaxes();

        if (msg.value > amountETH) {
            (success, ) = msg.sender.call{value: msg.value - amountETH}("");
            require(success, "BlasterLaunchpad: transfer failed");
        }

        return liquidityTokens;
    }

    function _lockTokens(
        address _token,
        uint _amount,
        uint _unlockTime
    ) internal returns (uint256) {
        locksNonce[msg.sender] += 1;

        bytes32 lockId = keccak256(
            abi.encodePacked(msg.sender, locksNonce[msg.sender])
        );

        lockInfos[lockId] = LockInfo(
            _token,
            msg.sender,
            _amount,
            _amount,
            _unlockTime,
            block.timestamp,
            block.timestamp
        );

        return uint256(lockId);
    }

    function sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
    }

    receive() external payable {}
}
