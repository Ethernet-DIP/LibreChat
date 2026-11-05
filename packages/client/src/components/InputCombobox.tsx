import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import type { OptionWithIcon } from '~/common';
import { fieldControl } from './Field';
import { cn } from '~/utils';

type ComboboxProps = {
  /** Ties an external `Label` to the input through its `htmlFor`. */
  id?: string;
  /** `field` matches `Input` and shows an arrow, for a combobox among form fields. */
  variant?: 'default' | 'field';
  required?: boolean;
  label?: string;
  placeholder?: string;
  options: OptionWithIcon[] | string[];
  className?: string;
  labelClassName?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export const InputCombobox: React.FC<ComboboxProps> = ({
  id,
  variant = 'default',
  required,
  label,
  labelClassName,
  placeholder = 'Select an option',
  options,
  className,
  value,
  onChange,
  onBlur,
}) => {
  const isOptionObject = (option: unknown): option is OptionWithIcon => {
    return option != null && typeof option === 'object' && 'value' in option;
  };

  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [isKeyboardFocus, setIsKeyboardFocus] = React.useState(false);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);
  };

  return (
    <Ariakit.ComboboxProvider value={inputValue} setValue={handleChange}>
      {label != null && (
        <Ariakit.ComboboxLabel
          className={cn('text-text-primary mb-2 block text-sm font-medium', labelClassName ?? '')}
        >
          {label}
        </Ariakit.ComboboxLabel>
      )}
      <div
        className={cn(
          'relative',
          variant === 'default' && isKeyboardFocus && 'ring-focus-control rounded-md ring-2',
        )}
      >
        <Ariakit.Combobox
          id={id}
          required={required}
          placeholder={placeholder}
          className={cn(
            variant === 'field'
              ? cn(fieldControl, 'pe-9')
              : 'border-border-light bg-surface-primary text-text-primary placeholder-text-secondary hover:bg-surface-hover h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden',
            className,
          )}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => {
            setIsKeyboardFocus(false);
            onBlur();
          }}
          onFocusVisible={() => {
            setIsKeyboardFocus(true);
            setIsOpen(true);
          }}
          onMouseDown={() => {
            setIsKeyboardFocus(false);
          }}
        />
        {variant === 'field' && (
          <ChevronDown
            className="text-text-secondary pointer-events-none absolute inset-y-0 end-3 my-auto size-4"
            aria-hidden="true"
          />
        )}
      </div>
      <Ariakit.ComboboxPopover
        gutter={4}
        sameWidth
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className={cn(
          'bg-surface-primary text-text-primary z-50 max-h-60 w-full overflow-auto rounded-md p-1 shadow-lg',
          'animate-in fade-in-0 zoom-in-95',
        )}
      >
        {options.map((option: string | OptionWithIcon, index: number) => (
          <Ariakit.ComboboxItem
            key={index}
            className={cn(
              'relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none',
              'hover:bg-surface-tertiary hover:text-text-primary cursor-pointer',
              'data-[active-item]:bg-surface-tertiary data-[active-item]:text-text-primary',
            )}
            value={isOptionObject(option) ? `${option.value ?? ''}` : option}
          >
            {isOptionObject(option) && option.icon != null && (
              <span className="me-2 shrink-0">{option.icon}</span>
            )}
            {isOptionObject(option) ? option.label : option}
          </Ariakit.ComboboxItem>
        ))}
      </Ariakit.ComboboxPopover>
    </Ariakit.ComboboxProvider>
  );
};
