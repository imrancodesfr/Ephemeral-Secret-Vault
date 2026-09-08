// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SupplyChain {
    struct Asset {
        string assetId;
        string name;
        string description;
        string status;
        address currentOwner;
        uint256 createdAt;
        uint256 lastUpdated;
        HistoryEntry[] history;
    }

    struct HistoryEntry {
        string status;
        address from;
        address to;
        uint256 timestamp;
    }

    mapping(string => Asset) public assets;
    string[] public assetIds;

    event AssetCreated(string assetId, string name, address owner, uint256 timestamp);
    event AssetTransferred(string assetId, address from, address to, string status, uint256 timestamp);
    event AssetUpdated(string assetId, string status, uint256 timestamp);

    modifier assetExists(string memory _assetId) {
        require(bytes(assets[_assetId].assetId).length > 0, "Asset does not exist");
        _;
    }

    function createAsset(string memory _assetId, string memory _name, string memory _description) external {
        require(bytes(assets[_assetId].assetId).length == 0, "Asset already exists");
        require(bytes(_name).length > 0, "Name required");

        Asset storage a = assets[_assetId];
        a.assetId = _assetId;
        a.name = _name;
        a.description = _description;
        a.status = "CREATED";
        a.currentOwner = msg.sender;
        a.createdAt = block.timestamp;
        a.lastUpdated = block.timestamp;
        a.history.push(HistoryEntry("CREATED", msg.sender, msg.sender, block.timestamp));

        assetIds.push(_assetId);
        emit AssetCreated(_assetId, _name, msg.sender, block.timestamp);
    }

    function transferAsset(string memory _assetId, address _to) external assetExists(_assetId) {
        Asset storage a = assets[_assetId];
        require(a.currentOwner == msg.sender, "Not current owner");
        require(_to != address(0), "Invalid recipient address");

        address from = a.currentOwner;
        a.currentOwner = _to;
        a.lastUpdated = block.timestamp;

        string memory newStatus;
        if (keccak256(bytes(a.status)) == keccak256(bytes("CREATED"))) {
            newStatus = "ASSIGNED";
        } else if (keccak256(bytes(a.status)) == keccak256(bytes("ASSIGNED"))) {
            newStatus = "TRANSFERRED";
        } else if (keccak256(bytes(a.status)) == keccak256(bytes("TRANSFERRED"))) {
            newStatus = "RECEIVED";
        } else if (keccak256(bytes(a.status)) == keccak256(bytes("RECEIVED"))) {
            newStatus = "VERIFIED";
        } else {
            revert("Asset in final state");
        }

        a.status = newStatus;
        a.history.push(HistoryEntry(newStatus, from, _to, block.timestamp));

        emit AssetTransferred(_assetId, from, _to, newStatus, block.timestamp);
    }

    function readAsset(string memory _assetId) external view assetExists(_assetId) returns (
        string memory assetId,
        string memory name,
        string memory description,
        string memory status,
        address currentOwner,
        uint256 createdAt,
        uint256 lastUpdated,
        uint256 historyLength
    ) {
        Asset storage a = assets[_assetId];
        return (
            a.assetId, a.name, a.description, a.status,
            a.currentOwner, a.createdAt, a.lastUpdated,
            a.history.length
        );
    }

    function verifyAsset(string memory _assetId) external view assetExists(_assetId) returns (string memory) {
        return assets[_assetId].status;
    }

    function getAssetCount() external view returns (uint256) {
        return assetIds.length;
    }
}
