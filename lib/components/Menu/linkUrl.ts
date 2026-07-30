const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);
const EXPLICIT_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const ROOT_RELATIVE_PATH_PATTERN = /^\/(?![\\/])/;
const HOST_WITH_PORT_PATTERN =
  /^(?:localhost|(?:[a-z\d-]+\.)+[a-z\d-]+|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:]+\]):\d+(?:[/?#]|$)/i;
const LEADING_SLASH_PATTERN = /^[\\/]/;

const containsAsciiControlCharacter = (value: string) => {
  for (const character of value) {
    const characterCode = character.charCodeAt(0);

    if (characterCode <= 31 || characterCode === 127) {
      return true;
    }
  }

  return false;
};

export const normalizeLinkUrl = (value: string): string | null => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (containsAsciiControlCharacter(trimmedValue)) {
    return null;
  }

  if (ROOT_RELATIVE_PATH_PATTERN.test(trimmedValue) && !trimmedValue.includes("\\")) {
    return trimmedValue;
  }

  if (LEADING_SLASH_PATTERN.test(trimmedValue)) {
    return null;
  }

  try {
    const hasExplicitProtocol =
      EXPLICIT_PROTOCOL_PATTERN.test(trimmedValue) && !HOST_WITH_PORT_PATTERN.test(trimmedValue);
    const candidate = hasExplicitProtocol ? trimmedValue : `https://${trimmedValue}`;
    const url = new URL(candidate);

    return ALLOWED_LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
