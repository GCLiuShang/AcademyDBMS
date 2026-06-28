import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './Details.css';

const MotionDiv = motion.div;

const Details = ({ open, title, children, onClose }) => {
  const scrollLockRef = useRef({ locked: false, prevOverflow: '', prevPaddingRight: '' });

  const lockScroll = () => {
    if (scrollLockRef.current.locked) return;
    const body = document.body;
    scrollLockRef.current.prevOverflow = body.style.overflow;
    scrollLockRef.current.prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    scrollLockRef.current.locked = true;
  };

  const unlockScroll = () => {
    if (!scrollLockRef.current.locked) return;
    const body = document.body;
    body.style.overflow = scrollLockRef.current.prevOverflow;
    body.style.paddingRight = scrollLockRef.current.prevPaddingRight;
    scrollLockRef.current.locked = false;
  };

  useEffect(() => {
    if (open) lockScroll();
    return () => unlockScroll();
  }, [open]);

  return (
    <AnimatePresence onExitComplete={unlockScroll}>
      {open && (
        <div className="details-root">
          {/* 遮罩 */}
          <MotionDiv
            className="details-mask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          />

          {/* 面板 */}
          <MotionDiv
            className="details-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="details-header">
              <div className="details-header-main">
                <div className="details-title">{title}</div>
              </div>
              <button type="button" className="details-close" onClick={onClose}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="close-x">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <div className="details-body">
              {/* 内容滑入 */}
              <MotionDiv
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
              >
                {children}
              </MotionDiv>
            </div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Details;
