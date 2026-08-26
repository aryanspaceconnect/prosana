"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ActionProposal } from '../agent/types';

export type QuestionItem = {
  q: string;
  type: 'radio' | 'check';
  options: string[];
};

export type RecommendationOption = {
  key: string;
  body: React.ReactNode;
  short: string;
  signal: number; // 0..3
  tone: string;   // hex or var e.g. '#10b981', '#f59e0b', '#94a3b8'
  label: string;  // e.g. "High confidence", "Needs review", "Cancel action"
  cta: string;
  ctaStyle?: string;
  action?: 'execute' | 'deny' | 'configure';
};

interface ApprovalCardProps {
  proposal?: ActionProposal;
  options?: RecommendationOption[];
  questions?: QuestionItem[];
  title?: string;
  userId?: string;
  onExecuted?: (result: { success: boolean; message: string }) => void;
  onAnswersSubmitted?: (answersText: string) => void;
}

const DEFAULT_QUESTIONS: QuestionItem[] = [
  {
    q: "How many flavors should we launch?",
    type: "radio",
    options: ["Three (core line)", "Five (full case)", "Just one hero"],
  },
  {
    q: "Which mix-ins should we stock?",
    type: "check",
    options: ["Chocolate chips", "Waffle bits", "Sprinkles"],
  },
  {
    q: "Which market do we enter first?",
    type: "radio",
    options: ["Food trucks", "Grocery freezers", "Scoop shops"],
  },
];

export function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5 shrink-0">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{
            height: 10,
            background: bar < signal ? tone : '#e2e8f0'
          }}
        />
      ))}
    </span>
  );
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  proposal,
  options: customOptions,
  questions: customQuestions,
  title,
  userId = 'guest_user',
  onExecuted,
  onAnswersSubmitted
}) => {
  // Determine if this is a questionnaire / human-in-the-loop input request
  const isQuestionnaire = Boolean(
    customQuestions ||
    proposal?.questions ||
    proposal?.payload?.questions ||
    proposal?.actionType === 'REQUEST_USER_INPUT'
  );

  const activeQuestions: QuestionItem[] = 
    customQuestions ||
    proposal?.questions ||
    proposal?.payload?.questions ||
    (proposal?.actionType === 'REQUEST_USER_INPUT' ? DEFAULT_QUESTIONS : DEFAULT_QUESTIONS);

  // --- QUESTIONNAIRE STATE ---
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(true);

  // --- PROPOSAL STATE ---
  const [selected, setSelected] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [status, setStatus] = useState<'pending' | 'executing' | 'approved' | 'denied'>(
    proposal?.status || (proposal?.executed ? 'approved' : 'pending')
  );
  const [resultMessage, setResultMessage] = useState<string | null>(
    proposal?.executedMessage || (proposal?.executed ? 'Action executed successfully.' : null)
  );

  // If questionnaire mode and dismissed
  if (isQuestionnaire && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-[12.5px] font-medium text-slate-800 shadow-xs transition-colors duration-150 hover:bg-slate-50 cursor-pointer"
      >
        Open approval
      </button>
    );
  }

  // --- RENDER QUESTIONNAIRE UI IF QUESTIONNAIRE MODE ---
  if (isQuestionnaire) {
    const question = activeQuestions[qi] || activeQuestions[0];
    const last = qi === activeQuestions.length - 1;
    const selectedIndices = answers[qi] ?? [];
    const hasAnswer = selectedIndices.length > 0 || Boolean(custom[qi]?.trim());

    const submitAnswers = (currentAnswers = answers, currentCustom = custom) => {
      setSent(true);

      const summaryLines: string[] = [];
      activeQuestions.forEach((q, idx) => {
        const picked = currentAnswers[idx] ?? [];
        const customVal = currentCustom[idx]?.trim();
        const optionLabels = picked.map(i => q.options[i]).filter(Boolean);
        if (customVal) optionLabels.push(customVal);

        const answerText = optionLabels.length > 0 ? optionLabels.join(', ') : 'No answer selected';
        summaryLines.push(`- **${q.q}**: ${answerText}`);
      });

      const formattedResponse = `[User Input Provided]\nI have answered your questions:\n${summaryLines.join('\n')}`;

      if (onAnswersSubmitted) {
        onAnswersSubmitted(formattedResponse);
      } else if (onExecuted) {
        onExecuted({ success: true, message: formattedResponse });
      }
    };

    const toggle = (index: number) => {
      const picked = answers[qi] ?? [];
      const nextPicked = question.type === "radio"
        ? [index]
        : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];

      const newAnswers = { ...answers, [qi]: nextPicked };
      setAnswers(newAnswers);

      if (question.type === "radio") {
        const newCustom = { ...custom, [qi]: "" };
        setCustom(newCustom);

        // single-choice auto-advances
        window.setTimeout(() => {
          if (qi === activeQuestions.length - 1) {
            submitAnswers(newAnswers, newCustom);
          } else {
            setQi((current) => Math.min(activeQuestions.length - 1, current + 1));
          }
        }, 480);
      }
    };

    const reset = () => {
      setQi(0);
      setAnswers({});
      setCustom({});
      setSent(false);
      setOpen(true);
    };

    return (
      <div className="flex min-h-[196px] w-full max-w-80 flex-col items-stretch my-3">
        <div className="w-full self-start overflow-hidden rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all text-[#1a1c1e]">
          {sent ? (
            <div className="flex h-37 flex-col items-center justify-center gap-2 py-6">
              <span
                className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white"
                style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span className="text-[13px] font-medium text-slate-900" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) 100ms both" }}>
                Answers sent
              </span>
              <button type="button" onClick={reset} className="text-[12px] font-medium text-slate-700 hover:underline cursor-pointer">
                Start over
              </button>
            </div>
          ) : (
            <div key={qi} className="p-4" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px] font-medium text-slate-900">{question.q}</span>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setOpen(false)}
                  className="shrink-0 size-6 flex items-center justify-center rounded-md text-slate-400 transition-colors duration-100 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-0.5">
                {question.options.map((option, i) => {
                  const on = selectedIndices.includes(i);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(i)}
                      className="-mx-1.5 flex items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200
                          ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"}
                          ${on ? "bg-slate-900 text-white" : "border border-slate-300 text-transparent"}`}
                      >
                        {question.type === "radio" ? (
                          <span className="size-1.5 rounded-full bg-white transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        )}
                      </span>
                      <span className={`text-[13px] transition-colors duration-200 ${on ? "text-slate-900 font-medium" : "text-slate-600"}`}>
                        {option}
                      </span>
                    </button>
                  );
                })}
                <label className="-mx-1.5 flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors duration-100 focus-within:bg-slate-50 hover:bg-slate-50">
                  <span aria-hidden="true" className="size-4 shrink-0" />
                  <input
                    value={custom[qi] ?? ""}
                    onChange={(event) => {
                      setCustom((current) => ({ ...current, [qi]: event.target.value }));
                      if (question.type === "radio") setAnswers((current) => ({ ...current, [qi]: [] }));
                    }}
                    placeholder="Type something…"
                    aria-label="Custom answer"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>
            </div>
          )}

          {/* footer — ring-dot pager + send arrow */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3.5 py-2.5">
            <span className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous"
                disabled={qi === 0 || sent}
                onClick={() => setQi((current) => Math.max(0, current - 1))}
                className="flex size-6 items-center justify-center rounded-[5px] text-slate-400 transition-colors duration-100 enabled:hover:bg-slate-200 enabled:hover:text-slate-700 disabled:opacity-35 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="flex items-center gap-1">
                {activeQuestions.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to question ${i + 1}`}
                    aria-current={i === qi && !sent ? "step" : undefined}
                    disabled={sent}
                    onClick={() => setQi(i)}
                    className="rounded-full transition-all duration-300 disabled:cursor-default"
                    style={
                      i === qi && !sent
                        ? { width: 9, height: 9, border: "2.5px solid #0f172a" }
                        : sent || i < qi
                          ? { width: 7, height: 7, background: "#94a3b8" }
                          : { width: 7, height: 7, border: "1.5px solid #94a3b8" }
                    }
                  />
                ))}
              </span>
              <button
                type="button"
                aria-label="Next"
                disabled={last || sent}
                onClick={() => setQi((current) => Math.min(activeQuestions.length - 1, current + 1))}
                className="flex size-6 items-center justify-center rounded-[5px] text-slate-400 transition-colors duration-100 enabled:hover:bg-slate-200 enabled:hover:text-slate-700 disabled:opacity-35 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </span>
            {!sent && (
              <button
                type="button"
                aria-label={last ? "Send answers" : "Next question"}
                disabled={!hasAnswer}
                onClick={() => last ? submitAnswers() : setQi((current) => current + 1)}
                className="-mr-0.5 flex size-7 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96] cursor-pointer"
                style={{
                  background: hasAnswer ? "#0f172a" : "#f1f5f9",
                  color: hasAnswer ? "#ffffff" : "#94a3b8",
                  boxShadow: hasAnswer ? "inset 0 1px 0 rgba(255,255,255,0.14)" : "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- PROPOSAL EXECUTION UI (WHEN NOT IN QUESTIONNAIRE MODE) ---
  const options: RecommendationOption[] = customOptions || (proposal ? [
    {
      key: proposal.actionId || 'primary',
      short: proposal.title,
      body: (
        <>
          <span className="font-semibold text-slate-900 block mb-1">{proposal.title}</span>
          <p className="text-slate-600 text-[12.5px] leading-relaxed">{proposal.description}</p>
          {proposal.payload && typeof proposal.payload === 'object' && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-0.5">
                Action Parameters
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(proposal.payload).map(([key, val]) => (
                  <div key={key} className="p-2 rounded-lg bg-white border border-slate-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                    </span>
                    <div className="mt-1">
                      {typeof val === 'boolean' ? (
                        val ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                            Pending Execution
                          </span>
                        )
                      ) : (
                        <span className="text-[12px] font-semibold text-slate-800 break-words">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val || 'N/A')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ),
      signal: proposal.riskLevel === 'low' ? 3 : 2,
      tone: proposal.riskLevel === 'low' ? '#10b981' : '#f59e0b',
      label: proposal.riskLevel === 'low' ? 'High confidence' : 'Needs review',
      cta: 'Allow & Execute',
      ctaStyle: 'bg-[#1a1c1e] text-white hover:bg-black',
      action: 'execute'
    },
    {
      key: 'deny',
      short: 'Decline & cancel action',
      body: 'Decline this action proposal. The agent will cancel the scheduled operation and record your response.',
      signal: 0,
      tone: '#94a3b8',
      label: 'Decline action',
      cta: 'Deny Proposal',
      ctaStyle: 'bg-rose-600 text-white hover:bg-rose-700',
      action: 'deny'
    },
    {
      key: 'configure',
      short: 'Review payload parameters',
      body: 'Request parameter adjustments or manual review before proceeding with this routine.',
      signal: 1,
      tone: '#f59e0b',
      label: 'Manual review',
      cta: 'Configure',
      ctaStyle: 'bg-slate-800 text-white hover:bg-slate-900',
      action: 'configure'
    }
  ] : [
    {
      key: 'default',
      short: 'Standard Recommendation',
      body: 'Execute recommended skin health action.',
      signal: 3,
      tone: '#10b981',
      label: 'High confidence',
      cta: 'Accept',
      ctaStyle: 'bg-[#1a1c1e] text-white',
      action: 'execute'
    }
  ]);

  const active = options[selected] || options[0];
  const others = options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  const handleAction = async (opt: RecommendationOption) => {
    if (opt.action === 'deny' || opt.key === 'deny') {
      setStatus('denied');
      setResultMessage('Action proposal was declined by user.');
      if (onExecuted) onExecuted({ success: false, message: 'User denied proposal.' });
      return;
    }

    if (opt.action === 'configure') {
      setStatus('denied');
      setResultMessage('User requested payload parameter configuration.');
      if (onExecuted) onExecuted({ success: false, message: 'User requested configuration.' });
      return;
    }

    if (proposal) {
      if (proposal.actionType === 'TRIGGER_FACIAL_SCAN' || proposal.actionTarget === 'scan') {
        window.dispatchEvent(new CustomEvent('prosana:open_chat_session', { detail: { initiatedBy: 'agent' } }));
        setStatus('approved');
        setResultMessage('prosana wellness check-in opened!');
        if (onExecuted) onExecuted({ success: true, message: 'prosana check-in opened.' });
        return;
      }

      setStatus('executing');
      try {
        const res = await fetch('/api/sana/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, proposal })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setStatus('approved');
          setResultMessage(data.message || 'Action executed successfully and recorded in audit log.');
          if (onExecuted) onExecuted({ success: true, message: data.message });
        } else {
          setStatus('pending');
          alert(data.error || 'Execution failed. Please try again.');
        }
      } catch (err) {
        console.error('Approval execute error:', err);
        setStatus('pending');
        alert('Network error executing proposal.');
      }
    } else {
      setStatus('approved');
      setResultMessage('Recommendation accepted.');
      if (onExecuted) onExecuted({ success: true, message: 'Recommendation accepted.' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-[400px] my-3 overflow-hidden rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all text-[#1a1c1e]"
    >
      <div className="p-4 pb-3">
        <span className="text-[13px] font-semibold text-slate-900 block">
          {title || (proposal ? 'Want me to execute this action?' : 'Agent Recommendation')}
        </span>
        <div
          key={active.key}
          className="mt-2 min-h-12 text-[12.5px] leading-relaxed text-slate-600"
          style={{ animation: 'fade-in 180ms ease-out both' }}
        >
          {active.body}
        </div>
      </div>

      {others.length > 0 && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: drawerOpen ? '1fr' : '0fr',
            opacity: drawerOpen ? 1 : 0,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 space-y-1">
              <p className="px-1 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Other options
              </p>
              {others.map(({ o, i }) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    setStatus('pending');
                    setDrawerOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-slate-200/60 active:scale-[0.98] cursor-pointer"
                >
                  <Meter signal={o.signal} tone={o.tone} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">
                    {o.short}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-slate-400">
                    {o.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-3.5 py-2.5">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12px] font-medium text-slate-700">{active.label}</span>
        </span>

        <AnimatePresence mode="wait">
          {status === 'executing' ? (
            <div className="flex items-center space-x-1.5 text-xs font-medium text-blue-600 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Executing...</span>
            </div>
          ) : status === 'approved' ? (
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Accepted</span>
            </div>
          ) : status === 'denied' ? (
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Declined</span>
            </div>
          ) : (
            <span className="flex items-center gap-2">
              {others.length > 0 && (
                <button
                  type="button"
                  aria-expanded={drawerOpen}
                  onClick={() => setDrawerOpen((current) => !current)}
                  className={`h-7 rounded-xl px-2.5 text-[12px] font-medium shadow-xs transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                    drawerOpen
                      ? 'bg-slate-200 text-slate-900'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                  }`}
                >
                  Alternatives
                </button>
              )}
              <button
                type="button"
                onClick={() => handleAction(active)}
                className={`h-7 rounded-xl px-3 text-[12px] font-medium shadow-xs transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                  active.ctaStyle || 'bg-[#1a1c1e] text-white hover:bg-black'
                }`}
              >
                {active.cta}
              </button>
            </span>
          )}
        </AnimatePresence>
      </div>

      {resultMessage && status !== 'pending' && (
        <div className="px-3.5 pb-2.5 pt-0 text-[11px] text-slate-500 font-medium">
          {resultMessage}
        </div>
      )}
    </motion.div>
  );
};

export const RecommendationCard = ApprovalCard;
export default ApprovalCard;
