import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import './ui.css';

export interface SelectOption<T extends string> {
  label: string;
  value: T;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}

const Select = <T extends string>({
  value,
  options,
  onChange,
  placeholder,
  className,
}: SelectProps<T>) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className={cn('ui-select-root', className)} ref={rootRef}>
      <button
        type="button"
        className={cn('ui-select-trigger', open && 'open')}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || placeholder || 'Select'}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="ui-select-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn('ui-select-option', option.value === value && 'selected')}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Select;
