const { ethers } = require("hardhat");
async function main() {
  // Get the contract factory
  const ComplaintRegistry = await ethers.getContractFactory("ComplaintRegistry");
  
  // Replace with your deployed contract address
  const contractAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
  const contract = await ComplaintRegistry.attach(contractAddress);

  // Example complaint data
  const complaintData = {
    id: Math.floor(Date.now() / 1000), // Use current timestamp as ID
    ipfsCid: "bafybeidfgqqw2j4v6f7v5j6huj3z7zg5q2n6k5j4h3g5v4c3b2v1n0m9l8k7j6",
    dataHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-complaint-hash")),
    reason: "Test Complaint",
    description: "This is a test complaint registered via script",
    locationName: "Test Location",
    lat: 12345678, // Example: 12.345678 * 1e6
    lng: 98765432  // Example: 98.765432 * 1e6
  };

  console.log("Registering complaint...");
  const tx = await contract.registerComplaint(
    complaintData.id,
    complaintData.ipfsCid,
    complaintData.dataHash,
    complaintData.reason,
    complaintData.description,
    complaintData.locationName,
    complaintData.lat,
    complaintData.lng
  );

  const receipt = await tx.wait();
  console.log(`Complaint registered! Transaction hash: ${receipt.transactionHash}`);
  console.log(`Complaint ID: ${complaintData.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
