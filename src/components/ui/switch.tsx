import './ui.css';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Switch = ({ checked, onCheckedChange, disabled }: SwitchProps) => (
  <button
    type="button"
    className="ui-switch"
    data-checked={checked}
    aria-pressed={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
  >
    <span className="ui-switch-thumb" />
  </button>
);

export default Switch;
