(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const MAX_KEYWORDS = 8;
  const MAX_OBJECTIVE_CHARS = 760;
  const MAX_DIGEST_CHARS = 1200;

  const INTENTS = [
    {
      id: "code",
      label: "software engineering",
      pattern: /\b(code|kode|python|javascript|typescript|html|css|sql|bash|php|golang|go|debug|bug|error|fix|perbaiki|update|repo|github|deploy|api|db|database|function|class|file|script)\b/i,
      temperature: 0.42,
      maxOutputTokens: 4096,
      priorities: [
        "ubah permintaan menjadi langkah implementasi konkret",
        "jaga kompatibilitas dengan kode yang sudah ada",
        "verifikasi syntax, alur data, dan edge case utama",
        "jawab dengan hasil yang bisa langsung dipakai"
      ]
    },
    {
      id: "analysis",
      label: "deep analysis",
      pattern: /\b(analisa|analisis|bandingkan|evaluasi|riset|strategi|kenapa|mengapa|sebab|akar masalah|reason|compare|evaluate|strategy)\b/i,
      temperature: 0.55,
      maxOutputTokens: 3072,
      priorities: [
        "pisahkan fakta, asumsi, dan kesimpulan",
        "jawab tajam tanpa mengarang kepastian",
        "beri keputusan praktis jika data cukup"
      ]
    },
    {
      id: "planning",
      label: "planning",
      pattern: /\b(rencana|planning|plan|roadmap|langkah|workflow|arsitektur|sistem|buatkan alur|susun)\b/i,
      temperature: 0.5,
      maxOutputTokens: 3072,
      priorities: [
        "pecah tujuan menjadi urutan eksekusi",
        "tentukan dependensi dan risiko",
        "pilih langkah paling hemat waktu"
      ]
    },
    {
      id: "creative",
      label: "creative generation",
      pattern: /\b(tulis|buat caption|copywriting|nama|ide|konsep|story|cerita|desain|persona|tone|branding)\b/i,
      temperature: 0.82,
      maxOutputTokens: 3072,
      priorities: [
        "buat output yang berkarakter",
        "hindari template basi",
        "sesuaikan gaya dengan instruksi user"
      ]
    },
    {
      id: "chat",
      label: "direct chat",
      pattern: /.*/i,
      temperature: 0.68,
      maxOutputTokens: 2048,
      priorities: [
        "jawab langsung",
        "hindari basa-basi",
        "tanyakan hanya jika benar-benar wajib"
      ]
    }
  ];

  const STOPWORDS = new Set([
    "yang", "dan", "atau", "untuk", "dengan", "dari", "jadi", "aku", "kamu", "saya", "ini", "itu",
    "nya", "di", "ke", "ga", "gak", "tidak", "the", "and", "for", "with", "from", "that", "this",
    "you", "your", "me", "my", "is", "are", "was", "were", "be", "to", "of", "in", "on"
  ]);

  function asText(value) {
    return String(value == null ? "" : value);
  }

  function oneLine(value) {
    return asText(value).replace(/\s+/g, " ").trim();
  }

  function trimMiddle(value, maxChars) {
    const text = asText(value).trim();
    if (text.length <= maxChars) return text;
    const head = Math.max(0, Math.floor(maxChars * 0.62));
    const tail = Math.max(0, maxChars - head - 35);
    return `${text.slice(0, head)} ... ${tail ? text.slice(-tail) : ""}`.trim();
  }

  function messageText(message) {
    return oneLine(message && message.content);
  }

  function latestUserMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message && message.role === "user" && messageText(message)) return message;
    }
    return { role: "user", content: "" };
  }

  function tokenize(text) {
    return asText(text)
      .toLowerCase()
      .replace(/[^a-z0-9_$.-]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  }

  function keywords(text) {
    const counts = new Map();
    tokenize(text).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_KEYWORDS)
      .map(([word]) => word);
  }

  function detectIntent(text) {
    const source = asText(text);
    const matched = INTENTS.find((intent) => intent.pattern.test(source)) || INTENTS[INTENTS.length - 1];
    return { ...matched };
  }

  function complexityScore(text, messages) {
    const source = asText(text);
    let score = 0;
    if (source.length > 420) score += 2;
    if (source.length > 1200) score += 2;
    if (/[`{}()[\];=<>]/.test(source)) score += 2;
    if (/\b(debug|error|arsitektur|database|full stack|security|deploy|api|repo|fix semua)\b/i.test(source)) score += 2;
    if ((messages || []).length > 8) score += 1;
    if (/\b(jangan|harus|wajib|pokoknya|tanpa|hanya|exact|persis)\b/i.test(source)) score += 1;
    return score;
  }

  function makeDigest(messages) {
    const usable = (messages || [])
      .filter((message) => message && ["user", "assistant"].includes(message.role))
      .filter((message) => messageText(message))
      .slice(-8);

    const lines = usable.map((message) => {
      const role = message.role === "assistant" ? "AI" : "USER";
      return `${role}: ${trimMiddle(messageText(message), 220)}`;
    });

    return trimMiddle(lines.join("\n"), MAX_DIGEST_CHARS);
  }

  function rankCapabilities(capabilities, text) {
    const terms = keywords(text);
    return (capabilities || [])
      .map((item) => {
        const haystack = `${item.name || ""} ${item.description || ""} ${item.kind || ""} ${item.source || ""}`.toLowerCase();
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.item);
  }

  function buildSystemDirective(plan) {
    const relevantTools = plan.relevantCapabilities.length
      ? `Relevant tools/skills: ${plan.relevantCapabilities.map((item) => item.name).join(", ")}.`
      : "Relevant tools/skills: none unless the user explicitly needs them.";

    return [
      "Braint-Ai.js planner is active. Treat this as private execution policy, not user-visible text.",
      `Detected intent: ${plan.intent.label}. Planning mode: ${plan.mode}. Complexity: ${plan.complexity}.`,
      relevantTools,
      "Silent operating loop: identify objective, constraints, missing assumptions, smallest working path, likely failure points, then answer or act directly.",
      "Never expose hidden chain-of-thought. If user asks for reasoning, give a short rationale or concise plan only.",
      "Priorities:",
      ...plan.intent.priorities.map((item) => `- ${item}`)
    ].join("\n");
  }

  function buildContextNote(plan) {
    const lines = [
      "[Braint-Ai private planning note]",
      `Objective: ${plan.objective}`,
      `Intent: ${plan.intent.label}`,
      `Mode: ${plan.mode}`,
      plan.keywords.length ? `Keywords: ${plan.keywords.join(", ")}` : "",
      plan.digest ? `Recent context digest:\n${plan.digest}` : "",
      "Use this note to improve the final answer. Do not quote this block."
    ];
    return lines.filter(Boolean).join("\n");
  }

  function plan(input) {
    const options = input || {};
    const conversation = options.conversation || {};
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const latest = latestUserMessage(messages);
    const latestText = messageText(latest);
    const intent = detectIntent(latestText);
    const complexity = complexityScore(latestText, messages);
    const mode = complexity >= 5 ? "deep" : complexity >= 3 ? "focused" : "fast";
    const keyTerms = keywords(latestText);
    const relevantCapabilities = rankCapabilities(options.capabilities || [], latestText);

    const result = {
      version: VERSION,
      objective: trimMiddle(latestText || "Jawab pesan user terakhir.", MAX_OBJECTIVE_CHARS),
      intent,
      mode,
      complexity,
      keywords: keyTerms,
      digest: makeDigest(messages),
      relevantCapabilities,
      temperature: intent.temperature,
      maxOutputTokens: intent.maxOutputTokens
    };

    result.systemDirective = buildSystemDirective(result);
    result.contextNote = buildContextNote(result);
    return result;
  }

  root.PasseoBraintAI = {
    version: VERSION,
    plan,
    keywords,
    detectIntent
  };
})(typeof window !== "undefined" ? window : globalThis);
