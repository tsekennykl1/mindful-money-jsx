# Mobile tables and reliable AWS data requests

## What will change
- Keep every table column available on iPhone portrait instead of hiding lower-priority fields.
- Preserve the dense mobile sizing so the first several fields fit, with remaining fields reachable by horizontal scrolling.
- Route stock and CRUD requests through `app.myfinance5051.com` before forwarding them to the existing AWS services, avoiding the browser preflight that currently fails.
- Continue forwarding the signed-in user's authorization token to AWS.

## Technical details
- Simplify the shared table so `priority` no longer hides columns at responsive breakpoints; size the table to its content inside the existing horizontal scroller.
- Add same-origin raw HTTP routes for CRUD and stock requests. Validate methods and stock query input, forward only the required headers, and return consistent JSON responses.
- Update the shared API addresses to use those same-origin routes, without changing transaction, dividend, ledger, or stock business logic.
- Add route metadata where applicable, document the proxy boundary in the project architecture notes, and verify the iPhone table scroll behavior plus live preflight/build health.

## Result
All fields remain visible through horizontal scrolling on small screens, while CRUD and stock calls no longer depend on AWS browser CORS configuration.
