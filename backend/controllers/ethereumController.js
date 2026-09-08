import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initWeb3, getAccounts, getBalance } from "../ethereum/web3.js";
import env from "../config/environment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTRACT_FILES = ["SecretVault.sol", "Voting.sol", "SupplyChain.sol"];
const CONTRACT_PURPOSE = {
  "SecretVault.sol": "Vault ownership, expiry rules (Dead Man's Switch), and recovery rules",
  "Voting.sol": "Guardian voting for recovery approval",
  "SupplyChain.sol": "Asset tracking with valid state transitions",
};

async function getStatus() {
  const connection = await initWeb3();
  if (!connection.connected) {
    return {
      connected: false,
      simulation: env.simulationMode,
      deployed: false,
      network: env.GANACHE_URL,
      error: connection.error,
      contracts: CONTRACT_FILES.map((f) => ({
        file: f,
        purpose: CONTRACT_PURPOSE[f],
        sourcePath: path.join(__dirname, "..", "ethereum", "contracts", f),
      })),
    };
  }

  const accounts = connection.accounts;
  const balances = [];
  for (const a of accounts.slice(0, 5)) {
    balances.push({ address: a, balanceEth: await getBalance(a) });
  }

  return {
    connected: true,
    simulation: env.simulationMode,
    deployed: false,
    network: env.GANACHE_URL,
    chainId: connection.chainId,
    accountCount: accounts.length,
    accounts: balances,
    contracts: CONTRACT_FILES.map((f) => ({
      file: f,
      purpose: CONTRACT_PURPOSE[f],
      sourcePath: path.join(__dirname, "..", "ethereum", "contracts", f),
    })),
  };
}

export async function getEthereumStatus(req, res) {
  try {
    const status = await getStatus();
    return res.json(status);
  } catch (error) {
    return res.json({ connected: false, simulation: env.simulationMode, deployed: false, error: error.message, contracts: CONTRACT_FILES });
  }
}

export function getContractSource(req, res) {
  const { name } = req.params;
  const file = CONTRACT_FILES.find((f) => f.toLowerCase().replace(".sol", "") === name.toLowerCase());
  if (!file) return res.status(404).json({ error: `Contract '${name}' not found. Available: ${CONTRACT_FILES.join(", ")}` });

  const sourcePath = path.join(__dirname, "..", "ethereum", "contracts", file);
  const source = fs.readFileSync(sourcePath, "utf8");

  return res.json({
    file,
    purpose: CONTRACT_PURPOSE[file],
    language: "Solidity",
    lines: source.split("\n").length,
    source,
  });
}
