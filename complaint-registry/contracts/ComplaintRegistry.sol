// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ComplaintRegistry {
    enum Status { IN_PROGRESS, SOLVED, REJECTED }

    struct Comment {
        address commenter;
        string text;
        uint256 timestamp;
    }

    struct Complaint {
        uint256 id;
        address reporter;
        string ipfsCid;     // IPFS CID (metadata + image)
        bytes32 dataHash;   // keccak256 of canonicalized complaint fields
        string reason;
        string description;
        string locationName;
        int256 lat;
        int256 lng;
        Status status;
        uint256 timestamp;
        uint256 likesCount;
    }

    struct Response {
        uint256 complaintId;
        address responder;
        string ipfsCid;
        bytes32 dataHash;
        string text;
        uint256 timestamp;
    }

    mapping(uint256 => Complaint) public complaints;
    mapping(uint256 => Response[]) public responses;
    mapping(uint256 => Comment[]) public comments;

    event ComplaintRegistered(uint256 indexed id, address indexed reporter, bytes32 dataHash, string ipfsCid, uint256 timestamp);
    event ResponseAdded(uint256 indexed id, address indexed responder, bytes32 dataHash, string ipfsCid, uint256 timestamp);
    event StatusUpdated(uint256 indexed id, Status newStatus);
    event CommentAdded(uint256 indexed id, address indexed commenter, string text, uint256 timestamp);
    event Liked(uint256 indexed id, address indexed liker, uint256 newLikesCount);

    function registerComplaint(
        uint256 _id,
        string calldata _ipfsCid,
        bytes32 _dataHash,
        string calldata _reason,
        string calldata _description,
        string calldata _locationName,
        int256 _lat,
        int256 _lng
    ) external {
        require(complaints[_id].timestamp == 0, "Complaint already exists");
        complaints[_id] = Complaint({
            id: _id,
            reporter: msg.sender,
            ipfsCid: _ipfsCid,
            dataHash: _dataHash,
            reason: _reason,
            description: _description,
            locationName: _locationName,
            lat: _lat,
            lng: _lng,
            status: Status.IN_PROGRESS,
            timestamp: block.timestamp,
            likesCount: 0
        });

        emit ComplaintRegistered(_id, msg.sender, _dataHash, _ipfsCid, block.timestamp);
    }

    function addResponse(
        uint256 _id,
        string calldata _ipfsCid,
        bytes32 _dataHash,
        string calldata _text
    ) external {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        responses[_id].push(Response({
            complaintId: _id,
            responder: msg.sender,
            ipfsCid: _ipfsCid,
            dataHash: _dataHash,
            text: _text,
            timestamp: block.timestamp
        }));

        emit ResponseAdded(_id, msg.sender, _dataHash, _ipfsCid, block.timestamp);
    }

    function updateStatus(uint256 _id, Status _newStatus) external {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        complaints[_id].status = _newStatus;
        emit StatusUpdated(_id, _newStatus);
    }

    function addComment(uint256 _id, string calldata _text) external {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        comments[_id].push(Comment({ 
            commenter: msg.sender, 
            text: _text, 
            timestamp: block.timestamp 
        }));
        emit CommentAdded(_id, msg.sender, _text, block.timestamp);
    }

    function like(uint256 _id) external {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        complaints[_id].likesCount += 1;
        emit Liked(_id, msg.sender, complaints[_id].likesCount);
    }

    // View functions
    function getComplaint(uint256 _id) external view returns (Complaint memory) {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        return complaints[_id];
    }

    function getResponses(uint256 _id) external view returns (Response[] memory) {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        return responses[_id];
    }

    function getComments(uint256 _id) external view returns (Comment[] memory) {
        require(complaints[_id].timestamp != 0, "Complaint not found");
        return comments[_id];
    }
}
