import hre from "hardhat";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("No PRIVATE_KEY in .env");

  const wallet = new hre.ethers.Wallet(privateKey);
  console.log("🔑 Wallet address:", wallet.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
