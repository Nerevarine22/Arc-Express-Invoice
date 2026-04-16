# Arc Express Invoice Contract

This folder contains the invoice smart contract for Arc Testnet.

## What it does

- creates invoice records with an incremental ID
- stores amount, description, and status
- marks invoices as paid
- exposes a getter for the frontend

## Next step

Connect this contract to a payment flow that transfers USDC and calls `markInvoicePaid`.
