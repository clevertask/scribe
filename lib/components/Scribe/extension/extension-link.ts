import Link from "@tiptap/extension-link";

export default Link.configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
  protocols: ["http", "https"],
  isAllowedUri: (url, ctx) => {
    try {
      const parsedUrl = url.includes(":")
        ? new URL(url)
        : new URL(`${ctx.defaultProtocol}://${url}`);

      if (!ctx.defaultValidate(parsedUrl.href)) {
        return false;
      }

      const disallowedProtocols = ["ftp", "file", "mailto"];
      const protocol = parsedUrl.protocol.replace(":", "");

      if (disallowedProtocols.includes(protocol)) {
        return false;
      }

      const allowedProtocols = ctx.protocols.map((p) =>
        typeof p === "string" ? p : p.scheme,
      );

      if (!allowedProtocols.includes(protocol)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  },
  shouldAutoLink: (url) => {
    try {
      const parsedUrl = url.includes(":")
        ? new URL(url)
        : new URL(`https://${url}`);
      return !!parsedUrl;
    } catch (error) {
      return false;
    }
  },
});
