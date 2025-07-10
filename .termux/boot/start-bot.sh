#!/data/data/com.termux/files/usr/bin/bash

# Kunci CPU agar tidak tidur
termux-wake-lock

# Jalankan tmux hanya kalau belum berjalan
tmux has-session -t botwa 2>/dev/null

if [ $? != 0 ]; then
  # Start bot WhatsApp dalam sesi tmux
  tmux new-session -d -s botwa "cd ~/hitori && node ."
fi
