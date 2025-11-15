#!/usr/bin/env python3
"""
Start script for Cloud Service
Activates virtual environment and runs the FastAPI application
"""
import os
import sys
import subprocess
from pathlib import Path

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.absolute()

print("=" * 60)
print("Starting Cloud Service for Biometric Validation")
print("=" * 60)
print()

# Check if virtual environment exists
venv_path = PROJECT_ROOT.parent / "bmcloud"
if not venv_path.exists():
    print("ERROR: Virtual environment 'bmcloud' not found!")
    print(f"Expected at: {venv_path}")
    print()
    print("Please create the virtual environment first:")
    print("  python -m venv bmcloud")
    print("  bmcloud\\Scripts\\activate")
    print("  pip install -r src/requirements.txt")
    sys.exit(1)

# Check if .env exists
env_file = PROJECT_ROOT / ".env"
if not env_file.exists():
    print("WARNING: .env file not found!")
    print("Using default configuration...")
    print()

# Change to src directory
os.chdir(PROJECT_ROOT / "src")

# Activate virtual environment and run
python_exe = venv_path / "Scripts" / "python.exe"

if not python_exe.exists():
    print(f"ERROR: Python executable not found at {python_exe}")
    sys.exit(1)

print(f"Using Python: {python_exe}")
print(f"Working directory: {os.getcwd()}")
print()
print("Starting server...")
print("-" * 60)
print()

# Run uvicorn
try:
    subprocess.run([
        str(python_exe),
        "-m", "uvicorn",
        "app.main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload",
        "--log-level", "info"
    ], check=True)
except KeyboardInterrupt:
    print()
    print("Server stopped by user")
except subprocess.CalledProcessError as e:
    print(f"ERROR: Server failed with exit code {e.returncode}")
    sys.exit(1)
