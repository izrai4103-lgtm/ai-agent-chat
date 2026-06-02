# Passeo Training 2000x

Folder ini berisi paket training/eval untuk Passeo-ai-Agent:

- `build-passeo-training-data.mjs` membuat 2000 sample instruksi.
- `passeo-training-2000.jsonl` adalah dataset chat JSONL hasil generate.

Komposisi:

- 500 coding drills
- 400 math drills
- 400 answer-quality drills
- 400 work-execution drills
- 300 debugging drills

Catatan teknis: dataset ini bisa dipakai untuk fine-tune/QLoRA model 7B yang kamu host sendiri. Endpoint eksternal gratis tidak bisa di-fine-tune langsung dari browser, jadi app memakai training core sebagai prompt/planner layer saat runtime.
