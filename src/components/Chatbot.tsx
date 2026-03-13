"use client"

import React, { useState, useRef, useEffect } from 'react'

interface Message {
    role: 'user' | 'assistant' | 'system'
    content: string
}

interface ChatbotProps {
    vectorStoreId: string | null;
    fetchedAnswers: Record<string, any>;
    onUpdateData: (key: string, newValue: any) => void;
}

export function Chatbot({ vectorStoreId, fetchedAnswers, onUpdateData }: ChatbotProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messageCount, setMessageCount] = useState(0);
    const MAX_QUESTIONS = 30;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || !vectorStoreId || messageCount >= MAX_QUESTIONS) return;

        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        setMessageCount(prev => prev + 1);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    vectorStoreId,
                    fetchedAnswers
                })
            });

            const data = await res.json();

            if (res.ok) {
                if (data.functionCall && data.functionCall.name === "update_json_value") {
                    const args = data.functionCall.arguments;
                    if (args.key && args.newValue) {
                        onUpdateData(args.key, args.newValue);
                    }
                }
                if (data.reply) {
                    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
                }
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request." }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: "An error occurred." }]);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {isOpen ? (
                <div className="w-80 md:w-96 h-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all">
                    {/* Header */}
                    <div className="bg-[var(--color-primary)] px-4 py-3 flex items-center justify-between text-white shadow-sm shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-xl">forum</span>
                            <span className="font-bold text-sm">Contextual Chatbot</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
                            <span className="material-symbols-outlined text-lg block">close</span>
                        </button>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50 text-sm custom-scrollbar">
                        {messages.length === 0 && (
                            <div className="text-center text-slate-500 mt-10">
                                <span className="material-symbols-outlined text-4xl opacity-50 block mb-2">smart_toy</span>
                                <p>Ask me questions about your document or extracted values!</p>
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-[var(--color-primary)] text-white' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700'}`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-2 shadow-sm flex gap-1 items-center">
                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                        {!vectorStoreId ? (
                            <p className="text-xs text-red-500 text-center py-2">Please upload a document first to use the chatbot.</p>
                        ) : messageCount >= MAX_QUESTIONS ? (
                            <p className="text-xs text-amber-600 dark:text-amber-500 text-center py-2 font-medium">Session limit reached ({MAX_QUESTIONS}/{MAX_QUESTIONS} questions). Please restart the application.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                                        placeholder="Ask anything..."
                                        className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-full text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all font-medium disabled:opacity-50"
                                        disabled={isLoading}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || isLoading}
                                        className="bg-[var(--color-primary)] text-white h-10 w-10 rounded-full flex items-center justify-center hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 shrink-0 shadow-md"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">send</span>
                                    </button>
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center font-medium">
                                    {messageCount} / {MAX_QUESTIONS} questions used
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setIsOpen(true)}
                    className="h-14 w-14 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105"
                >
                    <span className="material-symbols-outlined text-2xl">chat</span>
                </button>
            )}
        </div>
    )
}
