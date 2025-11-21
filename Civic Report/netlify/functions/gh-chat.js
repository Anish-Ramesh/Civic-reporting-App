// Netlify Function: gh-chat
// Calls GitHub Models (Azure AI Inference) chat API with a hardcoded PAT.

const GITHUB_PAT = "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"; // Provided by user (do not expose in frontend)
const ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";
const MODEL = "gpt-4o-mini";

// Civic assistant system prompt (condensed)
const BASE_SYSTEM_PROMPT = `You are an in-app assistant chatbot for a crowdsourced civic issue reporting mobile application.
Your role is to guide citizens in submitting, tracking, and resolving civic issues.
Do not request or process passwords, authentication details, or other sensitive information.

Civic Issue Categories:
1. Sanitation & Health
2. Water & Sewerage
3. Roads & Transport
4. Street Lighting
5. Parks & Horticulture
6. Town Planning
7. Revenue
8. Education
9. Public Works (PWD local)
10. Fire Services

Guidelines:
- Provide concise, step-by-step guidance relevant to the department.
- Help users attach media and provide accurate location.
- Explain validation and notifications.
- Encourage participation with points/badges when relevant.
- Never ask for sensitive info.
- If out of scope, politely redirect to appropriate in-app help or department contact.`;

function buildSystemPrompt(targetLanguage) {
  const langLine = targetLanguage ? `\n\nRespond in language code: ${targetLanguage}.` : "";
  return BASE_SYSTEM_PROMPT + langLine;
}

function normalizeMessages(systemPrompt, messages) {
  const out = [];
  out.push({ role: "system", content: systemPrompt });
  for (const m of messages || []) {
    const role = m.role === "assistant" ? "assistant" : "user";
    let content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    out.push({ role, content });
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { targetLanguage = "en", messages = [] } = JSON.parse(event.body || "{}");

    const sys = buildSystemPrompt(targetLanguage);
    const chatMessages = normalizeMessages(sys, messages);

    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITHUB_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: chatMessages,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        statusCode: resp.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: `Upstream error ${resp.status}`, details: text }),
      };
    }

    const data = await resp.json();
    let reply = "";
    try {
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        reply = content;
      } else if (Array.isArray(content)) {
        reply = content.map((p) => (typeof p === "string" ? p : p?.text || "")).join("");
      } else if (data?.choices?.[0]?.message?.content?.text) {
        reply = data.choices[0].message.content.text;
      } else {
        reply = JSON.stringify(data);
      }
    } catch (e) {
      reply = "Sorry, I could not parse the model response.";
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server error", details: String(err) }),
    };
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
