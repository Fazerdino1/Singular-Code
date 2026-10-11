import React, { useState, useEffect, useRef } from 'react';

interface PanelResizerProps {
  direction?: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  onReset?: () => void;
  className?: string;
  title?: string;
}

export const PanelResizer: React.FC<PanelResizerProps> = React.memo(({
  direction = 'vertical',
  onResize,
  onReset,
  className = '',
  title = 'Glisser pour redimensionner (Double-clic pour réinitialiser)'
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);
  const accumulatedDeltaRef = useRef<number>(0);
  const rAFIdRef = useRef<number | null>(null);
  const onResizeRef = useRef(onResize);
  const directionRef = useRef(direction);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const currentPos = directionRef.current === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      accumulatedDeltaRef.current += delta;

      if (rAFIdRef.current === null) {
        rAFIdRef.current = requestAnimationFrame(() => {
          if (accumulatedDeltaRef.current !== 0) {
            onResizeRef.current(accumulatedDeltaRef.current);
            accumulatedDeltaRef.current = 0;
          }
          rAFIdRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rAFIdRef.current !== null) {
        cancelAnimationFrame(rAFIdRef.current);
        rAFIdRef.current = null;
      }
      if (accumulatedDeltaRef.current !== 0) {
        onResizeRef.current(accumulatedDeltaRef.current);
        accumulatedDeltaRef.current = 0;
      }
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('is-resizing');
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rAFIdRef.current !== null) {
        cancelAnimationFrame(rAFIdRef.current);
        rAFIdRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('is-resizing');
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY;
    accumulatedDeltaRef.current = 0;
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing');
  };

  if (direction === 'vertical') {
    return (
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={onReset}
        title={title}
        className={`group relative flex items-center justify-center w-2 -mx-1 h-full cursor-col-resize z-10 hover:z-20 select-none transition-colors duration-200 ${
          isDragging ? 'bg-cyan-500/30' : 'hover:bg-cyan-500/20'
        } ${className}`}
      >
        {/* Ligne centrale de guidage */}
        <div
          className={`w-[2px] h-full transition-all duration-200 ${
            isDragging
              ? 'bg-gradient-to-b from-cyan-400 via-indigo-400 to-purple-500 shadow-[0_0_8px_rgba(0,212,255,0.8)] scale-x-125'
              : 'bg-[#1e2335] group-hover:bg-gradient-to-b group-hover:from-cyan-400 group-hover:to-purple-500 group-hover:shadow-[0_0_6px_rgba(0,212,255,0.5)]'
          }`}
        />

        {/* Poignée tactile centrale */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-9 rounded-full border flex flex-col items-center justify-center gap-[2px] transition-all duration-200 ${
            isDragging
              ? 'bg-[#0f1422] border-cyan-400 shadow-lg shadow-cyan-500/30 scale-110'
              : 'bg-[#121622] border-[#22283a] group-hover:border-cyan-400/60 group-hover:shadow-md'
          }`}
        >
          <span className="w-1 h-1 rounded-full bg-cyan-400/80" />
          <span className="w-1 h-1 rounded-full bg-indigo-400/80" />
          <span className="w-1 h-1 rounded-full bg-purple-400/80" />
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      title={title}
      className={`group relative flex items-center justify-center h-2 -my-1 w-full cursor-row-resize z-10 hover:z-20 select-none transition-colors duration-200 ${
        isDragging ? 'bg-cyan-500/30' : 'hover:bg-cyan-500/20'
      } ${className}`}
    >
      <div
        className={`h-[2px] w-full transition-all duration-200 ${
          isDragging
            ? 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 shadow-[0_0_8px_rgba(0,212,255,0.8)] scale-y-125'
            : 'bg-[#1e2335] group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-500'
        }`}
      />
      <div
        className={`absolute left-1/2 -translate-x-1/2 h-4 w-9 rounded-full border flex items-center justify-center gap-[3px] transition-all duration-200 ${
          isDragging
            ? 'bg-[#0f1422] border-cyan-400 shadow-lg shadow-cyan-500/30 scale-110'
            : 'bg-[#121622] border-[#22283a] group-hover:border-cyan-400/60'
        }`}
      >
        <span className="w-1 h-1 rounded-full bg-cyan-400/80" />
        <span className="w-1 h-1 rounded-full bg-indigo-400/80" />
        <span className="w-1 h-1 rounded-full bg-purple-400/80" />
      </div>
    </div>
  );
});

PanelResizer.displayName = 'PanelResizer';
