const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);
const EXPLICIT_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const HOST_WITH_PORT_PATTERN =
  /^(?:localhost|(?:[a-z\d-]+\.)+[a-z\d-]+|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:]+\]):\d+(?:[/?#]|$)/i;

export const normalizeLinkUrl = (value: string): string | null => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
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
