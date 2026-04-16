// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcExpressInvoicePayable {
    enum Status {
        Pending,
        Paid
    }

    struct Invoice {
        uint256 id;
        address issuer;
        uint256 amount;
        string description;
        Status status;
        uint256 createdAt;
        uint256 paidAt;
        address paidBy;
    }

    uint256 public nextInvoiceId = 1;
    IERC20 public immutable usdc;

    mapping(uint256 => Invoice) private invoices;

    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed issuer,
        uint256 amount,
        string description
    );

    event InvoicePaid(
        uint256 indexed invoiceId,
        address indexed paidBy,
        uint256 paidAt
    );

    error InvoiceNotFound(uint256 invoiceId);
    error InvoiceAlreadyPaid(uint256 invoiceId);
    error InvalidAmount();
    error EmptyDescription();
    error TransferFailed();
    error NotIssuer();

    constructor(address usdcAddress) {
        usdc = IERC20(usdcAddress);
    }

    function createInvoice(uint256 amount, string calldata description)
        external
        returns (uint256 invoiceId)
    {
        if (amount == 0) revert InvalidAmount();
        if (bytes(description).length == 0) revert EmptyDescription();

        invoiceId = nextInvoiceId++;

        invoices[invoiceId] = Invoice({
            id: invoiceId,
            issuer: msg.sender,
            amount: amount,
            description: description,
            status: Status.Pending,
            createdAt: block.timestamp,
            paidAt: 0,
            paidBy: address(0)
        });

        emit InvoiceCreated(invoiceId, msg.sender, amount, description);
    }

    function payInvoice(uint256 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);
        if (invoice.status == Status.Paid) revert InvoiceAlreadyPaid(invoiceId);

        bool ok = usdc.transferFrom(msg.sender, invoice.issuer, invoice.amount);
        if (!ok) revert TransferFailed();

        invoice.status = Status.Paid;
        invoice.paidAt = block.timestamp;
        invoice.paidBy = msg.sender;

        emit InvoicePaid(invoiceId, msg.sender, block.timestamp);
    }

    function markInvoicePaid(uint256 invoiceId, address paidBy) external {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);
        if (msg.sender != invoice.issuer) revert NotIssuer();
        if (invoice.status == Status.Paid) revert InvoiceAlreadyPaid(invoiceId);

        invoice.status = Status.Paid;
        invoice.paidAt = block.timestamp;
        invoice.paidBy = paidBy;

        emit InvoicePaid(invoiceId, paidBy, block.timestamp);
    }

    function getInvoice(uint256 invoiceId)
        external
        view
        returns (
            uint256 id,
            address issuer,
            uint256 amount,
            string memory description,
            Status status,
            uint256 createdAt,
            uint256 paidAt,
            address paidBy
        )
    {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);

        return (
            invoice.id,
            invoice.issuer,
            invoice.amount,
            invoice.description,
            invoice.status,
            invoice.createdAt,
            invoice.paidAt,
            invoice.paidBy
        );
    }

    function isPaid(uint256 invoiceId) external view returns (bool) {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);
        return invoice.status == Status.Paid;
    }

    function _requireInvoiceExists(Invoice storage invoice) private view {
        if (invoice.createdAt == 0) revert InvoiceNotFound(invoice.id);
    }
}
