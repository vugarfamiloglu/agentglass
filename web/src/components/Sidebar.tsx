import { NavLink } from "react-router-dom";

import { BrandMark } from "./BrandMark";
import { NAV } from "../nav";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <span className="brand-word">
          Glass<b>wing</b>
        </span>
      </div>

      <nav className="nav">
        {NAV.map((group) => (
          <div className="nav-group" key={group.group}>
            <div className="nav-label">{group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
              >
                <span className="nav-glyph">{item.glyph}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot mono">capture · inspect · replay</div>
    </aside>
  );
}
