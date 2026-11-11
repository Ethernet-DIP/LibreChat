import { useId } from 'react';
import { cn } from '~/utils';

/** Static diamond-lattice pattern drawn in the current text color, so it follows light and dark
 *  themes. Shared by the sign-in panel, the signed-in sidebar and the new-chat screen. Decorative
 *  only. */
export default function AuthPattern({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn(
        'text-text-on-status pointer-events-none absolute inset-0 size-full opacity-15',
        className,
      )}
    >
      <defs>
        <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M24 2 46 24 24 46 2 24Z" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M24 14 34 24 24 34 14 24Z" fill="currentColor" fillOpacity="0.5" />
          <circle cx="0" cy="0" r="2" fill="currentColor" />
          <circle cx="48" cy="0" r="2" fill="currentColor" />
          <circle cx="0" cy="48" r="2" fill="currentColor" />
          <circle cx="48" cy="48" r="2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
