// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PitNativeMultiSender} from "../src/PitNativeMultiSender.sol";
import {PitNftCollection, PitNftBatchSender} from "../src/PitNfts.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface Vm5 {
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function assume(bool) external;
}

contract RejectEther {
    receive() external payable {
        revert("reject");
    }
}

contract RejectNft {}

contract ReenterNative {
    PitNativeMultiSender public immutable sender;
    bool public blocked;

    constructor(PitNativeMultiSender sender_) {
        sender = sender_;
    }

    receive() external payable {
        address payable[] memory recipients = new address payable[](1);
        recipients[0] = payable(address(0xB0B));
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;
        try sender.send{value: 1}(recipients, amounts) {}
        catch {
            blocked = true;
        }
    }
}

contract PitPhase5Test is IERC721Receiver {
    Vm5 constant vm = Vm5(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CAROL = address(0xCA401);

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    function testNativeBatchConservesAndLeavesNoCustody() public {
        PitNativeMultiSender sender = new PitNativeMultiSender();
        vm.deal(address(this), 10 ether);
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = payable(ALICE);
        recipients[1] = payable(BOB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2 ether;
        amounts[1] = 3 ether;
        require(sender.send{value: 5 ether}(recipients, amounts) == 5 ether);
        require(ALICE.balance == 2 ether && BOB.balance == 3 ether && address(sender).balance == 0);
    }

    function testNativeHundredRecipientBoundary() public {
        PitNativeMultiSender sender = new PitNativeMultiSender();
        vm.deal(address(this), 101);
        address payable[] memory recipients = new address payable[](100);
        uint256[] memory amounts = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            recipients[i] = payable(address(uint160(10_000 + i)));
            amounts[i] = 1;
        }
        sender.send{value: 100}(recipients, amounts);
        for (uint256 i; i < 100; ++i) {
            require(recipients[i].balance == 1);
        }
        require(address(sender).balance == 0);
        address payable[] memory tooMany = new address payable[](101);
        uint256[] memory tooManyAmounts = new uint256[](101);
        vm.expectRevert();
        sender.send(tooMany, tooManyAmounts);
    }

    function testNativeBatchAtomicOnRevertingRecipientAndBadTotals() public {
        PitNativeMultiSender sender = new PitNativeMultiSender();
        RejectEther reject = new RejectEther();
        vm.deal(address(this), 10 ether);
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = payable(ALICE);
        recipients[1] = payable(address(reject));
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;
        vm.expectRevert();
        sender.send{value: 2 ether}(recipients, amounts);
        require(ALICE.balance == 0 && address(sender).balance == 0);
        vm.expectRevert();
        sender.send{value: 1 ether}(recipients, amounts);
        recipients[1] = payable(ALICE);
        vm.expectRevert();
        sender.send{value: 2 ether}(recipients, amounts);
        recipients[1] = payable(BOB);
        amounts[1] = 0;
        vm.expectRevert();
        sender.send{value: 1 ether}(recipients, amounts);
    }

    function testFuzzNativeConservation(uint96 a, uint96 b) public {
        vm.assume(a > 0 && b > 0);
        PitNativeMultiSender sender = new PitNativeMultiSender();
        uint256 total = uint256(a) + b;
        vm.deal(address(this), total);
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = payable(ALICE);
        recipients[1] = payable(BOB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = a;
        amounts[1] = b;
        sender.send{value: total}(recipients, amounts);
        require(ALICE.balance == a && BOB.balance == b && address(sender).balance == 0);
    }

    function testNativeRecipientCallbackCannotReenter() public {
        PitNativeMultiSender sender = new PitNativeMultiSender();
        ReenterNative receiver = new ReenterNative(sender);
        vm.deal(address(this), 2);
        address payable[] memory recipients = new address payable[](1);
        recipients[0] = payable(address(receiver));
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2;
        sender.send{value: 2}(recipients, amounts);
        require(
            receiver.blocked() && address(sender).balance == 0 && address(receiver).balance == 2
        );
    }

    function testFuzzNativeMismatchedValueRollsBack(uint96 a, uint96 b) public {
        vm.assume(a > 0 && b > 0);
        PitNativeMultiSender sender = new PitNativeMultiSender();
        vm.deal(address(this), uint256(a) + b);
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = payable(ALICE);
        recipients[1] = payable(BOB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = a;
        amounts[1] = b;
        vm.expectRevert();
        sender.send{value: a}(recipients, amounts);
        require(ALICE.balance == 0 && BOB.balance == 0 && address(sender).balance == 0);
    }

    function testNftMintCapOwnerAndUri() public {
        PitNftCollection nft = new PitNftCollection("PIT Art", "PA", address(this), 2);
        require(nft.mint(ALICE, "ipfs://one") == 1);
        require(nft.mint(BOB, "https://example.test/two.json") == 2);
        require(nft.ownerOf(1) == ALICE && nft.ownerOf(2) == BOB);
        require(keccak256(bytes(nft.tokenURI(1))) == keccak256(bytes("ipfs://one")));
        vm.expectRevert();
        nft.mint(CAROL, "ipfs://three");
        vm.prank(ALICE);
        vm.expectRevert();
        nft.mint(ALICE, "ipfs://unauthorized");
        require(nft.nextTokenId() == 3);
    }

    function testFuzzNftSupplyCap(uint8 rawCap) public {
        uint256 cap = uint256(rawCap % 8) + 1;
        PitNftCollection nft = new PitNftCollection("PIT Art", "PA", address(this), cap);
        for (uint256 i; i < cap; ++i) {
            require(nft.mint(ALICE, "ipfs://fixed") == i + 1);
            require(nft.ownerOf(i + 1) == ALICE);
        }
        vm.expectRevert();
        nft.mint(ALICE, "ipfs://overflow");
        require(nft.nextTokenId() == cap + 1);
    }

    function testNftBatchExactApprovalsAtomicityAndOwnerChecks() public {
        PitNftCollection nft = new PitNftCollection("PIT Art", "PA", address(this), 3);
        PitNftBatchSender sender = new PitNftBatchSender();
        nft.mint(address(this), "ipfs://one");
        nft.mint(address(this), "ipfs://two");
        nft.approve(address(sender), 1);
        nft.approve(address(sender), 2);
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        address[] memory recipients = new address[](2);
        recipients[0] = ALICE;
        recipients[1] = BOB;
        vm.prank(CAROL);
        vm.expectRevert();
        sender.send(nft, ids, recipients);
        recipients[1] = address(new RejectNft());
        vm.expectRevert();
        sender.send(nft, ids, recipients);
        require(nft.ownerOf(1) == address(this) && nft.ownerOf(2) == address(this));
        recipients[1] = BOB;
        sender.send(nft, ids, recipients);
        require(nft.ownerOf(1) == ALICE && nft.ownerOf(2) == BOB);
    }

    function testNftBatchRejectsMissingApprovalDuplicateAndZeroRecipient() public {
        PitNftCollection nft = new PitNftCollection("PIT Art", "PA", address(this), 2);
        PitNftBatchSender sender = new PitNftBatchSender();
        nft.mint(address(this), "ipfs://one");
        nft.mint(address(this), "ipfs://two");
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        address[] memory recipients = new address[](2);
        recipients[0] = ALICE;
        recipients[1] = BOB;
        vm.expectRevert();
        sender.send(nft, ids, recipients);
        nft.approve(address(sender), 1);
        nft.approve(address(sender), 2);
        ids[1] = 1;
        vm.expectRevert();
        sender.send(nft, ids, recipients);
        ids[1] = 2;
        recipients[1] = address(0);
        vm.expectRevert();
        sender.send(nft, ids, recipients);
        require(nft.ownerOf(1) == address(this) && nft.ownerOf(2) == address(this));
    }

    function testNftBatchRejectsOverFiftyTokenIds() public {
        PitNftBatchSender sender = new PitNftBatchSender();
        uint256[] memory ids = new uint256[](51);
        address[] memory recipients = new address[](51);
        vm.expectRevert();
        sender.send(PitNftCollection(address(0x1234)), ids, recipients);
    }
}

contract NativeBatchHandler {
    Vm5 private constant VM = Vm5(address(uint160(uint256(keccak256("hevm cheat code")))));
    PitNativeMultiSender public immutable sender;
    address public constant ALICE = address(0xA11CE);
    address public constant BOB = address(0xB0B);
    uint256 public aliceSent;
    uint256 public bobSent;
    uint256 public calls;

    constructor() {
        sender = new PitNativeMultiSender();
    }

    function sendPair(uint96 seedA, uint96 seedB) external {
        ++calls;
        uint256 a = uint256(seedA) % 1e12 + 1;
        uint256 b = uint256(seedB) % 1e12 + 1;
        VM.deal(address(this), a + b);
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = payable(ALICE);
        recipients[1] = payable(BOB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = a;
        amounts[1] = b;
        sender.send{value: a + b}(recipients, amounts);
        aliceSent += a;
        bobSent += b;
    }

    function rejectShortPayment(uint96 seed) external {
        ++calls;
        uint256 amount = uint256(seed) % 1e12 + 1;
        VM.deal(address(this), amount);
        address payable[] memory recipients = new address payable[](1);
        recipients[0] = payable(ALICE);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount + 1;
        try sender.send{value: amount}(recipients, amounts) {
            revert("underpayment accepted");
        } catch {}
    }
}

contract NativeBatchInvariantTest {
    NativeBatchHandler internal handler;
    address[] private targets;

    function setUp() public {
        handler = new NativeBatchHandler();
        targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return targets;
    }

    function invariant_NativeValueConservation() public view {
        require(handler.ALICE().balance == handler.aliceSent(), "Alice did not receive exact value");
        require(handler.BOB().balance == handler.bobSent(), "Bob did not receive exact value");
        require(address(handler.sender()).balance == 0, "sender retained value");
    }

    function afterInvariant() public view {
        require(handler.calls() > 0, "handler not exercised");
    }
}
