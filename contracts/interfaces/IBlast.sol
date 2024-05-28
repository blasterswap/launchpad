// SPDX-License-Identifier: MIT
pragma solidity >=0.5.16;

interface IBlast {
    enum GasMode {
        VOID,
        CLAIMABLE
    }

    function configureGovernor(address governor) external;

    function claimAllGas(
        address contractAddress,
        address recipientOfGas
    ) external returns (uint256);

    function claimGasAtMinClaimRate(
        address contractAddress,
        address recipientOfGas,
        uint256 minClaimRateBips
    ) external returns (uint256);

    function claimMaxGas(
        address contractAddress,
        address recipientOfGas
    ) external returns (uint256);

    function claimGas(
        address contractAddress,
        address recipientOfGas,
        uint256 gasToClaim,
        uint256 gasSecondsToConsume
    ) external returns (uint256);

    function readGasParams(
        address contractAddress
    )
        external
        view
        returns (
            uint256 etherSeconds,
            uint256 etherBalance,
            uint256 lastUpdated,
            GasMode
        );

    function claimAllYield(
        address contractAddress,
        address recipientOfYield
    ) external returns (uint256);

    function configureGovernorOnBehalf(
        address _newGovernor,
        address contractAddress
    ) external;

    function governorMap(address _contract) external view returns (address);
}
