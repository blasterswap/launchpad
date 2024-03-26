// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGasRefund {
    struct Withdrawal {
        address recipient;
        uint256 amount;
        uint256 nonce;
    }

    event Withdrawn(address indexed recipient, uint256 amount);

    event YeildClaimed (
        address[] pair
    );

    event SignerCandidateChanged(address candidate);

    event SignerCandidateConfirmed(address newSigner);

    event OwnerCandidateChanged(address candidate);

    event OwnerCandidateConfirmed(address newOwner);

    function withdrawGas(
        Withdrawal calldata _withdrawal,
        bytes memory _sig
    ) external payable;

    function claimAllGas(address[] calldata _contractAddresses) external payable;

    function claimGasAtMinClaimRate(
        address[] calldata _contractAddresses,
        uint256[] calldata _minClaimRateBips
    ) external payable;

    function claimMaxGas(address[] calldata _contractAddresses) external payable;

    function claimGas(
        address[] calldata _contractAddresses,
        uint256[] calldata _gasToClaim,
        uint256[] calldata _gasSecondsToConsume
    ) external payable;

    function changeSigner(address _signer) external;

    function confirmSigner() external;

    function confirmTransferOwnership() external;

    function configureGovernorOnBehalf(address[] calldata _pair, address _newGovernor) external;

    function claimAllPoolsGas(address[] calldata _pairs) external payable;
}
