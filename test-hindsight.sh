#!/usr/bin/env bash
# Usage: ./test-hindsight.sh [API_URL] [BANK_ID]
# Env: HINDSIGHT_API_URL, HINDSIGHT_BANK_ID, HINDSIGHT_API_TOKEN.
# Uses the current proxy settings. To test direct access: NO_PROXY='*' ./test-hindsight.sh
# Read-only: checks health and recall; does not retain memories or follow redirects.
set -euo pipefail

api_url="${1:-${HINDSIGHT_API_URL:-https://hindsight-api.coding-agent.site}}"
api_url="${api_url%/}"
bank_id="${2:-${HINDSIGHT_BANK_ID:-my-personal-memory}}"

command -v curl >/dev/null || { printf 'Error: curl is required.\n' >&2; exit 1; }
[[ "$api_url" == https://* ]] || { printf 'Error: HTTPS API URL required to protect credentials.\n' >&2; exit 1; }
[[ "$bank_id" =~ ^[a-zA-Z0-9_-]+$ ]] || { printf 'Error: bank ID must contain only letters, digits, underscores or hyphens.\n' >&2; exit 1; }

# Keep the token out of command-line arguments, logs and response headers.
# curl reads the Authorization header from an anonymous file descriptor.
auth=()
if [[ -n "${HINDSIGHT_API_TOKEN:-}" ]]; then
    [[ "$HINDSIGHT_API_TOKEN" != *$'\r'* && "$HINDSIGHT_API_TOKEN" != *$'\n'* ]] || {
        printf 'Error: token contains a newline.\n' >&2
        exit 1
    }
    auth=(--header @/dev/fd/3)
else
    printf 'Warning: HINDSIGHT_API_TOKEN is unset; recall may return 401/403.\n' >&2
fi

probe() {
    local name="$1" path="$2" status rc
    shift 2
    printf '\n=== %s ===\n' "$name"
    if [[ -n "${HINDSIGHT_API_TOKEN:-}" ]]; then
        exec 3<<<"Authorization: Bearer ${HINDSIGHT_API_TOKEN}"
    fi
    # Response body precedes diagnostics. No -L: never send credentials to a redirect target.
    if status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
        "${auth[@]}" "$@" --output /dev/stderr \
        --write-out '%{http_code}' "${api_url}${path}"); then
        printf '\nHTTP %s\n' "$status"
        case "$status" in
            2??) return 0 ;;
            3??) printf 'Redirect received: possible proxy interception or incorrect API URL.\n' >&2 ;;
            401|403) printf 'Authentication/access denied; check token and proxy policy.\n' >&2 ;;
            *) printf 'API request failed.\n' >&2 ;;
        esac
    else
        rc=$?
        printf '\ncurl failed (exit %s): check DNS, proxy, TLS or connectivity.\n' "$rc" >&2
    fi
    return 1
}

failed=0
probe 'Health' '/health' || failed=1
probe 'Recall' "/v1/default/banks/${bank_id}/memories/recall" \
    --header 'Content-Type: application/json' \
    --data '{"query":"Git commands","budget":"low"}' || failed=1
exit "$failed"
