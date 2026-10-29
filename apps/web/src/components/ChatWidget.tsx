'use client';

import React, { useState } from 'react';
import { MessageSquare, X, Send, UserCheck } from 'lucide-react';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'bot', text: '您好！欢迎来到 Toyland 官方客服中心 🧸。请发送您的疑问，我们将尽快为您安排人工客服。' }
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    // 1. 添加用户的提问
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInput('');

    // 2. 模拟人工客服未接入时的系统排队/提示回复
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { 
          sender: 'system', 
          text: '💡 消息已成功送达人工客服。当前咨询人数较多，请耐心等待，我们将稍后为您人工回复。' 
        }
      ]);
    }, 600);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-pink-500 to-amber-400 text-white shadow-xl flex items-center justify-center hover:scale-110 transition animate-bounce"
        >
          <MessageSquare className="w-7 h-7" />
        </button>
      ) : (
        <div className="bg-white rounded-3xl shadow-2xl w-80 sm:w-96 border border-pink-100 flex flex-col h-[480px] overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          {/* 客服窗口顶部 */}
          <div className="bg-gradient-to-r from-pink-500 to-amber-500 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Toyland 人工客服</h3>
                <span className="flex items-center gap-1.5 text-xs text-white/90">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  人工在线
                </span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 聊天内容区域 */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-pink-50/30">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${
                msg.sender === 'user' ? 'justify-end' : 
                msg.sender === 'system' ? 'justify-center' : 'justify-start'
              }`}>
                {msg.sender === 'system' ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-xl text-center max-w-[90%] shadow-sm">
                    {msg.text}
                  </div>
                ) : (
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    msg.sender === 'user'
                      ? 'bg-pink-600 text-white rounded-br-none'
                      : 'bg-white text-gray-800 shadow-sm border border-pink-100 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 输入框区域 */}
          <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="请输入您的问题，等待人工回复..."
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
            <button type="submit" className="bg-pink-600 text-white px-4 py-2 rounded-xl hover:bg-pink-700 transition flex items-center justify-center">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}