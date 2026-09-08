import crypto from "crypto";
import fabricNetwork from "../fabric/FabricNetwork.js";

export function getNetworkStatus(req, res) {
  return res.json({
    ...fabricNetwork.getStatus(),
    simulation: true,
    note: "Hyperledger Fabric is simulated in-process. No real ordering service, peers, or CAs exist — this mirrors Fabric concepts for demonstration.",
  });
}

export function getChaincodes(req, res) {
  return res.json({ chaincodes: fabricNetwork.getChaincodes() });
}

export function invokeChaincode(req, res) {
  const { chaincode, function: fn, args } = req.body;

  if (!chaincode || !fn) {
    return res.status(400).json({ error: "chaincode and function are required" });
  }

  // Mutations change the shared simulated ledger — admins only. Read-only
  // functions (readAsset/getAllAssets/getHistory) stay open to any signed-in user.
  const MUTATING = new Set(["createAsset", "updateAsset", "deleteAsset"]);
  if (MUTATING.has(fn) && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden: admin role required for this chaincode mutation" });
  }

  const cc = fabricNetwork.getChaincode(chaincode);
  if (!cc) return res.status(404).json({ error: `Chaincode '${chaincode}' not found` });

  try {
    let result;
    const payload = args || {};

    switch (fn) {
      case "createAsset": {
        const { assetId, ...data } = payload;
        if (!assetId) return res.status(400).json({ error: "assetId is required" });
        result = cc.createAsset(assetId, data);
        break;
      }
      case "readAsset": {
        result = cc.readAsset(payload.assetId);
        break;
      }
      case "updateAsset": {
        result = cc.updateAsset(payload.assetId, payload.updates || payload);
        break;
      }
      case "deleteAsset": {
        result = cc.deleteAsset(payload.assetId);
        break;
      }
      case "getAllAssets": {
        result = cc.getAllAssets();
        break;
      }
      case "getHistory": {
        result = cc.getHistory();
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown chaincode function '${fn}'` });
    }

    return res.json({ success: true, chaincode: cc.name, function: fn, result });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export function getChannelLedger(req, res) {
  const { channel: channelName } = req.params;
  const channel = fabricNetwork.getChannel(channelName);
  if (!channel) return res.status(404).json({ error: `Channel '${channelName}' not found` });
  const ledger = fabricNetwork.ledgers.find((l) => l.channelName === channelName);
  return res.json({ channel: channel.getStatus(), ledger: ledger ? ledger.getStatus() : null });
}
