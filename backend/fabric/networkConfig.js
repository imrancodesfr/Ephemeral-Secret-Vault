const networkConfig = {
  name: "ephemeral-vault-fabric",
  version: "1.0",
  organizations: [
    {
      name: "UniversityOrg",
      mspId: "UniversityOrgMSP",
      peers: ["peer0.university.example.com", "peer1.university.example.com"],
    },
    {
      name: "HospitalOrg",
      mspId: "HospitalOrgMSP",
      peers: ["peer0.hospital.example.com"],
    },
    {
      name: "BankOrg",
      mspId: "BankOrgMSP",
      peers: ["peer0.bank.example.com"],
    },
  ],
  channels: [
    {
      name: "document-custody",
      organizations: ["UniversityOrg", "HospitalOrg"],
    },
    {
      name: "supply-chain",
      organizations: ["UniversityOrg", "BankOrg"],
    },
  ],
  chaincodes: [
    {
      name: "document-custody-cc",
      version: "1.0",
      channel: "document-custody",
      language: "javascript",
    },
    {
      name: "supply-chain-cc",
      version: "1.0",
      channel: "supply-chain",
      language: "javascript",
    },
  ],
};

export default networkConfig;
