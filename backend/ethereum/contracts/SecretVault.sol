// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SecretVault {
    struct Vault {
        bytes32 vaultId;
        address owner;
        uint256 creationTimestamp;
        uint256 lastRenewalTimestamp;
        uint256 expiryTimestamp;
        uint256 totalShares;
        uint256 requiredShares;
        address recoveryRecipient;
        string vaultStatus;
        string recoveryStatus;
    }

    mapping(bytes32 => Vault) public vaults;
    mapping(bytes32 => bool) public vaultCreated;
    bytes32[] public vaultIds;

    event VaultCreated(bytes32 vaultId, address owner, uint256 timestamp);
    event VaultRenewed(bytes32 vaultId, uint256 newExpiry);
    event RecoveryActivated(bytes32 vaultId, uint256 timestamp);
    event RecoveryAuthorized(bytes32 vaultId, address guardian, uint256 timestamp);

    modifier onlyVaultOwner(bytes32 _vaultId) {
        require(vaults[_vaultId].owner == msg.sender, "Not vault owner");
        _;
    }

    modifier vaultExists(bytes32 _vaultId) {
        require(vaultCreated[_vaultId], "Vault does not exist");
        _;
    }

    function createVault(
        string memory _vaultId,
        uint256 _totalShares,
        uint256 _requiredShares,
        uint256 _expiryMinutes,
        address _recoveryRecipient
    ) external {
        bytes32 key = keccak256(bytes(_vaultId));
        require(!vaultCreated[key], "Vault already exists");
        require(_requiredShares <= _totalShares, "Required exceeds total");
        require(_totalShares > 0, "Total shares must be positive");

        Vault storage v = vaults[key];
        v.vaultId = key;
        v.owner = msg.sender;
        v.creationTimestamp = block.timestamp;
        v.lastRenewalTimestamp = block.timestamp;
        v.expiryTimestamp = block.timestamp + (_expiryMinutes * 60);
        v.totalShares = _totalShares;
        v.requiredShares = _requiredShares;
        v.recoveryRecipient = _recoveryRecipient;
        v.vaultStatus = "ACTIVE";
        v.recoveryStatus = "NONE";

        vaultCreated[key] = true;
        vaultIds.push(key);
        emit VaultCreated(key, msg.sender, block.timestamp);
    }

    function renewVault(string memory _vaultId) external onlyVaultOwner(keccak256(bytes(_vaultId))) vaultExists(keccak256(bytes(_vaultId))) {
        bytes32 key = keccak256(bytes(_vaultId));
        Vault storage v = vaults[key];
        require(keccak256(bytes(v.vaultStatus)) == keccak256(bytes("ACTIVE")), "Vault not active");
        require(block.timestamp <= v.expiryTimestamp, "Vault already expired");

        uint256 renewalPeriod = v.expiryTimestamp - v.lastRenewalTimestamp;
        v.lastRenewalTimestamp = block.timestamp;
        v.expiryTimestamp = block.timestamp + renewalPeriod;

        emit VaultRenewed(key, v.expiryTimestamp);
    }

    function getVaultDetails(string memory _vaultId) external view vaultExists(keccak256(bytes(_vaultId))) returns (
        bytes32 vaultId,
        address owner,
        uint256 creationTimestamp,
        uint256 lastRenewalTimestamp,
        uint256 expiryTimestamp,
        uint256 totalShares,
        uint256 requiredShares,
        address recoveryRecipient,
        bool isActive
    ) {
        Vault storage v = vaults[keccak256(bytes(_vaultId))];
        return (
            v.vaultId,
            v.owner,
            v.creationTimestamp,
            v.lastRenewalTimestamp,
            v.expiryTimestamp,
            v.totalShares,
            v.requiredShares,
            v.recoveryRecipient,
            keccak256(bytes(v.vaultStatus)) == keccak256(bytes("ACTIVE"))
        );
    }

    function getVaultStatus(string memory _vaultId) external view vaultExists(keccak256(bytes(_vaultId))) returns (string memory) {
        return vaults[keccak256(bytes(_vaultId))].vaultStatus;
    }

    function checkExpiry(string memory _vaultId) external view vaultExists(keccak256(bytes(_vaultId))) returns (bool) {
        return block.timestamp > vaults[keccak256(bytes(_vaultId))].expiryTimestamp;
    }

    function activateRecovery(string memory _vaultId) external vaultExists(keccak256(bytes(_vaultId))) {
        bytes32 key = keccak256(bytes(_vaultId));
        Vault storage v = vaults[key];
        require(block.timestamp > v.expiryTimestamp, "Vault not yet expired");
        require(keccak256(bytes(v.vaultStatus)) == keccak256(bytes("ACTIVE")), "Vault not active");

        v.vaultStatus = "RECOVERY_MODE";
        v.recoveryStatus = "AWAITING_APPROVAL";
        emit RecoveryActivated(key, block.timestamp);
    }

    function authorizeRecovery(string memory _vaultId) external {
        bytes32 key = keccak256(bytes(_vaultId));
        Vault storage v = vaults[key];
        require(vaultCreated[key], "Vault does not exist");
        require(keccak256(bytes(v.vaultStatus)) == keccak256(bytes("RECOVERY_MODE")), "Not in recovery mode");

        v.recoveryStatus = "AUTHORIZED";
        emit RecoveryAuthorized(key, msg.sender, block.timestamp);
    }

    function getVaultCount() external view returns (uint256) {
        return vaultIds.length;
    }
}
