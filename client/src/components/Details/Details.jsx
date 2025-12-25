import React, { useEffect, useRef } from 'react';
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
  }, [open]);

  useEffect(() => {
    return () => {
      unlockScroll();
    };
  }, []);

  return (
    <AnimatePresence
      onExitComplete={() => {
        unlockScroll();
      }}
    >
      {open && (
        <div className="details-root">
          <MotionDiv
            className="details-mask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          />
          <MotionDiv
            className="details-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <div className="details-header">
              <div className="details-header-main">
                <div className="details-title">{title}</div>
              </div>
              <button type="button" className="details-close" onClick={onClose}>
                X
              </button>
            </div>
            <div className="details-body">{children}</div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Details;
