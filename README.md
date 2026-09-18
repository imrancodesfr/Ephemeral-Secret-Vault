# Ephemeral Secret Sharing Vault

A blockchain-based system for securely storing and recovering sensitive information such as passwords, recovery codes, private keys, and confidential documents.

## Core Flow

```     
Secret → AES Encryption → Shamir Secret Sharing → Multiple Guardian Shares
  → Blockchain-controlled Vault → Owner Renewal → Expiry / Dead Man's Switch
  → Recovery Mode → Required Guardian Shares → Shamir Reconstruction
  → AES Decryption → Recovery Recipient
```

The original secret is **never** stored on the blockchain. Only vault metadata and rules (ownership, timestamps, expiry, threshold, recovery status) are stored on-chain.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js |
| API | Express.js |
| Custom Blockchain | JavaScript / Node.js |
| Hashing | SHA-256 |
| Merkle Tree | Custom JavaScript module |
| Consensus | Proof of Work |
| Ethereum | Ganache |
| Smart Contracts | Solidity |
| Blockchain Communication | Web3.js |
| Cryptography | AES |
| Secret Sharing | Shamir Secret Sharing |
| Persistence | SQLite (better-sqlite3) |
| Permissioned Blockchain | Hyperledger Fabric (simulated) |

## Persistence (SQLite)

All application data is stored in a **SQLite** database at `backend/data/vault.db`:

| Table | Purpose |
|---|---|
| `users` | Registered users (owners, guardians, recipients) |
| `vaults` | Vault metadata: ownership, expiry, threshold, status |
| `vault_crypto` | Shamir parameters + AES-encrypted secret (kept separate/narrow) |
| `vault_shares` | Shamir share parts |
| `guardians` | Guardian assignment + their share |
| `recoveries` | Recovery records + submitted shares |
| `notifications` | In-app expiry/notification log (Dead Man's Switch) |
| `documents` | Registered document hashes |
| `supply_chain` | Tracked assets + history |
| `voting` | Proposals + votes |

Data survives server restarts. To view/give a demo of the DB, open `backend/data/vault.db` with **DB Browser for SQLite** (free) or a VS Code SQLite extension.

## Architecture (maps to course requirements)

This project covers the required blockchain architecture layers:

| Requirement | Implementation |
|---|---|
| **Smart Contracts (Solidity)** | `contracts/` + `backend/ethereum/contracts/` contain `SecretVault.sol` (vault expiry + recovery rules), `Voting.sol` (guardian approval), `SupplyChain.sol` (asset state machine). Viewable via `GET /api/ethereum/contract/:name`. |
| **Chaincode (Hyperledger Fabric, JS)** | `backend/fabric/` is a working permissioned-network simulation: 3 organizations, 4 peers, 2 channels, 2 chaincode assets. Invoke via `POST /api/fabric/invoke`. |
| **Consensus & Security** | Custom **Proof-of-Work** blockchain (`backend/blockchain/`) with PoW mining, SHA-256 hashing, and Merkle-tree validation. `GET /api/blockchain/validate`. |
| **UI / API + Postman** | Node.js + Express REST API (`backend/`), HTML/JS frontend (`frontend/`), and a Postman collection in `postman/`. |
| **Ethereum (Web3.js)** | `backend/ethereum/web3.js` wraps the Web3.js provider for Ganache; status available at `GET /api/ethereum/status`. |

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm
- (Optional) Ganache for Ethereum smart contract layer
- (Optional) MetaMask browser extension

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start
# or for development with auto-reload
npm run dev
```

The server runs on `http://localhost:3000`.

### Quick Test

```bash
# Health check
curl http://localhost:3000/api/health

# Validate blockchain
curl http://localhost:3000/api/blockchain/validate
```

### Tests (with the server running)

```bash
node tools/validation-test.mjs      # 52 API validation tests
node tools/e2e-recovery-test.mjs    # 27 recovery-regression tests
```

A full verification checklist (including the 4 blockchain-integrity checks) lives in [`VALIDATION.md`](VALIDATION.md).

## Project Structure

```
ephemeral-secret-vault/
├── backend/
│   ├── server.js         # Entry point (starts the Expiry Monitor + HTTP server)
│   ├── app.js            # Express app (wires all route groups)
│   ├── config/           # Configuration (environment, database singleton)
│   ├── database/         # SQLite DatabaseService wrapper
│   ├── routes/           # Express routes (auth, vault, recovery, notifications,
│   │                     #   expiry, fabric, ethereum, blockchain, mining, ...)
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic (AES, Shamir, notificationService, ...)
│   ├── blockchain/       # Custom blockchain (Block, Merkle, Miner, PoW, ExpiryMonitor)
│   ├── ethereum/         # Web3.js client + Solidity contracts
│   ├── fabric/           # Hyperledger Fabric simulation (orgs, peers, channels, chaincode)
│   └── data/             # SQLite db (vault.db) + local ledger (blockchain.json)
├── frontend/             # HTML/CSS/JS UI (dashboard, create-vault, recovery,
│                         #   notifications, blockchain, voting, documents, supply-chain)
├── contracts/            # Solidity smart contracts (mirror of backend/ethereum/contracts)
├── postman/              # Postman collection
└── docs/                 # Documentation
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a user
- `POST /api/auth/login` - Login

### Vault
- `POST /api/vault/create` - Create a vault
- `GET /api/vault/:id` - Get vault details
- `POST /api/vault/:id/renew` - Renew vault (Dead Man's Switch reset)
- `GET /api/vault/:id/status` - Get vault status
- `POST /api/vault/:id/recovery` - Activate recovery mode

### Recovery
- `POST /api/recovery/share` - Submit a guardian share
- `GET /api/recovery/:id/status` - Check recovery status
- `POST /api/recovery/:id/complete` - Complete recovery
- `GET /api/recovery/user/:userId` - List recoveries where this user is a guardian or recipient

### Notifications (Dead Man's Switch)
- `GET /api/notifications/:recipientId` - List all notifications for a user
- `GET /api/notifications/:recipientId/unread` - List unread notifications
- `POST /api/notifications/:id/:recipientId/read` - Mark a notification as read
- `POST /api/notifications/:recipientId/read-all` - Mark all notifications as read
- `GET /api/notifications/simulated-emails/outbox` - View simulated email log

### Expiry Monitor
- `GET /api/expiry/status` - Check the background expiry monitor status
- `POST /api/expiry/check` - Run an expiry check immediately

### Hyperledger Fabric (permissioned blockchain simulation)
- `GET /api/fabric/status` - Network status (peers, channels, chaincodes, ledgers)
- `GET /api/fabric/chaincodes` - List deployed chaincodes + asset counts
- `POST /api/fabric/invoke` - Invoke chaincode functions (createAsset, readAsset, updateAsset, getAllAssets, getHistory)
- `GET /api/fabric/channel/:channel` - Channel + ledger status

### Ethereum (Web3.js / Solidity)
- `GET /api/ethereum/status` - Ganache connection status, accounts, balances, and deployed contracts
- `GET /api/ethereum/contract/:name` - Fetch a Solidity contract source (`secretvault`, `voting`, `supplychain`)

### Custom Blockchain
- `GET /api/blockchain` - View full chain
- `GET /api/blockchain/block/:index` - View a block
- `POST /api/blockchain/transaction` - Add a transaction
- `GET /api/blockchain/validate` - Validate chain integrity
- `GET /api/blockchain/block/:index/merkle` - View Merkle root

### Mining (Proof of Work)
- `POST /api/mining/mine` - Mine pending transactions
- `GET /api/mining/status` - Mining/chain status

### Documents
- `POST /api/documents/register` - Register a document
- `POST /api/documents/verify` - Verify document integrity
- `GET /api/documents/:id` - Get document

### Supply Chain
- `POST /api/supply-chain/create` - Create asset
- `POST /api/supply-chain/transfer` - Transfer asset
- `POST /api/supply-chain/update` - Update status
- `GET /api/supply-chain/:id/history` - View history

### Voting
- `POST /api/voting/proposal` - Create proposal
- `POST /api/voting/vote` - Cast vote
- `GET /api/voting/:id` - View proposal
- `GET /api/voting/:id/result` - View results

## Demonstration Scenario (2-of-3 Vault)

1. **Register** - Create Owner, 3 Guardians, Recovery Recipient
2. **Create Vault** - `POST /api/vault/create` with secret, 3 shares, threshold 2, e.g. 2 min expiry
3. **Encrypt** - Secret is AES encrypted
4. **Split** - Encrypted secret split via Shamir into 3 shares
5. **Custom Blockchain** - `VAULT_CREATED` transaction added
6. **Mine** - `POST /api/mining/mine` (PoW)
7. **Renew** - `POST /api/vault/:id/renew` resets expiry
8. **Stop renewing (Dead Man's Switch)** - The background **Expiry Monitor** (`/api/expiry/check`) detects the `ACTIVE` vault past its expiry
9. **Auto-recovery** - The monitor automatically flips the vault to `RECOVERY_MODE` and creates a recovery record
10. **Notify** - All guardians and the recovery recipient are notified (in-app + simulated email, and real SMTP if configured)
11. **Submit Shares** - 2 of 3 guardians submit shares
12. **Reconstruct** - Shamir reconstruction of encrypted secret
13. **Decrypt** - AES decryption returns original secret
14. **Recipient** - Only the authenticated recipient/guardian completes recovery, and the secret is delivered to the recovery recipient

> The original secret is never stored on-chain. When the owner is unresponsive or unavailable, the Dead Man's Switch lets guardians and the recovery recipient reconstruct the secret after the expiry period.

## Postman

Import `postman/EphemeralVault.postman_collection.json` into Postman. The collection contains all 21 API calls in the recommended demonstration order.

## Smart Contracts

- `SecretVault.sol` - Vault ownership, expiry rules, recovery rules
- `Voting.sol` - Guardian voting for recovery approval
- `SupplyChain.sol` - Asset tracking with valid state transitions

### Ethereum / Hyperledger Fabric layers

These layers are included to demonstrate blockchain interoperability, but the **core vault flow is self-contained** and does not require them to run:

- **Ethereum (Web3.js + Solidity):** `GET /api/ethereum/status` reports the Ganache connection (gracefully `connected:false` if Ganache is not running) and lists the Solidity contracts. `GET /api/ethereum/contract/:name` returns contract source. To run the on-chain path, start Ganache: `npm i -g ganache` then `ganache --host 127.0.0.1 --port 7545 --chain.chainId 1337 --wallet.totalAccounts 5 --wallet.defaultBalance 1000 --wallet.deterministic`.
- **Hyperledger Fabric (simulation):** `GET /api/fabric/status` shows the permissioned network (3 orgs, 4 peers, 2 channels, 2 chaincodes). `POST /api/fabric/invoke` runs chaincode operations such as `createAsset`, `readAsset`, `updateAsset`, and `getAllAssets`. This simulation runs fully in-process and needs no external Fabric binaries.

## Security Rules

1. Never store the plaintext secret on Ethereum
2. Never put the plaintext secret into the custom blockchain
3. Never put the plaintext secret into public API responses
4. Encrypt the secret before secret sharing
5. Keep guardian shares separate
6. Require the configured threshold
7. Validate vault owner before renewal
8. Validate guardian authorization before accepting a recovery share
9. Only the recovery recipient, a guardian, or the owner may complete recovery
10. Hash documents rather than publishing confidential contents

## Known Limitations (honest notes for review)

- Auth and session identity: an HS256 JWT `requireAuth` middleware (`backend/middleware/auth.js`) guards the vault, recovery, blockchain, mining, notifications, documents, supply-chain, voting, expiry and fabric routes. Identity is taken from the verified token, never from client-supplied `ownerId`/`from`/`actor` fields. Tests that cover this are under `tools/`.
- The Ethereum contracts compile, but the live demo drives the custom blockchain + Fabric simulation so the project runs anywhere without external services. Ganache is optional.
- Secret recovery reconstructs the plaintext for the authorized recipient by design — the plaintext is never stored, only transiently returned at the moment of authorized recovery.

## License

College project prototype.
