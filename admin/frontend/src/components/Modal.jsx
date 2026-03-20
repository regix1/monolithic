import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Global modal tracking for nested modal support
let modalStack = [];
let modalIdCounter = 0;
let savedScrollbarWidth = 0;

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export default function Modal({ opened, onClose, title, children, size = 'md' }) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [zIndex, setZIndex] = React.useState(80);
  const modalId = React.useRef(null);

  React.useEffect(() => {
    if (opened) {
      modalId.current = ++modalIdCounter;

      if (modalStack.length === 0) {
        savedScrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${savedScrollbarWidth}px`;
      }

      modalStack.push(modalId.current);
      setZIndex(80 + modalStack.length);

      setIsVisible(true);
      setTimeout(() => {
        setIsAnimating(true);
      }, 25);
    } else {
      setIsAnimating(false);
      setTimeout(() => {
        setIsVisible(false);

        if (modalId.current !== null) {
          modalStack = modalStack.filter((id) => id !== modalId.current);
          modalId.current = null;
        }

        if (modalStack.length === 0) {
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }
      }, 250);
    }

    return () => {
      if (modalId.current !== null) {
        modalStack = modalStack.filter((id) => id !== modalId.current);
        modalId.current = null;

        if (modalStack.length === 0) {
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }
      }
    };
  }, [opened]);

  React.useEffect(() => {
    if (!opened) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [opened, onClose]);

  if (!isVisible) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 overflow-y-auto overflow-x-hidden py-4 sm:py-8 transition-all duration-250 ease-out ${
        isAnimating ? 'bg-black/50 pointer-events-auto' : 'bg-transparent pointer-events-none'
      }`}
      style={{ zIndex }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="min-h-full flex items-center justify-center px-4">
        <div
          className={`bg-panda-surface border border-panda-border rounded-xl shadow-xl w-full ${sizes[size]} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col transform transition-all duration-250 ease-out ${
            isAnimating
              ? 'opacity-100 scale-100 translate-y-0 delay-[50ms]'
              : 'opacity-0 scale-90 translate-y-8 delay-0'
          }`}
        >
          {title && (
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-panda-border flex-shrink-0">
              <div className="text-base sm:text-lg font-semibold text-panda-text leading-tight">
                {title}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-panda-muted hover:text-panda-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
