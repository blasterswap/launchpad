import { ethers, } from "hardhat";
import { GasRefund } from "../typechain-types";

const gasRefundAddress = "0xba99b8a284f45447929a143dc2efa5bcfe7ade60";
const v2FactoryAddress = "0x9CC1599D4378Ea41d444642D18AA9Be44f709ffD";
const blastGasAddress = "0x4300000000000000000000000000000000000002";
const chainId = 81457;
const amount = 1;

async function changeGovernorAndClaim() {
	const [gasRefundOwner, _, v2Governor] = await ethers.getSigners();

	// chainge governor to gasRefund contract
	const factory = await ethers.getContractAt("IBlasterswapV2Factory", v2FactoryAddress);
	const blast = await ethers.getContractAt("IBlast", blastGasAddress);
	const gasRefund = await ethers.getContractAt("GasRefund", gasRefundAddress) as unknown as GasRefund;
	const allPairLength = await factory.allPairsLength();

	let totalGasSpent = 0n;

	let tenPairAddresses: string[] = [];
	let pairAddressesByTen: string[][] = [];
	let tenCounter = 0;

	for (let i = 0; i < allPairLength; i++) {
		const pairAddress = await factory.allPairs(i);
		let tx = await blast.connect(v2Governor).configureGovernorOnBehalf(
			gasRefundAddress,
			pairAddress
		);

		let receipt = await tx.wait();
		totalGasSpent += (receipt!.gasUsed * tx.gasPrice);
		console.log(`governor for pair ${pairAddress} changed to ${gasRefundAddress} `);

		if (tenCounter === 10) {
			pairAddressesByTen.push(tenPairAddresses);
			tenPairAddresses = [];
			tenCounter = 0;
		}
		tenPairAddresses.push(pairAddress);
		tenCounter++;
	}

	for (let i = 0; i < pairAddressesByTen.length; i++) {
		let tx = await gasRefund.connect(gasRefundOwner).claimMaxGas(pairAddressesByTen[i]);
		await tx.wait();
		console.log(`Claimed gas for ${pairAddressesByTen[i]} pairs`);
	}

	console.log(`total gas spent: ${totalGasSpent.toString()}`);
}

changeGovernorAndClaim();
