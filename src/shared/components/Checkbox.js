"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

const sizes = {
  sm: { box: "size-4", icon: "text-[14px]" },
  md: { box: "size-5", icon: "text-[16px]" },
};

export default function Checkbox({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  indeterminate = false,
  size = "md",
  ariaLabel,
  className,
}) {
  const handleClick = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  const isChecked = !!checked;
  const isIndeterminate = !isChecked && !!indeterminate;
  const ariaChecked = isIndeterminate ? "mixed" : isChecked;

  return (
    <div
      className={cn(
        "flex items-start gap-2",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={ariaChecked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/30",
          isChecked || isIndeterminate
            ? "bg-brand-500 border-brand-500 text-white"
            : "bg-background border-black/20 dark:border-white/20",
          sizes[size].box,
          disabled && "cursor-not-allowed"
        )}
      >
        {isChecked && (
          <span className={cn("material-symbols-outlined leading-none", sizes[size].icon)}>
            check
          </span>
        )}
        {isIndeterminate && (
          <span className={cn("block h-0.5 w-2 rounded-full bg-current", sizes[size].icon)} />
        )}
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-text-main">{label}</span>
          )}
          {description && (
            <span className="text-xs text-text-muted">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}

Checkbox.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  description: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  disabled: PropTypes.bool,
  indeterminate: PropTypes.bool,
  size: PropTypes.oneOf(["sm", "md"]),
  ariaLabel: PropTypes.string,
  className: PropTypes.string,
};
