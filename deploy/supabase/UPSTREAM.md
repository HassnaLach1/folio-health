Official Supabase Docker configuration, pinned to self-hosted/v0.8.2.
Source commit: 564eab8ad7840b13324f68b1bfac074ef8d51c21
Source: https://github.com/supabase/supabase/tree/self-hosted/v0.8.2/docker
License: Apache 2.0, included in LICENSE.

Folio changes live in ../compose.aws.yaml. Envoy access logging omits paths,
query strings, referrers and user agents to avoid logging OAuth or signed-file tokens.
