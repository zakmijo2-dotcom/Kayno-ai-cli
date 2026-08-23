#!/bin/sh
set -eu

REPO="zakmijo2-dotcom/Kayno-ai-cli"
BRANCH="${NOVA_BRANCH:-main}"
INSTALL_DIR="${NOVA_INSTALL_DIR:-$HOME/.nova-cli}"
BIN_DIR="${NOVA_BIN_DIR:-$HOME/.local/bin}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 is required"; exit 1; }
}
need curl
need tar
command -v node >/dev/null 2>&1 || { echo "✗ node >= 18 required (https://nodejs.org)"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ downloading nova ($BRANCH)..."
curl -fsSL "https://github.com/$REPO/archive/$BRANCH.tar.gz" -o "$TMP/nova.tar.gz"

echo "→ installing to $INSTALL_DIR..."
tar -xzf "$TMP/nova.tar.gz" -C "$TMP"
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/app"
mv "$TMP/Kayno-ai-cli-$BRANCH" "$INSTALL_DIR/app"
chmod +x "$INSTALL_DIR/app/bin/"*.js

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/app/bin/nova.js" "$BIN_DIR/nova"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo
    echo "⚠ add to your shell profile:"
    echo "    export PATH=\"$BIN_DIR:\$PATH\""
    echo
    ;;
esac

"$BIN_DIR/nova" --version >/dev/null && echo "✓ installed — run: nova --help"
