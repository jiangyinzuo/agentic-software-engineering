#!/usr/bin/env bash
set -euo pipefail

input_pdf="$1"
output_txt="${2:-${input_pdf%.*}.txt}"

pdftotext -layout "$input_pdf" - | awk '
BEGIN {
    page = 1
    print "=== Page " page " ==="
}
{
    while (index($0, "\f")) {
        pos = index($0, "\f")
        before = substr($0, 1, pos - 1)
        after = substr($0, pos + 1)

        if (before != "") print before

        page++
        print "=== Page " page " ==="

        $0 = after
    }

    print
}
' > "$output_txt"

echo "Written: $output_txt"
