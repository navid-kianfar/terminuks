import { forwardRef, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import './ui.css';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn('ui-textarea', className)} {...props} />
  )
);

Textarea.displayName = 'Textarea';

export default Textarea;
