import React, { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { LANGS, getCurrentTranslateLang, setTranslateLang } from '../utils/translation';

const LanguageSwitcher = () => {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('en');

  useEffect(() => {
    const stored = localStorage.getItem('preferred_lang');
    const current = stored || getCurrentTranslateLang();
    setLang(current);
  }, []);

  const handleChange = (value) => {
    setLang(value);
    setTranslateLang(value);
  };

  const popular = ['en','hi','ta','te','bn','ml','kn','mr','gu','pa'];

  return (
    <div className="fixed z-[60] md:hidden" style={{ bottom: 88, left: 16 }}>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Change language"
        className="w-12 h-12 rounded-full bg-emerald-600 shadow-lg text-white flex items-center justify-center focus:outline-none active:scale-95 transition"
      >
        <Globe className="w-6 h-6" />
      </button>

      {/* Panel */}
      {open && (
        <div className="mt-2 p-3 bg-white rounded-2xl shadow-2xl w-80 max-w-[90vw] border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-800">Choose Language</div>
            <div className="text-xs text-gray-400">Google Translate</div>
          </div>

          {/* Popular languages quick row */}
          <div className="flex flex-wrap gap-2 mb-3">
            {LANGS.filter(l => popular.includes(l.code)).map(l => (
              <button
                key={l.code}
                onClick={() => handleChange(l.code)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  lang === l.code ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {l.label.split(' (')[0]}
              </button>
            ))}
          </div>

          {/* All languages scroll */}
          <div className="max-h-56 overflow-y-auto pr-1 custom-scroll">
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => handleChange(l.code)}
                  className={`text-left px-3 py-2 rounded-lg text-sm border transition ${
                    lang === l.code ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
