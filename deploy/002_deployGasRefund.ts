import { deployments, getNamedAccounts } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

module.exports = async (hre: HardhatRuntimeEnvironment) => {
	const { deploy } = deployments;
	const { deployer, gasSigner } = await getNamedAccounts();


	console.log(`Deploying GasRefund with the account: ${deployer}`);
	console.log(`Gas Signer: ${gasSigner}`);

	await deploy("GasRefund", {
		from: deployer,
		args: [gasSigner],
		log: true,
	});
};

module.exports.tags = ['GasRefund'];
