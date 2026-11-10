/** Decorative brand-colored glow behind the auth screens. Purely visual, so it is hidden
 *  from assistive tech; the drift stops under `prefers-reduced-motion`. */
function AuthBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      data-testid="auth-backdrop"
    >
      <div className="animate-aurora-a bg-surface-brand/25 absolute -top-32 -left-24 size-[28rem] rounded-full blur-3xl motion-reduce:animate-none" />
      <div className="animate-aurora-b bg-surface-brand/20 absolute -right-24 -bottom-32 size-[32rem] rounded-full blur-3xl motion-reduce:animate-none" />
      <div className="animate-aurora-a bg-surface-brand/10 absolute top-1/3 left-1/2 size-80 rounded-full blur-3xl motion-reduce:animate-none" />
    </div>
  );
}

export default AuthBackdrop;
