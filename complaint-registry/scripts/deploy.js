import hre from "hardhat";
import fs from "fs";

async function main() {
  console.log("🚀 Deploying ComplaintRegistry to Optimism Sepolia...");

  // Get the contract factory
  const ComplaintRegistry = await hre.ethers.getContractFactory("ComplaintRegistry");
  
  console.log("✅ Contract factory loaded");

  // Deploy the contract with lower gas settings
  console.log("🚀 Deploying contract with optimized gas settings...");
  const gasPrice = await hre.ethers.provider.getGasPrice();
  console.log(`⛽ Current gas price: ${hre.ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);
  
  // Deploy with manual gas settings
  const deploymentTx = await ComplaintRegistry.getDeployTransaction();
  const estimatedGas = await hre.ethers.provider.estimateGas(deploymentTx);
  console.log(`⛽ Estimated gas: ${estimatedGas.toString()}`);
  
  // Try with a lower gas price
  const lowerGasPrice = gasPrice.mul(90).div(100); // 90% of current gas price
  const options = {
    gasLimit: estimatedGas.mul(12).div(10), // 20% buffer
    gasPrice: lowerGasPrice
  };
  
  console.log("⚙️ Using gas settings:", {
    gasLimit: options.gasLimit.toString(),
    gasPrice: hre.ethers.utils.formatUnits(options.gasPrice, 'gwei') + ' gwei'
  });
  
  const complaintRegistry = await ComplaintRegistry.deploy(options);
  await complaintRegistry.deployed();
  
  console.log(`✅ Contract deployed to: ${complaintRegistry.address}`);
  
  // Save the contract address to a file
  const contractAddresses = {
    optimismSepolia: complaintRegistry.address
  };
  
  fs.writeFileSync("deployed-addresses.json", JSON.stringify(contractAddresses, null, 2));
  console.log("📝 Contract address saved to deployed-addresses.json");
  
  // Wait for a few confirmations
  console.log("⏳ Waiting for confirmations...");
  await complaintRegistry.deployTransaction.wait(3);
  
  console.log("✅ Deployment confirmed!");
  console.log("🔍 Check your deployment at:", `https://sepolia-optimism.etherscan.io/address/${complaintRegistry.address}`);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
