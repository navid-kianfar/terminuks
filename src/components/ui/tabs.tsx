import { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import './ui.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  children: ReactNode;
}

const Tabs = <T extends string>({ items, value, onValueChange, children }: TabsProps<T>) => (
  <div className="ui-tabs">
    <div className="ui-tabs-list">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={cn('ui-tabs-trigger', item.value === value && 'active')}
          onClick={() => onValueChange(item.value)}
        >
          {item.icon}
          <span className="ui-tabs-trigger-copy">
            <strong>{item.label}</strong>
            {item.description && <span>{item.description}</span>}
          </span>
        </button>
      ))}
    </div>
    <div className="ui-tabs-content">{children}</div>
  </div>
);

export default Tabs;
