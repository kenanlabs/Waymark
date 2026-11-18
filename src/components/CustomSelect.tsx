import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface CustomSelectProps<T extends string = string> {
  id?: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  align?: 'left' | 'right';
  fullWidth?: boolean;
  size?: 'sm' | 'md';
}

export function CustomSelect<T extends string = string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  align = 'right',
  fullWidth = false,
  size = 'sm',
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const currentOption = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, options, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = options[activeIndex];
      if (chosen) {
        onChange(chosen.value);
      }
      setOpen(false);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
    }
  };

  const triggerSizeClass =
    size === 'md'
      ? 'w-full h-9 px-3 text-xs bg-[#FAFAFA] dark:bg-[#18181B] text-[#09090B] dark:text-[#FAFAFA]'
      : 'h-8 px-2.5 text-[12px] font-medium bg-white dark:bg-[#111113] text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white';

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? 'block w-full' : 'inline-block'}`}
      onKeyDown={handleKeyDown}
    >
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={`${triggerSizeClass} inline-flex items-center justify-between gap-2 border border-[#E4E4E7] dark:border-[#27272A] hover:border-[#A1A1AA] dark:hover:border-[#3F3F46] rounded-lg transition-[border-color,box-shadow,color] whitespace-nowrap focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA]`}
      >
        <span className="truncate">{currentOption?.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#A1A1AA] shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: align === 'right' ? 'top right' : 'top left' }}
            className={`absolute z-50 mt-1.5 ${
              fullWidth ? 'w-full' : 'min-w-[144px]'
            } py-1 bg-white dark:bg-[#16161A] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)] overflow-hidden ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === activeIndex;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-[12px] text-left transition-colors ${
                      isHighlighted
                        ? 'bg-[#F4F4F5] dark:bg-[#232329] text-[#09090B] dark:text-white'
                        : 'text-[#52525B] dark:text-[#A1A1AA]'
                    } ${isSelected ? 'font-medium text-[#09090B] dark:text-white' : ''}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#09090B] dark:text-white shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

interface GroupComboboxProps {
  id: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function GroupCombobox({
  id,
  value,
  suggestions,
  onChange,
  placeholder = '输入或选择分组',
}: GroupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) {
      setIsFiltering(false);
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const trimmed = value.trim();
  const filtered = isFiltering && trimmed
    ? suggestions.filter((s) => s.toLowerCase().includes(trimmed.toLowerCase()))
    : suggestions;
  const exactMatch = suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase());
  const displayOptions = filtered.length > 0 ? filtered : suggestions;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && e.key === 'ArrowDown') {
      e.preventDefault();
      setIsFiltering(false);
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % displayOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + displayOptions.length) % displayOptions.length);
    } else if (e.key === 'Enter' && displayOptions[activeIndex]) {
      e.preventDefault();
      onChange(displayOptions[activeIndex]);
      setOpen(false);
      setIsFiltering(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          value={value}
          onFocus={() => {
            setIsFiltering(false);
            setOpen(true);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setIsFiltering(true);
            setOpen(true);
            setActiveIndex(0);
          }}
          placeholder={placeholder}
          className="w-full h-9 pl-3 pr-8 text-xs bg-[#FAFAFA] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-lg focus:outline-none focus:border-[#09090B] dark:focus:border-[#FAFAFA] ring-inset focus:ring-1 focus:ring-[#09090B] dark:focus:ring-[#FAFAFA] transition-[border-color,box-shadow]"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="展开分组选项"
          onClick={() => {
            setIsFiltering(false);
            setOpen((prev) => !prev);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white rounded"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <AnimatePresence>
        {open && (displayOptions.length > 0 || (trimmed && !exactMatch)) && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top center' }}
            className="absolute left-0 right-0 z-40 mt-1.5 max-h-48 overflow-y-auto overscroll-contain py-1 bg-white dark:bg-[#16161A] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          >
            {trimmed && !exactMatch && (
              <li role="option" aria-selected={true}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(trimmed);
                    setOpen(false);
                    setIsFiltering(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#F4F4F5] dark:hover:bg-[#232329] font-medium border-b border-[#F4F4F5] dark:border-[#27272A]/60"
                >
                  <span className="truncate">使用新分组「{trimmed}」</span>
                </button>
              </li>
            )}
            {displayOptions.map((option, idx) => {
              const isSelected = option === value;
              const isHighlighted = idx === activeIndex;
              return (
                <li key={option} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(option);
                      setOpen(false);
                      setIsFiltering(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                      isHighlighted
                        ? 'bg-[#F4F4F5] dark:bg-[#232329] text-[#09090B] dark:text-white'
                        : 'text-[#52525B] dark:text-[#A1A1AA]'
                    } ${isSelected ? 'font-medium text-[#09090B] dark:text-white' : ''}`}
                  >
                    <span className="truncate">{option}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#09090B] dark:text-white shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
