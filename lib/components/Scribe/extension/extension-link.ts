import Link from "@tiptap/extension-link";

export default Link.extend({
  inclusive: false,
  addOptions() {
    return {
      openOnClick: false,
      linkOnPaste: true,
      autolink: true,
      protocols: [],
      defaultProtocol: "https",
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
        class: null,
      },
      validate: (url) => !!url,
      shouldAutoLink: (url) => !!url,
      isAllowedUri: () => true,
    };
  },
});
