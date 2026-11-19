#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -x backend/.venv/bin/python ]; then
  python3 -m venv backend/.venv
fi
backend/.venv/bin/python -m pip install --disable-pip-version-check -r backend/requirements.txt
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
fi
exec backend/.venv/bin/python launch.py
