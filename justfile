# Comment lines inside recipes are notes for us, not commands to echo.
set ignore-comments := true

# Generate the plain and protected apps into a temporary folder and run
# check, test and build on each, as a new app would.
test-variants:
    #!/usr/bin/env bash
    set -euo pipefail
    dir=$(mktemp -d)
    trap 'rm -rf "$dir"' EXIT
    for variant in plain protected; do
        flag=$([ "$variant" = protected ] && echo --protected || true)
        echo "== $variant"
        (cd "$dir" && bun "{{justfile_directory()}}/index.js" "$variant-app" $flag > /dev/null)
        for step in check test build; do
            (cd "$dir/$variant-app" && bun run "$step")
        done
    done
    echo "== every variant passed"

# Bump, publish to npm and push: just release patch|minor|major
release level="patch":
    # Refuse to release uncommitted work.
    git diff --quiet && git diff --cached --quiet
    # Bump package.json, commit it as "vX.Y.Z" and tag it vX.Y.Z.
    bun pm version {{level}}
    # Publish to npm (approve in the browser, 2FA).
    bun publish
    # Push the commit and only this release's tag, never --tags.
    git push --follow-tags origin main
