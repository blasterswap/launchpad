import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { IBlastwapV2Pair, IBlasterswapV2Router02, Coin, MockToken, factories, Coin__factory, IBlasterswapV2Pair } from "../typechain-types";
import { IBlasterswapV2Factory } from "../typechain-types";
import { deployments } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
// import { takeSnapshot, restoreSnapshot } from './utils/utils';
import { Network } from "ethers";

describe("Coin", function () {
	const supply = 10000000;
	const initialLiquidity = 10000;

	interface Blasterswap {
		factory: IBlasterswapV2Factory;
		router: IBlasterswapV2Router02;
	}

	interface CoinAndBlaster {
		memecoin: Coin;
		mockToken: MockToken;
		owner: SignerWithAddress;
		bob: SignerWithAddress;
		tom: SignerWithAddress;
		blasterswap: Blasterswap;
		pair: IBlasterswapV2Pair;
	}

	interface Options {
		buyTaxBasisPoints: number;
		sellTaxBasisPoints: number;
		burnBasisPoints: number;
		antisnipePeriod?: number;
		limitPerWallet?: number;
		limitPerTx?: number;
	}

	async function getBlasterswap(): Promise<Blasterswap> {
		const blasterswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
		const blasterswapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

		const factory = await ethers.getContractAt("IBlasterswapV2Factory", blasterswapFactory) as unknown as IBlasterswapV2Factory;
		const router = await ethers.getContractAt("IBlasterswapV2Router02", blasterswapRouter) as unknown as IBlasterswapV2Router02;

		return {
			factory: factory,
			router: router,
		}
	}

	async function deployAll(options: Options): Promise<CoinAndBlaster> {
		const [owner, bob, tom] = await ethers.getSigners();

		const Coin = await ethers.getContractFactory("Coin") as unknown as Coin__factory;

		const memecoinInst = await Coin.connect(owner).deploy(
			"BLASTER",
			"BLTR",
			supply,
			options!.buyTaxBasisPoints,
			options!.sellTaxBasisPoints,
			options!.burnBasisPoints,
			options.limitPerWallet || 0,
			options.limitPerTx || 0,
			options.antisnipePeriod || 0,
			await tom.getAddress(),
			await owner.getAddress()
		) as unknown as Coin;

		await memecoinInst.waitForDeployment();

		const Erc20Mock = await ethers.getContractFactory("MockToken");
		const erc20Mock = await Erc20Mock.connect(owner).deploy("Mock", "MCK") as unknown as MockToken;
		await erc20Mock.waitForDeployment();

		await erc20Mock.connect(owner).mint(20000);
		await erc20Mock.connect(bob).mint(20000);

		const blasterswap = await getBlasterswap();
		const mockTokenAddress = await erc20Mock.getAddress();
		const memecoinAddress = await memecoinInst.getAddress();

		await memecoinInst.connect(owner).approve((await blasterswap.router.getAddress()), 20000);
		await erc20Mock.connect(owner).approve((await blasterswap.router.getAddress()), 20000);

		await memecoinInst.connect(bob).approve((await blasterswap.router.getAddress()), 20000);
		await erc20Mock.connect(bob).approve((await blasterswap.router.getAddress()), 20000);

		const latestTime = await time.latest();

		await memecoinInst.connect(owner).disableBurnAndTaxes();
		await blasterswap.router.connect(owner).addLiquidity(
			mockTokenAddress,
			memecoinAddress,
			initialLiquidity,
			initialLiquidity,
			initialLiquidity,
			initialLiquidity,
			await owner.getAddress(),
			10000 + latestTime
		);
		await memecoinInst.connect(owner).enableBurnAndTaxes();

		const pairAddress = await blasterswap.factory.getPair(mockTokenAddress, memecoinAddress);
		const pair = await ethers.getContractAt("IBlasterswapV2Pair", pairAddress) as unknown as IBlasterswapV2Pair;

		await memecoinInst.connect(owner).addSupportedPair(pairAddress, true);
		await memecoinInst.connect(owner).addSupportedPair(await blasterswap.router.getAddress(), true);

		return {
			memecoin: memecoinInst,
			mockToken: erc20Mock,
			owner: owner,
			bob: bob,
			tom: tom,
			blasterswap: {
				factory: blasterswap.factory,
				router: blasterswap.router
			},
			pair: pair,
		};
	}

	describe("Deployment", function () {
		it("Should check all parameters", async function () {
			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: 0,
					sellTaxBasisPoints: 0,
					burnBasisPoints: 0,
				}
			);

			expect(await coinAndBlasterswap.memecoin.name()).to.equal("BLASTER");
			expect(await coinAndBlasterswap.memecoin.symbol()).to.equal("BLTR");
			expect(await coinAndBlasterswap.memecoin.buyTaxBasisPoints()).to.equal(0);
			expect(await coinAndBlasterswap.memecoin.sellTaxBasisPoints()).to.equal(0);
			expect(await coinAndBlasterswap.memecoin.burnBasisPoints()).to.equal(0);
			expect(await coinAndBlasterswap.memecoin.feeReceiver()).to.equal(await coinAndBlasterswap.tom.getAddress());
			expect((await coinAndBlasterswap.memecoin.totalSupply()).toString()).to.equal(supply.toString());
			expect((await coinAndBlasterswap.memecoin.balanceOf(coinAndBlasterswap.owner.address)).toString()).to.equal((supply - initialLiquidity).toString());
		});

		it("Should transfer tokens without fees", async function () {
			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: 0,
					sellTaxBasisPoints: 0,
					burnBasisPoints: 0,
				}
			);

			const transferAmount = 1000;

			await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.owner).transfer(coinAndBlasterswap.bob.address, transferAmount);
			expect((await coinAndBlasterswap.memecoin.balanceOf(coinAndBlasterswap.bob.address)).toString()).to.equal(transferAmount.toString());
			expect((await coinAndBlasterswap.memecoin.balanceOf(coinAndBlasterswap.owner.address)).toString()).to.equal((supply - transferAmount - initialLiquidity).toString());
		});

		it("Should check burn logic", async function () {
			const burnBasisPoints = 1000;

			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: 0,
					sellTaxBasisPoints: 0,
					burnBasisPoints: burnBasisPoints,
				}
			)

			const transferAmount = 1000;
			expect(await coinAndBlasterswap.memecoin.burnBasisPoints()).to.equal(1000);

			await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.owner).transfer(coinAndBlasterswap.bob.address, transferAmount);

			expect((await coinAndBlasterswap.memecoin.balanceOf(coinAndBlasterswap.bob.address)).toString()).to.equal((transferAmount - 100).toString());
			expect((await coinAndBlasterswap.memecoin.balanceOf(coinAndBlasterswap.owner.address)).toString()).to.equal((supply - initialLiquidity - transferAmount).toString());
			expect((await coinAndBlasterswap.memecoin.totalSupply()).toString()).to.equal(("9999900").toString());
		});

		it("Should check buy tax logic", async function () {
			const buyTaxBasisPoints = 1000;
			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: buyTaxBasisPoints,
					sellTaxBasisPoints: 0,
					burnBasisPoints: 0,
				}
			);

			expect(await coinAndBlasterswap.memecoin.buyTaxBasisPoints()).to.equal(BigInt(1000));

			let bobsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));
			let tomsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.tom).balanceOf((await coinAndBlasterswap.tom.getAddress()));
			let bobsBalanceOfMock = await coinAndBlasterswap.mockToken.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));

			let reserves = await coinAndBlasterswap.pair.getReserves();

			let memecoinReserves = reserves[0].toString();
			let mockTokenReserves = reserves[1].toString();

			const currentTime = await time.latest();

			const path = [];
			path.push(await coinAndBlasterswap.mockToken.getAddress());
			path.push(await coinAndBlasterswap.memecoin.getAddress());

			const amountOut = await coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).getAmountOut(3000, 10000, 10000);
			const amountOutWithTaxesSubstracted = amountOut - (amountOut * BigInt(buyTaxBasisPoints) / BigInt(10000));

			await coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).swapExactTokensForTokens(
				3000,
				amountOutWithTaxesSubstracted,
				path,
				await coinAndBlasterswap.bob.getAddress(),
				currentTime + 10000000
			);

			bobsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));
			tomsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.tom).balanceOf((await coinAndBlasterswap.tom.getAddress()));
			bobsBalanceOfMock = await coinAndBlasterswap.mockToken.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));

			reserves = await coinAndBlasterswap.pair.getReserves();
			memecoinReserves = reserves[0].toString();
			mockTokenReserves = reserves[1].toString();

			expect(bobsBalanceMemecoin.toString()).to.equal("2072");
			expect(tomsBalanceMemecoin.toString()).to.equal("230");
			expect(bobsBalanceOfMock.toString()).to.equal("17000");
		});

		it("Should check sell tax logic", async function () {
			const sellTaxBasisPoints = 1000;
			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: 0,
					sellTaxBasisPoints: sellTaxBasisPoints,
					burnBasisPoints: 0,
				}
			);
			expect(await coinAndBlasterswap.memecoin.sellTaxBasisPoints()).to.equal(1000);

			await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.owner).transfer((await coinAndBlasterswap.bob.getAddress()), 10000);

			let bobsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));
			let tomsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.tom).balanceOf((await coinAndBlasterswap.tom.getAddress()));
			let bobsBalanceOfMock = await coinAndBlasterswap.mockToken.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));

			let reserves = await coinAndBlasterswap.pair.getReserves();

			let token0 = await coinAndBlasterswap.pair.token0();


			let memecoinReserves = reserves[0].toString();
			let mockTokenReserves = reserves[1].toString();


			const currentTime = await time.latest();

			await coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).swapExactTokensForTokensSupportingFeeOnTransferTokens(
				3000,
				1000,
				[await coinAndBlasterswap.memecoin.getAddress(), await coinAndBlasterswap.mockToken.getAddress()],
				await coinAndBlasterswap.bob.getAddress(),
				currentTime + 10000000
			);

			bobsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));
			tomsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.tom).balanceOf((await coinAndBlasterswap.tom.getAddress()));
			bobsBalanceOfMock = await coinAndBlasterswap.mockToken.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));

			const reservesAfterSwap = await coinAndBlasterswap.pair.getReserves();

			if (token0 == await coinAndBlasterswap.mockToken.getAddress()) {
				mockTokenReserves = reservesAfterSwap[0].toString();
				memecoinReserves = reservesAfterSwap[1].toString();
			} else {
				memecoinReserves = reservesAfterSwap[0].toString();
				mockTokenReserves = reservesAfterSwap[1].toString();
			}

			expect(bobsBalanceMemecoin.toString()).to.equal("7000");
			expect(tomsBalanceMemecoin.toString()).to.equal("300");
			expect(bobsBalanceOfMock.toString()).to.equal("22120");
		});

		it("Should check sell tax and burn logic", async function () {
			const sellTaxBasisPoints = 1000;
			const burnBasisPoints = 1000;
			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: 0,
					sellTaxBasisPoints: sellTaxBasisPoints,
					burnBasisPoints: burnBasisPoints,
				}
			);
			expect(await coinAndBlasterswap.memecoin.sellTaxBasisPoints()).to.equal(1000);

			await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.owner).transfer((await coinAndBlasterswap.bob.getAddress()), 10000);

			let bobsBalanceMemecoinBeforeSwap = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));
			let tomsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.tom).balanceOf((await coinAndBlasterswap.tom.getAddress()));
			let bobsBalanceOfMockBeforeSwap = await coinAndBlasterswap.mockToken.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));

			let reserves = await coinAndBlasterswap.pair.getReserves();

			let token0 = await coinAndBlasterswap.pair.token0();

			let memecoinReservesBeforeSwap;
			let mockTokenReservesBeforeSwap;

			const reservesBeforeSwap = await coinAndBlasterswap.pair.getReserves();

			if (token0 == await coinAndBlasterswap.mockToken.getAddress()) {
				mockTokenReservesBeforeSwap = reservesBeforeSwap[0];
				memecoinReservesBeforeSwap = reservesBeforeSwap[1];
			} else {
				memecoinReservesBeforeSwap = reservesBeforeSwap[0];
				mockTokenReservesBeforeSwap = reservesBeforeSwap[1];
			}

			const currentTime = await time.latest();

			const path = [];
			path.push(await coinAndBlasterswap.memecoin.getAddress());
			path.push(await coinAndBlasterswap.mockToken.getAddress());

			const swapSize = BigInt(3000);
			const amountWhichThePairWillReceive = swapSize - (swapSize * BigInt(sellTaxBasisPoints) / BigInt(10000)) - (swapSize * BigInt(burnBasisPoints) / BigInt(10000));

			const amountOut = await coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).getAmountOut(amountWhichThePairWillReceive, 10000, 10000);
			await coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).swapExactTokensForTokensSupportingFeeOnTransferTokens(
				swapSize,
				amountOut,
				path,
				await coinAndBlasterswap.bob.getAddress(),
				currentTime + 10000000
			);

			let bobsBalanceMemecoinAfterSwap = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));
			tomsBalanceMemecoin = await coinAndBlasterswap.memecoin.connect(coinAndBlasterswap.tom).balanceOf((await coinAndBlasterswap.tom.getAddress()));
			let bobsBalanceOfMock = await coinAndBlasterswap.mockToken.connect(coinAndBlasterswap.bob).balanceOf((await coinAndBlasterswap.bob.getAddress()));

			const reservesAfterSwap = await coinAndBlasterswap.pair.getReserves();

			let mockTokenReserves;
			let memecoinReserves;

			if (token0 == await coinAndBlasterswap.mockToken.getAddress()) {
				mockTokenReserves = reservesAfterSwap[0];
				memecoinReserves = reservesAfterSwap[1];
			} else {
				memecoinReserves = reservesAfterSwap[0];
				mockTokenReserves = reservesAfterSwap[1];
			}

			expect(bobsBalanceMemecoinAfterSwap.toString()).to.equal((bobsBalanceMemecoinBeforeSwap - swapSize).toString());
			expect(tomsBalanceMemecoin.toString()).to.equal((swapSize * BigInt(sellTaxBasisPoints) / BigInt(10000)).toString());
			expect(bobsBalanceOfMock.toString()).to.equal((bobsBalanceOfMockBeforeSwap + amountOut).toString());
			expect(memecoinReserves.toString()).to.equal((memecoinReservesBeforeSwap + amountWhichThePairWillReceive).toString());
			expect(mockTokenReserves.toString()).to.equal((mockTokenReservesBeforeSwap - amountOut).toString());
		});

		it("Should check buy antisnipe", async function () {
			const coinAndBlasterswap = await deployAll(
				{
					buyTaxBasisPoints: 0,
					sellTaxBasisPoints: 0,
					burnBasisPoints: 0,
					limitPerTx: 100,
					limitPerWallet: 100,
					antisnipePeriod: 100,
				}
			);
			const currentTime = await time.latest();

			const path = [];
			path.push(await coinAndBlasterswap.mockToken.getAddress());
			path.push(await coinAndBlasterswap.memecoin.getAddress());

			const amountOut = await coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).getAmountOut(3000, 10000, 10000);

			await expect(coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).swapExactTokensForTokens(
				3000,
				amountOut,
				path,
				await coinAndBlasterswap.bob.getAddress(),
				currentTime + 10000000
			)).to.be.revertedWith("UniswapV2: TRANSFER_FAILED");

			await time.increase(100);
			await expect(coinAndBlasterswap.blasterswap.router.connect(coinAndBlasterswap.bob).swapExactTokensForTokens(
				3000,
				amountOut,
				path,
				await coinAndBlasterswap.bob.getAddress(),
				currentTime + 10000000
			)).to.not.be.reverted;
		});
	});
});
