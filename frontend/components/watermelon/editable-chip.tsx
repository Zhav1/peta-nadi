// Watermelon registry: editable-chip (interactive editable chip)
// Source: https://registry.watermelon.sh/r/editable-chip.json
// Adapted for PreHub dark theme: single surface bg-[#0c1017], borders
// border-white/10, min text size text-xs (12px) tabular-nums, ring-1
// white/20 when editing. Hand-rolled: react-icons BiSolidPencil swapped to
// lucide Pencil (no react-icons dep), motion/react layout/AnimatePresence
// replaced with CSS motion-safe keyframes + static reduced-motion final
// state. cn util kept. requestAnimationFrame focus kept. No Portal.
'use client';

import {
  useState,
  useRef,
  useEffect,
  type FC,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableChipProps {
  defaultLabel?: string;
  onChange?: (value: string) => void;
}

export const EditableChip: FC<EditableChipProps> = ({
  defaultLabel = 'Watchlist',
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState<string>(defaultLabel);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  const handleSave = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    const finalValue = label.trim() === '' ? 'Untitled' : label;
    setLabel(finalValue);
    setIsEditing(false);
    onChange?.(finalValue);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  return (
    <div>
      <style>{`@media (prefers-reduced-motion: no-preference) {
  @keyframes wm-chip-fade { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
  .wm-chip-fade { animation: wm-chip-fade 0.2s ease both; }
}`}</style>
      <div
        className={cn(
          'relative flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full border border-white/10 bg-[#0c1017] py-1 pr-1 transition-all duration-300 ease-in-out select-none motion-reduce:transition-none',
          isEditing && 'gap-8 ring-1 ring-white/20',
        )}
      >
        <input
          key="input"
          ref={inputRef}
          type="text"
          value={label}
          readOnly={!isEditing}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setLabel(e.target.value)
          }
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
            e.key === 'Enter' && handleSave(e)
          }
          onClick={(e: MouseEvent) => e.stopPropagation()}
          className="ml-4 w-32 border-none bg-transparent text-xs font-medium text-slate-100 capitalize tabular-nums outline-none selection:bg-white/20"
        />

        {isEditing ? (
          <button
            key="done"
            onClick={handleSave}
            className="wm-chip-fade rounded-full bg-white p-1 text-[#080d14] transition-colors"
          >
            <Check size={20} />
          </button>
        ) : (
          <button
            key="edit"
            onClick={handleEdit}
            className="wm-chip-fade rounded-full bg-white/5 p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
          >
            <Pencil size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default EditableChip;
