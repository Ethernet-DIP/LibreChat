import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { TranslationKeys } from '~/hooks';
import { useTypewriter } from './Typewriter';
import AuthPattern from './AuthPattern';
import { useLocalize } from '~/hooks';

const scenarios: { prompt: TranslationKeys; reply: TranslationKeys }[] = [
  { prompt: 'com_auth_showcase_prompt_help', reply: 'com_auth_showcase_reply_help' },
  { prompt: 'com_auth_showcase_prompt_who', reply: 'com_auth_showcase_reply_who' },
  { prompt: 'com_auth_showcase_prompt_quiz', reply: 'com_auth_showcase_reply_quiz' },
  { prompt: 'com_auth_showcase_prompt_lesson', reply: 'com_auth_showcase_reply_lesson' },
];

function Chat({ scenario, onDone }: { scenario: (typeof scenarios)[number]; onDone: () => void }) {
  const localize = useLocalize();
  const prompt = localize(scenario.prompt);
  const reply = localize(scenario.reply);
  const asking = useTypewriter(prompt, true);
  const answering = useTypewriter(reply, asking.done, 18);

  useEffect(() => {
    if (!answering.done || !asking.done) {
      return;
    }
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [answering.done, asking.done, onDone]);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="bg-surface-primary/95 text-text-primary animate-auth-rise ms-auto max-w-[85%] rounded-2xl rounded-ee-sm px-4 py-3 text-sm shadow-lg motion-reduce:animate-none">
        {asking.shown}
        {!asking.done && (
          <span className="animate-caret-blink ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-current motion-reduce:animate-none" />
        )}
      </div>
      {asking.done && (
        <div className="bg-surface-primary/95 text-text-primary animate-auth-rise max-w-[90%] rounded-2xl rounded-es-sm px-4 py-3 text-sm shadow-lg motion-reduce:animate-none">
          <div className="text-accent-primary mb-1 text-xs font-semibold">
            {localize('com_auth_showcase_assistant')}
          </div>
          {answering.shown}
          {!answering.done && (
            <span className="animate-caret-blink ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-current motion-reduce:animate-none" />
          )}
        </div>
      )}
    </div>
  );
}

/** Decorative sign-in side panel: a looping mock conversation showing what the assistant
 *  does. It is hidden from assistive tech because its typing text would otherwise be
 *  re-announced on every character; the same message lives in the headline. */
export default function AuthShowcase() {
  const localize = useLocalize();
  const reduced = useReducedMotion() === true;
  const [index, setIndex] = useState(0);
  const next = useCallback(() => {
    if (!reduced) {
      setIndex((i) => (i + 1) % scenarios.length);
    }
  }, [reduced]);

  return (
    <aside
      aria-hidden="true"
      data-testid="auth-showcase"
      className="from-surface-brand to-surface-brand-hover text-text-on-status relative hidden grow basis-1/2 flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br p-10 lg:flex"
    >
      <AuthPattern />
      <div className="animate-auth-rise relative max-w-md text-center motion-reduce:animate-none">
        <h2 className="text-3xl font-semibold">{localize('com_auth_showcase_headline')}</h2>
        <p className="mt-2 text-base opacity-90">{localize('com_auth_showcase_subhead')}</p>
      </div>
      <Chat key={index} scenario={scenarios[index]} onDone={next} />
    </aside>
  );
}
