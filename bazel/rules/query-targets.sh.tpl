tmp="$(mktemp)"

exec > "$tmp"

echo 'TARGETS = ['

(bazel query %{query}) | while read -r target; do
    echo '    "'"$target"'"',
done

echo ']'

mv "$tmp" %{output}
