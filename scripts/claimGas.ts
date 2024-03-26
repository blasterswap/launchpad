import { ethers } from "hardhat";
import { GasRefund } from "../typechain-types";

async function claimAllGas() {
	const [owner] = await ethers.getSigners();
	const gasRefundAddress = "0x88C8E1E32D2b4f42162929fF1103a260E919F283";
	const blasterswapV2FactoryAddress = "0x4a81878E3672F9528a826aA7d23c2a9e8b009Cf3"
	const blasterswapV2Router02Address = "0xd2eFc8534a7806f98a1a184E9D4b0879Cc65442f"

	const gasRefund = await ethers.getContractAt("GasRefund", gasRefundAddress) as unknown as GasRefund;

	await gasRefund.connect(owner).claimAllGas([blasterswapV2FactoryAddress]);
	await gasRefund.connect(owner).claimAllGas([blasterswapV2Router02Address]);
}


claimAllGas();
