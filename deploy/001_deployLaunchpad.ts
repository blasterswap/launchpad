import { deployments, getNamedAccounts } from 'hardhat'

const ROUTER = '0xbb1c6a12131aca9737Ae0169aabbE17677F01A83';
const WETH = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';

module.exports = async ({ }) => {
	const { deploy } = deployments;
	const { deployer } = await getNamedAccounts();

	await deploy("BlasterLaunchpad", {
		from: deployer,
		args: [ROUTER, WETH],
		log: true,
	});
};

module.exports.tags = ['Launchpad'];
