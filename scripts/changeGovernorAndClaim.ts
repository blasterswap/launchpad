import { ethers, } from "hardhat";
import { GasRefund } from "../typechain-types";

const gasRefundAddress = "0xba99b8a284f45447929a143dc2efa5bcfe7ade60";
const v2FactoryAddress = "0x9CC1599D4378Ea41d444642D18AA9Be44f709ffD";
const blastGasAddress = "0x4300000000000000000000000000000000000002";
const chainId = 81457;
const amount = 1;

async function changeGovernorAndClaim() {
	const [deployer, gasSigner, v2Governor] = await ethers.getSigners();

	// chainge governor to gasRefund contract
	const factory = await ethers.getContractAt("IBlasterswapV2Factory", v2FactoryAddress);
	const blast = await ethers.getContractAt("IBlast", blastGasAddress);
	const allPairLength = await factory.allPairsLength();

	let totalGasSpent = 0n;
	for (let i = 0; i < allPairLength; i++) {
		const pairAddress = await factory.allPairs(i);
		let tx = await blast.connect(v2Governor).configureGovernorOnBehalf(
			gasRefundAddress,
			pairAddress
		);

		let receipt = await tx.wait();
		totalGasSpent += (receipt!.gasUsed * tx.gasPrice);

		console.log(`governor for pair ${pairAddress
			} changed to ${gasRefundAddress} `);
	}

	console.log(`total gas spent: ${totalGasSpent.toString()}`);
}

changeGovernorAndClaim();
