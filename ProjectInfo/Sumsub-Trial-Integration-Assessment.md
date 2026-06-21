# Sumsub Trial Integration Assessment

Date: 2026-06-19, updated 2026-06-20

## Purpose

This note summarizes the Sumsub trial review for HyperTransfer. It focuses on what Sumsub can provide beyond basic KYC and Travel Rule, how it maps to the existing HyperTransfer product, and how hard it is to connect.

No Sumsub account password, API token, secret, applicant PII, or customer document data should be stored in this repository.

## Current Trial Status

- Sumsub Cockpit trial login page is reachable at `https://cockpit.sumsub.com/checkus/home`.
- Sumsub Cockpit sandbox login succeeded on 2026-06-21 with user-provided account authorization.
- Sandbox app token `HyperTransfer Sandbox KYC` was created. The real token and secret are stored only in ignored local `.env` and GitHub secret `HK_ENV_FILE`; they are not stored in this repository.
- KYC level selected for HyperTransfer: `idv-and-phone-verification`.
- Sumsub webhook `HyperTransfer KYC Webhook` was created for `https://h5.hypercypto.com/api/webhooks/sumsub` with `HMAC_SHA256_HEX`.
- Webhook events configured: `applicantCreated`, `applicantPending`, `applicantReviewed`, `applicantOnHold`, `applicantAwaitingUser`, `applicantAwaitingService`.
- The technical assessment below is based on official Sumsub documentation checked on 2026-06-19.

## Product Integration Status

Implemented on 2026-06-19 / 2026-06-20:

- Backend Sumsub adapter in `hypertransfer-main/backend/server.py`.
- Signed Sumsub API request support using `X-App-Token`, `X-App-Access-Ts`, and `X-App-Access-Sig`.
- Backend endpoints:
  - `GET /api/sumsub/config`
  - `GET /api/sumsub/health`
  - `POST /api/sumsub/kyc/start`
  - `GET /api/sumsub/kyc/status`
  - `POST /api/sumsub/access-token`
  - `POST /api/sumsub/connection-test`
  - `POST /api/webhooks/sumsub`
- Customer KYC page keeps the original HyperTransfer UX and starts a Sumsub KYC session inside that page when backend credentials are configured.
- Customer KYC start now creates or reuses a Sumsub applicant, writes supported fixedInfo, stores `externalUserId` / `applicantId`, and returns a short-lived WebSDK token.
- Customer KYC status now reads normalized Sumsub applicant review status instead of locally auto-approving.
- Sumsub webhook endpoint verifies payload digests when `SUMSUB_WEBHOOK_SECRET_KEY` is configured, records webhook events, and updates local KYC status.
- Staff `/casino-ops` portal now shows Sumsub provider status, enabled capability surface, and a connection-test action.
- Deployment env files now include Sumsub variables.

Blocked until credentials are configured:

- Live WebSDK launch in a real browser customer session.
- Webhook end-to-end callback from Sumsub Cockpit against the deployed public backend URL; current public endpoint still returns 404 until the new backend code is deployed.

Required server-side environment variables:

- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `SUMSUB_KYC_LEVEL_NAME`
- `SUMSUB_WEBHOOK_SECRET_KEY`
- Optional: `SUMSUB_BASE_URL`, `SUMSUB_ENVIRONMENT`, `SUMSUB_TR_LEVEL_NAME`, `SUMSUB_WEBSDK_TTL`

Configured values:

- Local ignored file: `hypertransfer-main/.env`
- GitHub repository secret: `HK_ENV_FILE`
- `SUMSUB_ENVIRONMENT=sandbox`
- `SUMSUB_KYC_LEVEL_NAME=idv-and-phone-verification`

## Product Capabilities Worth Testing

### Customer Verification

- ID document verification.
- Liveness and face match.
- Address verification / proof of address.
- Non-document verification where available.
- Reusable KYC / Sumsub ID.
- Video identification for higher assurance flows.
- Qualified electronic signature, if contract or onboarding signature later becomes relevant.

HyperTransfer fit:

- Replace the current hand-built KYC upload page with Sumsub WebSDK 2.0 for the real KYC flow.
- Keep HyperTransfer's own KYC status model and use Sumsub as the provider of verification evidence and review status.

### Risk, Fraud, And Source-Of-Funds Controls

- Email and phone verification.
- Device Intelligence for risky devices, VPN/proxy, emulation, rooted or jailbroken devices, incognito/privacy patterns, account sharing, bot activity, and multi-accounting.
- Advanced IP / geolocation checks.
- Questionnaires for source of funds, source of wealth, occupation, gaming/casino-specific declarations, or enhanced due diligence.
- AML screening and ongoing monitoring.
- Workflow Builder for risk-based routing, step-up checks, manual review, and auto-rejection branches.

HyperTransfer fit:

- Use questionnaires as the cleanest way to collect source-of-funds / source-of-wealth declarations without building a separate form engine first.
- Use Device Intelligence and IP/location signals as inputs for Macau access exclusion and high-risk user review, but do not present this as a replacement for casino-side policy controls.

### Transaction, Crypto, And Travel Rule

- Transaction Monitoring rules and case handling.
- Travel Rule checks as part of Transaction Monitoring.
- VASP attribution and VASP directory.
- Multiple Travel Rule data exchange protocols, including TRP, GTR, Sumsub protocol, and email notification paths.
- Unhosted wallet cases.
- Crypto Monitoring for wallet screening and transaction screening.
- Crypto Monitoring providers include options such as Crystal Intelligence, Merkle Science, Cyvers, TRM Labs, Elliptic, and Chainalysis according to Sumsub docs.

HyperTransfer fit:

- Sumsub can potentially replace or complement the current mock Travel Rule provider adapter.
- Sumsub can potentially replace or complement wallet KYT and transaction KYT providers.
- Hex Trust / Hex Safe should remain the custody, vault, deposit address, and webhook provider. Sumsub is not a replacement for custody.

### Staff Operations

- Applicant management.
- Case Management 2.0.
- Webhook logs.
- Workflow Builder versioning and testing.
- Team users, roles, permissions, SSO, and 2FA.
- KYB, if HyperTransfer later needs to onboard corporate counterparties or operator entities.

HyperTransfer fit:

- The customer H5 should stay simple and not expose Sumsub internals.
- Staff-facing evidence, cases, transaction alerts, and manual review state should live in `/casino-ops` or a future dedicated admin portal.

## Recommended Integration Architecture

### Frontend

- Embed Sumsub WebSDK 2.0 on the customer KYC step.
- Keep HyperTransfer UI language and flow ownership: registration, account MFA, deposit setup, wallet screening, Travel Rule, and deposit status remain HyperTransfer screens.
- Use Sumsub SDK only when the customer is performing provider-owned verification or step-up checks.

### Backend

Add a backend-side Sumsub adapter. The frontend must never receive app token secrets.

Suggested environment variables:

- `SUMSUB_BASE_URL`
- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `SUMSUB_WEBHOOK_SECRET_KEY`
- `SUMSUB_KYC_LEVEL_NAME`
- `SUMSUB_TR_LEVEL_NAME`
- `SUMSUB_ENVIRONMENT` (`sandbox` / `production`)

Implemented / suggested backend endpoints:

- `POST /api/sumsub/kyc/start`
  - Creates or reuses a Sumsub applicant and returns a short-lived WebSDK access token.
- `GET /api/sumsub/kyc/status`
  - Returns normalized applicant status for the frontend.
- `POST /api/sumsub/access-token`
  - Refreshes a short-lived WebSDK access token.
- `POST /api/webhooks/sumsub`
  - Receives applicant, transaction monitoring, Travel Rule, case management, and fraud events.
- `POST /api/compliance/sumsub/wallet-screening`
  - Starts wallet screening or payment-method check when applicable.
- `POST /api/compliance/sumsub/transaction`
  - Submits deposit/withdrawal transaction data for monitoring and Travel Rule.
- `GET /api/compliance/sumsub/status/:internalId`
  - Returns normalized HyperTransfer status for the frontend and staff portal.

### Data Mapping

HyperTransfer should keep its own canonical IDs and store Sumsub references as provider metadata.

Customer / KYC:

- `userId`
- `sumsubApplicantId`
- `externalUserId`
- `levelName`
- `inspectionId`
- `reviewStatus`
- `reviewResult`
- `riskLabels`
- `updatedAt`

Deposit / Travel Rule / KYT:

- `depositRequestId`
- `sumsubTransactionId`
- `asset`
- `network`
- `amount`
- `sourceWallet`
- `receivingWallet`
- `originator`
- `beneficiary`
- `counterpartyVasp`
- `travelRuleStatus`
- `walletScreeningStatus`
- `transactionScreeningStatus`
- `providerPayloadHash`
- `auditLogId`

## Integration Difficulty

### KYC WebSDK

Difficulty: Low to medium.

Prototype estimate: 2-4 developer days.

Production hardening estimate: 1-2 weeks.

Main work:

- Backend signed access-token endpoint.
- WebSDK 2.0 React integration.
- Applicant ID mapping.
- Webhook verification and status sync.
- Error handling, retry, and manual review states.
- Data retention and audit rules.

### Travel Rule And Crypto Monitoring

Difficulty: Medium to high.

Prototype estimate: 1 week if sandbox access is available.

Production estimate: 2-3 weeks for a clean provider adapter and staff review loop.

Main work:

- Transaction data model and Travel Rule payload mapping.
- VASP / unhosted-wallet branching.
- Source wallet and receiving wallet semantics.
- Transaction lifecycle states.
- Webhook status mapping.
- Manual review and exception handling in `/casino-ops`.
- Alignment with Hex Safe address issuance timing.

### Device Intelligence / Workflow Builder / Case Management

Difficulty: Medium.

Prototype estimate: 3-5 developer days per slice.

Production estimate: 1-2 weeks depending on how much staff workflow is built inside HyperTransfer versus left in Sumsub Cockpit.

Main work:

- Decide which risk decisions are made in Sumsub versus HyperTransfer.
- Map Sumsub case states to HyperTransfer case states.
- Avoid duplicating manual review queues unless the customer requires it.
- Decide whether device/IP signals are only provider evidence or active product gates.

## Proposed HyperTransfer Product Changes

Short term:

- KYC is now the first real Sumsub-backed flow: applicant mapping, fixedInfo, WebSDK token, status readback, and webhook update are implemented.
- Keep KYT, Travel Rule, and Transaction Monitoring provider interfaces mocked until the KYC online test passes.
- Next optional staff portal additions: Sumsub applicant status card, Travel Rule status, crypto monitoring result, and provider webhook history.

Medium term:

- Build a normalized compliance event table.
- Make address issuance depend on normalized states:
  - KYC approved.
  - Source wallet screening passed.
  - Travel Rule accepted or not required.
  - No open manual review block.
- Add source-of-funds questionnaire as a configurable step for large deposits or higher-risk profiles.
- Use Sumsub only as a provider implementation, not as the product boundary.

Do not change:

- Hex Trust / Hex Safe remains custody, vault, address issuance, deposit status, and transaction log provider.
- HT Markets remains OTC conversion and depeg response provider.
- HyperTransfer remains the orchestration layer and audit owner.

## Sales / Meeting Questions

Ask Sumsub HK sales:

- Which modules are enabled in the 2-week trial: KYC, AML screening, questionnaires, Device Intelligence, Transaction Monitoring, Travel Rule, Crypto Monitoring, Case Management, KYB?
- Can the trial generate Sandbox app token and secret immediately?
- What are the exact WebSDK level names available in this account?
- Does the trial include Travel Rule sandbox data exchange and VASP directory testing?
- Which blockchain analytics provider is included by default for Crypto Monitoring?
- Supported chains/assets for USDT Ethereum, USDT Tron, and USDC Ethereum.
- Travel Rule pricing model: per transaction, monthly platform fee, VASP directory fee, protocol fee, or bundle.
- KYC pricing model: per applicant, per document, per liveness, AML recurring monitoring.
- Device Intelligence pricing model.
- Hong Kong / Macau data residency, data processing, retention, and deletion options.
- Casino/gaming customer policy constraints.
- Production go-live review process, timeline, and required compliance documents.
- SLA and support coverage for Hong Kong time zone.

## POC Plan

1. User or owner logs into Cockpit and confirms trial modules enabled.
2. Create sandbox app token in Cockpit Dev Space and store token/secret outside the repo.
3. Create or identify a basic KYC level using WebSDK 2.0.
4. Configure webhook endpoint and verify applicant review status sync against the deployed public backend URL.
5. Run one live KYC sandbox applicant through the customer `/kyc` page.
6. Submit one sandbox transaction for Transaction Monitoring / Travel Rule if the trial allows it.
7. Add staff portal evidence cards for applicant status, Travel Rule status, crypto monitoring result, and provider webhook history if those modules are approved for the next scope.
8. Compare Sumsub KYT/Travel Rule output with current Hex Trust / external-provider assumptions.

## References

- Sumsub docs home: https://docs.sumsub.com/
- Sumsub API overview: https://docs.sumsub.com/reference/about-sumsub-api
- WebSDK overview: https://docs.sumsub.com/docs/about-web-sdk
- WebSDK integration guide: https://docs.sumsub.com/docs/get-started-with-web-sdk
- App tokens: https://docs.sumsub.com/docs/app-tokens
- Webhooks: https://docs.sumsub.com/docs/webhooks
- Transaction Monitoring: https://docs.sumsub.com/docs/transaction-monitoring
- Travel Rule overview: https://docs.sumsub.com/docs/travel-rule-overview
- Crypto Monitoring: https://docs.sumsub.com/docs/crypto-monitoring
- Workflow Builder: https://docs.sumsub.com/docs/get-started-with-workflow-builder
- Device Intelligence: https://docs.sumsub.com/docs/device-intelligence
