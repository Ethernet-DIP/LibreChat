import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Reveals `text` one character at a time while `active`. Under reduced motion the
 *  whole string is returned at once. */
export function useTypewriter(text: string, active: boolean, speedMs = 28) {
  const reduced = useReducedMotion() === true;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const id = setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, speedMs);
    return () => clearInterval(id);
  }, [text, active, reduced, speedMs]);

  return { shown: text.slice(0, count), done: count >= text.length };
}
