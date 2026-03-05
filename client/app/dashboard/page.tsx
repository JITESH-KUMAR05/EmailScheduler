'use client';

import { useEffect, useState, useCallback } from 'react';
import { emailAPI } from '@/lib/api';
import { Email } from '@/types';
import ComposeModal from '@/components/ComposeModal';
import { useAuth } from '@/context/AuthContext';
import { 
  Plus, Loader2 , Search, Clock, Send, 
  ChevronDown, User as UserIcon, 
  LogOut, Filter, RotateCw, Star
} from 'lucide-react';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = activeTab === 'scheduled' 
        ? await emailAPI.getScheduledEmails() 
        : await emailAPI.getSentEmails();
      setEmails(response.data);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredEmails = emails.filter(email => 
    email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans text-gray-900">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-[280px] flex-shrink-0 flex flex-col border-r border-gray-100 bg-white">
        
        {/* 1. Logo */}
        <div className="h-16 flex items-center px-6">
           <span className="font-extrabold text-2xl tracking-tighter text-black">ONG</span>
        </div>

        {/* 2. User Profile Card */}
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:border-gray-300 transition-colors group">
            <div className="flex items-center gap-3 overflow-hidden">
               {user?.picture ? (
                  <img src={user.picture} alt="User" className="w-10 h-10 rounded-full object-cover" />
               ) : (
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-white" />
                  </div>
               )}
               <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-gray-900 truncate">{user?.name}</span>
                  <span className="text-xs text-gray-500 truncate">{user?.email}</span>
               </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
          </div>
          
          {/* Logout Helper (Small link below profile) */}
          <button onClick={logout} className="text-xs text-red-500 hover:underline mt-2 ml-2">
            Sign out
          </button>
        </div>

        {/* 3. Compose Button */}
        <div className="px-4 mb-8">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 text-green-700 font-semibold border-2 border-green-600 rounded-full py-2.5 hover:bg-green-50 transition-all shadow-sm hover:shadow-md"
          >
            Compose
          </button>
        </div>

        {/* 4. Navigation Links */}
        <nav className="flex-1 px-4 space-y-1">
          <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
            CORE
          </div>
          
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'scheduled' 
                ? 'bg-gray-100 text-gray-900 font-semibold' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className={`w-5 h-5 ${activeTab === 'scheduled' ? 'text-gray-900' : 'text-gray-400'}`} />
              Scheduled
            </div>
            <span className="text-xs font-bold text-gray-400">{activeTab === 'scheduled' ? emails.length : ''}</span>
          </button>

          <button
            onClick={() => setActiveTab('sent')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'sent' 
                ? 'bg-green-50 text-green-800 font-semibold' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Send className={`w-5 h-5 ${activeTab === 'sent' ? 'text-green-600' : 'text-gray-400'}`} />
              Sent
            </div>
            <span className="text-xs font-bold text-gray-400">{activeTab === 'sent' ? emails.length : ''}</span>
          </button>
        </nav>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        
        {/* Top Header */}
        <header className="h-16 border-b border-gray-100 flex items-center justify-between px-8 bg-white">
          <div className="relative w-96">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
            <input 
              type="text" 
              placeholder="Search" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-2 bg-transparent border-none text-sm text-gray-900 placeholder-gray-300 focus:ring-0 outline-none"
            />
          </div>
          <div className="flex items-center gap-4 text-gray-400">
             <button onClick={fetchData} className="hover:text-gray-600"><RotateCw className="w-5 h-5" /></button>
             <button className="hover:text-gray-600"><Filter className="w-5 h-5" /></button>
          </div>
        </header>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>Loading...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Send className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No emails found</h3>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEmails.map((email) => (
                <div 
                  key={email.id} 
                  className="group flex items-center gap-4 p-4 hover:bg-gray-50 rounded-lg cursor-pointer transition-all border-b border-gray-50 last:border-0"
                >
                  {/* Avatar / Initials */}
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-600 font-bold text-xs">
                    {email.email.substring(0, 2).toUpperCase()}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex items-center gap-6">
                    {/* Recipient */}
                    <div className="w-1/4">
                      <p className="text-sm font-semibold text-gray-900 truncate">To: {email.email.split('@')[0]}</p>
                    </div>
                    
                    {/* Status Pill */}
                    <div className="flex-shrink-0">
                       {email.status === 'SENT' && (
                         <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500">
                           Sent
                         </span>
                       )}
                       {email.status === 'PENDING' && (
                         <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-600">
                           Scheduled
                         </span>
                       )}
                        {email.status === 'FAILED' && (
                         <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-600">
                           Failed
                         </span>
                       )}
                    </div>

                    {/* Subject & Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                         <span className="text-sm font-medium text-gray-900 truncate">{email.subject}</span>
                         <span className="text-sm text-gray-400 truncate hidden sm:block">- {email.body}</span>
                      </div>
                    </div>
                  </div>

                  {/* Date & Action */}
                  <div className="flex items-center gap-4 text-right">
                     <span className="text-xs text-gray-400 font-medium">
                       {new Date(activeTab === 'scheduled' ? email.sendAt : (email.sentAt || email.sendAt)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                     </span>
                     <button className="text-gray-300 hover:text-yellow-400">
                       <Star className="w-4 h-4" />
                     </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      <ComposeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
}