// Aadhar validation function
export function verhoeffCheck(aadhaar) {
  if (!aadhaar) return false;
  const num = aadhaar.toString().replace(/\D/g, '');
  return num.length === 12 && /^\d+$/.test(num);
}

// Alias for verhoeffCheck to maintain backward compatibility
export const isAadharBasic = verhoeffCheck;

// Format Aadhar number for display (XXXX-XXXX-XXXX)
export function formatAadhar(aadhaar) {
  if (!aadhaar) return '';
  const num = aadhaar.toString().replace(/\D/g, '');
  return num.replace(/(\d{4})(?=\d)/g, '$1-').replace(/-$/g, '');
}
