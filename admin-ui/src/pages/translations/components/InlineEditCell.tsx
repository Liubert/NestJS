import React from 'react';
import { Input } from 'antd';

interface InlineEditCellProps {
  value: string | null;
  onSave: (value: string) => void;
  onCancel: () => void;
}

const InlineEditCell: React.FC<InlineEditCellProps> = ({ value, onSave, onCancel }) => {
  const [localValue, setLocalValue] = React.useState(value ?? '');
  const savedRef = React.useRef(false);

  const handleSave = () => {
    if (savedRef.current) return;
    savedRef.current = true;
    onSave(localValue);
  };

  return (
    <Input.TextArea
      autoFocus
      autoSize={{ minRows: 1, maxRows: 5 }}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      style={{ fontSize: 12, minWidth: 80 }}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

export default InlineEditCell;
