import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

interface TooltipProps {
  content?: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom';
  delayMs?: number;
  disabled?: boolean;
}

interface Coords {
  top: number;
  left: number;
  actualSide: 'top' | 'bottom';
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 120,
  disabled = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords>({ top: 0, left: 0, actualSide: side });
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const hasContent =
    !disabled &&
    content !== undefined &&
    content !== null &&
    content !== false &&
    (typeof content !== 'string' || content.trim().length > 0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const computePosition = useCallback(
    (anchor: HTMLElement, tipEl?: HTMLDivElement | null) => {
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tipWidth = tipEl?.offsetWidth ?? 160;
      const tipHeight = tipEl?.offsetHeight ?? 30;
      const gap = 7;

      let actualSide = side;
      if (side === 'top' && rect.top - tipHeight - gap < 8) {
        actualSide = 'bottom';
      } else if (side === 'bottom' && rect.bottom + tipHeight + gap > vh - 8) {
        actualSide = 'top';
      }

      const top =
        actualSide === 'top' ? Math.max(8, rect.top - tipHeight - gap) : Math.min(vh - tipHeight - 8, rect.bottom + gap);

      const centerX = rect.left + rect.width / 2;
      const halfWidth = tipWidth / 2;
      const clampedCenterX = Math.max(
        10 + halfWidth,
        Math.min(vw - 10 - halfWidth, centerX)
      );

      setCoords({
        top,
        left: clampedCenterX,
        actualSide,
      });
    },
    [side]
  );

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    computePosition(triggerRef.current, tooltipRef.current);
  }, [open, content, computePosition]);

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => {
      setOpen(false);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  if (!hasContent || !isValidElement(children)) {
    return children;
  }

  const childProps = children.props as Record<string, unknown>;

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (typeof childProps.onMouseEnter === 'function') {
      (childProps.onMouseEnter as (ev: React.MouseEvent<HTMLElement>) => void)(e);
    }
    const target = e.currentTarget;
    triggerRef.current = target;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (triggerRef.current) {
        computePosition(triggerRef.current, tooltipRef.current);
        setOpen(true);
      }
    }, delayMs);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (typeof childProps.onMouseLeave === 'function') {
      (childProps.onMouseLeave as (ev: React.MouseEvent<HTMLElement>) => void)(e);
    }
    hideTooltip();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (typeof childProps.onMouseDown === 'function') {
      (childProps.onMouseDown as (ev: React.MouseEvent<HTMLElement>) => void)(e);
    }
    hideTooltip();
  };

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (typeof childProps.onFocus === 'function') {
      (childProps.onFocus as (ev: React.FocusEvent<HTMLElement>) => void)(e);
    }
    const target = e.currentTarget;
    triggerRef.current = target;
    clearTimer();
    computePosition(target, tooltipRef.current);
    setOpen(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (typeof childProps.onBlur === 'function') {
      (childProps.onBlur as (ev: React.FocusEvent<HTMLElement>) => void)(e);
    }
    hideTooltip();
  };

  const clonedChild = cloneElement(children, {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onMouseDown: handleMouseDown,
    onFocus: handleFocus,
    onBlur: handleBlur,
  } as Record<string, unknown>);

  return (
    <>
      {clonedChild}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={tooltipRef}
                role="tooltip"
                initial={{
                  opacity: 0,
                  scale: 0.96,
                  y: coords.actualSide === 'top' ? 3 : -3,
                }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'fixed',
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  transform: 'translateX(-50%)',
                }}
                className="z-[140] pointer-events-none select-none max-w-[320px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium leading-snug break-words bg-white dark:bg-[#1E1E24] text-[#27272A] dark:text-[#E4E4E7] border border-[#E4E4E7] dark:border-[#32323A] shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.36)]"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
