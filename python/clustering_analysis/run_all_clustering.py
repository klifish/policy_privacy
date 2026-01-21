#!/usr/bin/env python3
"""
Run all clustering analysis scripts (PI, PCH, SPP) in sequence.
"""
import subprocess
import sys
from pathlib import Path


def run_script(script_name, args=[]):
    script_path = Path(__file__).parent / script_name
    print(f"\n{'='*60}")
    print(f"Running {script_name}...")
    print(f"{'='*60}")

    cmd = [sys.executable, str(script_path)] + args
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running {script_name}: {e}")
        sys.exit(1)


def main():
    # 1. PI Clustering
    run_script("analyze_pi_clustering.py", ["--plot"])

    # 2. PCH Clustering (Layer-wise)
    run_script("analyze_pch_clustering.py", ["--plot"])

    # 3. PCH Clustering (Global)
    run_script("analyze_pch_clustering.py", ["--plot", "--global-analysis"])

    # 4. PCH Clustering (ICD10)
    run_script("analyze_pch_clustering.py", ["--plot", "--icd10"])

    # 5. SPP Clustering
    run_script("analyze_spp_clustering.py", ["--plot"])

    print("\nAll clustering analyses completed successfully.")


if __name__ == "__main__":
    main()
