import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAnalyticsData, formatAnalyticsSummary } from '../utils/analyticsUtils';

const SUPPORTED_LANGUAGES = [
  { label: 'English', code: 'en' },
  { label: 'हिंदी (Hindi)', code: 'hi' },
  { label: 'தமிழ் (Tamil)', code: 'ta' },
  { label: 'తెలుగు (Telugu)', code: 'te' },
  { label: 'বাংলা (Bengali)', code: 'bn' },
  { label: 'मराठी (Marathi)', code: 'mr' },
];

const ChatbotWidget = () => {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState('');
  const [selectingLang, setSelectingLang] = useState(false);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content:string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // Optional direct fallback (as requested: no env file, use key directly in client)
  const DIRECT_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';
  const DIRECT_MODEL = 'gpt-4o-mini';
  const DIRECT_PAT = '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';
  const SYSTEM_PROMPT = `You are an in-app assistant chatbot for a crowdsourced civic issue reporting mobile application.\nYour role is to guide citizens in submitting, tracking, and resolving civic issues. You also have access to analytics data about reported issues.\n\nCivic Issue Categories:\n1. Sanitation & Health\n2. Water & Sewerage\n3. Roads & Transport\n4. Street Lighting\n5. Parks & Horticulture\n6. Town Planning\n7. Revenue\n8. Education\n9. Public Works (PWD local)\n10. Fire Services\n\nAnalytics Data Access:\n- You can provide insights about complaint statistics, status distribution, and trends.\n- Use the [ANALYTICS] tool to fetch the latest data when needed.\n\nGuidelines:\n- Provide concise, step-by-step guidance relevant to the department.\n- Help users attach media and provide accurate location.\n- Explain validation and notifications.\n- Encourage participation with points/badges when relevant.\n- Never ask for sensitive info.\n- If out of scope, politely redirect to appropriate in-app help or department contact.`;

  // Check if the message is requesting analytics
  const isAnalyticsQuery = (message) => {
    if (!message) return false;
    const lowerMsg = message.toLowerCase();
    return (
      lowerMsg.includes('analytics') ||
      lowerMsg.includes('statistics') ||
      lowerMsg.includes('how many') ||
      lowerMsg.includes('report') ||
      lowerMsg.includes('status') ||
      lowerMsg.includes('trend') ||
      lowerMsg.includes('dashboard') ||
      lowerMsg.includes('summary') ||
      lowerMsg.includes('overview')
    );
  };

  // Handle analytics data fetch and processing
  const handleAnalyticsQuery = async (userMessage) => {
    try {
      const analyticsData = await getAnalyticsData();
      const summary = formatAnalyticsSummary(analyticsData);
      
      // Add a small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return `Here's the latest analytics summary:\n\n${summary}\n\nYou can ask me specific questions about the data, such as:\n- What's the most common issue type?\n- How many complaints are pending?\n- What's the current resolution rate?`;
    } catch (error) {
      console.error('Error handling analytics query:', error);
      return "I'm having trouble fetching the analytics data right now. Please try again later.";
    }
  };

  async function callDirectAPI(allMessages, targetLanguage) {
    // Check if the last message is an analytics query
    const lastMessage = allMessages[allMessages.length - 1]?.content;
    const isAnalytics = isAnalyticsQuery(lastMessage);
    
    // If it's an analytics query, handle it directly
    if (isAnalytics) {
      const response = await handleAnalyticsQuery(lastMessage);
      return response;
    }
    
    // Otherwise, proceed with the normal API call
    const payloadMessages = [
      { 
        role: 'system', 
        content: SYSTEM_PROMPT + 
          `\n\nCurrent date: ${new Date().toLocaleDateString()}` +
          `\nRespond in language code: ${targetLanguage || 'en'}.`
      },
      ...allMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.role === 'assistant' && m.content.includes('[ANALYTICS]') 
          ? 'I have access to analytics data. You can ask me about complaint statistics, status distribution, or trends.'
          : m.content
      }))
    ];
    
    // Add analytics context if relevant to the conversation
    const conversationContext = allMessages.map(m => m.content).join(' ').toLowerCase();
    if (isAnalyticsQuery(conversationContext)) {
      try {
        const analyticsData = await getAnalyticsData();
        payloadMessages[0].content += `\n\n[ANALYTICS CONTEXT]\n${formatAnalyticsSummary(analyticsData)}`;
      } catch (error) {
        console.error('Error adding analytics context:', error);
      }
    }

    try {
      const res = await fetch(DIRECT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DIRECT_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          model: DIRECT_MODEL, 
          messages: payloadMessages,
          temperature: 0.7,
          max_tokens: 500
        })
      });
      
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Direct API error ${res.status}: ${t}`);
      }
      
      const data = await res.json();
      let content = data?.choices?.[0]?.message?.content;
      
      if (!content) {
        if (Array.isArray(content)) {
          content = content.map(p => (typeof p === 'string' ? p : p?.text || '')).join('');
        } else if (data?.choices?.[0]?.message?.content?.text) {
          content = data.choices[0].message.content.text;
        } else {
          content = JSON.stringify(data);
        }
      }
      
      return content;
    } catch (error) {
      console.error('Error in callDirectAPI:', error);
      throw error;
    }
  }

  // No persistence: always start fresh when opened

  // Auto scroll to bottom when messages update
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const closeChat = () => {
    setOpen(false);
    setLanguage('');
    setSelectingLang(false);
    setMessages([]);
    setInput('');
    setLoading(false);
  };

  const startChat = () => {
    // Always reset and ask for language
    setLanguage('');
    setSelectingLang(true);
    setMessages([]);
    setInput('');
    setLoading(false);
    setOpen(true);
  };

  const handleSelectLanguage = (code) => {
    setLanguage(code);
    setSelectingLang(false);
    // Seed a welcome message for each new session
    setMessages([{ role: 'assistant', content: 'Hello! How can I help you report or track a civic issue today?' }]);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // First, try serverless function
      const res = await fetch('/.netlify/functions/gh-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: language || 'en',
          messages: newMessages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || 'Sorry, something went wrong.';
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      } else {
        // If 404 or other error, try direct API as fallback
        const reply = await callDirectAPI(newMessages, language || 'en');
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (err) {
      try {
        // Final fallback attempt directly
        const reply = await callDirectAPI(newMessages, language || 'en');
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      } catch (err2) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `There was an error reaching the assistant. ${String(err2)}` },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={startChat}
        className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-lg flex items-center justify-center text-white"
        aria-label="Open chatbot"
      >
        {/* Chat bubble icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8-1.21 0-2.36-.19-3.41-.54L3 20l1.54-5.59C4.19 12.36 4 11.21 4 10c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* Overlay panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end">
          {/* Click backdrop to close */}
          <div className="absolute inset-0 bg-black/30" onClick={closeChat} />
          <div className="relative m-4 w-full sm:max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="font-semibold text-gray-900">Civic Assistant</div>
              <button className="text-gray-500 hover:text-gray-700" onClick={closeChat} aria-label="Close">
                ✕
              </button>
            </div>

            {/* Language selection first-time */}
            {(!language || selectingLang) ? (
              <div className="p-4">
                <p className="text-sm text-gray-700 mb-2">Please select your language:</p>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleSelectLanguage(l.code)}
                      className={`px-3 py-2 rounded-md border text-sm ${language === l.code ? 'border-emerald-600 text-emerald-700' : 'border-gray-300 text-gray-700 hover:border-emerald-500'}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div ref={listRef} className="h-80 overflow-y-auto p-3 space-y-3 bg-white">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`${m.role === 'user' ? 'justify-end' : 'justify-start'} flex`}>
                      <div className={`${m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-900'} px-3 py-2 rounded-lg max-w-[80%] whitespace-pre-wrap break-words`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg">Thinking…</div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="border-t border-gray-200 p-3 bg-gray-50">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder="Type your message…"
                      className="flex-1 min-h-[44px] max-h-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={loading}
                      className="h-10 px-4 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;
