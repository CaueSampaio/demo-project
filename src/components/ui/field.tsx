import { cn } from "@/lib/utils";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

/**
 * Label + control + hint/error. Generates a control id and `aria-describedby`
 * (and `aria-invalid` on error) when the child is a single element.
 */
const Field = forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, htmlFor, hint, error, children, ...props }, ref) => {
    const generatedId = useId();
    const controlId = htmlFor ?? generatedId;
    const hintId = hint ? `${controlId}-hint` : undefined;
    const errorId = error ? `${controlId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

    let control = children;
    if (isValidElement(children)) {
      const childProps = children.props as FieldControlProps;
      control = cloneElement(children as ReactElement<FieldControlProps>, {
        id: childProps.id ?? controlId,
        "aria-describedby":
          [childProps["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : childProps["aria-invalid"],
      });
    }

    return (
      <div ref={ref} data-slot="field" className={cn("space-y-2", className)} {...props}>
        <label htmlFor={controlId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {control}
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Field.displayName = "Field";

export { Field };
export type { FieldProps };
