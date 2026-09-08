// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    struct Proposal {
        uint256 id;
        string title;
        string description;
        address creator;
        uint256 createdAt;
        bool isActive;
        mapping(address => bool) hasVoted;
        mapping(string => uint256) voteCounts;
        string[] options;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    event ProposalCreated(uint256 id, string title, address creator, uint256 timestamp);
    event VoteCast(uint256 proposalId, address voter, string option, uint256 timestamp);
    event ProposalClosed(uint256 id, uint256 timestamp);

    function createProposal(
        string memory _title,
        string memory _description,
        string[] memory _options
    ) external {
        require(bytes(_title).length > 0, "Title required");
        require(_options.length >= 2, "At least 2 options required");

        proposalCount++;
        Proposal storage p = proposals[proposalCount];
        p.id = proposalCount;
        p.title = _title;
        p.description = _description;
        p.creator = msg.sender;
        p.createdAt = block.timestamp;
        p.isActive = true;
        p.options = _options;

        for (uint256 i = 0; i < _options.length; i++) {
            p.voteCounts[_options[i]] = 0;
        }

        emit ProposalCreated(proposalCount, _title, msg.sender, block.timestamp);
    }

    function vote(uint256 _proposalId, string memory _option) external {
        Proposal storage p = proposals[_proposalId];
        require(p.isActive, "Proposal not active");
        require(!p.hasVoted[msg.sender], "Already voted");

        bool validOption = false;
        for (uint256 i = 0; i < p.options.length; i++) {
            if (keccak256(bytes(p.options[i])) == keccak256(bytes(_option))) {
                validOption = true;
                break;
            }
        }
        require(validOption, "Invalid option");

        p.hasVoted[msg.sender] = true;
        p.voteCounts[_option] += 1;

        emit VoteCast(_proposalId, msg.sender, _option, block.timestamp);
    }

    function getVoteCount(uint256 _proposalId, string memory _option) external view returns (uint256) {
        return proposals[_proposalId].voteCounts[_option];
    }

    function isApproved(uint256 _proposalId) external view returns (bool) {
        Proposal storage p = proposals[_proposalId];
        uint256 maxVotes = 0;
        for (uint256 i = 0; i < p.options.length; i++) {
            uint256 count = p.voteCounts[p.options[i]];
            if (count > maxVotes) {
                maxVotes = count;
            }
        }
        return maxVotes > 0;
    }

    function getProposalDetails(uint256 _proposalId) external view returns (
        uint256 id,
        string memory title,
        string memory description,
        address creator,
        uint256 createdAt,
        bool isActive,
        string[] memory options
    ) {
        Proposal storage p = proposals[_proposalId];
        return (p.id, p.title, p.description, p.creator, p.createdAt, p.isActive, p.options);
    }

    function closeProposal(uint256 _proposalId) external {
        Proposal storage p = proposals[_proposalId];
        require(msg.sender == p.creator, "Only creator can close");
        p.isActive = false;
        emit ProposalClosed(_proposalId, block.timestamp);
    }
}
