// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBlasterLaunchpad {
    function createCoin(
        CreateCoinArguments memory _createCoinArguments
    ) external payable;

    function removeLiquidityETH(
        address _coin,
        address _token,
        uint _liquidity,
        uint _amountTokenMin,
        uint _amountETHMin,
        address _to
    ) external payable;

    function addLiquidityETH(
        address _coin,
        uint _amountTokenDesired,
        uint _amountTokenMin,
        uint _amountETHMin
    ) external payable;

    function addLiquidityETHWithLock(
        address _coin,
        uint _amountTokenDesired,
        uint _amountTokenMin,
        uint _amountETHMin,
        uint _lockPeriod
    ) external payable;

    function claimToken(uint _lockId) external;

    function getLockInfo(
        uint256 _lockId
    ) external view returns (LockInfo memory);

    function getClaimAvailiable(
        uint256 _lockId
    ) external view returns (uint256);

    function lockTokens(
        address _token,
        uint _amount,
        uint _lockPeriod,
        uint8 _lpOrNot
    ) external;

    struct LockInfo {
        address token;
        address owner;
        uint amount;
        uint amountLeft;
        uint period;
        uint lastClaimDate;
        uint createdDate;
    }

    struct CreateCoinArguments {
        string name;
        string symbol;
        uint coinId;
        uint supply;
        uint buyTaxBasisPoints;
        uint sellTaxBasisPoints;
        uint burnBasisPoints;
        address feeReceiver;
        uint lpAmount;
        uint lpAmountETH;
        uint lockPeriod;
        uint vestingPeriod;
        uint maxTokensPerWallet;
        uint limitPerTransaction;
        uint antisnipePeriod;
    }

    /// @param lp 1 - if lp, 0 - if not
    event TokensLocked(
        address indexed locker,
        uint256 lockId,
        address token,
        uint256 amount,
        uint8 lp
    );

    event CoinCreated(
        address coin,
        address indexed deployer,
        uint coinId,
        uint lockPeriod,
        uint vestingPeriod,
        uint lpLockSizeTokens,
        uint lpLockSizeETH
    );

    event TokenClaimed(
        address indexed token,
        address claimer,
        uint amount,
        uint timePassed
    );
}
