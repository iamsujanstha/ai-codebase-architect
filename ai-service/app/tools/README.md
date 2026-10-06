# Business-tool extension boundary

No tool execution is enabled by this starter. Add an explicit allowlist here only
when your application has authenticated identities and business endpoints.

A tool adapter must validate its arguments, bind a trusted server-side user and
tenant scope, call a narrow NestJS endpoint with service authentication, apply a
deadline, and return only authorized fields. Do not accept arbitrary URLs, shell
commands, SQL, or provider credentials from model output.

Keep proposals separate from execution. Writes require a stored action preview,
user confirmation, idempotency, and a business-layer permission check. Add a
bounded tool loop to ChatService only after these contracts exist. See
`docs/application-integration.md` for the proposed endpoint and approval flow.
