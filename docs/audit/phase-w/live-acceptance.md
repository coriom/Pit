# PIT acceptance evidence

Evidence capture does not mean live acceptance has passed.

Session: b77a4e03-b6ef-4e60-8c75-32e0672cb138
Source: operator
Protocol: cow
Account: 0x29d0b5939dcc4d0492d72abd1210debd6c90cc96
Environment: ethereum-sepolia:11155111
Started: 2026-10-09T04:46:49.666Z

## Timeline

- 2026-10-09T04:46:52.086Z — cow-quote (b77a4e03-b6ef-4e60-8c75-32e0672cb138:quote:cowquote:102947df-de46-4f2e-8fd0-b0c5ebfa6eef): {"kind":"cow-quote","quoteIdentity":"cowquote:102947df-de46-4f2e-8fd0-b0c5ebfa6eef","sellToken":"0xfff9976782d46cc05630d1f6ebab18b2324d6b14","buyToken":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","sellBudget":"5000000000000000","expectedBuy":"248356085","pitPartnerFee":"0","obtainedAt":"2026-10-09T04:46:52.084Z"}
- 2026-10-09T04:46:53.414Z — readiness (b77a4e03-b6ef-4e60-8c75-32e0672cb138:checkpoint:797f043b-40b9-4935-a0fd-a50c4086a6ce): {"kind":"readiness","items":[{"id":"wallet","status":"PASS"},{"id":"chain","status":"PASS"},{"id":"cow-environment","status":"PASS"},{"id":"fees","status":"PASS"},{"id":"assets","status":"PASS"},{"id":"funds","status":"PASS"},{"id":"storage","status":"PASS"},{"id":"quote","status":"PASS"}]}
- 2026-10-09T04:46:53.429Z — checkpoint (b77a4e03-b6ef-4e60-8c75-32e0672cb138:checkpoint:51d1da5d-ae6c-4080-909d-86a9dc7a58c0): {"kind":"checkpoint","action":"cow-approval","confirmed":true}
- 2026-10-09T04:46:56.164Z — cow-approval (b77a4e03-b6ef-4e60-8c75-32e0672cb138:approval:cowquote:102947df-de46-4f2e-8fd0-b0c5ebfa6eef): {"kind":"cow-approval","quoteIdentity":"cowquote:102947df-de46-4f2e-8fd0-b0c5ebfa6eef","outcome":"completed"}
- 2026-10-09T04:46:57.632Z — readiness (b77a4e03-b6ef-4e60-8c75-32e0672cb138:checkpoint:6d6299dc-a281-4a19-bcd7-5e93a24da0d1): {"kind":"readiness","items":[{"id":"wallet","status":"PASS"},{"id":"chain","status":"PASS"},{"id":"cow-environment","status":"PASS"},{"id":"fees","status":"PASS"},{"id":"assets","status":"PASS"},{"id":"funds","status":"PASS"},{"id":"storage","status":"PASS"},{"id":"quote","status":"PASS"}]}
- 2026-10-09T04:46:57.645Z — checkpoint (b77a4e03-b6ef-4e60-8c75-32e0672cb138:checkpoint:83513cd2-f38b-4507-a239-026a76fe149f): {"kind":"checkpoint","action":"cow-order","confirmed":true}
- 2026-10-09T04:47:01.803Z — cow-submission (b77a4e03-b6ef-4e60-8c75-32e0672cb138:submission:0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673): {"kind":"cow-submission","quoteIdentity":"cowquote:102947df-de46-4f2e-8fd0-b0c5ebfa6eef","orderUid":"0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673","pitPartnerFee":"0"}
- 2026-10-09T04:47:05.410Z — cow-status (b77a4e03-b6ef-4e60-8c75-32e0672cb138:status:0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673:open): {"kind":"cow-status","orderUid":"0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673","status":"open","settlementTxHash":null}
- 2026-10-09T04:47:34.859Z — cow-fill (b77a4e03-b6ef-4e60-8c75-32e0672cb138:fill:cow:11155111:0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673:11875047:65): {"kind":"cow-fill","orderUid":"0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673","settlementTxHash":"public-hash:df87a97fc6604b961e59366ac3968eee:5acb1344e2ead93f4dc374942f4d2d8f","sellToken":"0xfff9976782d46cc05630d1f6ebab18b2324d6b14","buyToken":"0x1c7d4b196cb0c7b01d743fbc6116a902379c7238","sellDecimals":18,"buyDecimals":6,"sellAmount":"5000000000000000","sellAmountBeforeFees":"5000000000000000","buyAmount":"250299154","pitPartnerFee":"0","taxlotEventId":"cow:11155111:0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673:11875047:65","reconciliation":"MATCH","economicDifferences":[],"metadataDifferences":[]}
- 2026-10-09T04:47:35.390Z — cow-status (b77a4e03-b6ef-4e60-8c75-32e0672cb138:status:0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673:fulfilled): {"kind":"cow-status","orderUid":"0x5c6cb1b029fa885e0c80d1d8023aaf863d610432a27ebf28de8437273686a34929d0b5939dcc4d0492d72abd1210debd6c90cc966ac87673","status":"fulfilled","settlementTxHash":null}

## Acceptance

UNVERIFIED until independent protocol, fee, accounting and terminal-state checks pass.
