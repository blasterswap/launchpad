// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBlasterStaking {
    struct StakingInfo {
        uint128 initEpoch;
        uint128 totalStaked;
        mapping(uint => bool) tokensStaked;
        mapping(address => uint) tokenClaimedEpoch;
    }

    struct TokenLockInfo {
        uint128 lockEpochsCount;
        uint128 creationEpoch;
    }

    error TokenAlreadyClaimed();
    error TokenWasCreatedAfterStakerJoined();
}
