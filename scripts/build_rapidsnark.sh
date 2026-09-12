#!/usr/bin/env bash
# Build the rapidsnark native Groth16 prover into build/rapidsnark.
#
# lib/prover.js picks the resulting binary up automatically (PROVER_BACKEND=auto)
# and proves ~10x faster than snarkjs on the same zkey. Nothing else changes:
# rapidsnark reads the snarkjs .zkey/.wtns and writes the same proof layout.
#
# Requirements: git, cmake, a C++ toolchain. GMP is built from source by the
# rapidsnark tree itself. Re-running is idempotent; delete build/rapidsnark to
# start over.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RS_DIR="$REPO_ROOT/build/rapidsnark"
RS_REF="${RAPIDSNARK_REF:-main}"

case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  PLATFORM=macos_arm64 ;;
    Darwin-x86_64) PLATFORM=macos_x86_64 ;;
    Linux-x86_64)  PLATFORM=host ;;
    Linux-aarch64) PLATFORM=host ;;
    *) echo "unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

command -v cmake >/dev/null || { echo "cmake is required (macOS: brew install cmake)" >&2; exit 1; }

if [ ! -d "$RS_DIR/.git" ]; then
    git clone --depth 1 --branch "$RS_REF" --recurse-submodules --shallow-submodules \
        https://github.com/iden3/rapidsnark.git "$RS_DIR"
fi
cd "$RS_DIR"

if [ ! -d "depends/gmp/package_$PLATFORM" ] && [ ! -d "depends/gmp/package" ]; then
    ./build_gmp.sh "$PLATFORM"
fi

# Some Command Line Tools installs ship clang without its own libc++ headers
# (CommandLineTools/usr/include/c++/v1 is absent) while the SDK copy exists.
# Point the build at the SDK copy so <cstdint> and friends resolve.
EXTRA_CXX_FLAGS=""
if [ "$(uname -s)" = "Darwin" ]; then
    SDK_PATH="$(xcrun --show-sdk-path)"
    if ! echo '#include <cstdint>' | clang++ -x c++ -fsyntax-only - 2>/dev/null; then
        EXTRA_CXX_FLAGS="-isystem $SDK_PATH/usr/include/c++/v1"
    fi
fi

BUILD_DIR="build_prover_$PLATFORM"
[ "$PLATFORM" = host ] && BUILD_DIR="build_prover"
rm -rf "$BUILD_DIR" && mkdir "$BUILD_DIR" && cd "$BUILD_DIR"
cmake .. -DTARGET_PLATFORM="$PLATFORM" -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="../package_$PLATFORM" \
    ${EXTRA_CXX_FLAGS:+-DCMAKE_CXX_FLAGS="$EXTRA_CXX_FLAGS"}
make -j"$(getconf _NPROCESSORS_ONLN)"
make install

PROVER="$RS_DIR/package_$PLATFORM/bin/prover"
[ "$PLATFORM" = host ] && PROVER="$RS_DIR/package/bin/prover"
[ -x "$PROVER" ] || { echo "build finished but $PROVER is missing" >&2; exit 1; }
echo "rapidsnark prover: $PROVER"
