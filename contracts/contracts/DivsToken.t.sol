// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {DivsToken} from "./DivsToken.sol";

/// @dev The properties worth asserting here are the guarantees the token makes
/// by omission: supply is fixed, nobody can mint, and no privileged role can
/// interfere with a transfer. Supply invariance is checked directly, since
/// "there is no mint function" is otherwise only visible by reading the source.
contract DivsTokenTest is Test {
    DivsToken token;

    address treasury = address(0x7A);
    address alice = address(0xA1);
    address bob = address(0xB0B);

    uint256 constant ONE_BILLION = 1_000_000_000e18;

    function setUp() public {
        token = new DivsToken(treasury);
    }

    // --- supply -------------------------------------------------------------

    function test_TotalSupplyIsOneBillion() public view {
        assertEq(token.totalSupply(), ONE_BILLION, "supply should be exactly one billion");
        assertEq(token.MAX_SUPPLY(), ONE_BILLION, "constant should match the minted amount");
    }

    function test_EntireSupplyGoesToTheRecipient() public view {
        assertEq(token.balanceOf(treasury), ONE_BILLION, "recipient holds the whole supply");
    }

    function test_Metadata() public view {
        assertEq(token.name(), "DIVS Protocol");
        assertEq(token.symbol(), "DIVS");
        assertEq(token.decimals(), 18, "18 decimals, as the staking maths assumes");
    }

    function test_ConstructorRejectsZeroRecipient() public {
        vm.expectRevert("Zero recipient");
        new DivsToken(address(0));
    }

    /// @dev Supply cannot grow: there is no mint entry point at all.
    function test_SupplyNeverGrows() public {
        uint256 before = token.totalSupply();

        vm.prank(treasury);
        token.transfer(alice, 1_000e18);
        vm.prank(alice);
        token.transfer(bob, 400e18);

        assertEq(token.totalSupply(), before, "transfers must not change supply");
    }

    // --- transfers ----------------------------------------------------------

    function test_TransferMovesTheFullAmount() public {
        vm.prank(treasury);
        token.transfer(alice, 500e18);

        // No fee-on-transfer: what is sent is what arrives. The staking vault
        // credits the balance delta, but a skim here would still surprise
        // anyone integrating against the token.
        assertEq(token.balanceOf(alice), 500e18, "recipient receives the full amount");
        assertEq(token.balanceOf(treasury), ONE_BILLION - 500e18, "sender is debited exactly");
    }

    function testFuzz_TransferConservesSupply(uint256 amount) public {
        amount = bound(amount, 0, ONE_BILLION);

        vm.prank(treasury);
        token.transfer(alice, amount);

        assertEq(
            token.balanceOf(treasury) + token.balanceOf(alice),
            ONE_BILLION,
            "balances always sum to the fixed supply"
        );
        assertEq(token.totalSupply(), ONE_BILLION, "supply is invariant");
    }

    // --- burn ---------------------------------------------------------------

    function test_BurnReducesSupply() public {
        vm.prank(treasury);
        token.burn(250_000e18);

        assertEq(token.totalSupply(), ONE_BILLION - 250_000e18, "burn lowers supply");
        assertEq(token.balanceOf(treasury), ONE_BILLION - 250_000e18, "burn debits the caller");
    }

    /// @dev Burning is self-only: it needs the caller's own balance or an
    /// allowance they granted, so it is not a privilege over other holders.
    function test_CannotBurnSomeoneElsesBalanceWithoutAllowance() public {
        vm.prank(treasury);
        token.transfer(alice, 100e18);

        vm.prank(bob);
        vm.expectRevert();
        token.burnFrom(alice, 100e18);
    }

    // --- permit -------------------------------------------------------------

    /// @dev The reason permit is here: staking should be one signature, not an
    /// approve transaction followed by a stake transaction.
    function test_PermitApprovesBySignature() public {
        uint256 ownerKey = 0xA11CE;
        address owner = vm.addr(ownerKey);
        address spender = address(0x5AFE);
        uint256 value = 1_000e18;
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(treasury);
        token.transfer(owner, value);

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                token.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256(
                            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                        ),
                        owner,
                        spender,
                        value,
                        token.nonces(owner),
                        deadline
                    )
                )
            )
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        token.permit(owner, spender, value, deadline, v, r, s);

        assertEq(token.allowance(owner, spender), value, "signature should set the allowance");
        assertEq(token.nonces(owner), 1, "nonce should advance to stop replay");
    }

    function test_PermitRejectsAnExpiredDeadline() public {
        uint256 ownerKey = 0xA11CE;
        address owner = vm.addr(ownerKey);
        uint256 deadline = block.timestamp - 1;

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                token.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256(
                            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                        ),
                        owner,
                        address(0x5AFE),
                        1e18,
                        token.nonces(owner),
                        deadline
                    )
                )
            )
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        vm.expectRevert();
        token.permit(owner, address(0x5AFE), 1e18, deadline, v, r, s);
    }
}
