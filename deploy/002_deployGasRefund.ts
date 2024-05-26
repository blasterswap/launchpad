import { deployments, getNamedAccounts } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

module.exports = async (hre: HardhatRuntimeEnvironment) => {
	const { deploy } = deployments;
	const { deployer, gasSigner } = await getNamedAccounts();
	const blastGasAddress = "0x4300000000000000000000000000000000000002";


	console.log(`Deploying GasRefund with the account: ${deployer}`);
	console.log(`Gas Signer: ${gasSigner}`);

	await deploy("GasRefund", {
		from: deployer,
		args: [gasSigner, blastGasAddress],
		log: true,
	});
};

module.exports.tags = ['GasRefund'];
