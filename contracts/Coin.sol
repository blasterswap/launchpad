// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IBlasterswapV2Router02} from "./interfaces/IBlasterswapV2Router02.sol";

contract Coin is ERC20 {
    mapping(address => bool) public supportedPairs;

    address public feeReceiver;
    address public launchpad;

    uint64 public buyTaxBasisPoints;
    uint64 public sellTaxBasisPoints;
    uint64 public burnBasisPoints;

    uint64 private burnBasisPointsTmp;
    uint64 private sellTaxBasisPointsTmp;
    uint64 private buyTaxBasisPointsTmp;
    uint64 immutable basisPoints = 10000;

    uint256 private antisnipePeriodFinish;

    // max amount of tokens a wallet can hold
    uint256 private maxTokensPerWallet;

    // per transaction max
    uint256 private limitPerTransaction;

    bool private mint;

    modifier onlyLaunchpad() {
        require(msg.sender == launchpad, "ERC20: caller is not the launchpad");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint _supply,
        uint _buyTaxBasisPoints,
        uint _sellTaxBasisPoints,
        uint _burnBasisPoints,
        uint _maxTokensPerWallet,
        uint _limitPerTransaction,
        uint _antisnipePeriod,
        address _feeReceiver,
        address _launchpad
    ) ERC20(_name, _symbol) {
        if (_buyTaxBasisPoints != 0 || _sellTaxBasisPoints != 0) {
            require(
                _feeReceiver != address(0),
                "ERC20: receiver is the zero address"
            );
        }

        buyTaxBasisPoints = uint64(_buyTaxBasisPoints);
        sellTaxBasisPoints = uint64(_sellTaxBasisPoints);
        burnBasisPoints = uint64(_burnBasisPoints);
        launchpad = _launchpad;
        feeReceiver = _feeReceiver;

        maxTokensPerWallet = _maxTokensPerWallet;
        limitPerTransaction = _limitPerTransaction;
        antisnipePeriodFinish = block.timestamp + _antisnipePeriod;

        mint = true;
        _mint(msg.sender, _supply);
    }

    function _update(
        address _from,
        address _to,
        uint _amount
    ) internal override {
        if (_from == _to) {
            return;
        }

        if (mint) {
            mint = false;
            super._update(_from, _to, _amount);
            return;
        }

        uint256 amountMinusFee = _amount;

        // on sell
        if (supportedPairs[_to] && sellTaxBasisPoints > 0) {
            uint fees = _calculateAbsoluteAmountFromBasePoints(
                _amount,
                sellTaxBasisPoints
            );
            amountMinusFee = _amount - fees;

            super._update(_from, feeReceiver, fees);
        }

        if (supportedPairs[_from] && antisnipePeriodFinish > block.timestamp) {
            require(
                _amount <= limitPerTransaction,
                "Coin: transfer amount exceeds limit"
            );
            require(
                balanceOf(_to) <= maxTokensPerWallet,
                "Coin: max limit per wallet reached"
            );
        }

        // on buy
        if (supportedPairs[_from] && buyTaxBasisPoints > 0) {
            uint fees = _calculateAbsoluteAmountFromBasePoints(
                _amount,
                buyTaxBasisPoints
            );
            amountMinusFee = _amount - fees;

            super._update(_from, feeReceiver, fees);
        }

        uint burnAmount;
        if (burnBasisPoints > 0) {
            burnAmount = _calculateAbsoluteAmountFromBasePoints(
                _amount,
                burnBasisPoints
            );

            super._update(_from, address(0), burnAmount);
        }

        super._update(_from, _to, amountMinusFee - burnAmount);
    }

    /// @notice used by launchpad contract to add supported pairs for taxes
    /// @param _pair pool address
    /// @param _val false if pair is not supported, true if pair is supported
    function addSupportedPair(address _pair, bool _val) external onlyLaunchpad {
        supportedPairs[_pair] = _val;
    }

    /// @notice Used by the launchpad contract to add liquidity without burning and taxes
    function disableBurnAndTaxes() external onlyLaunchpad {
        buyTaxBasisPointsTmp = buyTaxBasisPoints;
        sellTaxBasisPointsTmp = sellTaxBasisPoints;
        burnBasisPointsTmp = burnBasisPoints;

        buyTaxBasisPoints = 0;
        sellTaxBasisPoints = 0;
        burnBasisPoints = 0;
    }

    /// @notice Used by the launchpad contract to add liquidity without burning and taxes
    function enableBurnAndTaxes() external onlyLaunchpad {
        buyTaxBasisPoints = buyTaxBasisPointsTmp;
        sellTaxBasisPoints = sellTaxBasisPointsTmp;
        burnBasisPoints = burnBasisPointsTmp;

        buyTaxBasisPointsTmp = 0;
        sellTaxBasisPointsTmp = 0;
        burnBasisPointsTmp = 0;
    }

    /// @notice Calculates the absolute amount of a percentage from a base points value
    /// @param _amount Amount to calculate the percentage from
    /// @param _points Base points value to calculate the percentage from
    function _calculateAbsoluteAmountFromBasePoints(
        uint _amount,
        uint _points
    ) internal pure returns (uint) {
        return (_amount * _points) / basisPoints;
    }
}
