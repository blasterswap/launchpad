import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { IBlasterswapV2Router02, Coin, IBlasterswapV2Factory } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { BlasterLaunchpad } from "../typechain-types";
import { WETH } from "../typechain-types";

describe("Launchpad", function () {
  const supply = 10000000;
  const initialLiquidity = 10000;

  interface Blasterswap {
    factory: IBlasterswapV2Factory;
    router: IBlasterswapV2Router02;
  }
  interface LaunchpadAndUni {
    launchpad: BlasterLaunchpad;
    owner: SignerWithAddress;
    bob: SignerWithAddress;
    tom: SignerWithAddress;
    blaster: Blasterswap;
    WETH: WETH;
  }

  async function getBlasterswap(): Promise<Blasterswap> {
    const uniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const uniswapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

    const uniFactory = await ethers.getContractAt("IBlasterswapV2Factory", uniswapFactory) as unknown as IBlasterswapV2Factory;
    const uniRouter = await ethers.getContractAt("IBlasterswapV2Router02", uniswapRouter) as unknown as IBlasterswapV2Router02;

    return {
      factory: uniFactory,
      router: uniRouter,
    }
  }

  async function deployAll(): Promise<LaunchpadAndUni> {
    const [owner, bob, tom] = await ethers.getSigners();

    const WETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

    const uniswap = await getBlasterswap();
    const weth = await ethers.getContractAt("WETH", WETHAddress) as unknown as WETH;

    const Launchpad = await ethers.getContractFactory("BlasterLaunchpad");
    const launchpad = await Launchpad.deploy(await uniswap.router.getAddress(), WETHAddress) as unknown as BlasterLaunchpad;

    return {
      owner: owner,
      bob: bob,
      launchpad: launchpad,
      tom: tom,
      blaster: {
        factory: uniswap.factory,
        router: uniswap.router,
      },
      WETH: weth,
    };
  }

  describe("Deployment", function () {
    it("Should check all parameters", async function () {
      const launchpadAndUni = await deployAll();

      expect((await launchpadAndUni.launchpad.WETH()).toLowerCase()).to.equal((await launchpadAndUni.WETH.getAddress()).toLowerCase());
      expect(await launchpadAndUni.launchpad.blasterRouter()).to.equal(await launchpadAndUni.blaster.router.getAddress());
    });

    it("Should create coin with liquidity provision and with timelock, then check unlocks", async function () {
      const launchpadAndBlaster = await deployAll();
      const coinName = "TestCoin";
      const coinSymbol = "TEST";
      const coinSupply = 10_000_000;
      const buyTaxBasisPoints = 0;
      const sellTaxBasisPoints = 0;
      const burnBasisPoints = 0;
      const feeReceiver = await launchpadAndBlaster.tom.getAddress();
      const amountToDropToNftHolders = 0;
      const lpAmount = 8_000_000;
      const lpTimeLock = 1000;
      const vestingLock = 1000;
      const ethLiquidity = ethers.parseEther("1");
      const coinId = 99;

      await launchpadAndBlaster.launchpad.connect(launchpadAndBlaster.bob).createCoin(
        {
          name: coinName,
          symbol: coinSymbol,
          coinId: coinId,
          supply: coinSupply,
          buyTaxBasisPoints: buyTaxBasisPoints,
          sellTaxBasisPoints: sellTaxBasisPoints,
          burnBasisPoints: burnBasisPoints,
          feeReceiver: feeReceiver,
          lpAmount: lpAmount,
          lpAmountETH: ethLiquidity,
          lockPeriod: lpTimeLock,
          vestingPeriod: vestingLock,
          maxTokensPerWallet: 0,
          limitPerTransaction: 0,
          antisnipePeriod: 0,
        },
        {
          value: ethLiquidity
        }
      );
      const coinCreatedBlockTimestamp = await time.latest();

      const filterCoinCreated = launchpadAndBlaster.launchpad.filters.CoinCreated;
      const block = await time.latestBlock();
      const eventsCoinCreated = await launchpadAndBlaster.launchpad.queryFilter(filterCoinCreated, block, coinCreatedBlockTimestamp + 1);

      expect(eventsCoinCreated[0].args?.lockPeriod.toString()).to.equal(lpTimeLock.toString());
      expect(eventsCoinCreated[0].args?.lpLockSizeETH.toString()).to.equal(ethLiquidity.toString());
      expect(eventsCoinCreated[0].args?.lpLockSizeTokens.toString()).to.equal(lpAmount.toString());
      expect(eventsCoinCreated[0].args?.deployer.toString()).to.equal(await launchpadAndBlaster.bob.getAddress());
      expect(eventsCoinCreated[0].args?.vestingPeriod.toString()).to.equal(vestingLock.toString());
      expect(eventsCoinCreated[0].args?.coinId.toString()).to.equal(coinId.toString());

      const coinAddress = eventsCoinCreated[0].args?.coin;
      const coin = await ethers.getContractAt("Coin", coinAddress) as unknown as Coin;

      const [token0, token1] = sortTokens(await launchpadAndBlaster.WETH.getAddress(), coinAddress);
      const lpTokenAddress = await launchpadAndBlaster.blaster.factory.getPair(token0, token1);
      const lpToken = await ethers.getContractAt("IERC20", lpTokenAddress) as unknown as IUniswapV2Pair;
      const launchpadLpTokenBalance = await lpToken.balanceOf(await launchpadAndBlaster.launchpad.getAddress());

      const tokensLockedFilter = launchpadAndBlaster.launchpad.filters.TokensLocked;

      const eventsTokensLocked = await launchpadAndBlaster.launchpad.queryFilter(tokensLockedFilter, block, await time.latestBlock());

      const lpTokensLockedEvent = eventsTokensLocked[0].args
      const tokensLockedEvent = eventsTokensLocked[1].args

      expect(lpTokensLockedEvent[4]).to.equal(1);
      expect(tokensLockedEvent[4]).to.equal(0);

      const lockKey = lpTokensLockedEvent[1];
      const lockKeyVesting = tokensLockedEvent[1];

      const lpTokenLockInfo = await launchpadAndBlaster.launchpad.getLockInfo(lockKey.toString());
      const vestingTokenLockInfo = await launchpadAndBlaster.launchpad.getLockInfo(lockKeyVesting.toString());

      expect(lpTokenLockInfo[0].toString()).to.equal(lpTokenAddress);
      expect(lpTokenLockInfo[1].toString()).to.equal(await launchpadAndBlaster.bob.getAddress());
      expect(lpTokenLockInfo[2].toString()).to.equal(launchpadLpTokenBalance.toString());
      expect(lpTokenLockInfo[3].toString()).to.equal(launchpadLpTokenBalance.toString());
      expect(lpTokenLockInfo[4].toString()).to.equal((lpTimeLock).toString());
      expect(lpTokenLockInfo[5].toString()).to.equal(coinCreatedBlockTimestamp.toString());

      const vestedAmount = coinSupply - amountToDropToNftHolders - lpAmount;
      expect(vestingTokenLockInfo[0].toString()).to.equal(coinAddress);
      expect(vestingTokenLockInfo[1].toString()).to.equal(await launchpadAndBlaster.bob.getAddress());
      expect(vestingTokenLockInfo[2].toString()).to.equal(vestedAmount.toString());
      expect(vestingTokenLockInfo[3].toString()).to.equal(vestedAmount.toString());
      expect(vestingTokenLockInfo[4].toString()).to.equal((lpTimeLock).toString());
      expect(vestingTokenLockInfo[5].toString()).to.equal(coinCreatedBlockTimestamp.toString());

      //substract one block to get half of tokes, so that the next call's timestamp equals 500
      await time.increase((lpTimeLock / 2) - 1);
      await launchpadAndBlaster.launchpad.connect(launchpadAndBlaster.bob).claimToken(lockKey);
      const bobsBalanceOfLPTokens = await lpToken.balanceOf(await launchpadAndBlaster.bob.getAddress());

      expect(bobsBalanceOfLPTokens.toString()).
        to.equal((launchpadLpTokenBalance / BigInt(2)).toString());

      await time.increase(lpTimeLock / 4 - 1);
      await launchpadAndBlaster.launchpad.connect(launchpadAndBlaster.bob).claimToken(lockKey);

      const bobsBalanceOfLPTokensSecondClaim = await lpToken.balanceOf(await launchpadAndBlaster.bob.getAddress());
      const bobsTokenSecondClaim = bobsBalanceOfLPTokensSecondClaim - bobsBalanceOfLPTokens;

      expect(bobsTokenSecondClaim.toString()).
        to.equal((launchpadLpTokenBalance / BigInt(4)).toString());

      await time.increase(lpTimeLock / 4);
      await launchpadAndBlaster.launchpad.connect(launchpadAndBlaster.bob).claimToken(lockKey);

      const bobsBalanceLpTokenAfterUnlockTime = await lpToken.balanceOf(await launchpadAndBlaster.bob.getAddress());

      expect(bobsBalanceLpTokenAfterUnlockTime.toString()).
        to.equal((launchpadLpTokenBalance).toString());

      const filterTokenClaimed = launchpadAndBlaster.launchpad.filters.TokenClaimed;
      const eventsTokenClaimed = await launchpadAndBlaster.launchpad.queryFilter(filterTokenClaimed, block, await time.latestBlock());

      const tokenClaimedEvent = eventsTokenClaimed[2].args;

      expect(tokenClaimedEvent.token).to.equal(lpTokenAddress);
      expect(tokenClaimedEvent.claimer).to.equal(await launchpadAndBlaster.bob.getAddress());
      expect(tokenClaimedEvent.amount).to.equal((BigInt(bobsTokenSecondClaim) + BigInt(1)).toString()); // add 1 token to the last claim lp balance is odd
      expect(tokenClaimedEvent.timePassed).to.equal(lpTimeLock + 1);


      await launchpadAndBlaster.launchpad.connect(launchpadAndBlaster.bob).claimToken(lockKeyVesting);
      const bobsBalanceOfTokens = await coin.balanceOf(await launchpadAndBlaster.bob.getAddress());
      expect(bobsBalanceOfTokens).to.be.eq(vestedAmount);

      const lpTokenLockInfoDeleted = await launchpadAndBlaster.launchpad.getLockInfo(lockKey.toString());
      expect(lpTokenLockInfoDeleted[0]).equals(ethers.ZeroAddress);
      expect(lpTokenLockInfoDeleted[1]).equals(ethers.ZeroAddress);
    });

    it("Should should be reverted due to zero vesting", async function () {
      const launchpadAndBlaster = await deployAll();
      const coinName = "TestCoin";
      const coinSymbol = "TEST";
      const coinSupply = 10_000_000;
      const buyTaxBasisPoints = 0;
      const sellTaxBasisPoints = 0;
      const burnBasisPoints = 0;
      const feeReceiver = await launchpadAndBlaster.tom.getAddress();
      const amountToDropToNftHolders = 0;
      const lpAmount = 8_000_000;
      const lpTimeLock = 1000;
      const vestingLock = 0;
      const ethLiquidity = ethers.parseEther("1");
      const coinId = 99;

      await expect(launchpadAndBlaster.launchpad.connect(launchpadAndBlaster.bob).createCoin(
        {
          name: coinName,
          symbol: coinSymbol,
          coinId: coinId,
          supply: coinSupply,
          buyTaxBasisPoints: buyTaxBasisPoints,
          sellTaxBasisPoints: sellTaxBasisPoints,
          burnBasisPoints: burnBasisPoints,
          feeReceiver: feeReceiver,
          lpAmount: lpAmount,
          lpAmountETH: ethLiquidity,
          lockPeriod: lpTimeLock,
          vestingPeriod: vestingLock,
          maxTokensPerWallet: 0,
          limitPerTransaction: 0,
          antisnipePeriod: 0,
        },
        {
          value: ethLiquidity
        }
      )).to.be.revertedWith("BlasterLaunchpad: vesting period is 0");
    })
  });
});

function sortTokens(token0: string, token1: string): [string, string] {
  return BigInt(token0) < BigInt(token1) ? [token0, token1] : [token1, token0];
}
