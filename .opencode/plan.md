# SQLite Database Migration Plan

## Goal
Replace the 7 in-memory arrays in `database.js` with persistent SQLite tables so data survives server restarts. Blockchain (`blockchain.json`) stays as-is — it already persists.

## Schema

| Table | Primary Key | Notable Columns | Notes |
|---|---|---|---|
| `users` | `id` (UUID) | `email` UNIQUE, `passwordHash`, `name`, `role`, `walletAddress`, `createdAt` | |
| `vaults` | `id` (VLT-XXXX) | `ownerId`, `totalShares`, `requiredShares`, `expiryTimestamp`, `status`, `lastRenewal`, `recoveryRecipient`, `createdAt` | |
| `vault_shares` | auto-increment | `vaultId` FK, `shareData` JSON, `shareIndex` | Split out from vaults to avoid storing huge JSON blob |
| `vault_crypto` | `vaultId` FK | `prime` INT, `chunkLengths` JSON, `encryptedSecret` TEXT | Separate table for Shamir params (sensitive, narrow access) |
| `guardians` | `id` (UUID) | `vaultId` FK, `userId`, `walletAddress`, `shareIndex`, `shareData` JSON, `hasSubmitted` BOOL | |
| `documents` | `id` (DOC-XXXX) | `documentName`, `documentHash`, `ownerId`, `timestamp`, `blockchainTransaction` | |
| `recoveries` | `id` (UUID) | `vaultId` FK, `status`, `requiredShares`, `submittedShares` JSON, `createdAt`, `completedAt` | |
| `supply_chain` | `assetId` | `name`, `description`, `status`, `history` JSON, `createdAt` | |
| `voting` | `id` (PROP-XXXX) | `title`, `description`, `options` JSON, `creatorId`, `vaultId`, `votes` JSON, `status`, `createdAt` | |

Arrays that are frequently read whole (shares, submittedShares, votes, history, options) stored as JSON text in their parent row — no junction tables needed for this scale.

## Files to Change

| File | Change |
|---|---|
| `package.json` | Add `better-sqlite3` dependency |
| `backend/config/environment.js` | Add `DB_PATH` |
| `backend/database/sqlite.js` | **NEW** — DatabaseService class wrapping better-sqlite3 |
| `backend/config/database.js` | Replace `db` object with DatabaseService singleton |
| `backend/controllers/authController.js` | `db.users.find/push` → `db.users.findByEmail/push` |
| `backend/controllers/vaultController.js` | `db.guardians.filter/find` → `db.guardians.findByVaultId/findById` |
| `backend/controllers/supplyChainController.js` | `db.supplyChain.find/push` → `db.supplyChain.findByAssetId/create` |
| `backend/controllers/votingController.js` | `db.voting.find/push` → `db.voting.findById/create` |
| `backend/services/vaultService.js` | `db.vaults.find/push` → `db.vaults.findById/create/update`; also fix dead-code `renewVault` bug (line 77) |
| `backend/services/recoveryService.js` | `db.recoveries.find` → `db.recoveries.findById/updateShares/updateStatus` |
| `backend/services/documentService.js` | `db.documents.find/push` → `db.documents.findById/create` |

## Implementation Steps

1. **`npm install better-sqlite3`** — add the native SQLite binding
2. **Add `DB_PATH`** to `environment.js` pointing to `backend/data/vault.db`
3. **Create `backend/database/sqlite.js`** — DatabaseService class:
   - Constructor opens SQLite, runs `CREATE TABLE IF NOT EXISTS` for all 9 tables
   - Provides methods per table: `push()`, `findByX()`, `filterByX()`, `update()` that map directly to the in-memory patterns
   - Nested arrays (votes, shares, history, options) read/written as `JSON.stringify`/`JSON.parse`
4. **Replace `backend/config/database.js`** — export the DatabaseService instance instead of the plain object
5. **Migrate each file** one-by-one, replacing `db.collection.find(...)` with the new method calls
6. **Fix `renewVault` dead-code bug** while touching vaultService.js
7. **Test**: start server, run Postman collection (all 24 requests), restart server, verify data persists

## Not Changed
- `Blockchain.js` / `blockchain.json` — already persists, no migration needed
- `Miner.js`, `shamirService.js`, `encryptionService.js` — pure logic, no DB access
