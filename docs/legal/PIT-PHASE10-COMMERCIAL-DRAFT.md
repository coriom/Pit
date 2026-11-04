# PIT Phase 10 — commercial and legal review draft

**Draft for professional review; not terms in force or a regulatory conclusion.** PIT's public free tools and guided paid blockchain workflows have different risk and data profiles. The commercial operator, legal entity, jurisdiction, payment acceptance and merchant wallet are not yet confirmed. Real USDC charges remain disabled.

## Technical service classification matrix

The table describes implemented behavior, not whether a legal authorization is or is not required. A qualified French/EU reviewer must classify each paid service under MiCA and any other applicable law, including the exact frontend, contracts, operator role and transaction flow. [MiCA Article 3](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng) defines crypto-asset services including custody, order execution, order reception/transmission and transfer services. The [AMF confirms](https://www.amf-france.org/fr/actualites-publications/actualites/lamf-rappelle-que-la-periode-transitoire-pour-les-psan-pour-continuer-de-fournir-des-services-sur) the French transition ended on 1 July 2026. Do not infer a blanket exemption from a non-custodial UI.

| Workflow | Signer and asset control | PIT fee and intervention | Instruction flow | Legal review question |
| --- | --- | --- | --- | --- |
| Offline calculators, data transformation | No chain transaction; user data stays local in the ordinary free flow | No fee or asset access | No transaction instruction sent | Consumer, privacy and financial-information wording; avoid personalized-advice claims. |
| Read-only Explorer, allowance/balance/metadata inspection | No user signature; public RPC sees queried addresses | No fee or asset access | Read requests only; no client transaction | Data protection and RPC-provider disclosure. |
| Standard/advanced ERC-20 creation | User signs; user-selected recipient receives supply; advanced creator holds selected roles | Paid router transfers USDC fee atomically; PIT has no created-token admin role | UI prepares parameters and user wallet submits; PIT does not sign for user | Token issuance/offer/disclosure, possible regulated service characterization, sanctions and consumer obligations. |
| ERC-20 MultiSender, NFT/native batch transfers | User signs; batch destinations are user selected; paid router holds no residual assets on success | ERC-20 paid route collects fee; other routes have indicative prices only; PIT cannot recall successful transfers | UI prepares recipients and amounts; user wallet submits | Whether the exact assisted transfer model qualifies as transfer service on behalf of clients; recipient screening and abuse policy. |
| Locker creation/funding | User signs funding; new immutable Locker holds assets until unlock for beneficiary | Paid route collects fee; PIT has no early withdrawal right; release remains free | UI prepares beneficiary/time and user wallet submits | Custody/control characterization despite immutable contract; disclosure of locked funds and unsupported direct transfers. |
| Vesting creation/funding | User signs; new Vesting contract holds allocation under immutable schedule | Paid route collects fee; PIT cannot change beneficiary/schedule; vested claims remain free | UI prepares allocation/schedule and user wallet submits | Custody/control, beneficiary rights, irreversible schedule and tax treatment. |
| Digital financial report | User may submit local financial data; hosted paid processing is disabled | x402 settlement is simulated only; no sale or asset intervention | No production payment or hosted report request | Personal/financial data processing, regulated advice boundaries, digital-content withdrawal/refund law, actual payment processor terms. |

The user signs and broadcasts through their wallet in executable local flows. PIT does not possess their private key. This technical fact does not alone settle whether PIT receives/transmits instructions or provides a regulated transfer service. The operator must obtain written, product-specific legal analysis before commercial activation.

## Proposed fee table — decision pending

| Paid candidate | Central configuration proposal | Execution status |
| --- | --- | --- |
| Standard ERC-20 creator | 49 USDC | Atomic route locally and testnet validated; commercial price unapproved. |
| Advanced ERC-20 creator | 149 USDC | Same. |
| ERC-20 MultiSender | 3 USDC + 0.10 per recipient, maximum 49 USDC | Same. |
| Token Locker creation | 39 USDC | Same; release free. |
| Token Vesting creation | 79 USDC | Same; vested claim free. |
| Other NFT/native operations | Indicative metadata only | No active fee-aware execution route. |
| Advanced digital reports | Indicative 4.90–14.90 USDC | x402 settlement simulated; no commercial checkout. |

All amounts are proposed PIT service fees in USDC, excluding native-network gas and underlying asset transfers. Approvals can be separate gas-bearing transactions. Final commercial fees, caps, taxes, jurisdiction and user disclosures require an operator decision and legal/accounting review. No subscription or prepaid credit is required for the proposed pay-per-operation model.

## Reviewable policy text, not published

### Terms of use

PIT Free offers calculations and public-chain information; users should verify inputs, chain data and outputs independently. PIT Operations, when later enabled, assists users in preparing transactions that their own wallet must review and sign. Public-chain transactions may be irreversible. Supported networks, contract addresses, fee amounts and limitations must be shown in the transaction review. PIT does not promise that a public RPC, third-party token, bridge, wallet or blockchain will be available or behave as expected. Add operator identity, governing law, eligibility, prohibited uses, support contact, complaint route and liability wording after legal review.

### Privacy notice

Offline Toolbox calculations require no wallet or account and do not need PIT server storage. Explorer RPC providers can observe queried addresses and IP/network metadata. Local wallet flows reveal addresses to the selected wallet and RPC. On-chain transactions, fee events and receipts are public and persistent. Imported portfolios and journals should remain local by default; hosted report processing is disabled. Specify actual hosting, access-log retention, processors, lawful basis, rights/contact, cross-border transfers and incident procedure before publication. Do not silently connect the historical SIWE/D1 account database to the pay-per-use product.

### Payment and refund terms

Before signing, display the PIT service fee, payment token and recipient, underlying asset movement, exact allowance, native gas estimate, quote version and expiry. A reverted **atomic** paid operation also reverts the PIT USDC fee transfer, but already consumed gas and any separate approval gas are not automatically refunded. Successful on-chain transfers, new tokens and schedules generally cannot be reversed by PIT. A separate digital-report payment would require its own settlement, delivery, duplicate-payment and refund process; the simulated x402 flow is not a sale. Define charge disputes, mistaken transfers, payment evidence, tax invoices and legally required withdrawal rights with counsel.

### Risk disclosures

Token creation can grant mint, burn, pause and default-admin powers. ERC-20 and NFT operator approvals may expose assets; approve only the necessary spender and amount, review the wallet prompt and revoke unused permissions when appropriate. Unknown tokens may be fee-on-transfer, rebasing, pausable or malicious and are not universally supported. Locker/Vesting funding and beneficiaries are fixed under contract rules; incorrect addresses or times can cause loss or extended lock. Gas prices vary; an RPC timeout does not prove that a transaction failed. A transaction is confirmed only after receipt, canonical block and state readback checks.

## Operator fields and records required

- Legal/commercial entity name, registration number, registered and support addresses, VAT/tax status, contact and complaint process.
- Markets and customer eligibility; professional legal classification of each workflow, including MiCA/PSCA analysis and token issuance obligations.
- Verified merchant wallet owner, governance and recovery process; canonical Circle USDC on the chosen chain; approved production contract addresses and final pricing/version.
- Accounting policy for on-chain service-fee events, fiat valuation timing, invoices, refunds, tax evidence, record retention and chain reorganizations; no account database is required solely for billing, but lawful business records may still be required.
- Final Terms, Privacy, Risk and Payment/Refund text approved for every release jurisdiction; independent security audit decision and incident owner.
