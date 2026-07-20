export const sanitizeAlpha = (value) => String(value || '').replace(/[^a-zA-Z\s]/g, '');

export const sanitizeDigits = (value, maxLength) =>
  String(value || '').replace(/[^0-9]/g, '').slice(0, maxLength);
