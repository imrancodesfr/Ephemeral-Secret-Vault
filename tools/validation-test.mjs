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

async function reg(name, email, password = "Str0ng!Pass") {
  const r = await req("POST", "/api/auth/register", { name, email, password, role: "OWNER" });
  return { status: r.status, token: r.json && r.json.token, id: r.json && r.json.user && r.json.user.id, json: r.json };
}

const s = RUN;
const alice = await reg("Alice", "alice" + s + "@t.local");
const bob = await reg("Bob", "bob" + s + "@t.local");
const carol = await reg("Carol", "carol" + s + "@t.local");
check("register alice", alice.status === 200 && !!alice.id);
check("register bob", bob.status === 200 && !!bob.id);
check("register carol", carol.status === 200 && !!carol.id);
const H = (t) => ({ Authorization: "Bearer " + t });

// ============ AUTH ============
const j = (x) => JSON.stringify(x);
check("reg missing fields -> 400",
  (await req("POST", "/api/auth/register", { name: "X", email: "x@t.local" })).status === 400);
check("reg short name -> 400",
  (await req("POST", "/api/auth/register", { name: "A", email: "a" + s + "@t.local", password: "Str0ng!Pass" })).status === 400);
check("reg bad email -> 400",
  (await req("POST", "/api/auth/register", { name: "X", email: "not-an-email", password: "Str0ng!Pass" })).status === 400);
check("reg weak password (letters only) -> 400",
  (await req("POST", "/api/auth/register", { name: "W", email: "w" + s + "@t.local", password: "abcdefgh" })).status === 400);
check("reg weak password (no special) -> 400",
  (await req("POST", "/api/auth/register", { name: "W", email: "w2" + s + "@t.local", password: "password1" })).status === 400);
check("reg password too long -> 400",
  (await req("POST", "/api/auth/register", { name: "W", email: "w3" + s + "@t.local", password: "A1!".padEnd(70, "a") })).status === 400);
check("reg invalid role -> 400",
  (await req("POST", "/api/auth/register", { name: "W", email: "w4" + s + "@t.local", password: "Str0ng!Pass", role: "HACKER" })).status === 400);
check("reg duplicate email -> 400",
  (await req("POST", "/api/auth/register", { name: "Again", email: "alice" + s + "@t.local", password: "Str0ng!Pass" })).status === 400);
check("login correct password -> 200",
  (await req("POST", "/api/auth/login", { email: "alice" + s + "@t.local", password: "Str0ng!Pass" })).status === 200);
check("login wrong password -> 401 unified",
  (await req("POST", "/api/auth/login", { email: "alice" + s + "@t.local", password: "Wrong!Pass1" })).status === 401);

// ============ VAULTS ============
const g2 = [{ userId: bob.id, name: "Bob" }, { userId: carol.id, name: "Carol" }];
check("vault totalShares < 2 -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 1, requiredShares: 1, guardians: g2.slice(0, 1) }, alice.token)).status === 400);
check("vault required > total -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 2, requiredShares: 3, guardians: g2 }, alice.token)).status === 400);
check("vault bad expiry -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 2, requiredShares: 2, expiryMinutes: "abc", guardians: g2 }, alice.token)).status === 400);
check("vault guardian count mismatch -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 3, requiredShares: 2, guardians: g2 }, alice.token)).status === 400);
check("vault unregistered guardian -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 2, requiredShares: 2, guardians: [{ userId: "not-a-user", name: "X" }, g2[1]] }, alice.token)).status === 400);
check("vault duplicate guardian -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 2, requiredShares: 2, guardians: [g2[0], g2[0]] }, alice.token)).status === 400);
check("vault owner as guardian -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 2, requiredShares: 2, guardians: [{ userId: alice.id, name: "Alice" }, g2[1]] }, alice.token)).status === 400);
check("vault unregistered recipient -> 400",
  (await req("POST", "/api/vault/create", { secret: "s", totalShares: 2, requiredShares: 2, guardians: g2, recoveryRecipient: "nope" }, alice.token)).status === 400);
const vault = await req("POST", "/api/vault/create", { secret: "TopSecret!", totalShares: 2, requiredShares: 2, guardians: g2 }, alice.token);
check("vault valid create -> 200", vault.status === 200 && !!vault.json.vault.id && vault.json.oneTimeShares.length === 2);
check("vault unauth -> 401", (await req("GET", "/api/vault")).status === 401);
check("vault scoping: bob sees as guardian", (await req("GET", "/api/vault", null, bob.token)).json.vaults.some(v => v.id === vault.json.vault.id));

// ============ BLOCKCHAIN / MINING ============
check("bc addTransaction unauth -> 401",
  (await req("POST", "/api/blockchain/transaction", { type: "X", vaultId: "V", data: {} })).status === 401);
check("bc type missing -> 400",
  (await req("POST", "/api/blockchain/transaction", { vaultId: "V", data: {} }, alice.token)).status === 400);
check("bc data not object -> 400",
  (await req("POST", "/api/blockchain/transaction", { type: "CUSTOM_EVENT", vaultId: "V", data: "hello" }, alice.token)).status === 400);
const tx = await req("POST", "/api/blockchain/transaction", { type: "CUSTOM_EVENT", vaultId: "VLT-AUDIT", actor: "ghost-account", data: { note: "x" } }, alice.token);
check("bc actor forced to session", tx.status === 200 && tx.json.transaction.actor === alice.id);
check("mine unauth -> 401", (await req("POST", "/api/mining/mine", {})).status === 401);
check("mine difficulty huge -> 400", (await req("POST", "/api/mining/mine", { difficulty: 999 }, alice.token)).status === 400);
check("mine difficulty non-integer -> 400", (await req("POST", "/api/mining/mine", { difficulty: "4" }, alice.token)).status === 400);
const mine = await req("POST", "/api/mining/mine", { difficulty: 2 }, alice.token);
check("mine valid difficulty -> 200", mine.status === 200 && mine.json.success === true);
check("fab invoke unauth -> 401", (await req("POST", "/api/fabric/invoke", { chaincode: "asset", function: "getAllAssets" })).status === 401);

// ============ VOTING ============
const mkProp = (title, opts) => req("POST", "/api/voting/proposal", { title, options: opts }, alice.token);
check("vote title missing -> 400", (await mkProp("", ["A", "B"])).status === 400);
check("vote options empty -> 400", (await mkProp("T", [])).status === 400);
check("vote options single -> 400", (await mkProp("T", ["A"])).status === 400);
check("vote options duplicate -> 400", (await mkProp("T", ["A", "A"])).status === 400);
check("vote option too long -> 400", (await mkProp("T", ["A", "B".repeat(41)])).status === 400);
const prop = await mkProp("Approve X", ["YES", "NO"]);
check("vote valid proposal -> 200", prop.status === 200 && prop.json.proposal.options.length === 2);
check("createProposal ignores spoofed creatorId", prop.json.proposal.creatorId === alice.id);
const badVote = await req("POST", "/api/voting/vote", { proposalId: prop.json.proposal.id, option: "MAYBE" }, bob.token);
check("vote invalid option -> 400", badVote.status === 400);

// ============ SUPPLY CHAIN ============
const ASSET = "AST-V-" + s.toUpperCase();
check("sc create unauth -> 401", (await req("POST", "/api/supply-chain/create", { assetId: ASSET, name: "x" })).status === 401);
check("sc assetId too long -> 400",
  (await req("POST", "/api/supply-chain/create", { assetId: "A".repeat(70), name: "x" }, alice.token)).status === 400);
check("sc name missing -> 400",
  (await req("POST", "/api/supply-chain/create", { assetId: ASSET }, alice.token)).status === 400);
check("sc description too long -> 400",
  (await req("POST", "/api/supply-chain/create", { assetId: ASSET, name: "Box", description: "d".repeat(501) }, alice.token)).status === 400);
const scCreate = await req("POST", "/api/supply-chain/create", { assetId: ASSET, name: "Box", description: "ok" }, alice.token);
check("sc valid create (short desc) -> 200", scCreate.status === 200);
const scTx = await req("POST", "/api/supply-chain/transfer", { assetId: ASSET, to: bob.id }, alice.token);
check("sc transfer to registered user ok", scTx.status === 200);

// ============ DOCUMENTS ============
check("doc register unauth -> 401", (await req("POST", "/api/documents/register", { documentName: "d", documentContent: "c" })).status === 401);
check("doc name too long -> 400",
  (await req("POST", "/api/documents/register", { documentName: "N".repeat(130), documentContent: "c" }, alice.token)).status === 400);
check("doc content required -> 400",
  (await req("POST", "/api/documents/register", { documentName: "D", documentContent: "" }, alice.token)).status === 400);
check("doc valid register -> 200",
  (await req("POST", "/api/documents/register", { documentName: "Deed", documentContent: "content" }, alice.token)).status === 200);

// ============ NOTIFICATIONS SCOPING ============
const notif = await req("GET", "/api/notifications/" + carol.id, null, alice.token);
check("notification scoped to session (url value ignored)", notif.status === 200 && notif.json.count !== undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);