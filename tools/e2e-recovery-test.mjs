const BASE = "http://127.0.0.1:3000";
const RUN = Date.now().toString(36);

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  | " + extra : "")); }
}

async function req(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

async function reg(name, email, role = "OWNER", password = "Str0ng!Pass") {
  const r = await req("POST", "/api/auth/register", { name, email, password, role });
  return { status: r.status, token: r.json && r.json.token, id: r.json && r.json.user && r.json.user.id, json: r.json };
}

console.log("Starting End-to-End Recovery Flow Test...");

// 1. Register users
const owner = await reg("Alice Owner", "owner_" + RUN + "@test.com", "OWNER");
const recipient = await reg("Darshan Recipient", "rec_" + RUN + "@test.com", "RECIPIENT");
const g1 = await reg("Bob Guardian", "bob_" + RUN + "@test.com", "GUARDIAN");
const g2 = await reg("Carol Guardian", "carol_" + RUN + "@test.com", "GUARDIAN");

check("Registered Owner, Recipient, and 2 Guardians", !!owner.id && !!recipient.id && !!g1.id && !!g2.id);

// 2. Test renew aliases on a dummy vault first
const dummyVault = await req("POST", "/api/vault/create", {
  secret: "DummySecret",
  totalShares: 2,
  requiredShares: 2,
  expiryMinutes: 10,
  guardians: [{ userId: g1.id }, { userId: g2.id }],
  recoveryRecipient: recipient.id
}, owner.token);

const dummyId = dummyVault.json.vault.id;
const renew1 = await req("POST", `/api/vault/${dummyId}/renew`, {}, owner.token);
check("POST /api/vault/:id/renew works", renew1.status === 200 && renew1.json.success === true);

const renew2 = await req("POST", `/api/vault/renew/${dummyId}`, {}, owner.token);
check("POST /api/vault/renew/:id alias works", renew2.status === 200 && renew2.json.success === true);

// 3. Now create the target vault with 0.05 min (3 sec) expiry
const secretText = "SuperSecretBitcoinWalletSeedPhrase12345!";
const guardians = [{ userId: g1.id }, { userId: g2.id }];

const createRes = await req("POST", "/api/vault/create", {
  secret: secretText,
  totalShares: 2,
  requiredShares: 2,
  expiryMinutes: 0.05,
  guardians,
  recoveryRecipient: recipient.id
}, owner.token);

check("Vault created successfully", createRes.status === 200 && !!createRes.json.vault.id);
const vaultId = createRes.json.vault.id;
const shares = createRes.json.oneTimeShares;
check("2 guardian shares generated", shares && shares.length === 2);

// 4. Check visibility for all stakeholders
const ownerVaults = await req("GET", "/api/vault", null, owner.token);
const recipientVaults = await req("GET", "/api/vault", null, recipient.token);
const g1Vaults = await req("GET", "/api/vault", null, g1.token);
const g2Vaults = await req("GET", "/api/vault", null, g2.token);

check("Owner sees vault", ownerVaults.json.vaults.some(v => v.id === vaultId));
check("Recovery Recipient sees vault", recipientVaults.json.vaults.some(v => v.id === vaultId));
check("Guardian 1 sees vault", g1Vaults.json.vaults.some(v => v.id === vaultId));
check("Guardian 2 sees vault", g2Vaults.json.vaults.some(v => v.id === vaultId));

// 5. Wait 3.5 seconds for vault to expire
console.log("Waiting 3.5s for vault dead man's switch expiry...");
await new Promise(r => setTimeout(r, 3500));

// 6. Recipient activates recovery (Dead Man's Switch trigger)
const recActRes = await req("POST", `/api/vault/${vaultId}/recovery`, {}, recipient.token);
check("Recipient can activate recovery once expired", recActRes.status === 200 && (recActRes.json.success === true || !!recActRes.json.recovery), JSON.stringify(recActRes.json));

const recoveryId = (recActRes.json.recovery && recActRes.json.recovery.id) || recActRes.json.recoveryId;
check("Valid recoveryId obtained", !!recoveryId);

// Test idempotent re-activation:
const recActAgain = await req("POST", `/api/vault/${vaultId}/recovery`, {}, recipient.token);
check("Idempotent re-activation returns success with alreadyActive", recActAgain.status === 200 && recActAgain.json.alreadyActive === true);

// 7. Check recovery list for recipient and guardians
const recListRecipient = await req("GET", "/api/recovery/user/" + recipient.id, null, recipient.token);
const recListG1 = await req("GET", "/api/recovery/user/" + g1.id, null, g1.token);

check("Recipient sees recovery", recListRecipient.json.recoveries.some(r => r.id === recoveryId));
check("Guardian sees recovery", recListG1.json.recoveries.some(r => r.id === recoveryId));

// 8. Guardian 1 submits share
const sub1 = await req("POST", "/api/recovery/share", {
  recoveryId,
  shareData: shares[0]
}, g1.token);
check("Guardian 1 share accepted", sub1.status === 200 && sub1.json.submittedCount === 1);

// 9. Guardian 2 submits share
const sub2 = await req("POST", "/api/recovery/share", {
  recoveryId,
  shareData: shares[1]
}, g2.token);
check("Guardian 2 share accepted (all shares ready)", sub2.status === 200 && sub2.json.allSharesReady === true);

// 10. Recipient completes recovery and gets decrypted secret
const compRes = await req("POST", `/api/recovery/${recoveryId}/complete`, {}, recipient.token);
check("Recovery completed successfully", compRes.status === 200 && compRes.json.success === true);
check("Secret matches original plaintext", compRes.json.secret === secretText, `Got: ${compRes.json.secret}`);

// 11. Verify vault is now permanently sealed and cannot be recovered again
const compAgain = await req("POST", `/api/recovery/${recoveryId}/complete`, {}, recipient.token);
check("Permanent seal prevents double recovery", compAgain.status === 400);

console.log(`\nEnd-to-End Recovery Tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
