import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { GasRefund } from "../typechain-types";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"

import "hardhat"

describe("GasRefund", function () {
	let deployer: SignerWithAddress;
	let withdrawer: SignerWithAddress;
	let gasRefund: GasRefund;

	const BlastAddress = "0x4300000000000000000000000000000000000002";

	async function deployGasRefund() {
		[deployer, withdrawer] = await ethers.getSigners();

		const GasRefund = await ethers.getContractFactory("GasRefund");
		gasRefund = await GasRefund.connect(deployer).deploy(deployer.address, BlastAddress) as unknown as GasRefund;
	}

	describe("Deployment", function () {
		beforeEach(async function () {
			await loadFixture(deployGasRefund);
		});

		it("Should set the deployer as the owner", async function () {
			expect(await gasRefund.owner()).to.equal(deployer.address);
			expect(await gasRefund.blast()).to.equal(BlastAddress);
		});

		it("Should withdraw gas and revert with invalid signature on the second withdrawal", async function () {
			const amount = ethers.parseEther("1");

			await deployer.sendTransaction({
				to: await gasRefund.getAddress(),
				value: amount
			});

			const network = await ethers.provider.getNetwork();
			const encodedPayload = ethers.solidityPackedKeccak256(
				["address", "uint256", "address", "uint", "uint"],
				[(await gasRefund.getAddress()), network.chainId, withdrawer.address, amount, 0]

			);

			const signature = await deployer.signMessage(ethers.getBytes(encodedPayload));

			const balanceBefore = await ethers.provider.getBalance(withdrawer.address);
			let tx = await gasRefund.connect(withdrawer).withdrawGas(amount, signature);
			let rec = await tx.wait();

			let gasSpent = rec!.gasPrice * rec!.gasUsed;
			const balanceAfter = await ethers.provider.getBalance(withdrawer.address) + gasSpent;

			expect(balanceAfter).to.equal(balanceBefore + amount);

			await expect(gasRefund.connect(withdrawer).withdrawGas(amount, signature))
				.to.be.revertedWith("GasRefund: invalid signature");
		});

	});
});
