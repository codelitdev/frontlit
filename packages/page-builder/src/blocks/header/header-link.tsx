import type { ThemeStyle } from "../../models";
import type { HeaderNavLink } from "./settings";
import { NavLink } from "../../components/nav-link";
import { Button, Link as PrimitiveLink } from "../../primitives";

export function HeaderLink({
  link,
  theme,
  onClick,
  fullWidth = false,
}: {
  link: HeaderNavLink;
  theme?: ThemeStyle;
  onClick?: () => void;
  /** Mobile menu: button links span the sheet, like the CTA. */
  fullWidth?: boolean;
}) {
  if (link.isButton) {
    return (
      <NavLink href={link.href} onClick={onClick}>
        <Button
          size={fullWidth ? undefined : "sm"}
          theme={theme}
          className={fullWidth ? "w-full" : undefined}
        >
          {link.label}
        </Button>
      </NavLink>
    );
  }

  return (
    <NavLink href={link.href} onClick={onClick} className="no-underline">
      <PrimitiveLink theme={theme} className="no-underline">
        {link.label}
      </PrimitiveLink>
    </NavLink>
  );
}
