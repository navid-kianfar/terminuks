import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import './ui.css';

interface ColorPickerProps {
  value: string;
  colors: string[];
  onChange: (value: string) => void;
  className?: string;
}

const ColorPicker = ({ value, colors, onChange, className }: ColorPickerProps) => {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !(menuRef.current && menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!open || !rootRef.current) {
      return;
    }

    const rect = rootRef.current.getBoundingClientRect();
    const estimatedMenuHeight = Math.min(colors.length, 6) * 48 + 24;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
    setMenuStyle({
      top: rect.bottom + 6,
      left: rect.right - Math.min(220, rect.width),
      width: Math.min(220, rect.width),
    });
  }, [open, colors.length]);

  return (
    <div className={cn('ui-color-picker', className)} ref={rootRef}>
      <button
        type="button"
        className={cn('ui-select-trigger', 'ui-color-trigger', open && 'open')}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ui-color-trigger-value">
          <span className="ui-color-chip" style={{ backgroundColor: value }} />
          <span>{value}</span>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          className={cn('ui-color-menu', openUpward && 'ui-color-menu-upward', 'ui-color-menu-portal')}
          style={{
            left: menuStyle.left,
            width: menuStyle.width,
            top: openUpward ? undefined : menuStyle.top,
            bottom: openUpward ? window.innerHeight - rootRef.current!.getBoundingClientRect().top + 6 : undefined,
          }}
        >
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className={cn('ui-color-option', color === value && 'selected')}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
            >
              <span className="ui-color-trigger-value">
                <span className="ui-color-chip" style={{ backgroundColor: color }} />
                <span>{color}</span>
              </span>
              {color === value && <Check size={14} />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default ColorPicker;
