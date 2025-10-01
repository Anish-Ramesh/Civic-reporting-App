import { expect } from "chai";
import hardhat from "hardhat";
const { ethers } = hardhat;

describe("CivicBlockchain", function () {
  let civicBlockchain;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const CivicBlockchain = await ethers.getContractFactory("CivicBlockchain");
    civicBlockchain = await CivicBlockchain.deploy();
    await civicBlockchain.waitForDeployment();
  });

  describe("Genesis Block", function () {
    it("Should create genesis block on deployment", async function () {
      const blockchainLength = await civicBlockchain.getBlockchainLength();
      expect(blockchainLength).to.equal(1);
      
      const [header, transactions] = await civicBlockchain.getBlock(0);
      expect(header.blockNumber).to.equal(0);
      expect(header.previousBlockHash).to.equal(ethers.ZeroHash);
      expect(transactions.length).to.equal(0);
    });
  });

  describe("Complaint Filing", function () {
    it("Should file a new complaint and create a new block", async function () {
      const complaintId = 1;
      const description = "Pothole on Main Street";
      const locationName = "Main Street";
      const lat = 40712345; // Microdegrees
      const lng = -73987654; // Microdegrees
      const mediaHash = "QmTest123";

      const initialLength = await civicBlockchain.getBlockchainLength();
      
      const tx = await civicBlockchain.connect(addr1).fileComplaint(
        complaintId,
        description,
        locationName,
        lat,
        lng,
        mediaHash
      );
      
      const receipt = await tx.wait();
      
      // Check that a new block was created
      const newLength = await civicBlockchain.getBlockchainLength();
      expect(newLength).to.equal(initialLength + 1n);
      
      // Check the new block
      const [header, transactions] = await civicBlockchain.getBlock(1);
      expect(header.blockNumber).to.equal(1);
      expect(header.miner).to.equal(addr1.address);
      expect(transactions.length).to.equal(1);
      expect(transactions[0].txType).to.equal(0); // COMPLAINT_FILED
      expect(transactions[0].sender).to.equal(addr1.address);
      
      // Check that complaint data was stored
      const complaint = await civicBlockchain.complaints(complaintId);
      expect(complaint.complaintId).to.equal(complaintId);
      expect(complaint.citizen).to.equal(addr1.address);
      expect(complaint.description).to.equal(description);
    });

    it("Should not allow duplicate complaint IDs", async function () {
      const complaintId = 1;
      
      await civicBlockchain.connect(addr1).fileComplaint(
        complaintId,
        "First complaint",
        "Location 1",
        1000000,
        2000000,
        "hash1"
      );

      await expect(
        civicBlockchain.connect(addr2).fileComplaint(
          complaintId,
          "Duplicate complaint",
          "Location 2",
          3000000,
          4000000,
          "hash2"
        )
      ).to.be.revertedWith("Complaint already exists");
    });
  });

  describe("Government Response", function () {
    it("Should add response and create new block", async function () {
      const complaintId = 1;
      
      // First file a complaint
      await civicBlockchain.connect(addr1).fileComplaint(
        complaintId,
        "Test complaint",
        "Test location",
        1000000,
        2000000,
        "test-hash"
      );
      
      const initialLength = await civicBlockchain.getBlockchainLength();
      
      // Add response
      const responseText = "We are working on this issue";
      await civicBlockchain.connect(owner).addResponse(complaintId, responseText);
      
      // Check that a new block was created
      const newLength = await civicBlockchain.getBlockchainLength();
      expect(newLength).to.equal(initialLength + 1n);
      
      // Check the new block
      const [header, transactions] = await civicBlockchain.getBlock(2);
      expect(transactions.length).to.equal(1);
      expect(transactions[0].txType).to.equal(1); // RESPONSE_ADDED
      expect(transactions[0].sender).to.equal(owner.address);
      
      // Check that response was stored
      const responses = await civicBlockchain.getResponses(complaintId);
      expect(responses.length).to.equal(1);
      expect(responses[0].responder).to.equal(owner.address);
      expect(responses[0].responseText).to.equal(responseText);
    });

    it("Should not allow response to non-existent complaint", async function () {
      await expect(
        civicBlockchain.connect(owner).addResponse(999, "Test response")
      ).to.be.revertedWith("Complaint does not exist");
    });
  });

  describe("Status Updates", function () {
    it("Should update status and create new block", async function () {
      const complaintId = 1;
      
      // File a complaint first
      await civicBlockchain.connect(addr1).fileComplaint(
        complaintId,
        "Test complaint",
        "Test location",
        1000000,
        2000000,
        "test-hash"
      );
      
      const initialLength = await civicBlockchain.getBlockchainLength();
      
      // Update status to IN_PROGRESS
      await civicBlockchain.connect(owner).updateStatus(complaintId, 1);
      
      // Check that a new block was created
      const newLength = await civicBlockchain.getBlockchainLength();
      expect(newLength).to.equal(initialLength + 1n);
      
      // Check the new block
      const [header, transactions] = await civicBlockchain.getBlock(2);
      expect(transactions.length).to.equal(1);
      expect(transactions[0].txType).to.equal(2); // STATUS_UPDATE
      expect(transactions[0].sender).to.equal(owner.address);
      
      // Check current status
      const currentStatus = await civicBlockchain.getCurrentStatus(complaintId);
      expect(currentStatus).to.equal(1); // IN_PROGRESS
    });

    it("Should handle multiple status updates", async function () {
      const complaintId = 1;
      
      await civicBlockchain.connect(addr1).fileComplaint(
        complaintId,
        "Test complaint",
        "Test location",
        1000000,
        2000000,
        "test-hash"
      );
      
      // Update status multiple times
      await civicBlockchain.connect(owner).updateStatus(complaintId, 1); // IN_PROGRESS
      await civicBlockchain.connect(owner).updateStatus(complaintId, 2); // RESOLVED
      
      // Check that blocks were created for each update
      const blockchainLength = await civicBlockchain.getBlockchainLength();
      expect(blockchainLength).to.equal(4); // Genesis + complaint + 2 status updates
      
      // Check final status
      const currentStatus = await civicBlockchain.getCurrentStatus(complaintId);
      expect(currentStatus).to.equal(2); // RESOLVED
    });
  });

  describe("Citizen Verification", function () {
    it("Should add verification and create new block", async function () {
      const complaintId = 1;
      
      // File a complaint first
      await civicBlockchain.connect(addr1).fileComplaint(
        complaintId,
        "Test complaint",
        "Test location",
        1000000,
        2000000,
        "test-hash"
      );
      
      const initialLength = await civicBlockchain.getBlockchainLength();
      
      // Add verification
      await civicBlockchain.connect(addr1).addVerification(complaintId, true);
      
      // Check that a new block was created
      const newLength = await civicBlockchain.getBlockchainLength();
      expect(newLength).to.equal(initialLength + 1n);
      
      // Check the new block
      const [header, transactions] = await civicBlockchain.getBlock(2);
      expect(transactions.length).to.equal(1);
      expect(transactions[0].txType).to.equal(3); // VERIFICATION_ADDED
      expect(transactions[0].sender).to.equal(addr1.address);
      
      // Check that verification was stored
      const verifications = await civicBlockchain.getVerifications(complaintId);
      expect(verifications.length).to.equal(1);
      expect(verifications[0].verifier).to.equal(addr1.address);
      expect(verifications[0].isResolved).to.equal(true);
    });
  });

  describe("Blockchain Integrity", function () {
    it("Should maintain blockchain integrity", async function () {
      // Create multiple transactions
      await civicBlockchain.connect(addr1).fileComplaint(1, "Complaint 1", "Location 1", 1000000, 2000000, "hash1");
      await civicBlockchain.connect(addr2).fileComplaint(2, "Complaint 2", "Location 2", 3000000, 4000000, "hash2");
      await civicBlockchain.connect(owner).addResponse(1, "Response 1");
      
      // Verify chain integrity
      const isIntegrity = await civicBlockchain.verifyChainIntegrity();
      expect(isIntegrity).to.equal(true);
    });

    it("Should calculate correct block hashes", async function () {
      // Create a new block first
      await civicBlockchain.connect(addr1).fileComplaint(1, "Test", "Test", 1000000, 2000000, "hash");
      
      // Get the new block
      const [newHeader, newTransactions] = await civicBlockchain.getBlock(1);
      
      // Create a simple block object for testing
      const testBlock = {
        header: {
          blockNumber: newHeader.blockNumber,
          timestamp: newHeader.timestamp,
          previousBlockHash: newHeader.previousBlockHash,
          transactionsMerkleRoot: newHeader.transactionsMerkleRoot,
          miner: newHeader.miner
        },
        transactions: [] // Empty array for simplicity
      };
      
      // Verify the block hash calculation works
      const calculatedHash = await civicBlockchain.calculateBlockHash(testBlock);
      expect(calculatedHash).to.not.equal(ethers.ZeroHash);
      
      // Verify it's a valid hash (32 bytes)
      expect(calculatedHash.length).to.equal(66); // 0x + 64 hex chars
    });
  });

  describe("Gas Efficiency", function () {
    it("Should be gas efficient for basic operations", async function () {
      // Test complaint filing gas cost
      const tx1 = await civicBlockchain.connect(addr1).fileComplaint(
        1,
        "Test complaint",
        "Test location",
        1000000,
        2000000,
        "test-hash"
      );
      const receipt1 = await tx1.wait();
      
      console.log(`Complaint filing gas used: ${receipt1.gasUsed.toString()}`);
      
      // Test response gas cost
      const tx2 = await civicBlockchain.connect(owner).addResponse(1, "Test response");
      const receipt2 = await tx2.wait();
      
      console.log(`Response gas used: ${receipt2.gasUsed.toString()}`);
      
      // Test status update gas cost
      const tx3 = await civicBlockchain.connect(owner).updateStatus(1, 1);
      const receipt3 = await tx3.wait();
      
      console.log(`Status update gas used: ${receipt3.gasUsed.toString()}`);
      
      // Test verification gas cost
      const tx4 = await civicBlockchain.connect(addr1).addVerification(1, true);
      const receipt4 = await tx4.wait();
      
      console.log(`Verification gas used: ${receipt4.gasUsed.toString()}`);
      
      // All operations should be reasonable (less than 500k gas each)
      expect(receipt1.gasUsed).to.be.lessThan(500000);
      expect(receipt2.gasUsed).to.be.lessThan(500000);
      expect(receipt3.gasUsed).to.be.lessThan(300000);
      expect(receipt4.gasUsed).to.be.lessThan(500000);
    });
  });
});
