// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CivicBlockchain
 * @dev A proper blockchain implementation for civic complaints with immutable blocks and transaction history
 * Optimized for low gas costs with efficient storage patterns
 */
contract CivicBlockchain {
    
    // Transaction Types - using uint8 instead of enum for gas efficiency
    uint8 public constant COMPLAINT_FILED = 0;
    uint8 public constant RESPONSE_ADDED = 1;
    uint8 public constant STATUS_UPDATE = 2;
    uint8 public constant VERIFICATION_ADDED = 3;
    
    // Status Types - using uint8 for gas efficiency
    uint8 public constant STATUS_PENDING = 0;
    uint8 public constant STATUS_IN_PROGRESS = 1;
    uint8 public constant STATUS_RESOLVED = 2;
    uint8 public constant STATUS_REJECTED = 3;
    
    // Block Header Structure - optimized for minimal storage
    struct BlockHeader {
        uint256 blockNumber;
        uint256 timestamp;
        bytes32 previousBlockHash;
        bytes32 transactionsMerkleRoot;
        address miner; // In this case, the transaction submitter
    }
    
    // Transaction Structure - packed for gas efficiency
    struct CivicTransaction {
        uint8 txType;        // Transaction type (0-3)
        address sender;      // Transaction sender
        bytes32 dataHash;    // Hash of transaction data
        uint256 timestamp;   // Block timestamp
    }
    
    // Block Structure
    struct Block {
        BlockHeader header;
        CivicTransaction[] transactions;
    }
    
    // Complaint Data Structure - stored efficiently
    struct ComplaintData {
        uint256 complaintId;
        address citizen;
        string description;
        string locationName;
        int256 lat;          // Stored as microdegrees for precision
        int256 lng;          // Stored as microdegrees for precision
        string mediaHash;    // IPFS hash of media evidence
        uint256 timestamp;
    }
    
    // Response Data Structure
    struct ResponseData {
        uint256 complaintId;
        address responder;
        string responseText;
        uint256 timestamp;
    }
    
    // Verification Data Structure
    struct VerificationData {
        uint256 complaintId;
        address verifier;
        bool isResolved;     // Citizen verification of resolution
        uint256 timestamp;
    }
    
    // State Variables
    Block[] public blockchain;
    mapping(uint256 => ComplaintData) public complaints;
    mapping(uint256 => ResponseData[]) private responses;
    mapping(uint256 => VerificationData[]) private verifications;
    
    // Public getter functions for arrays
    function getResponses(uint256 _complaintId) external view returns (ResponseData[] memory) {
        return responses[_complaintId];
    }
    
    function getVerifications(uint256 _complaintId) external view returns (VerificationData[] memory) {
        return verifications[_complaintId];
    }
    
    // Events - indexed for efficient filtering
    event BlockMined(uint256 indexed blockNumber, bytes32 blockHash, address miner, uint256 transactionCount);
    event ComplaintFiled(uint256 indexed complaintId, address indexed citizen, bytes32 dataHash, uint256 blockNumber);
    event ResponseAdded(uint256 indexed complaintId, address indexed responder, bytes32 dataHash, uint256 blockNumber);
    event StatusUpdated(uint256 indexed complaintId, uint8 newStatus, bytes32 dataHash, uint256 blockNumber);
    event VerificationAdded(uint256 indexed complaintId, address indexed verifier, bool isResolved, bytes32 dataHash, uint256 blockNumber);
    
    // Modifiers for access control
    modifier onlyValidComplaint(uint256 _complaintId) {
        require(complaints[_complaintId].timestamp > 0, "Complaint does not exist");
        _;
    }
    
    constructor() {
        // Create Genesis Block
        BlockHeader memory genesisHeader = BlockHeader({
            blockNumber: 0,
            timestamp: block.timestamp,
            previousBlockHash: bytes32(0), // Genesis block has no previous hash
            transactionsMerkleRoot: bytes32(0), // Empty merkle root
            miner: msg.sender
        });

        // Create genesis block directly in storage
        Block storage genesisBlock = blockchain.push();
        genesisBlock.header = genesisHeader;
        // No transactions in genesis, so leave empty

        emit BlockMined(0, calculateBlockHash(genesisBlock), msg.sender, 0);
    }
    
    /**
     * @dev File a new complaint - creates a new block with the transaction
     */
    function fileComplaint(
        uint256 _complaintId,
        string calldata _description,
        string calldata _locationName,
        int256 _lat,
        int256 _lng,
        string calldata _mediaHash
    ) external {
        require(complaints[_complaintId].timestamp == 0, "Complaint already exists");
        
        // Store complaint data
        complaints[_complaintId] = ComplaintData({
            complaintId: _complaintId,
            citizen: msg.sender,
            description: _description,
            locationName: _locationName,
            lat: _lat,
            lng: _lng,
            mediaHash: _mediaHash,
            timestamp: block.timestamp
        });
        
        // Create transaction data hash
        bytes32 dataHash = keccak256(abi.encodePacked(
            _complaintId,
            msg.sender,
            _description,
            _locationName,
            _lat,
            _lng,
            _mediaHash,
            block.timestamp
        ));
        
        // Create transaction
        CivicTransaction memory tx = CivicTransaction({
            txType: COMPLAINT_FILED,
            sender: msg.sender,
            dataHash: dataHash,
            timestamp: block.timestamp
        });
        
        // Create new block with this transaction
        _createBlock(tx);
        
        emit ComplaintFiled(_complaintId, msg.sender, dataHash, blockchain.length - 1);
    }
    
    /**
     * @dev Add a government response - creates a new block with the transaction
     */
    function addResponse(
        uint256 _complaintId,
        string calldata _responseText
    ) external onlyValidComplaint(_complaintId) {
        
        // Store response data
        responses[_complaintId].push(ResponseData({
            complaintId: _complaintId,
            responder: msg.sender,
            responseText: _responseText,
            timestamp: block.timestamp
        }));
        
        // Create transaction data hash
        bytes32 dataHash = keccak256(abi.encodePacked(
            _complaintId,
            msg.sender,
            _responseText,
            block.timestamp
        ));
        
        // Create transaction
        CivicTransaction memory tx = CivicTransaction({
            txType: RESPONSE_ADDED,
            sender: msg.sender,
            dataHash: dataHash,
            timestamp: block.timestamp
        });
        
        // Create new block with this transaction
        _createBlock(tx);
        
        emit ResponseAdded(_complaintId, msg.sender, dataHash, blockchain.length - 1);
    }
    
    /**
     * @dev Update complaint status - creates a new block with the transaction
     */
    function updateStatus(uint256 _complaintId, uint8 _newStatus) external onlyValidComplaint(_complaintId) {
        require(_newStatus <= STATUS_REJECTED, "Invalid status");
        
        // Encode status in data hash (store status in the last 8 bits)
        bytes32 dataHash = bytes32(uint256(_newStatus));
        
        // Create transaction
        CivicTransaction memory tx = CivicTransaction({
            txType: STATUS_UPDATE,
            sender: msg.sender,
            dataHash: dataHash,
            timestamp: block.timestamp
        });
        
        // Create new block with this transaction
        _createBlock(tx);
        
        emit StatusUpdated(_complaintId, _newStatus, dataHash, blockchain.length - 1);
    }
    
    /**
     * @dev Add citizen verification - creates a new block with the transaction
     */
    function addVerification(
        uint256 _complaintId,
        bool _isResolved
    ) external onlyValidComplaint(_complaintId) {
        
        // Store verification data
        verifications[_complaintId].push(VerificationData({
            complaintId: _complaintId,
            verifier: msg.sender,
            isResolved: _isResolved,
            timestamp: block.timestamp
        }));
        
        // Create transaction data hash
        bytes32 dataHash = keccak256(abi.encodePacked(
            _complaintId,
            msg.sender,
            _isResolved,
            block.timestamp
        ));
        
        // Create transaction
        CivicTransaction memory tx = CivicTransaction({
            txType: VERIFICATION_ADDED,
            sender: msg.sender,
            dataHash: dataHash,
            timestamp: block.timestamp
        });
        
        // Create new block with this transaction
        _createBlock(tx);
        
        emit VerificationAdded(_complaintId, msg.sender, _isResolved, dataHash, blockchain.length - 1);
    }
    
    /**
     * @dev Internal function to create a new block with a transaction
     */
    function _createBlock(CivicTransaction memory _transaction) internal {
        uint256 blockNumber = blockchain.length;
        Block storage previousBlock = blockchain[blockNumber - 1];
        
        // Calculate Merkle root (for single transaction, it's just the transaction hash)
        bytes32 merkleRoot = keccak256(abi.encode(
            _transaction.txType,
            _transaction.sender,
            _transaction.dataHash,
            _transaction.timestamp
        ));
        
        // Create block header
        BlockHeader memory header = BlockHeader({
            blockNumber: blockNumber,
            timestamp: block.timestamp,
            previousBlockHash: calculateBlockHash(previousBlock),
            transactionsMerkleRoot: merkleRoot,
            miner: msg.sender
        });
        
        // Create and store block directly
        Block storage newBlock = blockchain.push();
        newBlock.header = header;
        newBlock.transactions.push(_transaction);
        
        // Create memory copy for hash calculation
        Block memory memoryBlock = Block({
            header: header,
            transactions: new CivicTransaction[](1)
        });
        memoryBlock.transactions[0] = _transaction;
        
        emit BlockMined(blockNumber, calculateBlockHash(memoryBlock), msg.sender, 1);
    }
    
    /**
     * @dev Calculate block hash for integrity verification
     */
    function calculateBlockHash(Block memory _block) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            _block.header.blockNumber,
            _block.header.timestamp,
            _block.header.previousBlockHash,
            _block.header.transactionsMerkleRoot,
            _block.header.miner
        ));
    }
    
    /**
     * @dev Get current blockchain length
     */
    function getBlockchainLength() external view returns (uint256) {
        return blockchain.length;
    }
    
    /**
     * @dev Get block by number
     */
    function getBlock(uint256 _blockNumber) external view returns (BlockHeader memory, CivicTransaction[] memory) {
        require(_blockNumber < blockchain.length, "Block does not exist");
        Block storage blockData = blockchain[_blockNumber];

        // Copy transactions from storage to memory
        CivicTransaction[] memory txs = new CivicTransaction[](blockData.transactions.length);
        for (uint256 i = 0; i < blockData.transactions.length; i++) {
            txs[i] = blockData.transactions[i];
        }

        return (blockData.header, txs);
    }
    
    /**
     * @dev Get current status of a complaint by scanning transaction history
     */
    function getCurrentStatus(uint256 _complaintId) external view onlyValidComplaint(_complaintId) returns (uint8) {
        uint8 currentStatus = STATUS_PENDING;
        
        // Scan blockchain from newest to oldest for status updates
        for (uint256 i = blockchain.length - 1; i > 0; i--) {
            Block storage blockData = blockchain[i];
            for (uint256 j = 0; j < blockData.transactions.length; j++) {
                CivicTransaction storage tx = blockData.transactions[j];
                if (tx.txType == STATUS_UPDATE) {
                    // Extract status from the last 8 bits of the data hash
                    // This is a simplified approach - in production, you'd want a more robust method
                    uint256 hashValue = uint256(tx.dataHash);
                    uint8 extractedStatus = uint8(hashValue & 0xFF); // Get last byte
                    if (extractedStatus <= STATUS_REJECTED) {
                        return extractedStatus;
                    }
                }
            }
        }
        
        return currentStatus;
    }
    
    /**
     * @dev Verify blockchain integrity
     */
    function verifyChainIntegrity() external view returns (bool) {
        for (uint256 i = 1; i < blockchain.length; i++) {
            Block storage currentBlock = blockchain[i];
            Block storage previousBlock = blockchain[i - 1];
            
            bytes32 calculatedPreviousHash = calculateBlockHash(previousBlock);
            if (currentBlock.header.previousBlockHash != calculatedPreviousHash) {
                return false;
            }
        }
        return true;
    }
}
