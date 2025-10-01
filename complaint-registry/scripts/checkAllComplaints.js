import pkg from 'hardhat';
const { ethers } = pkg;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Using account: ${deployer.address}`);

  const contractAddress = process.env.CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  
  const ComplaintRegistry = await ethers.getContractFactory("ComplaintRegistry");
  const contract = await ComplaintRegistry.attach(contractAddress);

  console.log(`\n📋 Checking complaints from contract: ${contractAddress}`);
  
  // Get total complaint count
  try {
    const totalComplaints = await contract.complaintCount();
    console.log(`\n📊 Total complaints registered: ${totalComplaints.toString()}`);
    
    if (totalComplaints.toString() === "0") {
      console.log("\n❌ No complaints found in the contract");
      console.log("\n💡 To submit a complaint, you need to:");
      console.log("1. Use the frontend application to submit a complaint");
      console.log("2. Or run a script to submit a test complaint");
      return;
    }
    
    // Check each complaint
    console.log("\n📝 Complaint Details:");
    for (let i = 1; i <= totalComplaints; i++) {
      try {
        const complaint = await contract.complaints(i);
        if (complaint.timestamp.toString() !== "0") {
          console.log(`\n--- Complaint #${i} ---`);
          console.log(`Reporter: ${complaint.reporter}`);
          console.log(`IPFS CID: ${complaint.ipfsCid}`);
          console.log(`Data Hash: ${complaint.dataHash}`);
          console.log(`Status: ${complaint.status}`);
          console.log(`Timestamp: ${new Date(complaint.timestamp * 1000).toISOString()}`);
        }
      } catch (error) {
        console.log(`Error checking complaint #${i}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("Error checking complaints:", error.message);
  }
}

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exitCode = 1;
});
