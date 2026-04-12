import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import './ui.css';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('ui-input', className)} {...props} />
  )
);

Input.displayName = 'Input';

export default Input;
