// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IBlasterswapV2Pair} from "./interfaces/IBlasterswapV2Pair.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGasRefund} from "./interfaces/IGasRefund.sol";
import {IBlast} from "./interfaces/IBlast.sol";

contract GasRefund is IGasRefund, Ownable {
    using SafeERC20 for IERC20;

    address public signer;
    address public signerCandidate;
    address public ownerCandidate;

    IBlast public immutable blast;

    mapping(address => uint256) public nonces;

    constructor(address _signer, address _blast) Ownable(msg.sender) {
        signer = _signer;
        blast = IBlast(_blast);
    }

    function changeSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "GasRefund: signer is zero address");
        signerCandidate = _signer;

        emit SignerCandidateChanged(_signer);
    }

    function confirmSigner() external onlyOwner {
        require(
            signerCandidate != address(0),
            "GasRefund: signerCandidate is zero address"
        );
        signer = signerCandidate;

        emit SignerCandidateConfirmed(signerCandidate);
    }

    function transferOwnership(address _newOwner) public override onlyOwner {
        require(_newOwner != address(0), "GasRefund: newOwner is zero address");
        ownerCandidate = _newOwner;

        emit OwnerCandidateChanged(_newOwner);
    }

    function confirmTransferOwnership() external onlyOwner {
        require(
            ownerCandidate != address(0),
            "GasRefund: ownerCandidate is zero address"
        );
        super._transferOwnership(ownerCandidate);

        emit OwnerCandidateConfirmed(owner());
    }

    function configureGovernorOnBehalf(
        address[] calldata _pairs,
        address _newGovernor
    ) external onlyOwner {
        require(
            _newGovernor != address(0),
            "GasRefund: newGovernor is zero address"
        );
        uint i = 0;
        for (; i < _pairs.length; ) {
            blast.configureGovernorOnBehalf(_newGovernor, _pairs[i]);
            unchecked {
                ++i;
            }
        }
    }

    function claimAllPoolsGas(
        address[] calldata _pairs
    ) external payable onlyOwner {
        for (uint i = 0; i < _pairs.length; i++) {
            IBlasterswapV2Pair(_pairs[i]).claimPoolMaxGas();
        }
    }

    function claimAllGas(
        address[] calldata _contractAddresses
    ) external payable onlyOwner {
        for (uint i = 0; i < _contractAddresses.length; i++) {
            blast.claimAllGas(_contractAddresses[i], address(this));
        }
    }

    function claimGasAtMinClaimRate(
        address[] calldata _contractAddresses,
        uint256[] calldata _minClaimRateBips
    ) external payable onlyOwner {
        require(
            _contractAddresses.length == _minClaimRateBips.length,
            "GasRefund: should have the same length"
        );
        for (uint i = 0; i < _contractAddresses.length; i++) {
            blast.claimGasAtMinClaimRate(
                _contractAddresses[i],
                address(this),
                _minClaimRateBips[i]
            );
        }
    }

    function claimMaxGas(
        address[] calldata _contractAddresses
    ) external payable onlyOwner {
        for (uint i = 0; i < _contractAddresses.length; i++) {
            blast.claimMaxGas(_contractAddresses[i], address(this));
        }
    }

    function claimGas(
        address[] calldata _contractAddresses,
        uint256[] calldata _gasToClaim,
        uint256[] calldata _gasSecondsToConsume
    ) external payable onlyOwner {
        require(
            _contractAddresses.length == _gasToClaim.length,
            "GasRefund: should have the same length"
        );
        require(
            _contractAddresses.length == _gasSecondsToConsume.length,
            "GasRefund: should have the same length"
        );

        for (uint i = 0; i < _contractAddresses.length; i++) {
            blast.claimGas(
                _contractAddresses[i],
                address(this),
                _gasToClaim[i],
                _gasSecondsToConsume[i]
            );
        }
    }

    function readGasParams(
        address contractAddress
    )
        external
        view
        returns (
            uint256 etherSeconds,
            uint256 etherBalance,
            uint256 lastUpdated,
            IBlast.GasMode
        )
    {
        return blast.readGasParams(contractAddress);
    }

    function withdrawGas(uint256 _amount, bytes memory _sig) external payable {
        require(
            _verify(
                keccak256(
                    abi.encodePacked(
                        address(this),
                        block.chainid,
                        msg.sender,
                        _amount,
                        nonces[msg.sender]
                    )
                ),
                _sig
            ),
            "GasRefund: invalid signature"
        );

        nonces[msg.sender]++;
        (bool success, ) = address(msg.sender).call{value: _amount}("");
        require(success, "GasRefund: transfer failed");

        emit Withdrawn(msg.sender, _amount);
    }

    function _verify(
        bytes32 _data,
        bytes memory _signature
    ) internal view returns (bool) {
        return
            ECDSA.recover(
                MessageHashUtils.toEthSignedMessageHash(_data),
                _signature
            ) == signer;
    }

    receive() external payable {}
}
