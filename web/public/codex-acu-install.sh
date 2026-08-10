#!/usr/bin/env sh
set -eu

DEFAULT_BASE_URL="https://api.acucompute.com/v1"
FALLBACK_BASE_URL="https://acu-api-direct.jerrypsy.top/v1"
MIN_CODEX_VERSION="0.124.0"
PUBLIC_ASSET_BASE="https://api.acucompute.com"
DIRECT_ASSET_BASE="https://acu-api-direct.jerrypsy.top"
RAW_ASSET_BASE="https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu"
PUBLIC_CODEX_MIRROR_BASE="$PUBLIC_ASSET_BASE/codex-releases"
DIRECT_CODEX_MIRROR_BASE="$DIRECT_ASSET_BASE/codex-releases"
OFFICIAL_CODEX_RELEASES_BASE="https://releases.openai.com/codex"

usage() {
  echo "usage: install.sh [--base-url URL] [--bin-dir DIR] [--acu-home DIR] [--skip-network-check] [--skip-live-verify]" >&2
}

base_url=
bin_dir=${CODEX_ACU_BIN_DIR:-${HOME}/.local/bin}
acu_home=${CODEX_ACU_HOME:-${XDG_DATA_HOME:-${HOME}/.local/share}/codex-acu}
native_bin_dir="$acu_home/bin"
skip_network_check=${CODEX_ACU_SKIP_NETWORK_CHECK:-0}
live_verify=${CODEX_ACU_LIVE_VERIFY:-1}
cli_verify=${CODEX_ACU_CLI_VERIFY:-0}
update_codex=${CODEX_ACU_UPDATE_CODEX:-1}
prefer_npm=${CODEX_ACU_PREFER_NPM:-1}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url) base_url=${2:-}; shift 2 ;;
    --bin-dir) bin_dir=${2:-}; shift 2 ;;
    --acu-home) acu_home=${2:-}; shift 2 ;;
    --skip-network-check) skip_network_check=1; shift ;;
    --skip-live-verify) live_verify=0; shift ;;
    *) usage; exit 2 ;;
  esac
done

case "$base_url" in
  "") ;;
  https://*/v1) ;;
  *) echo "--base-url must be an HTTPS URL ending in /v1" >&2; exit 2 ;;
esac

download_file() {
  url=$1
  output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 10 --max-time 300 "$url" -o "$output"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 300 -O "$output" "$url"
    return
  fi
  echo "curl or wget is required" >&2
  return 1
}

file_sha256() {
  path=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
    return
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$path" | sed 's/^.*= //'
    return
  fi
  printf 'UNAVAILABLE\n'
}

codex_version() {
  "$1" --version 2>/dev/null | sed -n 's/.* \([0-9][0-9A-Za-z.+-]*\)$/\1/p' | head -n 1
}

version_at_least() {
  awk -v have="$1" -v need="$2" 'BEGIN {
    sub(/[-+].*$/, "", have)
    sub(/[-+].*$/, "", need)
    split(have, h, ".")
    split(need, n, ".")
    for (i = 1; i <= 3; i++) {
      hv = h[i] + 0
      nv = n[i] + 0
      if (hv > nv) exit 0
      if (hv < nv) exit 1
    }
    exit 0
  }'
}

usable_codex() {
  candidate=$1
  [ -x "$candidate" ] || return 1
  version=$(codex_version "$candidate")
  [ -n "$version" ] || return 1
  version_at_least "$version" "$MIN_CODEX_VERSION"
}

download_codex_installer() {
  output=$1
  for url in \
    "$PUBLIC_CODEX_MIRROR_BASE/install.sh" \
    "$DIRECT_CODEX_MIRROR_BASE/install.sh" \
    "https://chatgpt.com/codex/install.sh"; do
    if download_file "$url" "$output"; then
      return
    fi
  done
  return 1
}

install_codex_official() {
  installer=$1
  patched_installer=$2
  echo "Installing the latest Codex CLI into the private ACU runtime..."
  if ! download_codex_installer "$installer"; then
    return 1
  fi
  sed \
    's|^RELEASES_BASE_URL="https://releases.openai.com/codex"$|RELEASES_BASE_URL="${CODEX_RELEASES_BASE_URL:-https://releases.openai.com/codex}"|' \
    "$installer" > "$patched_installer"
  for releases_base in \
    "$DIRECT_CODEX_MIRROR_BASE" \
    "$PUBLIC_CODEX_MIRROR_BASE" \
    "$OFFICIAL_CODEX_RELEASES_BASE"; do
    echo "Trying Codex releases from $releases_base..."
    if CODEX_NON_INTERACTIVE=1 \
      CODEX_INSTALL_DIR="$native_bin_dir" \
      CODEX_HOME="$acu_home/native-codex" \
      CODEX_RELEASE="${CODEX_ACU_CODEX_VERSION:-latest}" \
      CODEX_RELEASES_BASE_URL="$releases_base" \
      CODEX_INSTALLER_USE_RELEASES_OPENAI_COM=1 \
      sh "$patched_installer"; then
      return
    fi
  done
  return 1
}

install_codex_npm() {
  command -v npm >/dev/null 2>&1 || return 1
  npm_prefix="$acu_home/npm"
  mkdir -p "$npm_prefix"
  codex_release=${CODEX_ACU_CODEX_VERSION:-latest}
  for registry in "https://registry.npmjs.org" "https://registry.npmmirror.com"; do
    echo "Installing Codex CLI $codex_release from $registry..."
    if npm install --global --prefix "$npm_prefix" "@openai/codex@$codex_release" \
      --registry="$registry" --fetch-retries=1 --fetch-timeout=60000 &&
      usable_codex "$npm_prefix/bin/codex"; then
      return 0
    fi
  done
  return 1
}

find_managed_codex() {
  for candidate in \
    "$native_bin_dir/codex" \
    "$acu_home/npm/bin/codex" \
    "$acu_home/npm/codex"; do
    if [ -n "$candidate" ] && usable_codex "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 1
}

find_system_codex() {
  candidate=$(command -v codex 2>/dev/null || true)
  if [ -n "$candidate" ] && usable_codex "$candidate"; then
    printf '%s\n' "$candidate"
    return
  fi
  return 1
}

endpoint_available() {
  endpoint=$1
  key=$2
  [ "$skip_network_check" = "1" ] && return 0
  command -v curl >/dev/null 2>&1 || return 1
  curl -fsS --connect-timeout 8 --max-time 20 \
    -H "Authorization: Bearer $key" \
    "$endpoint/models" >/dev/null
}

download_asset() {
  local_path=$1
  public_name=$2
  raw_name=$3
  output=$4
  if [ -f "$local_path" ]; then
    cp "$local_path" "$output"
    return
  fi
  for url in \
    "$PUBLIC_ASSET_BASE/$public_name" \
    "$DIRECT_ASSET_BASE/$public_name" \
    "$RAW_ASSET_BASE/$raw_name"; do
    if download_file "$url" "$output"; then
      return
    fi
  done
  echo "failed to download $public_name from all configured sources" >&2
  return 1
}

register_path() {
  case ":${PATH}:" in
    *":${bin_dir}:"*) return ;;
  esac
  path_export="export PATH=\"${bin_dir}:\$PATH\""
  shell_name=$(basename "${SHELL:-sh}")
  profiles=
  case "$shell_name" in
    zsh) profiles="$HOME/.zprofile $HOME/.zshrc" ;;
    bash) profiles="$HOME/.bash_profile $HOME/.bashrc" ;;
    *) profiles="$HOME/.profile" ;;
  esac
  wrote_profile=0
  for profile in $profiles; do
    if [ -f "$profile" ]; then
      if ! grep -Fq "$bin_dir" "$profile"; then
        printf '\n%s\n' "$path_export" >> "$profile"
      fi
      wrote_profile=1
    fi
  done
  if [ "$wrote_profile" = "0" ]; then
    printf '%s\n' "$path_export" >> "$HOME/.profile"
  fi
}

mkdir -p "$bin_dir" "$native_bin_dir" "$acu_home"
chmod 700 "$acu_home"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-acu-install.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

managed_codex=$(find_managed_codex || true)
native_codex=$managed_codex
npm_attempted=0
if [ "$update_codex" != "0" ] && [ "$prefer_npm" != "0" ]; then
  npm_attempted=1
  if install_codex_npm; then
    native_codex=$(find_managed_codex || true)
  fi
fi
if [ -z "$native_codex" ]; then native_codex=$(find_system_codex || true); fi
if [ -z "$native_codex" ] && [ "$npm_attempted" = "0" ] && [ "$prefer_npm" != "0" ]; then
  npm_attempted=1
  if install_codex_npm; then
    native_codex=$(find_managed_codex || true)
  fi
fi
if [ -z "$native_codex" ]; then
  install_codex_official "$tmp_dir/codex-install.sh" "$tmp_dir/codex-install-patched.sh" || true
  native_codex=$(find_managed_codex || true)
fi
[ -n "$native_codex" ] || { echo "Codex installation completed but no usable codex binary was found" >&2; exit 1; }

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || printf '.')
download_asset "$script_dir/codex-acu" "codex-acu" "codex-acu" "$tmp_dir/codex-acu"
download_asset "$script_dir/model-catalog.json" "codex-acu-model-catalog.json" "model-catalog.json" "$tmp_dir/model-catalog.json"
chmod 755 "$tmp_dir/codex-acu"
chmod 600 "$tmp_dir/model-catalog.json"
mv "$tmp_dir/codex-acu" "$bin_dir/codex-acu"
mv "$tmp_dir/model-catalog.json" "$acu_home/model-catalog.json"

api_key=${ACU_API_KEY:-}
credential_file="$acu_home/credentials"
if [ -z "$api_key" ] && [ -s "$credential_file" ]; then
  IFS= read -r api_key < "$credential_file"
fi
case "$api_key" in
  sk-?*) ;;
  *)
    echo "ACU_API_KEY must be provided in the install command and start with sk-" >&2
    echo "example: curl -fsSL $PUBLIC_ASSET_BASE/codex-acu-install.sh | ACU_API_KEY='sk-...' sh" >&2
    exit 2
    ;;
esac
case "$api_key" in
  *'
'*) echo "ACU_API_KEY must be a single line" >&2; exit 2 ;;
esac
credential_tmp="$acu_home/credentials.tmp"
(umask 077; printf '%s\n' "$api_key" > "$credential_tmp")
chmod 600 "$credential_tmp"
mv "$credential_tmp" "$credential_file"

if [ -z "$base_url" ]; then
  for candidate in "$DEFAULT_BASE_URL" "$FALLBACK_BASE_URL"; do
    if endpoint_available "$candidate" "$api_key"; then
      base_url=$candidate
      break
    fi
  done
fi
[ -n "$base_url" ] || {
  echo "Neither ACU Responses endpoint is reachable with this API Key." >&2
  exit 1
}

config_tmp="$acu_home/config.toml.tmp"
cat >"$config_tmp" <<EOF
model = "acu-auto"
model_provider = "acu-founder-alpha"
model_reasoning_effort = "medium"
model_context_window = 272000
model_auto_compact_token_limit = 258400
model_auto_compact_token_limit_scope = "total"
model_catalog_json = "$acu_home/model-catalog.json"

[model_providers.acu-founder-alpha]
name = "ACU Router Founder Alpha"
base_url = "$base_url"
env_key = "ACU_API_KEY"
wire_api = "responses"
EOF
chmod 600 "$config_tmp"
mv "$config_tmp" "$acu_home/config.toml"

printf '%s\n' "$native_codex" > "$acu_home/native-codex-path"
chmod 600 "$acu_home/native-codex-path"
native_config=${CODEX_NATIVE_HOME:-${HOME}/.codex}/config.toml
if [ -f "$native_config" ]; then
  file_sha256 "$native_config" > "$acu_home/native-config.sha256"
else
  printf '%s\n' MISSING > "$acu_home/native-config.sha256"
fi
chmod 600 "$acu_home/native-config.sha256"

CODEX_ACU_HOME="$acu_home" \
  CODEX_ACU_SKIP_ENDPOINT_PREFLIGHT="$skip_network_check" \
  "$bin_dir/codex-acu" doctor
if [ "$live_verify" != "0" ] && [ "$cli_verify" = "1" ]; then
  echo "Verifying a real Codex ACU request..."
  validation_output=$(CODEX_ACU_HOME="$acu_home" "$bin_dir/codex-acu" \
    exec --skip-git-repo-check --ephemeral "Return exactly CODEX_ACU_OK" 2>&1) || {
    printf '%s\n' "$validation_output" >&2
    echo "codex-acu live verification failed" >&2
    exit 1
  }
  printf '%s\n' "$validation_output" | grep -q 'CODEX_ACU_OK' || {
    printf '%s\n' "$validation_output" >&2
    echo "codex-acu verification did not return CODEX_ACU_OK" >&2
    exit 1
  }
fi

echo "codex-acu installed: $bin_dir/codex-acu"
echo "Codex version: $(codex_version "$native_codex")"
echo "ACU endpoint: $base_url"
register_path
case ":${PATH}:" in
  *":${bin_dir}:"*) ;;
  *) echo "Open a new terminal or run: export PATH=\"$bin_dir:\$PATH\"" ;;
esac
