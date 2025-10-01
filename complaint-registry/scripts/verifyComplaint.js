import pkg from 'hardhat';
const { ethers } = pkg;
import { NFTStorage, File } from 'nft.storage';

async function fetchIPFSData(ipfsCid) {
  const client = new NFTStorage({ token: process.env.NEXT_PUBLIC_NFT_STORAGE_TOKEN });
  const response = await fetch(`https://${ipfsCid}.ipfs.nftstorage.link/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch IPFS data: ${response.statusText}`);
  }
  return await response.json();
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Using account: ${deployer.address}`);

  // Use deployed contract address from env
  const contractAddress = process.env.CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const complaintId = 1; // Replace with the complaint ID you want to verify

  const ComplaintRegistry = await ethers.getContractFactory("ComplaintRegistry");
  const contract = await ComplaintRegistry.attach(contractAddress);

  console.log(`Fetching complaint #${complaintId}...`);
  const complaint = await contract.complaints(complaintId);
  
  if (complaint.timestamp.toString() === "0") {
    console.error("Complaint not found");
    return;
  }

  console.log("\nOn-chain Complaint Data:");
  console.log(`- Reporter: ${complaint.reporter}`);
  console.log(`- IPFS CID: ${complaint.ipfsCid}`);
  console.log(`- Data Hash: ${complaint.dataHash}`);
  console.log(`- Status: ${Object.keys(await contract.Statuses())[complaint.status]}`);
  console.log(`- Timestamp: ${new Date(complaint.timestamp * 1000).toISOString()}`);

  // Fetch IPFS data
  console.log("\nFetching IPFS data...");
  try {
    const ipfsData = await fetchIPFSData(complaint.ipfsCid);
    console.log("\nIPFS Data:", JSON.stringify(ipfsData, null, 2));

    // Verify data integrity
    const canonicalString = `${ipfsData.id}|${ipfsData.reporter.toLowerCase()}|${ipfsData.reason}|${ipfsData.description}|${ipfsData.location.name}|${ipfsData.location.lat}|${ipfsData.location.lng}|${complaint.ipfsCid}|${new Date(ipfsData.timestamp).toISOString()}`;
    const computedHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(canonicalString));
    
    console.log("\nVerification Results:");
    console.log(`- Computed Hash: ${computedHash}`);
    console.log(`- On-chain Hash: ${complaint.dataHash}`);
    console.log(`- Hashes Match: ${computedHash === complaint.dataHash ? '✅' : '❌'}`);
    
    if (computedHash !== complaint.dataHash) {
      console.warn("\n⚠️  WARNING: Data integrity check failed! The complaint data may have been tampered with.");
    } else {
      console.log("\n✅ Data integrity verified successfully!");
    }
  } catch (error) {
    console.error("\nError fetching IPFS data:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
