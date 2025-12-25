import React, { useEffect, useLayoutEffect, useState, useRef, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import './Breadcrumb.css';

const MotionDiv = motion.div;

const COLORS = [
  '#00489B', '#005BC0', '#006CE2', '#1182FF', 
  '#3F9AFF', '#69B0FF', '#8FC4FF', '#B7D9FF'
];

let globalLastPath = []; // Module-level variable to persist across unmounts

// Helper: Calculate new display items state
const calculateNewState = (prevPath, nextPath, currentDisplayItems) => {
    // 1. Check if identical
    if (prevPath.length === nextPath.length && prevPath.every((p, i) => p.id === nextPath[i].id)) {
        return currentDisplayItems.length > 0 ? currentDisplayItems : nextPath.map(p => ({ ...p, status: 'static' }));
    }

    const currentIds = new Set(nextPath.map(p => p.id));
    let newItems = [...currentDisplayItems];

    // Handle Mount/Init case where currentDisplayItems is empty but we have history
    if (newItems.length === 0) {
        if (prevPath.length > 0) {
            newItems = prevPath.map(p => ({ ...p, status: 'static' }));
        } else {
            // First ever load
            return nextPath.map(p => ({ ...p, status: 'static' }));
        }
    }

    // 2. Diff
    const added = nextPath.filter(p => !prevPath.some(pp => pp.id === p.id));
    const removed = prevPath.filter(p => !nextPath.some(pp => pp.id === p.id));

    if (added.length > 0) {
      // --- Forward Animation ---
      newItems = newItems.filter(i => i.status !== 'exiting');
      
      added.forEach(item => {
        newItems.push({ ...item, status: 'entering' });
      });
    } else if (removed.length > 0) {
      // --- Backward Animation ---
      const count = removed.length;
      const duration = 0.4 / (count || 1); 
      
      // Mark removed items as 'exiting' in the current list
      const exitingIndices = [];
      newItems = newItems.map((item, index) => {
        if (!currentIds.has(item.id)) {
          exitingIndices.push(index);
          return { ...item, status: 'exiting' };
        }
        return item;
      });

      // Calculate delays for sequential fade out (Right to Left)
      newItems = newItems.map((item, index) => {
        if (item.status === 'exiting') {
          const groupIndex = exitingIndices.indexOf(index);
          const reverseIndex = exitingIndices.length - 1 - groupIndex; 
          
          const delay = reverseIndex * duration;
          return { ...item, duration: duration, delay };
        }
        return item;
      });
    } else {
      // No change detected by diff logic
       if (newItems.length === 0) {
         newItems = nextPath.map(p => ({ ...p, status: 'static' }));
       } 
    }

    // Synchronize properties
    newItems = newItems.map(item => {
      if (item.status === 'exiting') return item;
      const latest = nextPath.find(p => p.id === item.id);
      if (latest) {
        const status = item.status === 'entering' ? 'entering' : 'static';
        return { ...item, ...latest, status };
      }
      return item;
    });

    return newItems;
};

// Shared measurement context to avoid repeated object creation
const measurementCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measurementContext = measurementCanvas ? measurementCanvas.getContext('2d') : null;

const getTextWidth = (text) => {
  if (!measurementContext) return 100;
  measurementContext.font = 'bold 16px sans-serif'; 
  const metrics = measurementContext.measureText(text + '         ');
  return metrics.width;
};

const getSpaceWidth = () => {
  if (!measurementContext) return 5;
  measurementContext.font = 'bold 16px sans-serif';
  return measurementContext.measureText(' ').width;
};

/**
 * Breadcrumb Component
 */
const Breadcrumb = memo(({ path, onNavigate }) => {
  // Initialize state based on global history to handle unmount/remount
  const [displayItems, setDisplayItems] = useState(() => {
    return calculateNewState(globalLastPath, path, []);
  });
  
  // Track internal updates
  const prevPathRef = useRef(path); 
  useLayoutEffect(() => {
    const prevPath = prevPathRef.current;
    if (prevPath === path) return;
    setDisplayItems(current => calculateNewState(prevPath, path, current));
    prevPathRef.current = path;
    globalLastPath = path;
  }, [path]);

  // Derive widths and positions synchronously to avoid flickering
  const { widths, positions, spaceWidth } = useMemo(() => {
    const sw = getSpaceWidth();
    const newWidths = {};
    displayItems.forEach(item => {
      newWidths[item.id] = getTextWidth(item.name) * 2;
    });

    const newPositions = {};
    displayItems.forEach((item, index) => {
      const w = newWidths[item.id] || 100;
      if (index === 0) {
        newPositions[item.id] = -w / 2; // Offset for visual style
      } else {
        const prevId = displayItems[index - 1].id;
        const prevLeft = newPositions[prevId];
        const prevW = newWidths[prevId] || 100;
        newPositions[item.id] = (prevLeft + prevW) - w / 2;
      }
    });

    return { widths: newWidths, positions: newPositions, spaceWidth: sw };
  }, [displayItems]);

  // Effect to handle ONLY cleanup timers for exiting items
  useEffect(() => {
    const exitingItems = displayItems.filter(i => i.status === 'exiting');
    if (exitingItems.length > 0) {
        // Calculate max wait time
        let maxDuration = 0;
        exitingItems.forEach(item => {
            const end = (item.delay || 0) + (item.duration || 0.4);
            if (end > maxDuration) maxDuration = end;
        });
        
        const timeoutId = setTimeout(() => {
            setDisplayItems(prev => prev.filter(i => path.some(p => p.id === i.id)));
        }, (maxDuration + 0.1) * 1000);
        
        return () => clearTimeout(timeoutId);
    }
  }, [displayItems, path]);

  const handleClick = (index) => {
    const item = displayItems[index];
    if (item.status === 'exiting') return;
    
    // Check if clicking the last valid item (do nothing)
    const validItems = displayItems.filter(i => i.status !== 'exiting');
    const validIndex = validItems.findIndex(i => i.id === item.id);
    if (validIndex === validItems.length - 1) return;
    
    onNavigate(item);
  };

  // Framer Motion Variants
  const variants = {
    entering: { 
      x: [-50, 0], // Slide in from left
      opacity: [0, 1],
      transition: { duration: 0.4, ease: "easeOut" }
    },
    exiting: (custom) => ({ 
      opacity: 0,
      transition: { 
        duration: custom.duration || 0.4, 
        delay: custom.delay, 
        ease: "linear" 
      }
    }),
    static: { 
      x: 0, 
      opacity: 1,
      transition: { duration: 0 } 
    }
  };

  return (
    <div className="breadcrumb-container">
      {displayItems.map((item, index) => {
        const w = widths[item.id];
        const left = positions[item.id];
        const color = COLORS[index % COLORS.length];
        const zIndex = 100 - index;

        return (
          <MotionDiv
            key={item.id}
            className={`breadcrumb-item ${item.status}`}
            onClick={() => handleClick(index)}
            
            // Initial state logic
            initial={item.status === 'entering' ? { x: -50, opacity: 0 } : { x: 0, opacity: 1 }}
            
            // Animation state
            animate={item.status === 'exiting' ? 'exiting' : (item.status === 'entering' ? 'entering' : 'static')}
            
            // Pass custom data (delay, duration) to variants
            custom={{ delay: item.delay || 0, duration: item.duration }}
            variants={variants}

            style={{
              width: `${w}px`,
              left: `${left}px`,
              zIndex: zIndex,
              backgroundColor: color,
              // Motion handles transform and opacity, standard CSS handles layout
            }}
          >
            <div className="breadcrumb-text-half" style={{ paddingLeft: `${spaceWidth * 2}px` }}>
              {item.name}
            </div>
          </MotionDiv>
        );
      })}
    </div>
  );
});

export default Breadcrumb;
