#!/data/data/com.termux/files/usr/bin/bash

SESSION_NAME=hitori_bot

if ! tmux has-session -t $SESSION_NAME 2>/dev/null; then
    cd ~/hitori || exit
    tmux new-session -d -s $SESSION_NAME "node ."
fi
