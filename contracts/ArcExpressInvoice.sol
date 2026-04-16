// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcExpressInvoice {
    enum InvoiceStatus {
        Pending,
        Paid
    }

    struct Invoice {
        uint256 id;
        address issuer;
        uint256 amount;
        string description;
        InvoiceStatus status;
        uint256 createdAt;
        uint256 paidAt;
        address paidBy;
    }

    uint256 public nextInvoiceId = 1;

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
            status: InvoiceStatus.Pending,
            createdAt: block.timestamp,
            paidAt: 0,
            paidBy: address(0)
        });

        emit InvoiceCreated(invoiceId, msg.sender, amount, description);
    }

    function markInvoicePaid(uint256 invoiceId, address paidBy) external {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);

        if (invoice.status == InvoiceStatus.Paid) {
            revert InvoiceAlreadyPaid(invoiceId);
        }

        invoice.status = InvoiceStatus.Paid;
        invoice.paidAt = block.timestamp;
        invoice.paidBy = paidBy;

        emit InvoicePaid(invoiceId, paidBy, block.timestamp);
    }

    function getInvoice(uint256 invoiceId)
        external
        view
        returns (Invoice memory)
    {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);
        return invoice;
    }

    function isPaid(uint256 invoiceId) external view returns (bool) {
        Invoice storage invoice = invoices[invoiceId];
        _requireInvoiceExists(invoice);
        return invoice.status == InvoiceStatus.Paid;
    }

    function _requireInvoiceExists(Invoice storage invoice) private view {
        if (invoice.createdAt == 0) {
            revert InvoiceNotFound(invoice.id);
        }
    }
}
