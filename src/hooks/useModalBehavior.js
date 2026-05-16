import { useEffect } from 'react';

/**
 * Standard modal behaviors:
 *  - Pressing Escape calls onClose
 *  - Body scroll is locked while the modal is open
 *
 * Pair with `handleOverlayClick` so clicking the dimmed overlay also closes,
 * but clicks inside the modal body do not.
 *
 * @param {() => void} onClose
 * @param {{ enabled?: boolean }} [opts] - set enabled:false to temporarily skip (e.g. while saving)
 */
export function useModalBehavior(onClose, opts = {}) {
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) return undefined;

    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, enabled]);
}

/**
 * Use this on the overlay element so only clicks on the dim background
 * (not bubbling clicks from inside the modal) close the modal.
 */
export function handleOverlayClick(onClose) {
  return (event) => {
    if (event.target === event.currentTarget) onClose();
  };
}
