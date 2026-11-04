"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Controlled `<input type="date">` with iOS / iOS Chrome (WebKit) Reset support.
 *
 * WebKit "Reset" reverts to the `defaultValue` attribute. React mirrors `value` into
 * `defaultValue` on controlled inputs, so Reset appears to do nothing unless we keep
 * `defaultValue` empty. Change/input may also report a stale value; re-read after
 * the picker closes (blur + visualViewport resize + short timeouts).
 */
export function DateInput({
  value,
  onValueChange,
  className,
  onFocus,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "onInput"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const clearIosDefaultValue = useCallback((el: HTMLInputElement) => {
    el.defaultValue = "";
  }, []);

  const commitDomValue = useCallback((el: HTMLInputElement) => {
    const domValue = el.value;
    if (domValue !== valueRef.current) {
      onValueChangeRef.current(domValue);
    }
  }, []);

  const scheduleIosSync = useCallback(
    (el: HTMLInputElement) => {
      commitDomValue(el);
      clearIosDefaultValue(el);

      const run = () => {
        commitDomValue(el);
        clearIosDefaultValue(el);
      };

      queueMicrotask(run);
      requestAnimationFrame(run);
      window.setTimeout(run, 0);
      window.setTimeout(run, 100);
      window.setTimeout(run, 250);
    },
    [clearIosDefaultValue, commitDomValue],
  );

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    clearIosDefaultValue(el);
    if (value === "" && el.value !== "") {
      el.value = "";
    }
  }, [value, clearIosDefaultValue]);

  return (
    <input
      {...rest}
      ref={inputRef}
      type="date"
      className={className}
      value={value || ""}
      onChange={(event) => scheduleIosSync(event.currentTarget)}
      onInput={(event) => scheduleIosSync(event.currentTarget)}
      onBlur={(event) => scheduleIosSync(event.currentTarget)}
      onFocus={(event) => {
        onFocus?.(event);
        const el = event.currentTarget;
        const viewport = window.visualViewport;
        if (!viewport) return;

        const onViewportChange = () => {
          requestAnimationFrame(() => scheduleIosSync(el));
        };

        viewport.addEventListener("resize", onViewportChange);
        viewport.addEventListener("scroll", onViewportChange);

        const detach = () => {
          viewport.removeEventListener("resize", onViewportChange);
          viewport.removeEventListener("scroll", onViewportChange);
          scheduleIosSync(el);
        };

        el.addEventListener("blur", detach, { once: true });
      }}
    />
  );
}
