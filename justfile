# Comment lines inside recipes are notes for us, not commands to echo.
set ignore-comments := true

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
