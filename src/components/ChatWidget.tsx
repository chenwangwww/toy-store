'use client';

import React, { useState } from 'react';
import { MessageSquare, X, Send, Bot } from 'lucide-react';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hi! 我是 Toyland 智能客服小熊 🧸，请问有什么可以帮您挑选的玩具吗？' }
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInput('');

    setTimeout(() => {
      let botReply = '这款玩具目前店内有充足现货哦！支持包邮与急速闪送。';
      if (userText.includes('优惠') || userText.includes('折扣')) {
        botReply = '现在下单即可享受新人满 200 减 30 的优惠券，快去购物车看看吧！';
      } else if (userText.includes('年龄') || userText.includes('岁')) {
        botReply = '我们按年龄段为您精选了益智、拼装、毛绒和户外玩具，您可以点击分类筛选查看哦！';
      }
      setMessages(prev => [...prev, { sender: 'bot', text: botReply }]);
    }, 800);
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
          <div className="bg-gradient-to-r from-pink-500 to-amber-500 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Toyland 智能导购</h3>
                <span className="text-xs text-white/80">随时为您解答</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-pink-50/30">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.sender === 'user'
                    ? 'bg-pink-600 text-white rounded-br-none'
                    : 'bg-white text-gray-800 shadow-sm border border-pink-100 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="咨询玩具、年龄、优惠..."
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