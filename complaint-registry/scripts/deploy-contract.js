import hre from "hardhat";
import fs from "fs";

async function main() {
  console.log("🚀 Starting ComplaintRegistry deployment...");

  const ComplaintRegistry = await hre.ethers.getContractFactory("ComplaintRegistry");

  // Deploy the contract
  const contract = await ComplaintRegistry.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ ComplaintRegistry deployed to:", address);
  console.log("📝 Transaction hash:", contract.deploymentTransaction().hash);

  // Save the address to a file for easy access
  fs.writeFileSync('deployed-address.txt', address);
  console.log("📄 Address saved to deployed-address.txt");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
