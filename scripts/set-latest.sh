#!/usr/bin/env bash
set -euo pipefail

# Promote published packages to the "latest" dist-tag on npm.
#
# Usage:
#   ./scripts/set-latest.sh                 # interactive — shows changed packages, lets you pick
#   ./scripts/set-latest.sh --all           # tag all packages (no prompts except OTP)
#   ./scripts/set-latest.sh --changed       # tag only packages with code changes since last tag
#   ./scripts/set-latest.sh core react      # tag specific packages by short name
#   ./scripts/set-latest.sh --dry-run       # show what would be tagged, don't do it

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# stadium palette (ANSI 256)
C_GREEN="\033[38;5;78m"
C_YELLOW="\033[38;5;220m"
C_RED="\033[38;5;167m"
C_BLUE="\033[38;5;75m"
C_DIM="\033[38;5;243m"
C_BOLD="\033[1m"
C_RESET="\033[0m"

ALL_PACKAGES=(core json signals react zustand store redux tanstack-store zod reads devtools testing pinia vuex eslint-plugin solid)
DRY_RUN=false
MODE=""
VERSION=""
EXPLICIT=()

for arg in "$@"; do
  case "$arg" in
    --all)       MODE="all" ;;
    --changed)   MODE="changed" ;;
    --dry-run)   DRY_RUN=true ;;
    --version=*) VERSION="${arg#--version=}" ;;
    -*)          echo -e "${C_RED}Unknown flag: $arg${C_RESET}" >&2; exit 1 ;;
    *)           EXPLICIT+=("$arg") ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  VERSION=$(node -p "require('$ROOT/packages/core/package.json').version")
fi

# Find the current and previous version tags.
_all_tags=$(git tag --list 'v0.*' --sort=-version:refname)
_stable_tags=$(echo "$_all_tags" | grep -v '-' || true)
_tags="${_stable_tags:-$_all_tags}"
CURR_TAG=$(echo "$_tags" | head -1)
PREV_TAG=$(echo "$_tags" | sed -n '2p')

# Determine which packages had real code changes
changed_packages() {
  if [[ -z "$PREV_TAG" ]]; then
    printf '%s\n' "${ALL_PACKAGES[@]}"
    return
  fi
  local compare_to="$CURR_TAG"
  local tag_msg
  tag_msg=$(git log -1 --format=%s "$CURR_TAG" 2>/dev/null || echo "")
  if [[ "$tag_msg" == *"Bump all packages"* ]]; then
    compare_to="${CURR_TAG}^"
  fi
  git diff --name-only "$PREV_TAG".."$compare_to" -- packages/ \
    | sed 's|packages/\([^/]*\)/.*|\1|' \
    | sort -u
}

CHANGED=($(changed_packages))

# Resolve which packages to tag
TARGETS=()
if [[ ${#EXPLICIT[@]} -gt 0 ]]; then
  TARGETS=("${EXPLICIT[@]}")
elif [[ "$MODE" == "all" ]]; then
  TARGETS=("${ALL_PACKAGES[@]}")
elif [[ "$MODE" == "changed" ]]; then
  TARGETS=("${CHANGED[@]}")
else
  # Interactive mode
  echo ""
  echo -e "  ${C_GREEN}${C_BOLD}umpire${C_RESET}  ${C_DIM}${PREV_TAG:-"(no tags)"} -> ${CURR_TAG:-"(no tags)"}${C_RESET}"
  echo ""

  for pkg in "${ALL_PACKAGES[@]}"; do
    local_changed=false
    for c in "${CHANGED[@]}"; do
      if [[ "$c" == "$pkg" ]]; then local_changed=true; break; fi
    done
    if $local_changed; then
      echo -e "  ${C_GREEN}●${C_RESET} ${C_BOLD}$pkg${C_RESET}"
    else
      echo -e "  ${C_DIM}○ $pkg${C_RESET}"
    fi
  done

  echo ""
  echo -e "  ${C_BLUE}1${C_RESET}) Changed only ${C_DIM}(${CHANGED[*]})${C_RESET}"
  echo -e "  ${C_BLUE}2${C_RESET}) All packages"
  echo -e "  ${C_BLUE}3${C_RESET}) Pick specific"
  echo -e "  ${C_DIM}q) quit${C_RESET}"
  echo ""
  read -rp "  > " choice
  choice="${choice:-1}"

  case "$choice" in
    1) TARGETS=("${CHANGED[@]}") ;;
    2) TARGETS=("${ALL_PACKAGES[@]}") ;;
    3) read -rp "  packages: " -a TARGETS ;;
    q|Q) echo ""; exit 0 ;;
    *) echo -e "  ${C_RED}invalid choice${C_RESET}"; exit 1 ;;
  esac
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo -e "  ${C_DIM}nothing to tag${C_RESET}"
  exit 0
fi

# Expand short names to full npm package names
FULL_NAMES=()
for t in "${TARGETS[@]}"; do
  FULL_NAMES+=("@umpire/$t")
done

echo ""
echo -e "  ${C_YELLOW}latest${C_RESET} -> ${C_BOLD}${VERSION}${C_RESET}"
echo ""
for name in "${FULL_NAMES[@]}"; do
  echo -e "    ${C_DIM}▸${C_RESET} $name"
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
for i in "${!FULL_NAMES[@]}"; do
  PKG="${FULL_NAMES[$i]}"
  printf "  %-30s " "$PKG"
  if npm dist-tag add "$PKG@$VERSION" latest --otp="$OTP" 2>/dev/null; then
    echo -e "${C_GREEN}✓${C_RESET}"
  else
    echo -e "${C_RED}✗${C_RESET}"
    FAILED+=("${TARGETS[$i]}")
  fi
done

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo -e "  ${C_GREEN}done${C_RESET} — ${#FULL_NAMES[@]} packages -> latest@${VERSION}"
else
  echo -e "  ${C_RED}failed:${C_RESET} ${FAILED[*]}"
  echo -e "  ${C_DIM}re-run: $0 ${FAILED[*]}${C_RESET}"
  exit 1
fi
echo ""
