import { expect } from "chai";
import hardhat from "hardhat";
const { ethers } = hardhat;

describe("ComplaintRegistry", function () {
  let complaintRegistry;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const ComplaintRegistry = await ethers.getContractFactory("ComplaintRegistry");
    complaintRegistry = await ComplaintRegistry.deploy();
    await complaintRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await complaintRegistry.getAddress()).to.be.properAddress;
    });
  });

  describe("Register Complaint", function () {
    it("Should register a new complaint", async function () {
      const complaintId = 1;
      const ipfsCid = "bafybeidfgqqw2j4v6f7v5j6huj3z7zg5q2n6k5j4h3g5v4c3b2v1n0m9l8k7j6";
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test-hash"));
      const reason = "Test Complaint";
      const description = "This is a test complaint";
      const locationName = "Test Location";
      const lat = 12345678;
      const lng = 98765432;

      await expect(
        complaintRegistry.registerComplaint(
          complaintId,
          ipfsCid,
          dataHash,
          reason,
          description,
          locationName,
          lat,
          lng
        )
      )
        .to.emit(complaintRegistry, "ComplaintRegistered")
        .withArgs(complaintId, owner.address, dataHash, ipfsCid, (value) => value > 0);

      const complaint = await complaintRegistry.complaints(complaintId);
      expect(complaint.id).to.equal(complaintId);
      expect(complaint.reporter).to.equal(owner.address);
      expect(complaint.ipfsCid).to.equal(ipfsCid);
      expect(complaint.dataHash).to.equal(dataHash);
      expect(complaint.reason).to.equal(reason);
      expect(complaint.description).to.equal(description);
      expect(complaint.locationName).to.equal(locationName);
      expect(complaint.lat).to.equal(lat);
      expect(complaint.lng).to.equal(lng);
      expect(complaint.status).to.equal(0); // IN_PROGRESS
      expect(complaint.likesCount).to.equal(0);
    });

    it("Should not allow duplicate complaint IDs", async function () {
      const complaintId = 1;
      const ipfsCid = "test-cid";
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test-hash"));

      await complaintRegistry.registerComplaint(
        complaintId,
        ipfsCid,
        dataHash,
        "Reason",
        "Description",
        "Location",
        0,
        0
      );

      await expect(
        complaintRegistry.registerComplaint(
          complaintId,
          ipfsCid,
          dataHash,
          "Duplicate",
          "Should fail",
          "Location",
          0,
          0
        )
      ).to.be.revertedWith("Complaint already exists");
    });
  });

  describe("Update Status", function () {
    it("Should update complaint status", async function () {
      const complaintId = 1;
      await registerTestComplaint(complaintId);

      // Update to SOLVED (1)
      await expect(complaintRegistry.updateStatus(complaintId, 1))
        .to.emit(complaintRegistry, "StatusUpdated")
        .withArgs(complaintId, 1);

      let complaint = await complaintRegistry.complaints(complaintId);
      expect(complaint.status).to.equal(1);

      // Update to REJECTED (2)
      await complaintRegistry.updateStatus(complaintId, 2);
      complaint = await complaintRegistry.complaints(complaintId);
      expect(complaint.status).to.equal(2);
    });

    it("Should not allow updating non-existent complaints", async function () {
      await expect(complaintRegistry.updateStatus(999, 1)).to.be.revertedWith(
        "Complaint not found"
      );
    });
  });

  describe("Comments", function () {
    it("Should add a comment to a complaint", async function () {
      const complaintId = 1;
      await registerTestComplaint(complaintId);
      const commentText = "This is a test comment";

      await expect(complaintRegistry.addComment(complaintId, commentText))
        .to.emit(complaintRegistry, "CommentAdded")
        .withArgs(complaintId, owner.address, commentText, (value) => value > 0);

      const comments = await complaintRegistry.getComments(complaintId);
      expect(comments.length).to.equal(1);
      expect(comments[0].commenter).to.equal(owner.address);
      expect(comments[0].text).to.equal(commentText);
    });
  });

  describe("Likes", function () {
    it("Should increment likes count", async function () {
      const complaintId = 1;
      await registerTestComplaint(complaintId);

      await expect(complaintRegistry.connect(addr1).like(complaintId))
        .to.emit(complaintRegistry, "Liked")
        .withArgs(complaintId, addr1.address, 1);

      let complaint = await complaintRegistry.complaints(complaintId);
      expect(complaint.likesCount).to.equal(1);

      // Another like from different address
      await complaintRegistry.connect(addr2).like(complaintId);
      complaint = await complaintRegistry.complaints(complaintId);
      expect(complaint.likesCount).to.equal(2);
    });
  });

  // Helper function to register a test complaint
  async function registerTestComplaint(id) {
    await complaintRegistry.registerComplaint(
      id,
      "test-cid",
      ethers.keccak256(ethers.toUtf8Bytes("test-hash")),
      "Test Reason",
      "Test Description",
      "Test Location",
      0,
      0
    );
  }
});
