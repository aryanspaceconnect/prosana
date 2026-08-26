import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { SanaLogoIcon } from './SanaLogoIcon';

interface HeaderProps {
  userProfile: UserProfile | null;
  onOpenSettings: () => void;
  onOpenScan?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ userProfile, onOpenSettings }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    // Text "prosana" naturally slides into the logo icon after 5 seconds
    const timer = setTimeout(() => {
      setIsExpanded(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <header className="relative w-full px-6 pt-5 pb-2 flex items-center justify-between z-20 pointer-events-auto shrink-0">
      {/* Interactive prosana Brand with SVG Logo & Natural In-Logo Slide + Blur */}
      <div
        className="flex items-center space-x-2 cursor-pointer select-none group py-1"
        onClick={handleToggle}
        title="Toggle prosana logo text"
      >
        {/* SVG Logo Icon Mark */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="shrink-0 z-20 flex items-center justify-center"
        >
          <SanaLogoIcon size={22} color="#1a1c1e" />
        </motion.div>

        {/* Sliding Text Mask Window */}
        <motion.div
          initial={false}
          animate={{
            width: isExpanded ? 'auto' : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={{
            duration: 0.75,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="relative overflow-hidden flex items-center h-7"
          style={{
            // Apply gradient mask ONLY during collapse transition so text blurs as it enters logo
            maskImage: isExpanded
              ? 'none'
              : 'linear-gradient(to right, transparent 0px, rgba(0,0,0,0.2) 4px, black 14px, black 100%)',
            WebkitMaskImage: isExpanded
              ? 'none'
              : 'linear-gradient(to right, transparent 0px, rgba(0,0,0,0.2) 4px, black 14px, black 100%)',
          }}
        >
          <motion.div
            initial={false}
            animate={{
              x: isExpanded ? 0 : -45,
              filter: isExpanded ? 'blur(0px)' : 'blur(4px)',
            }}
            transition={{
              duration: 0.75,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="whitespace-nowrap px-0.5"
          >
            <span className="text-[19px] font-bold tracking-tight text-[#1a1c1e] lowercase">
              prosana
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* Subtle Right Status or spacing */}
      <div className="flex items-center space-x-2.5" />
    </header>
  );
};

