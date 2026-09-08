# Ephemeral Vault — Technical Audit & Architecture

## Current Architecture (as inspected)

- **Stack:** Node.js (ESM) + Express, `better-sqlite3` (WAL mode, `foreign_keys=ON`), `web3` v4 (Ganache connection), `solc` (compile-on-demand, unused), no auth middleware.
- **Frontend:** Vanilla HTML + CSS + ES modules (`shell.js` injects a sidebar layout). No framework.
- **Storage:**
  - SQLite `backend/data/vault.db`: users, vaults, vault_crypto, vault_shares, guardians, documents, recoveries, supply_chain, voting, notifications.
  - `backend/data/blockchain.json`: the entire Proof-of-Work chain (single local file).
- **Blockchain:** custom `Block`, `Blockchain`, `Miner`, `MerkleTree`, `Transaction`, `sha256`. Local single-node simulation, persisted to one JSON file.
- **Shamir:** `backend/services/shamirService.js` — true threshold scheme over GF(p), p = 2^31−1, secret hex-encoded and chunked into 7-hex pieces, one polynomial per chunk. Shares are `{x, y:[...]}`.
- **Encryption:** `AES-256-CBC` (Node crypto) with a single static key from `env.ENCRYPTION_KEY` (length 64 hex = 32 bytes → valid AES-256).
- **Ethereum:** Solidity contracts `SecretVault.sol`, `Voting.sol`, `SupplyChain.sol` exist in `backend/ethereum/contracts/` AND a duplicate `contracts/`. `web3.js` connects to Ganache and can query balances; `solc` present but **no compile/deploy** done. No live deployment; UI has no Ethereum page.
- **Hyperledger Fabric:** Pure in-process JS simulation: `Peer`, `Channel`, `Chaincode`, `Ledger` classes with fake MSP/org/peer config. No real Fabric.
- **Dead Man's Switch:** `ExpiryMonitor.js` polls every `EXPIRY_CHECK_INTERVAL_MS` (30s), flips `ACTIVE → RECOVERY_MODE`, creates a recovery, adds `VAULT_EXPIRED` + `RECOVERY_STARTED` txs, notifies guardians + recipient.
- **Voting:** Custom voting module (proposal → votes → counts) + records a transaction. Not a consensus algorithm; it's a replicate-module demo.

## Critical Problems Found

### Security
1. **CRITICAL — Plaintext secret & all shares stored at rest.** `vaultService.createVault` stores the AES-encrypted secret (`vault_crypto.encryptedSecret`) **and every Shamir share** (`vault_shares` rows AND `guardians.shareData`) in the same local DB. A DB compromise defeats Shamir entirely — an attacker holds all shares and the ciphertext.
2. **CRITICAL — Static, hardcoded AES key.** `ENCRYPTION_KEY` literal in `environment.js`. Anyone with the repo can decrypt every vault. Also AES-CBC has no authentication (no GCM/tag) → padding-oracle risk in principle; IV reuse risk if key reused.
3. **CRITICAL — Passwords hashed with bare SHA-256, unsalted.** `authController.js`. No KDF → trivially brute-forced; identical passwords → identical hashes. No auth middleware enforces tokens; "login" is cosmetic.
4. **HIGH — Guarding not real.** `getGuardianShare` returns a guardian's share to *anyone* who knows the UUIDs (no caller verification). `completeRecovery` only checks `userId` membership of a person, but there's no authentication to say the caller *is* that user.
5. **HIGH — Expiry by server clock only; no trust anchor.** Any API caller can `POST /api/vault/:id/recovery` (activate recovery) before expiry is rejected — but that's the only guard; whoever can call the API can recover a vault after expiry without any ownership proof.
6. **MEDIUM — Merkle root not committed into the block hash.** `Block.calculateHash()` hashes transactions but not `merkleRoot`; `isChainValid()` doesn't re-verify the Merkle root, and `verifyMerkle` is a trivial string equality that doesn't recompute the tree.
7. **MEDIUM — `isChainValid` doesn't verify difficulty (PoW) or the genesis.** It only checks hash == calculateHash and previousHash linkage.
8. **MEDIUM — Secret/share leakage via response.** Vault create returns guardian share indexes; notifications mail bodies include recovery/vault IDs (fine), but `GET /api/blockchain` dumps full transaction `data` (metadata only — OK), and the `vault_shares` table is unused but still stores shares.
9. **LOW — Missing `nodemailer` dep** (gracefully degrades) and `body-parser`/`uuid` are redundant but harmless.

### Shamir / cryptography
10. **HIGH — Threshold enforcement is theoretical.** Because the server keeps every share, "2-of-3 required" never actually prevents the server from reconstructing with 1 share. The *scheme* is correct, but the *deployment* negates it.
11. **MEDIUM — `requiredShares` min is 1** (controller allows `requiredShares>=1` but UI says >=2). Needs alignment.
12. **LOW — `modInverse` is O(n²) fine for demo; no issue.**

### Blockchain (as simulation)
13. **HIGH — Not decentralized.** Single JSON file, single actor. Must be labeled `Local Blockchain Simulation`, not "real" blockchain.
14. **MEDIUM — No mempool/consensus beyond PoW for a single node; "Vote" named "consensus" in UI wording.**
15. **LOW — Reward tx queued into pending after mining (never mined until next call directly), minor logic quirk.**

### Ethereum / Fabric
16. **HIGH — Misrepresented as integration.** Contracts exist but are never compiled/deployed; `ethereum/status` returns source files, not deployment. Must be labeled an *optional Ganache demonstration*.
17. **HIGH — Fabric is a JS simulation** with no real Fabric runtime. Must be labeled a simulation, and not claimed as live.
18. **LOW — Duplicate `contracts/` dir** — remove.

## UX/IA problems
- Sidebar mixes unrelated demo pages with core product at same depth.
- Dashboard shows blockchain metrics before security state; "Your vaults" only lists what you own.
- Create-vault form uses heavy cards, developer terms, no threshold visual.
- Recovery page is four tabs with empty space; no lifecycle visualization.
- Notifications are long paragraphs.
- Blockchain page dumps raw JSON; no separation of user view vs advanced view.
- Placeholder IDs (`DOC-XXXXXXXX`, `VLT-XXXXXXXX`, `actor-address`, `PROP-XXXXXXXX`) — replace with realistic demo values.

## What's actually implemented vs simulated
- **Real:** AES-256, authentic Shamir (correct math), PoW block mining, Merkle root, SHA-256, expiry monitor (Dead Man's Switch), threshold recovery math, voting logic, document hashing, local blockchain JSON persistence.
- **Simulated/Fake:** decentralized network (single node), Ethereum deployment (source-only, no on-chain action), Hyperledger (in-process classes), "consensus" voting (not a consensus algorithm), guardian identity/trust, DB isolation of shares.

## Storage on/off chain
- **ON-Chain (blockchain.json):** transaction metadata — vault id, actor id, type, timestamp, and structured `data` (e.g., `{expiryMinutes, guardianCount}`, `{requiredShares}`, `{documentHash}`, DPW attempts). No plaintext secret.
- **OFF-Chain (DB):** encrypted secret, (currently all) shares, users, etc.

## Decision
This audit is stored at `AUDIT.md`. Fixes to be applied next (Phase 3 → 10).