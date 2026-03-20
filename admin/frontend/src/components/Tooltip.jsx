import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const DEFAULT_OFFSET = 8;

const EdgeTooltip = ({ trigger, content, position, offset, contentClassName }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    if (!ref.current) return;

    const rect = trigger.getBoundingClientRect();
    const tooltipRect = ref.current.getBoundingClientRect();
    const viewportPadding = 12;
    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2 - tooltipRect.width / 2;
        y = rect.top - tooltipRect.height - offset;
        if (y < viewportPadding) {
          y = rect.bottom + offset;
        }
        break;
      case 'bottom':
        x = rect.left + rect.width / 2 - tooltipRect.width / 2;
        y = rect.bottom + offset;
        if (y + tooltipRect.height > window.innerHeight - viewportPadding) {
          y = rect.top - tooltipRect.height - offset;
        }
        break;
      case 'left':
        x = rect.left - tooltipRect.width - offset;
        y = rect.top + rect.height / 2 - tooltipRect.height / 2;
        if (x < viewportPadding) {
          x = rect.right + offset;
        }
        break;
      case 'right':
        x = rect.right + offset;
        y = rect.top + rect.height / 2 - tooltipRect.height / 2;
        if (x + tooltipRect.width > window.innerWidth - viewportPadding) {
          x = rect.left - tooltipRect.width - offset;
        }
        break;
      default:
        break;
    }

    // Clamp to viewport bounds
    x = Math.max(viewportPadding, Math.min(x, window.innerWidth - tooltipRect.width - viewportPadding));
    y = Math.max(viewportPadding, Math.min(y, window.innerHeight - tooltipRect.height - viewportPadding));

    setPos({ x, y });
    setIsReady(true);
  }, [trigger, position, offset]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className={`fixed z-[90] max-w-md px-2.5 py-1.5 text-xs bg-panda-surface border border-panda-border text-panda-text rounded-md shadow-lg ${contentClassName}`}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        opacity: isReady ? 1 : 0,
        transition: 'none',
        pointerEvents: isReady ? 'auto' : 'none',
      }}
    >
      {content}
    </div>
  );
};

const Tooltip = ({
  children,
  content,
  position = 'top',
  offset = DEFAULT_OFFSET,
  className,
  contentClassName = '',
}) => {
  const [show, setShow] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [globallyDisabled, setGloballyDisabled] = useState(
    document.documentElement.getAttribute('data-disable-tooltips') === 'true'
  );
  const triggerRef = useRef(null);
  const showTimeoutRef = useRef(null);

  // Listen for tooltips setting changes
  useEffect(() => {
    const handleTooltipsChange = () => {
      const disabled = document.documentElement.getAttribute('data-disable-tooltips') === 'true';
      setGloballyDisabled(disabled);
      if (disabled) setShow(false);
    };
    window.addEventListener('tooltipschange', handleTooltipsChange);
    return () => window.removeEventListener('tooltipschange', handleTooltipsChange);
  }, []);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile((prev) => (prev === mobile ? prev : mobile));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Scroll and click-outside handlers when visible
  useEffect(() => {
    if (!show) return;

    const handleScroll = () => setShow(false);

    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        setShow(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('touchmove', handleScroll, { passive: true, capture: true });

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, { capture: true });
      document.addEventListener('touchstart', handleClickOutside, { capture: true });
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('touchmove', handleScroll, { capture: true });
      document.removeEventListener('click', handleClickOutside, { capture: true });
      document.removeEventListener('touchstart', handleClickOutside, { capture: true });
    };
  }, [show]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    };
  }, []);

  const tooltipsDisabled = globallyDisabled;

  const defaultChildren = (
    <Info
      aria-label="More information"
      className={`w-5 h-5 text-panda-text p-1.5 -m-1.5 ${tooltipsDisabled ? '' : 'cursor-help'}`}
    />
  );
  const childContent = children ?? defaultChildren;

  const handleMouseEnter = () => {
    if (tooltipsDisabled || isMobile) return;
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    showTimeoutRef.current = setTimeout(() => setShow(true), 150);
  };

  const handleMouseLeave = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    setShow(false);
  };

  const handleClick = (e) => {
    if (isMobile && !tooltipsDisabled) {
      e.preventDefault();
      e.stopPropagation();
      if (!show) {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
          // position state not needed for edge strategy, just toggle
        }
      }
      setShow((prev) => !prev);
    } else {
      setShow(false);
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        className={className || 'inline-flex'}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {childContent}
      </div>

      {show && !tooltipsDisabled && triggerRef.current &&
        createPortal(
          <EdgeTooltip
            trigger={triggerRef.current}
            content={content}
            position={position}
            offset={offset}
            contentClassName={contentClassName}
          />,
          document.body
        )}
    </>
  );
};

export default Tooltip;
