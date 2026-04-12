import { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import './ui.css';

type ButtonVariant = 'default' | 'primary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClass: Record<ButtonVariant, string> = {
  default: '',
  primary: 'ui-button-primary',
  outline: 'ui-button-outline',
  ghost: 'ui-button-ghost',
  destructive: 'ui-button-destructive',
};

const sizeClass: Record<ButtonSize, string> = {
  default: '',
  sm: 'ui-button-sm',
  icon: 'ui-button-icon',
};

const Button = ({ className, variant = 'default', size = 'default', ...props }: ButtonProps) => (
  <button
    className={cn('ui-button', variantClass[variant], sizeClass[size], className)}
    {...props}
  />
);

export default Button;
