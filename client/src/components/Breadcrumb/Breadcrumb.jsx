import React, { useEffect, useLayoutEffect, useState, useRef, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import './Breadcrumb.css';

const MotionDiv = motion.div;

const COLORS = [
  '#1A56DB', '#2563EB', '#3B82F6', '#609AFA',
  '#83B4FF', '#A8CAFF', '#C8DDFF', '#E3EEFF'
];

// 计算新的显示项状态
const calculateNewState = (prevPath, nextPath, currentDisplayItems) => {
    // 检查是否相同
    if (prevPath.length === nextPath.length && prevPath.every((p, i) => p.id === nextPath[i].id)) {
        return currentDisplayItems.length > 0 ? currentDisplayItems : nextPath.map(p => ({ ...p, status: 'static' }));
    }

    const currentIds = new Set(nextPath.map(p => p.id));
    let newItems = [...currentDisplayItems];

    // 处理挂载/初始化时 currentDisplayItems 为空的情况
    if (newItems.length === 0) {
        return nextPath.map(p => ({ ...p, status: 'static' }));
    }

    // 2. Diff
    const added = nextPath.filter(p => !prevPath.some(pp => pp.id === p.id));
    const removed = prevPath.filter(p => !nextPath.some(pp => pp.id === p.id));

    if (added.length > 0) {
      // 前向动画
      newItems = newItems.filter(i => i.status !== 'exiting');

      added.forEach(item => {
        newItems.push({ ...item, status: 'entering' });
      });
    } else if (removed.length > 0) {
      // 后向动画
      const count = removed.length;
      const duration = 0.4 / (count || 1);

      // 将移除的项标记为 'exiting'
      const exitingIndices = [];
      newItems = newItems.map((item, index) => {
        if (!currentIds.has(item.id)) {
          exitingIndices.push(index);
          return { ...item, status: 'exiting' };
        }
        return item;
      });

      // 计算顺序淡出的延迟（从右到左）
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
      // Diff 未检测到变化
       if (newItems.length === 0) {
         newItems = nextPath.map(p => ({ ...p, status: 'static' }));
       }
    }

    // 同步属性
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

// 共享测量上下文，避免重复创建对象
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

const Breadcrumb = memo(({ path, onNavigate }) => {
  // 不使用模块级变量 globalLastPath（已移除），该变量曾跨挂载实例残留
  // 导致新挂载的 Breadcrumb 初始化到旧的路径状态。
  // 路径状态变化完全由 useLayoutEffect 中的 diff 逻辑驱动。
  const [displayItems, setDisplayItems] = useState(() => {
    return calculateNewState(path, path, []);
  });

  // 跟踪内部更新
  const prevPathRef = useRef(path);
  useLayoutEffect(() => {
    const prevPath = prevPathRef.current;
    if (prevPath === path) return;
    setDisplayItems(current => calculateNewState(prevPath, path, current));
    prevPathRef.current = path;
  }, [path]);

  // 同步计算宽度和位置，避免闪烁
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
        newPositions[item.id] = -w / 2; // 偏移
      } else {
        const prevId = displayItems[index - 1].id;
        const prevLeft = newPositions[prevId];
        const prevW = newWidths[prevId] || 100;
        newPositions[item.id] = (prevLeft + prevW) - w / 2;
      }
    });

    return { widths: newWidths, positions: newPositions, spaceWidth: sw };
  }, [displayItems]);

  // 处理退出项的清理定时器
  useEffect(() => {
    const exitingItems = displayItems.filter(i => i.status === 'exiting');
    if (exitingItems.length > 0) {
        // 计算最大等待时间
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

    // 如果点击的是最后一个有效项，不做任何操作
    const validItems = displayItems.filter(i => i.status !== 'exiting');
    const validIndex = validItems.findIndex(i => i.id === item.id);
    if (validIndex === validItems.length - 1) return;
    
    onNavigate(item);
  };

  // Framer Motion 动画变体
  const variants = {
    entering: {
      x: [-50, 0], // 从左滑入
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

            initial={item.status === 'entering' ? { x: -50, opacity: 0 } : { x: 0, opacity: 1 }}

            animate={item.status === 'exiting' ? 'exiting' : (item.status === 'entering' ? 'entering' : 'static')}

            custom={{ delay: item.delay || 0, duration: item.duration }}
            variants={variants}

            style={{
              width: `${w}px`,
              left: `${left}px`,
              zIndex: zIndex,
              backgroundColor: color,
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
