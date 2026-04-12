import './CustomSwitch.css';

interface CustomSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const CustomSwitch = ({ checked, onCheckedChange }: CustomSwitchProps) => {
  return (
    <button
      type="button"
      className={`custom-switch ${checked ? 'checked' : ''}`}
      onClick={() => onCheckedChange(!checked)}
      aria-pressed={checked}
    >
      <span className="custom-switch-thumb" />
    </button>
  );
};

export default CustomSwitch;
