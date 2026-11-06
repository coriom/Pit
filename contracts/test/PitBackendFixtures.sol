// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PitBackendTokenFixture {
    string public name = "PIT Backend Fixture";
    string public symbol = "PBF";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor() { balanceOf[msg.sender] = 1_000_000_000; emit Transfer(address(0), msg.sender, 1_000_000_000); }
    function transfer(address to, uint256 value) external returns (bool) { require(balanceOf[msg.sender] >= value); balanceOf[msg.sender] -= value; balanceOf[to] += value; emit Transfer(msg.sender, to, value); return true; }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) { require(allowance[from][msg.sender] >= value && balanceOf[from] >= value); allowance[from][msg.sender] -= value; balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value); return true; }
    function mint(address to, uint256 value) external { balanceOf[to] += value; emit Transfer(address(0), to, value); }
}

contract PitBackendControlFixture {
    address public owner;
    bool public paused;
    mapping(bytes32 => mapping(address => bool)) public roles;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event Paused(address account);
    event Unpaused(address account);
    constructor() { owner = msg.sender; emit OwnershipTransferred(address(0), msg.sender); }
    function transferOwnership(address next) external { require(msg.sender == owner); emit OwnershipTransferred(owner,next); owner=next; }
    function grantRole(bytes32 role, address account) external { require(msg.sender == owner); roles[role][account]=true; emit RoleGranted(role,account,msg.sender); }
    function revokeRole(bytes32 role, address account) external { require(msg.sender == owner); roles[role][account]=false; emit RoleRevoked(role,account,msg.sender); }
    function getRoleAdmin(bytes32) external pure returns (bytes32) { return bytes32(0); }
    function setPaused(bool value) external { require(msg.sender == owner); paused=value; if(value) emit Paused(msg.sender); else emit Unpaused(msg.sender); }
}

contract PitBackendNftFixture {
    string public tokenURIValue;
    string public uriValue;
    function setTokenURI(string calldata value) external { tokenURIValue=value; }
    function setURI(string calldata value) external { uriValue=value; }
    function tokenURI(uint256) external view returns (string memory) { require(bytes(tokenURIValue).length>0); return tokenURIValue; }
    function uri(uint256) external view returns (string memory) { return uriValue; }
}

contract PitBackendFeeTokenFixture {
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 value);
    constructor() { balanceOf[msg.sender] = 1_000_000_000; emit Transfer(address(0), msg.sender, 1_000_000_000); }
    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value);
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value * 9 / 10;
        emit Transfer(msg.sender, to, value); // deliberately misleading nonstandard event
        return true;
    }
}
