class Ledger {
  constructor(channelName) {
    this.channelName = channelName;
    this.blocks = [];
    this.state = {};
  }

  addBlock(block) {
    this.blocks.push({
      number: this.blocks.length,
      ...block,
      timestamp: Date.now(),
    });
    return block;
  }

  getState(key) {
    return this.state[key] || null;
  }

  setState(key, value) {
    this.state[key] = value;
    return { key, value };
  }

  deleteState(key) {
    const value = this.state[key];
    delete this.state[key];
    return { key, value };
  }

  getStateRange(startKey, endKey) {
    return Object.entries(this.state)
      .filter(([key]) => key >= startKey && key <= endKey)
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
  }

  getBlocks() {
    return this.blocks;
  }

  getStatus() {
    return {
      channelName: this.channelName,
      blockCount: this.blocks.length,
      stateCount: Object.keys(this.state).length,
    };
  }
}

export default Ledger;
