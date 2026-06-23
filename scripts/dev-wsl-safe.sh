#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/.." && pwd -P)"
run_root="$repo_root"

if [[ "$repo_root" == /mnt/* ]]; then
  run_root="${PASCAL_WSL_DEV_DIR:-$HOME/.cache/pascal-editor-wsl-dev}"

  if [[ "$run_root" == /mnt/* ]]; then
    echo "PASCAL_WSL_DEV_DIR must point to WSL storage, not /mnt/*." >&2
    exit 1
  fi

  mkdir -p "$run_root"
  (
    flock 9
    rsync -a --delete \
      --exclude='.git/' \
      --exclude='.next/' \
      --exclude='.turbo/' \
      --exclude='.codex-logs/' \
      --exclude='node_modules/' \
      "$repo_root/" "$run_root/"
    rm -rf "$run_root/.turbo" "$run_root/apps/editor/.next" "$run_root/apps/editor/.turbo"
  ) 9>"$run_root/.sync.lock"
fi

cd "$run_root"

install_stamp="$run_root/node_modules/.pascal-install-stamp"
if [[ ! -d "$run_root/node_modules" || ! -f "$install_stamp" || "$run_root/bun.lock" -nt "$install_stamp" || "$run_root/package.json" -nt "$install_stamp" || "$run_root/apps/editor/package.json" -nt "$install_stamp" ]]; then
  bun install --frozen-lockfile
  mkdir -p "$run_root/node_modules"
  touch "$install_stamp"
fi

if [[ -f "$run_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$run_root/.env"
  set +a
fi

bun --cwd "$run_root/packages/core" build
bun --cwd "$run_root/packages/viewer" build
bun --cwd "$run_root/packages/nodes" build

exec bun --cwd "$run_root/apps/editor" dev
