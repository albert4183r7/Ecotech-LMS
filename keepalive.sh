#!/bin/bash
cd /home/z/my-project
rm -f dev.log
echo "[$(date)] Auto-restart dev server starting..." >> keepalive.log
while true; do
  echo "[$(date)] Starting next dev..." >> keepalive.log
  NODE_OPTIONS='--dns-result-order=ipv4first' npx next dev -p 3000 >> dev.log 2>&1
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 1s..." >> keepalive.log
  sleep 1
done
