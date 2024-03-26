// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    // Function to deposit Ether and mint WETH
    function deposit() public payable {
        // Mint WETH to sender, equivalent to the amount of Ether sent
        _mint(msg.sender, msg.value);
    }

    // Function to withdraw Ether and burn WETH
    function withdraw(uint amount) external {
        // Burn WETH from sender
        _burn(msg.sender, amount);

        // Send Ether back to sender
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Failed to send Ether");
    }

    // Fallback function to receive Ether when sent directly to contract
    receive() external payable {
        deposit();
    }
}
