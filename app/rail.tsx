"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Manifest" },
  { href: "/profile", label: "Route Profile" },
  { href: "/briefs", label: "Briefs" },
  { href: "/settings", label: "Settings" },
];

export function Rail() {
  const path = usePathname();
  return (
    <nav className="rail">
      <div className="brand">
        <div className="name">FLIGHT BAG</div>
        <div className="caps">dispatch planner</div>
      </div>
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={active ? "active" : ""}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
