import type { FC } from "react";
import type { CalloutVariant } from "../components/Scribe/extension/callout";

export interface CalloutIconProps {
  className?: string;
  variant: CalloutVariant;
}

export const CalloutIcon: FC<CalloutIconProps> = ({
  className = "scribe-callout-icon",
  variant,
}) => {
  const sharedProps = {
    "aria-hidden": true,
    className,
    fill: "none",
    height: 18,
    viewBox: "0 0 20 20",
    width: 18,
  } as const;
  const strokeProps = {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.5,
  };

  if (variant === "tip") {
    return (
      <svg {...sharedProps}>
        <path
          d="M6.5 12.1a5 5 0 1 1 7 0c-.8.75-1.2 1.4-1.2 2.15H7.7c0-.75-.4-1.4-1.2-2.15Z"
          {...strokeProps}
        />
        <path d="M7.9 16.6h4.2M8.8 14.25v2.35M11.2 14.25v2.35" {...strokeProps} />
      </svg>
    );
  }

  if (variant === "warning") {
    return (
      <svg {...sharedProps}>
        <path
          d="M9.1 3.6 2.3 15.4a1.05 1.05 0 0 0 .9 1.55h13.6a1.05 1.05 0 0 0 .9-1.55L10.9 3.6a1.04 1.04 0 0 0-1.8 0Z"
          {...strokeProps}
        />
        <path d="M10 7.6v4.45M10 14.65v.05" {...strokeProps} />
      </svg>
    );
  }

  if (variant === "caution") {
    return (
      <svg {...sharedProps}>
        <path d="m6.45 2.75-3.7 3.7v7.1l3.7 3.7h7.1l3.7-3.7v-7.1l-3.7-3.7h-7.1Z" {...strokeProps} />
        <path d="M10 6.2v5.65M10 14.45v.05" {...strokeProps} />
      </svg>
    );
  }

  return (
    <svg {...sharedProps}>
      <circle cx="10" cy="10" r="7.25" {...strokeProps} />
      <path d="M10 8.5v5M10 5.65v.05" {...strokeProps} />
    </svg>
  );
};

export const RemoveCalloutIcon: FC = () => (
  <svg
    aria-hidden="true"
    className="scribe-callout-icon"
    fill="none"
    height="18"
    viewBox="0 0 20 20"
    width="18"
  >
    <path
      d="M7.25 4.5h7.25M7.25 8.5h7.25M7.25 12.5h4.5M5.25 15.5l-2.5-2.5 2.5-2.5M2.75 13h4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);
