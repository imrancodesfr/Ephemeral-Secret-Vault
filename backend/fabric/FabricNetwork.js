import Peer from "./peers/Peer.js";
import Channel from "./channels/Channel.js";
import Chaincode from "./chaincode/Chaincode.js";
import Ledger from "./ledger/Ledger.js";
import networkConfig from "./networkConfig.js";

class FabricNetwork {
  constructor() {
    this.peers = [];
    this.channels = [];
    this.chaincodes = [];
    this.ledgers = [];
    this.init();
  }

  init() {
    networkConfig.organizations.forEach((org) => {
      org.peers.forEach((peerName) => {
        const peer = new Peer({
          name: peerName,
          organization: org.name,
          url: `grpcs://${peerName}:7051`,
        });
        peer.connect();
        this.peers.push(peer);
      });
    });

    networkConfig.channels.forEach((chConfig) => {
      const channel = new Channel({
        name: chConfig.name,
        organizations: chConfig.organizations,
      });
      const orgPeers = this.peers.filter((p) =>
        chConfig.organizations.includes(p.organization)
      );
      orgPeers.forEach((p) => channel.addPeer(p));
      this.channels.push(channel);

      const ledger = new Ledger(chConfig.name);
      this.ledgers.push(ledger);
    });

    networkConfig.chaincodes.forEach((ccConfig) => {
      const channel = this.channels.find((c) => c.name === ccConfig.channel);
      const chaincode = new Chaincode({
        name: ccConfig.name,
        version: ccConfig.version,
        channel: ccConfig.channel,
      });
      this.chaincodes.push(chaincode);
    });
  }

  getPeers() {
    return this.peers.map((p) => p.getStatus());
  }

  getChannels() {
    return this.channels.map((c) => c.getStatus());
  }

  getChaincodes() {
    return this.chaincodes.map((cc) => cc.getStatus());
  }

  getLedgers() {
    return this.ledgers.map((l) => l.getStatus());
  }

  getChaincode(name) {
    return this.chaincodes.find((cc) => cc.name === name);
  }

  getChannel(name) {
    return this.channels.find((c) => c.name === name);
  }

  getStatus() {
    return {
      networkName: networkConfig.name,
      version: networkConfig.version,
      peerCount: this.peers.length,
      channelCount: this.channels.length,
      chaincodeCount: this.chaincodes.length,
      ledgerCount: this.ledgers.length,
      peers: this.getPeers(),
      channels: this.getChannels(),
      chaincodes: this.getChaincodes(),
    };
  }
}

const fabricNetwork = new FabricNetwork();
export default fabricNetwork;
