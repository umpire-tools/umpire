#!/usr/bin/env bash
# Manual publish script — use when the CI publish workflow misses a release.
# Publishes all packages whose local version is not yet on npm.
# Requires: npm login (run `npm whoami` to verify), yarn build already run.
#
# Usage:
#   yarn build
#   ./scripts/publish-manual.sh
#   ./scripts/publish-manual.sh --dry-run   # print what would be published

set -euo pipefail

# stadium palette (ANSI 256)
C_GREEN="\033[38;5;78m"
C_YELLOW="\033[38;5;220m"
C_RED="\033[38;5;167m"
C_BLUE="\033[38;5;75m"
C_DIM="\033[38;5;243m"
C_BOLD="\033[1m"
C_RESET="\033[0m"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "  ${C_DIM}dry run — no packages will be published${C_RESET}"
  echo ""
fi

PACKAGES=(
  core
  dsl
  json
  reads
  write
  drizzle
  devtools
  store
  signals
  react
  redux
  pinia
  tanstack-store
  vuex
  zustand
  zod
  testing
  eslint-plugin
  solid
)

# Find which packages need publishing
TO_PUBLISH=()
TO_SKIP=()

for pkg in "${PACKAGES[@]}"; do
  PKG_DIR="$ROOT/packages/$pkg"
  VERSION=$(node -p "require('$PKG_DIR/package.json').version")
  PKG_NAME=$(node -p "require('$PKG_DIR/package.json').name")

  if npm show "$PKG_NAME@$VERSION" version > /dev/null 2>&1; then
    TO_SKIP+=("$pkg")
  else
    TO_PUBLISH+=("$pkg")
  fi
done

echo ""
echo -e "  ${C_GREEN}${C_BOLD}umpire${C_RESET}  manual publish"
echo ""

if [[ ${#TO_SKIP[@]} -gt 0 ]]; then
  for pkg in "${TO_SKIP[@]}"; do
    VERSION=$(node -p "require('$ROOT/packages/$pkg/package.json').version")
    echo -e "  ${C_DIM}✓ @umpire/$pkg@$VERSION — already published${C_RESET}"
  done
fi

if [[ ${#TO_PUBLISH[@]} -eq 0 ]]; then
  echo ""
  echo -e "  ${C_GREEN}all packages already published${C_RESET}"
  echo ""
  exit 0
fi

echo ""
for pkg in "${TO_PUBLISH[@]}"; do
  VERSION=$(node -p "require('$ROOT/packages/$pkg/package.json').version")
  TAG="latest"
  if echo "$VERSION" | grep -q "-"; then TAG="alpha"; fi
  echo -e "  ${C_YELLOW}→${C_RESET}  ${C_BOLD}@umpire/$pkg${C_RESET}@${VERSION}  ${C_DIM}(tag: $TAG)${C_RESET}"
done
echo ""

if $DRY_RUN; then
  echo -e "  ${C_DIM}(dry run — no changes)${C_RESET}"
  echo ""
  exit 0
fi

# Check npm auth before prompting for OTP
if ! npm whoami &>/dev/null; then
  echo -e "  ${C_RED}not logged in to npm${C_RESET}"
  echo -e "  ${C_DIM}run: npm login${C_RESET}"
  echo ""
  exit 1
fi

read -rsp "  OTP: " OTP
echo ""
echo ""

FAILED=()
for pkg in "${TO_PUBLISH[@]}"; do
  PKG_DIR="$ROOT/packages/$pkg"
  VERSION=$(node -p "require('$PKG_DIR/package.json').version")
  PKG_NAME=$(node -p "require('$PKG_DIR/package.json').name")
  TAG="latest"
  if echo "$VERSION" | grep -q "-"; then TAG="alpha"; fi

  printf "  %-34s " "@umpire/$pkg@$VERSION"
  if (
    cd "$PKG_DIR"
    yarn pack -o package.tgz 2>/dev/null
    npm publish package.tgz --access public --tag "$TAG" --otp="$OTP" 2>/dev/null
    rm -f package.tgz
  ); then
    echo -e "${C_GREEN}✓${C_RESET}"
  else
    echo -e "${C_RED}✗${C_RESET}"
    FAILED+=("$pkg")
    rm -f "$PKG_DIR/package.tgz" 2>/dev/null || true
  fi
done

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo -e "  ${C_GREEN}done${C_RESET} — ${#TO_PUBLISH[@]} packages published"
else
  echo -e "  ${C_RED}failed:${C_RESET} ${FAILED[*]}"
  echo -e "  ${C_DIM}re-run: $0 (check npm auth / OTP and try again)${C_RESET}"
  exit 1
fi
echo ""
