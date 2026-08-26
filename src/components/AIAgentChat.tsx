import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, ChatMessage, ChatSession, ChatAttachment } from '../types';
import { 
  createChatSession, 
  saveChatSessionData, 
  subscribeUserSessions, 
  subscribeChatSession,
  deleteChatSession
} from '../lib/firebase';
import { loadAgentVault, VaultNote, VaultDocument } from '../agent/agentVault';
import { getSessionNotepad } from '../agent/sessionNotepad';
import { ApprovalCard } from './ApprovalCard';
import { ThinkingReasoning, TraceRow } from './ThinkingReasoning';
import { LoadingState } from './LoadingState';
import { WebSearch } from './WebSearch';
import { PlusMenu } from './PlusMenu';
import { SanaLogoIcon } from './SanaLogoIcon';

const WELCOME_TITLES = [
  "How can SANA assist your skin today?",
  "Ready to review your daily routine?",
  "Hello! What skin goal are we focusing on?",
  "Your AI Skincare Advisor is active.",
  "Welcome! Let's optimize your skin barrier."
];

interface AIAgentChatProps {
  userProfile: UserProfile | null;
  onMinimizeNavToggle: (minimize: boolean) => void;
  onTriggerPopup?: (popup: any) => void;
  activeSessionIdProp?: string | null;
  onSessionChange?: (sessionId: string) => void;
}

const ProductImageCard: React.FC<{ src?: string; alt?: string }> = ({ src, alt }) => {
  const [imgError, setImgError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  if (!src) return null;

  return (
    <div
      onClick={() => !imgError && setShowPreview(true)}
      className="relative my-3 inline-block max-w-sm w-auto rounded-2xl border border-slate-200/90 bg-slate-50/50 shadow-xs overflow-hidden cursor-pointer group hover:shadow-md hover:border-slate-300 transition-all"
    >
      {/* Loading Skeleton */}
      {!isLoaded && !imgError && (
        <div className="absolute inset-0 bg-slate-100/90 animate-pulse flex flex-col items-center justify-center min-h-[160px] z-10 pointer-events-none">
          <Icon icon="solar:gallery-wide-linear" className="w-6 h-6 text-slate-300 animate-bounce mb-1" />
          <span className="text-[11px] text-slate-400 font-medium">Loading image...</span>
        </div>
      )}

      {/* Main Image */}
      {imgError ? (
        <div className="w-72 h-36 bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
          <Icon icon="solar:gallery-wide-broken-linear" className="w-7 h-7 text-slate-300 mb-1" />
          <span className="text-[12px] font-medium text-slate-600 line-clamp-1">{alt || 'Product Image'}</span>
          <span className="text-[10.5px] text-slate-400 mt-0.5">Preview unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt || 'Product Image'}
          className="w-full max-h-72 object-contain block mx-auto transition-transform duration-300 group-hover:scale-[1.02]"
          onLoad={() => setIsLoaded(true)}
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      )}

      {/* Frosted Title Badge positioned at Bottom-Right directly ON the image */}
      {alt && !imgError && (
        <div className="absolute bottom-2.5 right-2.5 max-w-[85%] px-3 py-1.5 rounded-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/50 dark:border-slate-700/60 shadow-xs flex items-center gap-1.5 pointer-events-none transition-all group-hover:bg-white/85">
          <Icon icon="solar:box-minimalistic-bold" className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 shrink-0" />
          <span className="text-[11.5px] font-semibold text-slate-800 dark:text-slate-100 truncate tracking-tight">{alt}</span>
        </div>
      )}

      {/* Lightbox Preview */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setShowPreview(false);
          }}
        >
          <div className="relative max-w-xl max-h-[85vh] bg-white rounded-2xl p-4 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPreview(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
            </button>
            <img src={src} alt={alt || 'Product Preview'} className="w-full h-full max-h-[70vh] object-contain rounded-lg" />
            {alt && <p className="mt-3 text-center text-xs font-semibold text-slate-700">{alt}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  userProfile: UserProfile | null;
  sessionId: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onSendMessage?: (text: string) => void;
}

const extractTraceRows = (msg: ChatMessage): { rows: TraceRow[]; elapsed?: number } => {
  const rawRows: TraceRow[] = [];

  if (msg.passOnTrace && Array.isArray(msg.passOnTrace)) {
    msg.passOnTrace.forEach((p: any) => {
      if (p.thought) {
        rawRows.push({
          primary: p.thought,
          type: 'Reasoning'
        });
      }
      if (p.nextTools && Array.isArray(p.nextTools)) {
        p.nextTools.forEach((tc: any) => {
          rawRows.push({
            primary: `Tool: ${tc.name}`,
            secondary: tc.arguments ? JSON.stringify(tc.arguments).slice(0, 45) : undefined,
            mono: true,
            type: 'Tool'
          });
        });
      }
    });
  }

  if (msg.thinkingMeta?.modelThoughts && Array.isArray(msg.thinkingMeta.modelThoughts)) {
    msg.thinkingMeta.modelThoughts.forEach((th: string) => {
      if (th && !rawRows.some(r => r.primary === th)) {
        rawRows.push({ primary: th, type: 'Reasoning' });
      }
    });
  }

  // Deduplicate identical consecutive or duplicate trace rows to prevent inflated counts
  const rows: TraceRow[] = [];
  const seenKeys = new Set<string>();
  for (const r of rawRows) {
    const key = `${r.type}:${r.primary}:${r.secondary || ''}`;
    // If it's a tool, allow unique tool calls or deduplicate exact repeats
    if (r.type === 'Tool') {
      const toolKey = r.primary;
      // Count existing occurrences of this exact tool
      const existingCount = rows.filter(row => row.primary === r.primary).length;
      if (existingCount < 2) { // Cap each tool to max 2 entries per message trace
        rows.push(r);
      }
    } else {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        rows.push(r);
      }
    }
  }

  return {
    rows,
    elapsed: msg.thinkingMeta?.elapsedSeconds
  };
};

const ChatMessageBubble = React.memo<ChatMessageBubbleProps>(
  ({ msg, userProfile, sessionId, setMessages, onSendMessage }) => {
    const isUser = msg.role === 'user';

    // Extract search query if present in msg.searchQuery or embedded text
    let searchQuery = msg.searchQuery;
    let searchSites = msg.searchSites;

    if (!searchQuery && !isUser && msg.text) {
      const match = msg.text.match(/\[SEARCH:\s*["']?([^"']+)["']?\]/i) || msg.text.match(/Searching\s+["']([^"']+)["']/i);
      if (match) {
        searchQuery = match[1];
      }
    }

    // Clean text by removing raw [SEARCH: "..."] tags if any
    const rawText = msg.text || '';
    const isOffTopic = rawText.includes('[[OFF_TOPIC_REJECT]]') || rawText.includes('OFF_TOPIC_REJECT');
    const OFF_TOPIC_MESSAGE = `I am SANA, your dedicated AI companion for skin health and dermatology. I am specialized to assist you with skin barrier analysis, routine advice, product recommendations, ingredient safety, and climate exposome protection.

I am unable to assist with unrelated topics like software coding, automobile purchases, or general trivia, but I would be delighted to help you with any questions about your skin, routine, or diagnostic reports!`;

    const displayText = isOffTopic
      ? OFF_TOPIC_MESSAGE
      : rawText.replace(/\[SEARCH:\s*["']?([^"']+)["']?\]/gi, '').trim();
    const { rows: traceRows, elapsed: traceElapsed } = extractTraceRows(msg);

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} my-1 w-full select-text`}
      >
        {isUser ? (
          <div className="max-w-[85%] px-4 py-3 rounded-[20px] rounded-br-xs bg-[#1a1c1e] text-white text-[13.5px] leading-relaxed shadow-xs flex flex-col space-y-1.5">
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-1">
                {msg.attachments.map((att) => (
                  <div key={att.id} className="rounded-xl overflow-hidden bg-black/40 border border-white/20 p-1 shrink-0">
                    {att.type === 'image' ? (
                      <img
                        src={att.url}
                        alt={att.name}
                        onClick={() => window.open(att.url, '_blank')}
                        className="max-w-[220px] max-h-44 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <div className="flex items-center space-x-2 px-2.5 py-1.5 text-xs text-white/90">
                        <Icon icon="solar:document-bold" className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span className="truncate max-w-[150px] font-medium">{att.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
            <span className="text-[10px] mt-1 block text-right font-medium text-white/60">
              {msg.timestamp}
            </span>
          </div>
        ) : (
          <div className="w-full max-w-[96%] py-1 px-1 text-[#1e2229]">
            {/* Real Thinking Trace Dropdown - Rendered ONLY if real thoughts/tools exist */}
            {traceRows.length > 0 && (
              <div className="mb-2">
                <ThinkingReasoning isWorking={false} rows={traceRows} elapsedSeconds={traceElapsed} />
              </div>
            )}

            {/* Web Search Reasoning Stream UI */}
            {searchQuery && (
              <div className="my-2">
                <WebSearch query={searchQuery} sites={searchSites} />
              </div>
            )}

            {/* Markdown Rendering for LLM Assistant Response */}
            <div className="text-[14px] leading-relaxed text-[#1e2229] space-y-2">
              <Markdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-[16px] font-bold text-[#121316] mt-3 mb-1.5 tracking-tight border-b border-slate-200/60 pb-1">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-[14.5px] font-bold text-[#1a1c1e] mt-2.5 mb-1 tracking-tight">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-[13.5px] font-bold text-[#2d3139] mt-2 mb-0.5">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-[13.5px] leading-[1.6] text-[#2c3038] mb-1.5 last:mb-0">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside pl-4 space-y-1 my-1.5 text-[13.5px] text-[#2c3038]">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5 text-[13.5px] text-[#2c3038]">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-[1.5] pl-0.5">
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[#121316]">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-[#4a5568]">
                      {children}
                    </em>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[#1a1c1e]/30 pl-3 py-1 my-2 text-[13px] text-[#4a5568] bg-[#f8fafc] rounded-r-lg">
                      {children}
                    </blockquote>
                  ),
                  code: ({ children }) => (
                    <code className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#f1f5f9] text-[#0f172a] border border-[#e2e8f0]">
                      {children}
                    </code>
                  ),
                  img: ({ src, alt }) => (
                    <ProductImageCard src={src as string} alt={alt as string} />
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-800 transition-colors inline-flex items-center space-x-0.5"
                    >
                      <span>{children}</span>
                      <Icon icon="solar:arrow-right-up-linear" className="w-3 h-3 ml-0.5 inline" />
                    </a>
                  )
                }}
              >
                {displayText}
              </Markdown>
            </div>

            {/* Action Proposal Interactive Card */}
            {msg.actionProposal && (
              <div className="mt-3">
                <ApprovalCard
                  proposal={msg.actionProposal}
                  userId={userProfile?.uid || 'guest_user'}
                  onExecuted={(res) => {
                    setMessages((prev) => {
                      const nextMsgs = prev.map((m) => {
                        if (m.id === msg.id && m.actionProposal) {
                          return {
                            ...m,
                            actionProposal: {
                              ...m.actionProposal,
                              executed: true,
                              executedMessage: res.message
                            }
                          };
                        }
                        return m;
                      });
                      if (userProfile?.uid && sessionId) {
                        saveChatSessionData(userProfile.uid, sessionId, { messages: nextMsgs });
                      }
                      return nextMsgs;
                    });
                  }}
                />
              </div>
            )}

            <span className="text-[10px] mt-1.5 block text-left font-medium text-[#8e95a2]">
              {msg.timestamp}
            </span>
          </div>
        )}
      </motion.div>
    );
  },
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.text === next.msg.text &&
    prev.msg.actionProposal === next.msg.actionProposal &&
    prev.msg.searchQuery === next.msg.searchQuery &&
    prev.userProfile?.uid === next.userProfile?.uid &&
    prev.sessionId === next.sessionId
);

export const AIAgentChat: React.FC<AIAgentChatProps> = ({
  userProfile,
  onMinimizeNavToggle,
  onTriggerPopup,
  activeSessionIdProp,
  onSessionChange
}) => {
  const userId = userProfile?.uid || 'guest_user';

  // Multi-session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return activeSessionIdProp || `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [sessionNotepadText, setSessionNotepadText] = useState<string>('');
  const [welcomeIndex, setWelcomeIndex] = useState<number>(0);

  // Rotate welcome prompt index whenever a new chat session is started / selected
  useEffect(() => {
    setWelcomeIndex(Math.floor(Math.random() * WELCOME_TITLES.length));
  }, [activeSessionId]);

  // Input & Stream state
  const [inputText, setInputText] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<ChatAttachment[]>([]);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'working'>('idle');
  const [liveTraceRows, setLiveTraceRows] = useState<TraceRow[]>([]);
  const requestStartTimeRef = useRef<number>(0);

  // Agent Vault state
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Synchronize session ID with external props if given
  useEffect(() => {
    if (activeSessionIdProp && activeSessionIdProp !== activeSessionId) {
      setActiveSessionId(activeSessionIdProp);
    }
  }, [activeSessionIdProp]);

  // Subscribe to all sessions list (with LocalStorage fallback)
  useEffect(() => {
    let localSessions: any[] = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem('sana_local_sessions_list');
        if (raw) localSessions = JSON.parse(raw);
      }
    } catch {}

    const unsubscribe = subscribeUserSessions(userId, (sessionList) => {
      // Merge Firestore session list with local cached sessions
      const mergedMap = new Map<string, any>();
      sessionList.forEach(s => mergedMap.set(s.id, s));
      localSessions.forEach(s => {
        if (!mergedMap.has(s.id)) mergedMap.set(s.id, s);
      });
      const combined = Array.from(mergedMap.values());
      setSessions(combined);

      // If we don't have an active session yet and there is at least one session, set it
      if (combined.length > 0 && !activeSessionId) {
        setActiveSessionId(combined[0].id);
      }
    });

    return () => unsubscribe();
  }, [userId, activeSessionId]);

  // Subscribe to the active session document (with LocalStorage cache fallback)
  useEffect(() => {
    if (!activeSessionId) return;

    let cachedMsgs: ChatMessage[] | null = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(`sana_chat_session_${activeSessionId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
            cachedMsgs = parsed.messages;
            setMessages(cachedMsgs);
          }
        }
      }
    } catch {}

    const unsubscribe = subscribeChatSession(userId, activeSessionId, (sessionData) => {
      if (sessionData && Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
        setMessages(sessionData.messages);
        setSessionNotepadText(sessionData.sessionNotepad || '');

        // Persist to LocalStorage cache
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(`sana_chat_session_${activeSessionId}`, JSON.stringify({
              id: activeSessionId,
              title: sessionData.title || 'Chat Session',
              createdAt: sessionData.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: sessionData.messages
            }));
          }
        } catch {}
      } else {
        // If Firestore document doesn't exist or returned empty, retain cached messages if available
        if (!cachedMsgs || cachedMsgs.length === 0) {
          setMessages([]);
          setSessionNotepadText('');
        }
      }
    });

    return () => unsubscribe();
  }, [userId, activeSessionId]);

  // Listen to open session events (e.g. from facial scan reports or notifications)
  useEffect(() => {
    const handleOpenSession = (e: any) => {
      if (e.detail?.sessionId) {
        const sid = e.detail.sessionId;
        setActiveSessionId(sid);
        if (onSessionChange) onSessionChange(sid);

        const reportText = e.detail.reportText;
        const scanId = e.detail.scanId || sid;

        if (reportText) {
          const userPromptText = e.detail.initialQuery || `Generate scan report for scan #${scanId}`;
          const initialMsgs: ChatMessage[] = [
            {
              id: `msg_user_prompt_${Date.now()}`,
              role: 'user',
              text: userPromptText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              createdAt: new Date().toISOString()
            },
            {
              id: `msg_report_${Date.now()}`,
              role: 'model',
              text: reportText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              createdAt: new Date().toISOString()
            }
          ];

          // Store in LocalStorage cache for immediate display and offline persistence
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const sessionObj = {
                id: sid,
                title: 'Clinical Facial Scan Report',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: initialMsgs
              };
              localStorage.setItem(`sana_chat_session_${sid}`, JSON.stringify(sessionObj));

              const listRaw = localStorage.getItem('sana_local_sessions_list');
              let list = listRaw ? JSON.parse(listRaw) : [];
              if (!list.some((s: any) => s.id === sid)) {
                list = [{ id: sid, title: 'Clinical Facial Scan Report', createdAt: new Date().toISOString() }, ...list];
                localStorage.setItem('sana_local_sessions_list', JSON.stringify(list));
              }
            }
          } catch (err) {
            console.warn("[AIAgentChat] LocalStorage cache write error:", err);
          }

          setMessages(initialMsgs);
        }
      }
    };
    window.addEventListener('sana:open_chat_session', handleOpenSession);
    
    const handleRemoteSend = (e: any) => {
      if (e.detail?.message && handleSendMessageRef.current) {
        handleSendMessageRef.current(e.detail.message);
      }
    };
    window.addEventListener('sana:send_message', handleRemoteSend as any);

    return () => {
      window.removeEventListener('sana:open_chat_session', handleOpenSession);
      window.removeEventListener('sana:send_message', handleRemoteSend as any);
    };
  }, [onSessionChange]);

  // Load user's Agent Vault data
  const refreshVault = async () => {
    const vault = await loadAgentVault(userId);
    setVaultNotes(vault.notes || []);
    setVaultDocs(vault.documents || []);
  };

  useEffect(() => {
    refreshVault();
  }, [userId]);

  // Helper to compress and downscale uploaded images to prevent payload & firestore bloat
  const compressImageFile = (file: File, maxDimension = 1024, quality = 0.82): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            resolve((e.target?.result as string) || '');
          }
        };
        img.onerror = () => resolve((e.target?.result as string) || '');
        img.src = (e.target?.result as string) || '';
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle document file uploads into selectedAttachments
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const textContent = (event.target?.result as string) || '';
        const safeContent = textContent.length > 15000 ? textContent.substring(0, 15000) + '... [truncated]' : textContent;
        const newAttachment: ChatAttachment = {
          id: `att_doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: 'document',
          url: safeContent,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent: safeContent
        };
        setSelectedAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsText(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle skin photo / image uploads into selectedAttachments
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const compressedDataUrl = await compressImageFile(file);
        const newAttachment: ChatAttachment = {
          id: `att_img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: 'image',
          url: compressedDataUrl,
          mimeType: 'image/jpeg',
          size: file.size
        };
        setSelectedAttachments(prev => [...prev, newAttachment]);
      } catch (err) {
        console.error('Failed to process image file:', err);
      }
    }

    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Keep pill navigation restored in normal mode
  useEffect(() => {
    onMinimizeNavToggle(false);
  }, [onMinimizeNavToggle]);

  // Track if user has deliberately scrolled up to read past messages
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 90;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth', force = false) => {
    if (messagesContainerRef.current) {
      if (force || !isUserScrolledUpRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior
        });
      }
    }
  };

  // Automatically scroll down when new messages or loading/reasoning updates appear
  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, processingStatus, liveTraceRows]);

  // Reset scroll and force scroll to bottom on session switch
  useEffect(() => {
    isUserScrolledUpRef.current = false;
    const timer = setTimeout(() => {
      scrollToBottom('auto', true);
    }, 40);
    return () => clearTimeout(timer);
  }, [activeSessionId]);

  const handleAbortRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProcessingStatus('idle');
  };

  // Start a fresh, blank new chat session
  const handleStartNewChat = () => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setActiveSessionId(newSessionId);
    setMessages([]);
    setSessionNotepadText('');
    setShowSessionsDrawer(false);
    if (onSessionChange) onSessionChange(newSessionId);
  };

  // Switch to a previous session
  const handleSelectSession = (sessId: string) => {
    setActiveSessionId(sessId);
    setShowSessionsDrawer(false);
    if (onSessionChange) onSessionChange(sessId);
  };

  // Delete a previous session
  const handleDeleteSession = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteChatSession(userId, sessId);
    if (activeSessionId === sessId) {
      handleStartNewChat();
    }
  };

  const currentSession = sessions.find(s => s.id === activeSessionId);
  const currentTitle = currentSession?.title || (messages.length > 0 ? (messages[0]?.text?.slice(0, 30) || 'Active Consultation') : 'New Consultation');

  // Store handleSendMessage in a ref so event listeners can call the latest version
  const handleSendMessageRef = useRef<((textToSend?: string) => Promise<void>) | undefined>(undefined);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend !== undefined ? textToSend : inputText;
    const currentAttachments = textToSend !== undefined ? [] : [...selectedAttachments];

    if ((!text.trim() && currentAttachments.length === 0) || processingStatus !== 'idle') return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setSelectedAttachments([]);
    
    // Start initial loading state ("Funneling request")
    setProcessingStatus('loading');
    setLiveTraceRows([]);
    requestStartTimeRef.current = Date.now();

    // Auto-derive title if this is the first user message in a new session
    const isFirstTurn = messages.length === 0;
    const titleSource = text.trim() || (currentAttachments.length > 0 ? `Attached: ${currentAttachments[0].name}` : 'Skin Consultation');
    const sessionTitle = isFirstTurn
      ? titleSource.length > 35
        ? `${titleSource.slice(0, 35)}...`
        : titleSource
      : currentSession?.title || 'Skin Consultation';

    // Persist immediately to Firestore
    if (isFirstTurn) {
      await createChatSession(userId, {
        id: activeSessionId,
        title: sessionTitle,
        sessionType: 'chat',
        initialMessages: [userMsg]
      });
    } else {
      await saveChatSessionData(userId, activeSessionId, {
        messages: [userMsg],
        title: sessionTitle
      });
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build composite message for SanaAgent backend including attached files/images
      let apiMessageText = text.trim();
      if (currentAttachments.length > 0) {
        const attachmentDetails = currentAttachments.map(att => {
          if (att.type === 'document' && att.textContent) {
            return `[ATTACHED CLINICAL DOCUMENT "${att.name}"]:\n${att.textContent.substring(0, 3000)}`;
          } else if (att.type === 'image') {
            return `[ATTACHED SKIN/PRODUCT IMAGE "${att.name}"]`;
          }
          return `[ATTACHED FILE "${att.name}"]`;
        }).join('\n\n');

        apiMessageText = apiMessageText
          ? `${apiMessageText}\n\n${attachmentDetails}`
          : `Please analyze the attached image/file(s):\n${attachmentDetails}`;
      }

      const response = await fetch('/api/sana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          message: apiMessageText,
          sessionId: activeSessionId,
          attachments: currentAttachments,
          history: updatedMessages.map(m => ({
            role: m.role,
            text: m.text,
            attachments: m.attachments
          })),
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      setProcessingStatus('working');
      
      const modelMsgId = `mod_${Date.now()}`;
      
      // Append initial empty model message
      setMessages((prev) => [
        ...prev,
        {
          id: modelMsgId,
          role: 'model',
          text: '',
          elapsedSeconds: 0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString()
        }
      ]);

      const data = await response.json();
      
      if (!data) throw new Error('Stream ended without returning final result');

      // Extract real tool results & detected queries
      let detectedSearchQuery: string | undefined = undefined;
      let detectedSearchSites: any[] | undefined = undefined;
      const realTraceRows: TraceRow[] = [];

      if (data.toolResults && Array.isArray(data.toolResults)) {
        for (const tr of data.toolResults) {
          if (['web_search', 'web_fetch', 'exa_search', 'exa_answer'].includes(tr.toolName) && tr.data) {
            detectedSearchQuery = tr.data.query || tr.data.searchQuery;
            detectedSearchSites = tr.data.sites || tr.data.searchSites;
          }
          realTraceRows.push({
            primary: `Executed: ${tr.toolName}`,
            secondary: tr.error ? 'failed' : 'ok',
            type: 'Tool'
          });
        }
      }

      if (data.passOnTrace && Array.isArray(data.passOnTrace)) {
        for (const passOn of data.passOnTrace) {
          if (passOn.thought) {
            realTraceRows.push({
              primary: passOn.thought,
              type: 'Reasoning'
            });
          }
          if (passOn.nextTools) {
            for (const toolCall of passOn.nextTools) {
              if (toolCall.name === 'trigger_popup_card' && onTriggerPopup) {
                const args = toolCall.arguments || {};
                onTriggerPopup({
                  id: `popup_${Date.now()}`,
                  type: 'custom_action',
                  title: args.title || 'SANA Action Alert',
                  subtitle: args.subtitle || 'Routine action requested',
                  timeAgo: 'Just now',
                  actionText: args.actionText || 'Start Routine',
                  iconType: args.iconType || 'sparkle',
                  badgeText: args.badgeText || 'SANA AGENT POP-UP',
                  actionTarget: args.actionTarget || 'scan'
                });
              }
              if (['web_search', 'web_fetch', 'exa_search', 'exa_answer'].includes(toolCall.name) && !detectedSearchQuery) {
                const args = toolCall.arguments || {};
                if (args.query) {
                  detectedSearchQuery = args.query;
                }
              }
              realTraceRows.push({
                primary: `Tool Call: ${toolCall.name}`,
                secondary: toolCall.arguments ? JSON.stringify(toolCall.arguments).slice(0, 40) : undefined,
                mono: true,
                type: 'Tool'
              });
            }
          }
        }
      }

      setLiveTraceRows(realTraceRows);

      const elapsedSeconds = (Date.now() - requestStartTimeRef.current) / 1000;

      const modelMsg: ChatMessage = {
        id: modelMsgId,
        role: 'model',
        text: data.text || "I am processing your skincare query with SanaAgent.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString(),
        actionProposal: data.actionProposal,
        passOnTrace: data.passOnTrace,
        sessionId: activeSessionId,
        searchQuery: detectedSearchQuery,
        searchSites: detectedSearchSites,
        thinkingMeta: {
          intent: data.passOnTrace?.[0]?.intent || 'AGENT_LOOP',
          thinkingMode: (data.iterations && data.iterations > 1) ? 'hard' : 'easy',
          complexityScore: data.iterations ? Math.min(10, data.iterations * 3) : 3,
          appliedRules: ['SanaAgent PassOn Protocol'],
          reasoningSteps: [],
          elapsedSeconds
        }
      };

      const finalMessages = [...updatedMessages, modelMsg];
      setMessages(finalMessages);

      await saveChatSessionData(userId, activeSessionId, {
        messages: [modelMsg],
        title: sessionTitle
      });

      refreshVault();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('SanaAgent request aborted by user.');
        const cancelMsg: ChatMessage = {
          id: `aborted_${Date.now()}`,
          role: 'model',
          text: "Response generation was terminated by user.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString()
        };
        const finalMessages = [...updatedMessages, cancelMsg];
        setMessages(finalMessages);
        await saveChatSessionData(userId, activeSessionId, { messages: [cancelMsg] });
        return;
      }
      console.error('SanaAgent Chat error:', err);

      const fallbackText = "I encountered a transient network connection error. For your skin safety, always maintain hydrated skin barrier repair and apply SPF 50 daily.";
      const errorMsg: ChatMessage = {
        id: `fallback_${Date.now()}`,
        role: 'model',
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
      await saveChatSessionData(userId, activeSessionId, { messages: [errorMsg] });
    } finally {
      setProcessingStatus('idle');
    }
  };

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  const suggestionChips = [
    "Retinol + Vitamin C safe combination?",
    "How to repair damaged skin barrier?",
    "Evening double-cleansing AM/PM steps",
    "SPF 50 recommendation for sensitive skin",
    "Niacinamide with Salicylic Acid routine",
    "Climate humidity barrier protection"
  ];

  return (
    <div className="w-full h-full flex flex-col pt-1 px-3 sm:px-4 overflow-hidden relative">
      {/* Minimal Top Header Bar: Side Panel Toggle & New Chat Action */}
      <div className="flex items-center justify-between py-2 px-1 shrink-0 mb-1">
        {/* Left Side Header Actions: History Panel Toggle & New Chat Button */}
        <div className="flex items-center space-x-2">
          {/* Toggle Sessions Side Panel Button (Icon Only) */}
          <button
            onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
            className="p-2 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-800 transition-all cursor-pointer border border-slate-200/60 group flex items-center justify-center"
            title="Toggle history side panel"
          >
            <Icon icon="solar:sidebar-minimalistic-bold" className="w-4 h-4 text-slate-700 group-hover:text-slate-900 shrink-0" />
          </button>

          {/* Clean New Chat Icon Button (Moved to Left) */}
          <button
            onClick={handleStartNewChat}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer border border-slate-200/60 flex items-center justify-center"
            title="Start fresh new chat session"
          >
            <Icon icon="solar:pen-new-square-linear" className="w-4 h-4 text-slate-700 hover:text-slate-900 shrink-0" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-2 space-y-3.5 px-1 flex flex-col overscroll-contain"
      >
        {messages.length === 0 ? (
          <motion.div
            key={`welcome_${activeSessionId}`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="my-auto py-8 px-4 flex flex-col items-center text-center max-w-sm mx-auto"
          >
            {/* Dynamic Welcome Title Only */}
            <h2 className="text-[19px] font-bold text-[#121316] tracking-tight leading-snug">
              {WELCOME_TITLES[welcomeIndex] || WELCOME_TITLES[0]}
            </h2>
          </motion.div>
        ) : (
          /* Active Messages List */
          messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              userProfile={userProfile}
              sessionId={activeSessionId}
              setMessages={setMessages}
              onSendMessage={handleSendMessage}
            />
          ))
        )}

        {/* Initial Loading Indicator (Before LLM output begins) */}
        {processingStatus === 'loading' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start my-1 w-full">
            <LoadingState label="Funneling request" variant="Drive" />
          </motion.div>
        )}

        {/* Working State Indicator (While LLM is processing/generating) */}
        {processingStatus === 'working' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start my-1 w-full">
            <ThinkingReasoning isWorking={true} rows={liveTraceRows} />
          </motion.div>
        )}

        <div ref={chatEndRef} className="h-2 shrink-0" />
      </div>

      {/* Hidden File Inputs for Document and Image Ingestion */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.md,.pdf,.json,.csv,.doc,.docx"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* Bottom Input & Action Dock - Positioned strictly above the floating navigation pill */}
      <div className="shrink-0 w-full pt-1.5 pb-[78px] sm:pb-[84px] px-1 flex flex-col items-center justify-center z-20 pointer-events-auto">
        {/* Quick Suggestion Chips - Minimal Options for active chats */}
        {messages.length > 0 && messages.length < 3 && (
          <div className="w-full max-w-[500px] flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 mb-2 opacity-90 hover:opacity-100 transition-opacity">
            {suggestionChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(chip)}
                className="px-3 py-1.5 rounded-xl bg-slate-100/70 hover:bg-slate-200/80 text-[11.5px] text-slate-700 hover:text-slate-900 font-medium whitespace-nowrap border border-slate-200/60 transition-colors cursor-pointer shrink-0 shadow-2xs"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Chat Input Bar - Squaricle Design with optimal width */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="w-full max-w-[500px] flex flex-col p-1.5 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all duration-300 focus-within:ring-2 focus-within:ring-[#1a1c1e]/15 focus-within:border-[#1a1c1e]/50 focus-within:shadow-lg"
        >
          {/* Selected Attachments Preview Shelf */}
          {selectedAttachments.length > 0 && (
            <div className="w-full flex items-center space-x-2 overflow-x-auto no-scrollbar pb-2 px-1 border-b border-slate-100/80 mb-1.5">
              {selectedAttachments.map((att) => (
                <div key={att.id} className="relative shrink-0 group">
                  {att.type === 'image' ? (
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
                      <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setSelectedAttachments(prev => prev.filter(a => a.id !== att.id))}
                        className="absolute top-0.5 right-0.5 w-4.5 h-4.5 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-slate-900 transition-colors shadow-xs"
                      >
                        <Icon icon="solar:close-circle-bold" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-800 relative pr-6">
                      <Icon icon="solar:document-bold" className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="truncate max-w-[110px] text-[11px] font-medium">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAttachments(prev => prev.filter(a => a.id !== att.id))}
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        <Icon icon="solar:close-circle-bold" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-1.5 pl-1 w-full">
            <PlusMenu
              onUploadDocument={() => fileInputRef.current?.click()}
              onUploadImage={() => imageInputRef.current?.click()}
              onOpenVault={() => setShowVaultModal(true)}
            />
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={selectedAttachments.length > 0 ? "Add a message or press send..." : "Ask SANA or log a skin memory..."}
              className="flex-1 px-1.5 text-[13px] text-[#121316] font-medium bg-transparent focus:outline-none placeholder-[#94a3b8] min-w-0"
            />
            {processingStatus === 'idle' ? (
              <button
                type="submit"
                disabled={!inputText.trim() && selectedAttachments.length === 0}
                title="Send message"
                className="w-8.5 h-8.5 rounded-xl bg-[#1a1c1e] text-white flex items-center justify-center disabled:opacity-30 disabled:scale-95 transition-all duration-200 cursor-pointer shadow-xs shrink-0 hover:bg-black active:scale-95"
              >
                <Icon icon="solar:plain-2-bold" className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAbortRequest}
                title="Terminate response request"
                className="w-8.5 h-8.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-xs shrink-0 active:scale-95 animate-pulse"
              >
                <Icon icon="solar:stop-bold" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Sessions Side Panel Drawer */}
      <AnimatePresence>
        {showSessionsDrawer && (
          <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSessionsDrawer(false)}
              className="absolute inset-0 bg-black/30 backdrop-blur-xs"
            />

            {/* Slide-out Side Panel Container */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="relative w-72 sm:w-80 h-full bg-white shadow-2xl border-r border-slate-200/90 p-4 flex flex-col justify-between z-10"
            >
              <div className="flex flex-col h-full overflow-hidden">
                {/* Side Panel Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0 mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 rounded-xl bg-slate-900 text-white">
                      <Icon icon="solar:sidebar-minimalistic-bold" className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Chat Sessions</h3>
                      <p className="text-[11px] text-slate-500">{sessions.length} saved consultations</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        handleStartNewChat();
                        setShowSessionsDrawer(false);
                      }}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer border border-slate-200/50"
                      title="New Chat"
                    >
                      <Icon icon="solar:pen-new-square-linear" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowSessionsDrawer(false)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                      title="Close side panel"
                    >
                      <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Sessions List */}
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                  {sessions.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No past sessions found. Start a new consultation anytime.
                    </div>
                  ) : (
                    sessions.map((sess) => {
                      const isSelected = sess.id === activeSessionId;
                      const dateFormatted = sess.updatedAt || sess.createdAt
                        ? new Date(sess.updatedAt || sess.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'Recent';

                      return (
                        <div
                          key={sess.id}
                          onClick={() => {
                            handleSelectSession(sess.id);
                            setShowSessionsDrawer(false);
                          }}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                              : 'bg-slate-50 hover:bg-slate-100/90 text-slate-800 border-slate-200/80'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center space-x-1.5 mb-1">
                              <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                {sess.title || 'Skin Consultation'}
                              </span>
                            </div>
                            {sess.sessionType === 'onboarding_report' && (
                              <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase mb-1 ${isSelected ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'}`}>
                                Baseline Scan
                              </span>
                            )}
                            {sess.sessionType === 'scan_report' && (
                              <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase mb-1 ${isSelected ? 'bg-blue-400 text-slate-900' : 'bg-blue-100 text-blue-800'}`}>
                                Scan Report
                              </span>
                            )}
                            {sess.lastMessage && (
                              <p className={`text-[11px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                {sess.lastMessage}
                              </p>
                            )}
                            <div className={`text-[9.5px] mt-1 flex items-center space-x-1.5 ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                              <span>{dateFormatted}</span>
                              <span>•</span>
                              <span>{sess.messageCount || sess.messages?.length || 0} msgs</span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            title="Delete session"
                            className={`p-1.5 rounded-xl transition-colors opacity-0 group-hover:opacity-100 shrink-0 ${
                              isSelected
                                ? 'text-rose-300 hover:text-rose-100 hover:bg-white/10'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <Icon icon="solar:trash-bin-trash-linear" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vault Inspector Modal */}
      <AnimatePresence>
        {showVaultModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[28px] max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                    <Icon icon="solar:vault-bold" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Agent Memory Vault</h3>
                    <p className="text-xs text-slate-500">Namespace: <span className="font-mono text-emerald-700">{userId}</span></p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVaultModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                {/* Session Isolated Notepad Section */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Icon icon="solar:pen-new-square-bold-duotone" className="w-4 h-4 text-indigo-600" />
                    <span>Session Notepad (Private to this Chat)</span>
                  </h4>
                  <div className="p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs">
                    {sessionNotepadText ? (
                      <p className="text-slate-700 whitespace-pre-wrap">{sessionNotepadText}</p>
                    ) : (
                      <p className="text-slate-400 italic">Empty. SANA logs working hypotheses and calculated indices here during this consultation.</p>
                    )}
                  </div>
                </div>

                {/* Notes Section */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Icon icon="solar:notes-bold-duotone" className="w-4 h-4 text-emerald-600" />
                    <span>Memory Notes ({vaultNotes.length})</span>
                  </h4>
                  {vaultNotes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No skin memories stored in vault yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {vaultNotes.map((note) => (
                        <div key={note.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900">{note.title}</span>
                            <span className="text-[10px] text-slate-400">{new Date(note.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-600">{note.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Documents Section */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Icon icon="solar:document-text-bold-duotone" className="w-4 h-4 text-blue-600" />
                    <span>Indexed Documents ({vaultDocs.length})</span>
                  </h4>
                  {vaultDocs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No uploaded documents in vault yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {vaultDocs.map((docItem) => (
                        <div key={docItem.id} className="p-3 rounded-2xl bg-blue-50/50 border border-blue-100 text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900">{docItem.title}</span>
                            <span className="text-[10px] text-slate-400">{new Date(docItem.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-600 line-clamp-2">{docItem.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-center shrink-0">
                <p className="text-[11px] text-slate-400">
                  🔒 Data in this vault is strictly segregated by user ID in Firestore (<code className="bg-slate-100 px-1 py-0.5 rounded">users/{"{userId}"}/agent_sessions</code>).
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AIAgentChat;
