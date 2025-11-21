// Shared translation utilities for web + PWA

export const LANGS = [
  // Core + Indian languages
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'or', label: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'ur', label: 'Urdu (اردو)' },
  { code: 'as', label: 'Assamese (অসমীয়া)' },
  { code: 'ne', label: 'Nepali (नेपाली)' },
  { code: 'sd', label: 'Sindhi (سنڌي)' },
  { code: 'si', label: 'Sinhala (සිංහල)' },
  { code: 'sa', label: 'Sanskrit (संस्कृतम्)' },
  { code: 'bho', label: 'Bhojpuri (भोजपुरी)' },
  { code: 'gom', label: 'Konkani (कोंकणी)' },
  { code: 'mai', label: 'Maithili (मैथिली)' },
  // Popular foreign languages
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'tr', label: 'Turkish (Türkçe)' },
  { code: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  { code: 'id', label: 'Indonesian (Bahasa Indonesia)' },
  { code: 'ms', label: 'Malay (Bahasa Melayu)' },
  { code: 'th', label: 'Thai (ไทย)' },
  { code: 'nl', label: 'Dutch (Nederlands)' },
  { code: 'pl', label: 'Polish (Polski)' },
  { code: 'sv', label: 'Swedish (Svenska)' },
  { code: 'da', label: 'Danish (Dansk)' },
  { code: 'no', label: 'Norwegian (Norsk)' },
  { code: 'cs', label: 'Czech (Čeština)' },
  { code: 'el', label: 'Greek (Ελληνικά)' },
  { code: 'he', label: 'Hebrew (עברית)' },
  { code: 'hu', label: 'Hungarian (Magyar)' },
  { code: 'ro', label: 'Romanian (Română)' },
  { code: 'uk', label: 'Ukrainian (Українська)' },
  { code: 'tl', label: 'Filipino (Tagalog)' },
  { code: 'bg', label: 'Bulgarian (Български)' },
  { code: 'hr', label: 'Croatian (Hrvatski)' },
  { code: 'sr', label: 'Serbian (Српски)' },
  { code: 'sk', label: 'Slovak (Slovenčina)' },
  { code: 'sl', label: 'Slovenian (Slovenščina)' },
  { code: 'fi', label: 'Finnish (Suomi)' },
  { code: 'et', label: 'Estonian (Eesti)' },
  { code: 'lt', label: 'Lithuanian (Lietuvių)' },
  { code: 'lv', label: 'Latvian (Latviešu)' },
  { code: 'am', label: 'Amharic (አማርኛ)' },
  { code: 'sw', label: 'Swahili (Kiswahili)' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'yo', label: 'Yoruba (Yòrùbá)' },
  { code: 'zu', label: 'Zulu (isiZulu)' },
  { code: 'km', label: 'Khmer (ខ្មែរ)' },
  { code: 'lo', label: 'Lao (ລາວ)' },
  { code: 'my', label: 'Burmese (မြန်မာ)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'zh-CN', label: 'Chinese (简体)' },
  { code: 'zh-TW', label: 'Chinese (繁體)' },
];

export const getCurrentTranslateLang = () => {
  try {
    const match = document.cookie.match(/(?:^|; )googtrans=([^;]*)/);
    if (!match) return 'en';
    const value = decodeURIComponent(match[1]);
    const parts = value.split('/');
    return parts[parts.length - 1] || 'en';
  } catch { return 'en'; }
};

export const setTranslateLang = (lang) => {
  try {
    const cookieVal = `/auto/${lang}`;
    const domain = window.location.hostname;
    document.cookie = `googtrans=${cookieVal}; path=/;`;
    document.cookie = `googtrans=${cookieVal}; path=/; domain=.${domain}`;
    localStorage.setItem('preferred_lang', lang);
    window.location.reload();
  } catch (e) {
    console.error('Failed to set translation language', e);
  }
};
