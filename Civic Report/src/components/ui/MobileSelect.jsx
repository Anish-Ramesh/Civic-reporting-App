import React, { useEffect, useRef, useState } from 'react';

/**
 * MobileSelect - a lightweight, fully styled select replacement for mobile.
 * Avoids native Android picker UI (big blue check icons) by rendering our own list.
 *
 * Props:
 * - value: current value (string)
 * - onChange: function(value)
 * - options: Array<{ value: string, label: string }>
 * - placeholder?: string
 * - className?: string (applied to the trigger)
 */
const MobileSelect = ({ value, onChange, options = [], placeholder = 'Select', className = '', ...props }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`w-full text-left appearance-none pl-3 pr-10 h-10 sm:h-11 md:h-12 text-sm sm:text-base border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition ${className}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        {...props}
      >
        <span className={`block truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.172l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
        >
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
                className={`cursor-pointer select-none px-3 py-1.5 hover:bg-gray-50 ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'text-gray-900'}`}
              >
                <div className="flex items-center gap-2">
                  {/* check icon */}
                  <svg
                    className={`h-4 w-4 transition-opacity ${isSelected ? 'opacity-100 text-emerald-600' : 'opacity-0 text-transparent'}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25A1 1 0 116.204 9.54l2.543 2.543 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">{opt.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MobileSelect;
