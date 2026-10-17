import { useEffect, useRef, type ChangeEvent, type JSX } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type WeightInputProps = {
  value: string;
  onChange: (value: string) => void;
  min?: number; // default 1
  max?: number; // default 1500
  disabled?: boolean;
  className?: string;
};

/** Digits-only after input filtering, so this is true only for a non-empty
 * integer within [min, max]. Empty is treated as invalid so submit buttons
 * stay disabled while the field is blank. */
export function isValidWeight(value: string, min: number, max: number): boolean {
  if (!/^\d*$/.test(value)) return false;
  if (value === "") return false;
  const num = Number(value);
  return num >= min && num <= max;
}

export function WeightInput({
  value,
  onChange,
  min = 1,
  max = 1500,
  disabled,
  className,
}: WeightInputProps): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);

  // SSR hydration race guard: an `input` event dispatched before hydration is
  // dropped by React (text input events are not replayed), but the DOM keeps
  // the typed value while our controlled state still holds the SSR value.
  // After hydration, adopt whatever digits the DOM holds into state.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.value === value) return;
    const adopted = /^\d*$/.test(el.value) ? el.value.replace(/^0+(?=\d)/, "") : "";
    if (adopted !== value) onChange(adopted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Reject characters that are not digits ( "-", ".", "e", ... ) and trim
    // leading zeros ("0123" -> "123"); "0" and empty stay as-is.
    const next = /^\d*$/.test(raw) ? raw.replace(/^0+(?=\d)/, "") : value;
    if (raw !== next) e.target.value = next;
    if (next !== value) onChange(next);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        ref={ref}
        type="number"
        inputMode="numeric"
        aria-label="Weight"
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        className="w-full min-w-0"
      />
      <span aria-hidden="true" className="text-sm text-slate-500 select-none shrink-0">
        lbs
      </span>
    </div>
  );
}
