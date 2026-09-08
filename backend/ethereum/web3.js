import Web3 from "web3";
import env from "../config/environment.js";

let web3;
let accounts = [];

export async function initWeb3() {
  try {
    web3 = new Web3(env.GANACHE_URL);
    accounts = await web3.eth.getAccounts();
    return { connected: true, accounts, chainId: await web3.eth.getChainId() };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

export function getWeb3() {
  return web3;
}

export function getAccounts() {
  return accounts;
}

export async function getBalance(address) {
  if (!web3) return null;
  const balance = await web3.eth.getBalance(address);
  return web3.utils.fromWei(balance, "ether");
}

export async function sendTransaction({ from, to, value, gas = 21000 }) {
  if (!web3) throw new Error("Web3 not initialized");
  const tx = await web3.eth.sendTransaction({
    from,
    to,
    value: web3.utils.toWei(value.toString(), "ether"),
    gas,
  });
  return {
    transactionHash: tx.transactionHash,
    blockNumber: tx.blockNumber,
    gasUsed: tx.gasUsed,
    status: tx.status,
  };
}

export async function deployContract(abi, bytecode, args = [], from) {
  if (!web3) throw new Error("Web3 not initialized");
  const contract = new web3.eth.Contract(abi);
  // web3 v4: capture the receipt via the 'receipt' event during deployment
  let capturedReceipt = null;
  const deployTx = contract.deploy({ data: bytecode, arguments: args });
  const sendPromise = deployTx.send({ from, gas: 6000000 });
  sendPromise.on("receipt", (receipt) => { capturedReceipt = receipt; });
  const deployed = await sendPromise;
  return {
    address: deployed.options.address,
    transactionHash: capturedReceipt?.transactionHash ?? null,
    blockNumber: capturedReceipt?.blockNumber ?? null,
    gasUsed: capturedReceipt?.gasUsed ?? null,
    status: capturedReceipt?.status ?? 1,
  };
}

export async function getTransactionReceipt(txHash) {
  if (!web3) return null;
  return await web3.eth.getTransactionReceipt(txHash);
}

export function toWei(amount) {
  return web3.utils.toWei(amount.toString(), "ether");
}

export function fromWei(amount) {
  return web3.utils.fromWei(amount.toString(), "ether");
}
