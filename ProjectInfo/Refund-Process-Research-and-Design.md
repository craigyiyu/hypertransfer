# HyperTransfer Refund Process Research and Design

> Date: 2026-06-21
> Scope: Phase 1 stablecoin refunds for HyperTransfer / Macau operator prototype
> Product boundary: customer refund request + address verification in HyperTransfer H5; treasury approval, custody transfer, and audit evidence in Operator VA Operations Portal.

## 1. Source Basis

### Internal project sources

- `ClientMeetings/2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md`
  - Refund process must include legal / valid refund address verification.
  - Refund / payout must include wallet ownership and lawful address checks.
- `ClientMeetings/2026-06-08-HyperTransfer-Complete-Process-Flow.md`
  - Refund / payout is a treasury-controlled workflow.
  - Destination-wallet KYT, approval, policy checks, signing, and broadcast are required.
- `ProjectInfo/design.md`
  - Payout / withdrawal interface includes `POST /api/payouts`, destination-wallet screening, approval submission, custody transfer, approval/reject, and transfer status.
- `ProjectInfo/virtual-asset-ppt.md`
  - Refund / Payout sequence: create request -> KYC status -> payout -> destination screening -> approval -> whitelist if required -> custody transfer -> broadcast/completed webhook -> record txHash.

### Public market references checked

- BitPay refund address policy: https://support.bitpay.com/hc/en-us/articles/203076776-Why-can-t-BitPay-just-send-the-refund-back-to-the-address-that-sent-it
  - Refund destination should be supplied through payment protocol or explicitly confirmed, address validity should be checked, and shopper identity may be verified before funds are sent.
- BitPay merchant refund flow: https://support.bitpay.com/hc/en-us/articles/205071499-How-do-I-refund-a-fully-paid-invoice
  - Merchant selects invoice, chooses full or partial refund, sends refund instructions, customer provides refund address, and payout needs sufficient ledger balance.
- Crypto.com Pay merchant refund flow: https://help.crypto.com/en/articles/6063059-how-to-initiate-refunds-partial-refunds-to-customers
  - Merchant initiates refund from dashboard; on-chain refunds ask customer for a valid wallet address before processing.
- Cobo Payments refund link flow: https://www.cobo.com/payments/en/guides/create-refund-link
  - User applies, customer service approves/rejects, backend creates one-time refund address collection URL, customer submits address, refund is tracked by webhook/status API.
  - Cobo also treats refunds as withdrawals subject to risk control and administrator approval when thresholds are triggered.
- BVNK auto-refund note: https://help.bvnk.com/hc/en-us/articles/27122836779666-Auto-Refund-to-Source-Address
  - Auto-refund to source address is possible for eligible payments, but CEX pooled-account payments may require the end user to claim funds from the exchange.
- Coinbase wrong-address / return guidance: https://help.coinbase.com/en/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/i-sent-funds-to-the-wrong-address-how-do-i-get-them-back
  - Crypto transactions are final and cannot be cancelled or reversed; this reinforces the need to validate the refund destination before broadcast.

## 2. Policy Decisions for HyperTransfer

1. **No BTC or ETH assets in Phase 1.**
   - Supported customer assets: USDT and USDC only.
   - Supported rails: USDT on ERC-20 / TRC-20, USDC on ERC-20.
   - ERC-20 is a stablecoin network rail here; it does not mean ETH asset support.

2. **Do not blindly refund to the original source address.**
   - Some payment providers support auto-refund to source address for eligible flows, but CEX pooled wallets create recovery risk.
   - HyperTransfer should require an authenticated customer destination confirmation unless Operator compliance approves a specific auto-refund policy later.

3. **Refund is a payout / withdrawal workflow.**
   - Treat refund as money leaving WTA / custody vault.
   - Run destination-wallet KYT before approval.
   - Apply treasury/compliance approval and custody policy controls before signing.

4. **Refund amount policy.**
   - Default refund is the original stablecoin asset and network amount, less actual network fee only if contractually applicable.
   - Partial refund is allowed only if support / treasury records a reason.
   - If the original funds were already converted through OTC, treasury must decide whether refund is stablecoin payout or fiat/off-ramp adjustment.

5. **Customer-facing vs staff-facing boundary.**
   - Customer H5 can request refund and provide destination wallet.
   - Casino staff portal owns approval, policy checks, Hex Safe transfer, reconciliation, and audit evidence.

## 3. Complete Refund Flow

```text
1. Customer or support opens refund request
   - Link refund to original DepositRequest / txHash / sessionId.
   - Capture reason: cancellation, overpayment, underpayment declined, failed KYC, failed Travel Rule, source-wallet mismatch, duplicate payment, expired deposit, operational error.

2. Eligibility check
   - Original deposit exists and is matched to the customer.
   - Asset/network is Phase 1 supported: USDT/USDC stablecoin rails only.
   - KYC status and sanctions status are checked.
   - Funds are available in WTA / custody balance.

3. Customer refund address collection
   - Customer confirms refund destination through authenticated H5 session.
   - Same asset/network is shown clearly.
   - Never ask for private key, seed phrase, exchange password, or OTP forwarding.
   - Address collection link/session should be one-time and expire.

4. Address format and ownership/suitability check
   - Validate ERC-20 or TRC-20 format.
   - Warn against wrong network.
   - Optionally require wallet ownership proof or signed message for higher-risk cases.

5. Destination-wallet KYT
   - Screen destination wallet against sanctions, mixer, scam, darknet, high-risk exposure, and provider risk score.
   - Pass -> treasury approval.
   - Manual review -> compliance case, no payout until cleared.
   - Reject -> refund destination rejected, customer/support must provide an alternative or escalate.

6. Treasury / compliance approval
   - Staff reviews original deposit, refund reason, amount, destination KYT result, customer attestation, and WTA balance.
   - Large amount or exception follows maker-checker / quorum approval.
   - Approval trail is recorded.

7. Custody payout execution
   - Add whitelisted address if policy requires.
   - Submit custody transfer via Hex Safe / custody adapter.
   - Apply custody policy and approvals.
   - Sign and broadcast transaction.

8. Webhook / polling completion
   - Track transfer.broadcasted and transfer.completed events.
   - Store txHash, transferId, confirmations, fees, timestamps, operator IDs.
   - Notify customer and close case.

9. Reconciliation and audit
   - Match refund transfer with custody transaction logs, WTA balance movement, monthly statement, and internal refund case.
   - Include all evidence in audit report.
```

## 4. Suggested Status Model

```text
requested
address_required
address_submitted
destination_kyt_pending
destination_kyt_passed
manual_review
approval_pending
approved
signing
broadcasted
completed
failed
rejected
cancelled
expired
```

## 5. Data Model

```text
refundId
originalDepositRequestId
originalSessionId
originalTxHash
customerId
asset
network
amount
reason
destinationAddress
customerAttestation
destinationKytProvider
destinationKytReference
destinationKytDecision
destinationRiskScore
approvalStatus
approvalQuorum
approvers
custodyTransferId
payoutTxHash
feeAmount
status
createdAt
updatedAt
completedAt
auditTrail
```

## 6. Product Updates Needed

### Customer H5

- Add refund entry from a completed deposit.
- Show original deposit amount, asset, network rail, and txHash.
- Collect refund reason.
- Collect and validate destination wallet.
- Run destination-wallet KYT.
- Show pending treasury approval / completed / rejected / manual review states.

### Casino staff operations portal

- Add refund queue.
- Show refund amount, status, destination, original txHash, KYT decision, and audit trail.
- Add actions:
  - submit approval
  - approve
  - broadcast via custody adapter
  - close / reject / manual review in later production build

### Backend / provider adapter later

- Add `refunds` or `payouts` API.
- Add KYT provider adapter for destination wallet.
- Add custody transfer adapter for Hex Safe withdrawal / payout.
- Add webhook handler for transfer status.
- Add reconciliation join with custody transaction logs and monthly statement.

## 7. Current Prototype Implementation Boundary

- Customer refund page: `/refund`.
- Staff queue: `/casino-ops`.
- Current implementation is a deterministic frontend mock:
  - address format validation
  - destination KYT mock
  - treasury approval mock
  - Hex Safe payout mock with generated `transferId` and `txHash`
- It does not move funds or call Hex Trust / Hex Safe yet.
