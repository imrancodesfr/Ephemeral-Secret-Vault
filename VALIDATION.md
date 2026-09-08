# Validation Checklist

Every rule below is enforced by the backend (never just the UI). Status reflects
the current code; `PASS` means covered by `tools/validation-test.mjs` (run with
`node tools/validation-test.mjs` against a running server).

## Authentication (`/api/auth`)
- [x] Register requires name, email, password
- [x] Name: 2–50 characters
- [x] Email: valid format, max 254 chars
- [x] Password: 8–64 chars, must include a letter, a number, and a special character
- [x] Role: only OWNER, GUARDIAN, RECIPIENT, ADMIN
- [x] Wallet address: optional, max 120 chars
- [x] No duplicate email
- [x] Login: unified "Invalid email or password" (no account probing)
- [x] Login: per-account exponential backoff (5s → 15m), 429 + Retry-After
- [x] Login/register: constant-time scrypt comparison and dummy-hash timing
- [x] `/me` returns only the signed-in user; `/users` is auth-only

## Vaults (`/api/vault`, auth required)
- [x] secret: required, non-empty string
- [x] totalShares: integer >= 2; requiredShares: integer >= 2
- [x] requiredShares <= totalShares
- [x] expiryMinutes: positive number (min 0.02)
- [x] guardians: must be array of exactly `totalShares` entries
- [x] Each guardian must be a registered account
- [x] Guardians must be distinct (no duplicates)
- [x] Vault owner cannot be their own guardian
- [x] recoveryRecipient must be a registered account (defaults to owner)
- [x] All views scoped to involvement (owner/guardian/recipient); others get 404
- [x] Guardian share lookup: only your own record (403 otherwise)

## Blockchain (`/api/blockchain`)
- [x] Ledger reads (chain/block/validate/merkle) are public read-only
- [x] `POST /transaction` requires auth
- [x] type: required, max 40 chars
- [x] vaultId: required, max 64 chars
- [x] data: must be a JSON object (not array/string/null)
- [x] actor: always the signed-in account (client-supplied value ignored)
- [x] Chain validates (PoW, hashes, merkle root) across restarts

## Mining (`/api/mining`)
- [x] `POST /mine` requires auth
- [x] difficulty: integer 1–8 when provided (prevents DoS mining)
- [x] minerAddress: optional, max 64 chars

## Recovery (auth required)
- [x] Only the owner can activate recovery
- [x] Shares delivered once (read = consumed), replays 400
- [x] Guardian can submit only their own commitment; threshold enforced
- [x] Only involved participants can complete; secret returned exactly once
- [x] Post-completion: vault_crypto destroyed, shares scrubbed, vault sealed

## Notifications (auth required)
- [x] recipientId from session always (URL value ignored)
- [x] Deliver-once share consumption
- [x] Admin-only, redacted, simulation-labeled outbox

## Supply Chain (auth required for writes + reads)
- [x] assetId: required, max 64 chars
- [x] name: required, max 120 chars; description: max 500 chars
- [x] Creator is always the signed-in account (ownerId/from/to ignored)
- [x] Transfer: only current custodian (403 otherwise)
- [x] Transfer: recipient must be a registered account (no free-typed names)
- [x] Transfer: cannot transfer to self
- [x] update: status must be in the allowed list; from/to must be registered
- [x] Assets scoped to involved accounts (creator + anyone in transfer history)

## Voting (auth required for writes)
- [x] title: required, max 120 chars; description max 1000 chars
- [x] options: 2–10 distinct strings, each 1–40 chars
- [x] vaultId (optional) must reference an existing vault
- [x] creator is always the signed-in account
- [x] vote: option must be a proposal option; one vote per account
- [x] Proposals list is public (governance demo); votes are session-bound

## Documents (auth required)
- [x] documentName: required, max 120 chars
- [x] documentContent: required, max 5,000,000 chars
- [x] owner is always the signed-in account
- [x] List/get/verify scoped to the owner (404 for others)

## Fabric (auth required for invoke)
- [x] `/invoke` requires auth; chaincode + function must exist
- [x] Simulation-only, honest labeling

## Cross-cutting
- [x] JSON body limit 10 MB
- [x] All party/identity fields derive from the server session, never client input