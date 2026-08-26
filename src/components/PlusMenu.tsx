import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PlusMenuProps {
  onUploadDocument?: () => void;
  onUploadImage?: () => void;
  onOpenVault?: () => void;
}

export const PlusMenu: React.FC<PlusMenuProps> = ({
  onUploadDocument,
  onUploadImage,
  onOpenVault
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative flex items-center justify-center shrink-0">
      {/* Emergent Menu Items */}
      <AnimatePresence>
        {open && (
          <div className="absolute inset-0 pointer-events-none z-50">
            {/* Top Item: Photo / Image */}
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              animate={{ scale: 1, opacity: 1, x: 0, y: -58 }}
              exit={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25, mass: 0.8, delay: 0.02 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                if (onUploadImage) onUploadImage();
              }}
              title="Upload Photo / Skin Image"
              className="pointer-events-auto absolute left-1/2 top-1/2 -ml-5 -mt-5 w-10 h-10 rounded-full bg-white text-[#111827] shadow-[0_4px_18px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-transform"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="4" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </motion.button>

            {/* Left Item: Document */}
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              animate={{ scale: 1, opacity: 1, x: -48, y: -26 }}
              exit={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25, mass: 0.8, delay: 0.0 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                if (onUploadDocument) onUploadDocument();
              }}
              title="Upload Document / Skin Note"
              className="pointer-events-auto absolute left-1/2 top-1/2 -ml-5 -mt-5 w-10 h-10 rounded-full bg-white text-[#111827] shadow-[0_4px_18px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-transform"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </motion.button>

            {/* Right Item: Folder / Vault */}
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              animate={{ scale: 1, opacity: 1, x: 48, y: -26 }}
              exit={{ scale: 0, opacity: 0, x: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25, mass: 0.8, delay: 0.04 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                if (onOpenVault) onOpenVault();
              }}
              title="Open Memory Vault & History"
              className="pointer-events-auto absolute left-1/2 top-1/2 -ml-5 -mt-5 w-10 h-10 rounded-full bg-white text-[#111827] shadow-[0_4px_18px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-transform"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* Base Trigger Circle: Single circle with + / X */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={open ? "Close menu" : "Add photo, document, or vault"}
        className="w-9 h-9 rounded-full bg-white text-[#111827] shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/80 flex items-center justify-center cursor-pointer focus:outline-none hover:scale-105 active:scale-95 transition-all duration-200 z-40 relative shrink-0"
      >
        <motion.div
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 450, damping: 25 }}
          className="flex items-center justify-center"
        >
          {open ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </motion.div>
      </button>
    </div>
  );
};

export default PlusMenu;
