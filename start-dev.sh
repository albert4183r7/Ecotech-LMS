#!/bin/bash
cd /home/z/my-project
while true; do
  NODE_OPTIONS='--dns-result-order=ipv4first' npx next dev -p 3000 2>&1 | tee -a dev.log
  echo "[$(date)] Server died, restarting in 2s..." >> dev.log
  sleep 2
done
