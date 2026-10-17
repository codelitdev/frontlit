"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import type { ThemeStyle } from "../../models";
import type { HeaderNavLink } from "./settings";
import { NavLink } from "../../components/nav-link";
import { Button, Drawer } from "../../primitives";
import { HeaderLink } from "./header-link";

/**
 * The header's mobile drawer. It is the only interactive part of the header,
 * so it is the only part sent to the browser on server-rendered pages.
 */
export function HeaderMobileMenu({
  links,
  ctaLabel,
  ctaHref,
  theme,
}: {
  links: HeaderNavLink[];
  ctaLabel?: string;
  ctaHref?: string;
  theme: ThemeStyle;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer
      open={open}
      setOpen={setOpen}
      side="right"
      theme={theme}
      trigger={
        <Button variant="outline" size="sm" theme={theme}>
          <MenuIcon className="h-4 w-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      }
    >
      <div className="mt-6 flex flex-col gap-4">
        {links.map((link) => (
          <HeaderLink
            key={link.id}
            link={link}
            theme={theme}
            onClick={() => setOpen(false)}
            fullWidth
          />
        ))}
        {ctaLabel && ctaHref && (
          <NavLink href={ctaHref} onClick={() => setOpen(false)}>
            <Button theme={theme} className="w-full">
              {ctaLabel}
            </Button>
          </NavLink>
        )}
      </div>
    </Drawer>
  );
}
