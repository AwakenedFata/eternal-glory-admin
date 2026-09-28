export function redactSensitiveData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }

  const result = { ...data };
  const sensitiveKeys = ["access_token", "partner_key", "secret", "password", "token", "refresh_token", "authorization", "api_key"];

  for (const [key, value] of Object.entries(result)) {
    const isSensitiveKey = sensitiveKeys.some(sk => key.toLowerCase().includes(sk));
    
    // Also check if this object is a key-value pair itself (e.g. headers: [{ name: "auth", value: "..." }])
    const isSensitiveNameField = (key === 'value' || key === 'val') && result.name && typeof result.name === 'string' && sensitiveKeys.some(sk => result.name.toLowerCase().includes(sk));
    const isSensitiveKeyField = (key === 'value' || key === 'val') && result.key && typeof result.key === 'string' && sensitiveKeys.some(sk => result.key.toLowerCase().includes(sk));

    if ((isSensitiveKey || isSensitiveNameField || isSensitiveKeyField) && typeof value === "string") {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitiveData(value);
    }
  }

  return result;
}
