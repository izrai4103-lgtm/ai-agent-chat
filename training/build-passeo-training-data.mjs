import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, "passeo-training-2000.jsonl");

const SYSTEM = [
  "Kamu adalah Passeo-ai-Agent, AI assistant berbahasa Indonesia yang tegas, praktis, dan langsung kerja.",
  "Jawab request aman dengan solusi konkret. Untuk coding beri kode/test. Untuk matematika beri langkah ringkas dan jawaban final.",
  "Untuk kerja beri prioritas dan next action. Jangan tampilkan raw chain-of-thought internal."
].join(" ");

const counts = {
  coding: 500,
  math: 400,
  answer_quality: 400,
  work_execution: 400,
  debugging: 300
};

const languages = ["Python", "JavaScript", "TypeScript", "Go", "PHP", "SQL", "Bash", "HTML CSS"];
const codeTasks = [
  "validasi input form",
  "REST API sederhana",
  "cache data JSON",
  "parser log error",
  "pagination list",
  "rate limiter kecil",
  "CLI pembuat laporan",
  "fungsi retry request",
  "query agregasi penjualan",
  "komponen chat input"
];
const constraints = [
  "tanpa library eksternal",
  "hemat token dan mudah dites",
  "mobile friendly",
  "dengan error handling",
  "pakai struktur fungsi kecil",
  "jelaskan command test"
];

const workTasks = [
  "membuat rencana deploy website",
  "menyusun laporan harian tim",
  "memecah deadline proyek menjadi sprint",
  "membuat SOP customer support",
  "menyiapkan checklist audit bug",
  "mengatur prioritas fitur produk",
  "membuat brief desain aplikasi",
  "menyusun email follow up klien"
];
const debugSymptoms = [
  "fetch gagal karena CORS",
  "tombol submit tidak aktif",
  "layout mobile turun ke bawah",
  "data localStorage tidak update",
  "API mengembalikan 503",
  "textarea menutup keyboard",
  "query database lambat",
  "build gagal karena import salah"
];
const answerPrompts = [
  "jawab sapaan user",
  "ringkas artikel teknis",
  "jelaskan konsep API",
  "beri keputusan dari dua opsi",
  "ubah instruksi kasar menjadi task teknis",
  "buat checklist singkat",
  "tolak request berbahaya dengan ringkas",
  "jawab request aman tanpa refusal"
];

function mod(index, array) {
  return array[index % array.length];
}

function codingSample(index) {
  const language = mod(index, languages);
  const task = mod(Math.floor(index / languages.length), codeTasks);
  const constraint = mod(index + 3, constraints);
  return {
    category: "coding",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Buat ${task} pakai ${language}, ${constraint}.` },
      {
        role: "assistant",
        content: [
          `Target: ${task} dengan ${language}.`,
          "Langkah: 1. validasi input, 2. proses data, 3. tangani error, 4. test kasus utama.",
          "Output: tulis implementasi kecil yang bisa langsung dijalankan, lalu sertakan command/test minimal.",
          `Catatan: prioritaskan ${constraint}, jangan tambah dependency kalau tidak perlu.`
        ].join("\n")
      }
    ]
  };
}

function mathSample(index) {
  const a = 7 + (index % 37);
  const b = 3 + (index % 19);
  const c = 2 + (index % 11);
  const mode = index % 4;
  if (mode === 0) {
    return {
      category: "math",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Hitung ${a} x ${b} + ${c}.` },
        { role: "assistant", content: `${a} x ${b} = ${a * b}. Tambah ${c} menjadi ${a * b + c}. Jawaban final: ${a * b + c}.` }
      ]
    };
  }
  if (mode === 1) {
    const result = a + b;
    return {
      category: "math",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Jika x - ${b} = ${a}, berapa x?` },
        { role: "assistant", content: `Pindahkan ${b} ke kanan: x = ${a} + ${b}. Jadi x = ${result}.` }
      ]
    };
  }
  if (mode === 2) {
    const total = a + b + c;
    return {
      category: "math",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Rata-rata dari ${a}, ${b}, dan ${c} berapa?` },
        { role: "assistant", content: `Jumlah data = ${a} + ${b} + ${c} = ${total}. Rata-rata = ${total} / 3 = ${(total / 3).toFixed(2)}.` }
      ]
    };
  }
  const percent = (a * b).toFixed(0);
  return {
    category: "math",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Berapa ${a}% dari ${b * 100}?` },
      { role: "assistant", content: `${a}% = ${a}/100. Maka ${a}/100 x ${b * 100} = ${percent}. Jawaban final: ${percent}.` }
    ]
  };
}

function answerSample(index) {
  const prompt = mod(index, answerPrompts);
  const safe = index % 7 !== 0;
  return {
    category: "answer_quality",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${prompt}. Buat jawaban singkat dan berguna.` },
      {
        role: "assistant",
        content: safe
          ? "Jawaban inti dulu: bantu user dengan langkah konkret, bahasa jelas, dan detail secukupnya. Jika request aman, jangan refusal."
          : "Untuk request berbahaya, tolak singkat dan arahkan ke alternatif aman yang masih membantu."
      }
    ]
  };
}

function workSample(index) {
  const task = mod(index, workTasks);
  return {
    category: "work_execution",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Buat rencana kerja untuk ${task}.` },
      {
        role: "assistant",
        content: [
          `Tujuan: ${task}.`,
          "Prioritas: 1. tentukan output final, 2. pecah tugas, 3. tetapkan deadline, 4. cek risiko.",
          "Next action: kerjakan item pertama yang paling membuka dependensi, lalu review hasilnya."
        ].join("\n")
      }
    ]
  };
}

function debuggingSample(index) {
  const symptom = mod(index, debugSymptoms);
  return {
    category: "debugging",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Debug masalah: ${symptom}.` },
      {
        role: "assistant",
        content: [
          `Gejala: ${symptom}.`,
          "Cek cepat: reproduksi, baca error, isolasi perubahan terakhir, validasi input/output.",
          "Fix minimal: ubah bagian yang langsung menyebabkan gejala, lalu test ulang sebelum refactor."
        ].join("\n")
      }
    ]
  };
}

const builders = [
  ["coding", codingSample],
  ["math", mathSample],
  ["answer_quality", answerSample],
  ["work_execution", workSample],
  ["debugging", debuggingSample]
];

const rows = [];
for (const [category, builder] of builders) {
  for (let index = 0; index < counts[category]; index += 1) {
    rows.push({
      id: `passeo-${category}-${String(index + 1).padStart(4, "0")}`,
      ...builder(index),
      metadata: {
        app: "Passeo-ai-Agent",
        training_core: "2000x",
        category,
        index: index + 1
      }
    });
  }
}

writeFileSync(outputPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
console.log(`Generated ${rows.length} training rows at ${outputPath}`);
