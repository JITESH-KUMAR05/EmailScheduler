'use client';

import { useState, useRef } from 'react';
import { X, Upload, Clock, Paperclip, ChevronDown, Bold, Italic, Underline, AlignLeft, List, Image as ImageIcon, Trash2 } from 'lucide-react';
import { emailAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ComposeModal({ isOpen, onClose, onSuccess }: ComposeModalProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailList, setEmailList] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [delay, setDelay] = useState(5);
  const [hourlyLimit, setHourlyLimit] = useState(0); 
  const [loading, setLoading] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]); // New State for files
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null); 

  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (emailInput.trim() && emailInput.includes('@')) {
        setEmailList([...emailList, emailInput.trim()]);
        setEmailInput('');
      }
    }
  };

  const removeEmail = (index: number) => {
    setEmailList(emailList.filter((_, i) => i !== index));
  };

  // Handle Email List Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const emails = text.split(/[\n,]/).map((e) => e.trim()).filter((e) => e.includes('@'));
      setEmailList(prev => [...prev, ...emails]);
    };
    reader.readAsText(file);
  };

  // Handle Attachment Selection
  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (emailList.length === 0) {
      alert("Please add at least one recipient.");
      return;
    }
    
    const finalStartTime = startTime ? new Date(startTime).toISOString() : new Date(Date.now() + 60000).toISOString();

    setLoading(true);
    try {
      const payload = {
        emails: emailList.map(email => ({ email, subject, body })),
        startTime: finalStartTime,
        delayInSeconds: Number(delay)
      };

      await emailAPI.scheduleEmails(payload);
      
      // Reset form
      setSubject('');
      setBody('');
      setEmailList([]);
      setAttachments([]);
      
      onClose();
      
      setTimeout(async () => {
        await onSuccess(); // This calls fetchData()
        alert('Campaign Scheduled Successfully!');
      }, 500);
      
    } catch (error) {
      console.error(error);
      alert('Failed to schedule.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="hover:bg-gray-100 p-2 rounded-full">
               <X className="w-5 h-5 text-gray-500" />
            </button>
            <h2 className="text-xl font-medium text-gray-800">Compose New Email</h2>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Paperclip now works visually */}
             <button 
                onClick={() => attachmentInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-gray-600 relative"
             >
               <Paperclip className="w-5 h-5" />
               {attachments.length > 0 && (
                 <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></span>
               )}
             </button>
             <input type="file" multiple ref={attachmentInputRef} className="hidden" onChange={handleAttachment} />

             <button 
                onClick={() => setShowSchedule(!showSchedule)}
                className={`p-2 hover:text-green-600 ${showSchedule ? 'text-green-600' : 'text-gray-400'}`}
             >
               <Clock className="w-5 h-5" />
             </button>
             <button 
                onClick={handleSubmit}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-medium transition-colors flex items-center gap-2"
             >
                {loading ? 'Sending...' : 'Send Later'}
             </button>
          </div>
        </div>

        {/* --- Form Content --- */}
        <div className="flex-1 overflow-y-auto p-10 space-y-8 relative">
          
          {/* FROM */}
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm font-medium text-gray-500">From</label>
            <div className="flex-1">
               <div className="inline-flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded text-sm text-gray-700 font-medium">
                  {user?.picture && <img src={user.picture} className="w-5 h-5 rounded-full" alt="" />}
                  {user?.email || 'oliver.brown@domain.io'}
                  <ChevronDown className="w-3 h-3 text-gray-400" />
               </div>
            </div>
          </div>

          {/* TO */}
          <div className="flex items-start gap-4 border-b border-gray-100 pb-4">
             <label className="w-20 text-sm font-medium text-gray-500 mt-2">To</label>
             <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                   {emailList.map((email, idx) => (
                     <span key={idx} className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-full text-xs border border-green-200">
                        {email}
                        <button onClick={() => removeEmail(idx)}><X className="w-3 h-3" /></button>
                     </span>
                   ))}
                   <input 
                     type="text" 
                     placeholder={emailList.length === 0 ? "recipient@example.com" : ""}
                     value={emailInput}
                     onChange={(e) => setEmailInput(e.target.value)}
                     onKeyDown={handleEmailKeyDown}
                     className="outline-none flex-1 min-w-[200px] text-sm py-1.5 text-gray-700 placeholder-gray-300"
                   />
                </div>
                
                <div className="flex justify-end">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-green-600 font-medium hover:underline cursor-pointer"
                  >
                    <Upload className="w-3 h-3" /> Upload List
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileUpload} />
                </div>
             </div>
          </div>

          {/* SUBJECT */}
          <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
             <label className="w-20 text-sm font-medium text-gray-500">Subject</label>
             <input 
               type="text" 
               value={subject}
               onChange={(e) => setSubject(e.target.value)}
               placeholder="Subject" 
               className="flex-1 outline-none text-gray-800 font-medium placeholder-gray-300"
             />
          </div>

          {/* SETTINGS */}
          <div className="flex items-center gap-8 py-2">
             <div className="flex items-center gap-3">
               <label className="text-xs font-semibold text-gray-500">Delay between 2 emails</label>
               <input 
                 type="number" 
                 value={delay}
                 onChange={(e) => setDelay(Number(e.target.value))}
                 className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:border-green-500 outline-none"
               />
             </div>
             <div className="flex items-center gap-3">
               <label className="text-xs font-semibold text-gray-500">Hourly Limit</label>
               <input 
                 type="number" 
                 value={hourlyLimit}
                 onChange={(e) => {
                    const val = Number(e.target.value);
                    setHourlyLimit(val);
                    if(val > 0) setDelay(Math.ceil(3600/val));
                 }}
                 className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:border-green-500 outline-none"
               />
             </div>
          </div>

          {/* ATTACHMENTS LIST (VISUAL ONLY) */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded text-xs text-gray-700">
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button onClick={() => removeAttachment(i)} className="hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* REAL EDITOR (Fixed) */}
          <div className="bg-gray-50/50 rounded-xl min-h-[300px] flex flex-col p-4 border border-transparent focus-within:border-gray-200 transition-colors">
             
             {/* Toolbar */}
             <div className="flex items-center gap-4 text-gray-400 bg-white p-2 rounded-lg shadow-sm w-max mb-4">
                <button className="hover:text-gray-600 p-1"><Bold className="w-4 h-4" /></button>
                <button className="hover:text-gray-600 p-1"><Italic className="w-4 h-4" /></button>
                <button className="hover:text-gray-600 p-1"><Underline className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                <button className="hover:text-gray-600 p-1"><AlignLeft className="w-4 h-4" /></button>
                <button className="hover:text-gray-600 p-1"><List className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                <button className="hover:text-gray-600 p-1"><ImageIcon className="w-4 h-4" /></button>
             </div>
             
             {/* Main Input - Now takes the full space properly */}
             <textarea 
               value={body}
               onChange={(e) => setBody(e.target.value)}
               placeholder="Type your reply here..." 
               className="flex-1 bg-transparent outline-none text-gray-700 resize-none p-2 placeholder-gray-400 text-sm leading-relaxed"
             />
          </div>

        </div>

        {/* POPUP SCHEDULE */}
        {showSchedule && (
          <div className="absolute top-10 right-10 bg-white shadow-xl border border-gray-200 rounded-xl w-72 p-4 z-50 animate-in fade-in zoom-in duration-200">
             <h3 className="font-semibold text-gray-800 mb-4 text-sm">Send Later</h3>
             
             <label className="block text-xs text-gray-500 mb-1">Pick date & time</label>
             <input 
               type="datetime-local" 
               value={startTime}
               onChange={(e) => setStartTime(e.target.value)}
               className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-4"
             />

             <div className="space-y-1 mb-4">
                {['Tomorrow, 8:00 AM', 'Tomorrow, 1:00 PM'].map(label => (
                   <button key={label} className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 rounded-lg">
                     {label}
                   </button>
                ))}
             </div>

             <div className="flex justify-end gap-2">
                <button onClick={() => setShowSchedule(false)} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={() => setShowSchedule(false)} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg">Done</button>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}