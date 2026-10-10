#!/bin/bash
# Double-click to start Haunts. Opens your browser; leave this window open while you use it.
cd "$(dirname "$0")"
if lsof -i :8142 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:8142"
  exit 0
fi
exec python3 server.py --lan --open
