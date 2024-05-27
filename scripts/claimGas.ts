import { ethers, } from "hardhat";
import { GasRefund } from "../typechain-types";

const gasRefundAddress = "0xba99b8a284f45447929a143dc2efa5bcfe7ade60";
const chainId = 81457;
const amount = 1;

async function claimAllGas() {
	const [deployer, gasSigner] = await ethers.getSigners();

	console.log(`Trying to claim with ${gasSigner.address}`);

	const gasRefund = await ethers.getContractAt("GasRefund", gasRefundAddress) as unknown as GasRefund;
	const currentNonce = await gasRefund.nonces(gasSigner.address);

	const encodedPayloadHash = ethers.solidityPackedKeccak256(
		["address", "uint256", "address", "uint", "uint"],
		[(await gasRefund.getAddress()), chainId, gasSigner.address, amount, currentNonce]
	);

	const signature = await gasSigner.signMessage(ethers.getBytes(encodedPayloadHash));


	console.log(ethers.getBytes(encodedPayloadHash));

	await gasRefund.connect(gasSigner).withdrawGas(
		amount, signature
	);

	console.log("Claimed!");
}

claimAllGas();
