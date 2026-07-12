"use client";

import { useState, useRef, useEffect } from "react";
import { chatWithHarry } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function ChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I am Harry, your HRFast assistant. I can query our SQL database using natural language. Ask me about test scores, job roles, candidate details, or averages!",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState<Record<number, boolean>>({});

  // Additional fields for displaying query details per message
  const [queryDetails, setQueryDetails] = useState<
    Record<number, { query: string | null; response: string | null }>
  >({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;

    if (!textToSend) setInput("");

    // Add user message
    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setSending(true);

    try {
      // Map history payload
      const historyPayload = updatedMessages.slice(0, -1); // exclude last user message
      const res = await chatWithHarry({
        message: text,
        history: historyPayload,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.message,
      };

      const newIndex = updatedMessages.length;
      setQueryDetails((prev) => ({
        ...prev,
        [newIndex]: { query: res.query_used, response: res.db_response },
      }));

      setMessages([...updatedMessages, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `Error: ${(err as Error).message}`,
      };
      setMessages([...updatedMessages, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const toggleQuery = (idx: number) => {
    setExpandedQueries((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const quickPrompts = [
    "Who is the top candidate for Mid Level Fullstack?",
    "How many candidates are registered?",
    "What is Radhofan's match score?",
    "What is the average match score of all candidates?",
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto h-[90vh] flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold grad-text mb-1">💬 Harry Chatbot</h1>
        <p className="text-slate-500 text-sm">
          HRFast&apos;s local assistant powered by LlamaIndex SQL Translation &amp; LangChain
        </p>
      </div>

      {/* Quick Prompts */}
      <div className="mb-4 flex flex-wrap gap-2">
        {quickPrompts.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            disabled={sending}
            className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat workspace container */}
      <div className="flex-1 min-h-0 glass rounded-2xl flex flex-col border border-white/5 bg-[#0d0d14]/45 overflow-hidden">
        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const details = queryDetails[idx];

            return (
              <div
                key={idx}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl p-4 border text-sm ${
                    isUser
                      ? "bg-violet-600/10 border-violet-500/20 text-slate-100 rounded-tr-none"
                      : "bg-white/[0.02] border-white/5 text-slate-300 rounded-tl-none"
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {/* Collapsible database query details */}
                  {details && (details.query || details.response) && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => toggleQuery(idx)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer font-mono"
                      >
                        {expandedQueries[idx] ? "▼ Hide SQL details" : "▶ Show SQL details"}
                      </button>

                      {expandedQueries[idx] && (
                        <div className="mt-2 space-y-2 bg-[#08080c] rounded-lg p-3 border border-white/5 font-mono text-[10px] text-slate-400">
                          {details.query && (
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-slate-600 font-bold mb-1">
                                Generated DB Query
                              </p>
                              <pre className="whitespace-pre-wrap bg-white/3 p-2 rounded text-cyan-300">
                                {details.query}
                              </pre>
                            </div>
                          )}
                          {details.response && (
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-slate-600 font-bold mb-1">
                                DB Raw Response
                              </p>
                              <pre className="whitespace-pre-wrap bg-white/3 p-2 rounded text-slate-500">
                                {details.response}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing state */}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl rounded-tl-none p-4 max-w-[75%]">
                <div className="flex items-center gap-1.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/5 bg-[#09090e]/50 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={sending}
            placeholder={sending ? "Harry is typing..." : "Ask Harry a question..."}
            className="flex-1 bg-white/3 border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-violet-500/50 transition-colors disabled:opacity-50"
          />
          <Button
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            className="bg-linear-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-medium shadow-lg shadow-violet-500/20 px-5 rounded-xl h-11"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
