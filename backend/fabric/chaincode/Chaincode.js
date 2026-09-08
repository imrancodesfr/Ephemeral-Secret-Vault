import crypto from "crypto";

class Chaincode {
  constructor({ name, version, channel }) {
    this.name = name;
    this.version = version;
    this.channel = channel;
    this.state = {};
    this.history = [];
  }

  createAsset(assetId, data) {
    if (this.state[assetId]) throw new Error("Asset already exists");
    const asset = {
      id: assetId,
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.state[assetId] = asset;
    this.history.push({
      transactionId: crypto.randomUUID(),
      function: "createAsset",
      assetId,
      timestamp: Date.now(),
    });
    return asset;
  }

  readAsset(assetId) {
    const asset = this.state[assetId];
    if (!asset) throw new Error("Asset not found");
    return asset;
  }

  updateAsset(assetId, updates) {
    if (!this.state[assetId]) throw new Error("Asset not found");
    this.state[assetId] = { ...this.state[assetId], ...updates, updatedAt: Date.now() };
    this.history.push({
      transactionId: crypto.randomUUID(),
      function: "updateAsset",
      assetId,
      timestamp: Date.now(),
    });
    return this.state[assetId];
  }

  deleteAsset(assetId) {
    if (!this.state[assetId]) throw new Error("Asset not found");
    const deleted = this.state[assetId];
    delete this.state[assetId];
    this.history.push({
      transactionId: crypto.randomUUID(),
      function: "deleteAsset",
      assetId,
      timestamp: Date.now(),
    });
    return deleted;
  }

  getAllAssets() {
    return Object.values(this.state);
  }

  getHistory() {
    return this.history;
  }

  getStatus() {
    return {
      name: this.name,
      version: this.version,
      channel: this.channel,
      assetCount: Object.keys(this.state).length,
      transactionCount: this.history.length,
    };
  }
}

export default Chaincode;
