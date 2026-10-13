import { useState } from "react";
import { Link } from "react-router-dom";
import { FirebaseV2PageShell } from "./FirebaseV2PageShell.jsx";

export function LocalSidebar({ label, items, active, backTo, backLabel }) {
  const [open, setOpen] = useState(false);
  const menuId = `workspace-menu-${label.replace(/\s/g, "-")}`;

  return <aside className="workspace-sidebar" aria-label={`${label} 메뉴`}>
    <button className="workspace-menu-toggle" type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
      <span>{label}</span><span>{open ? "닫기" : "메뉴"}</span>
    </button>
    <div className={`workspace-sidebar-inner${open ? " is-open" : ""}`} id={menuId}>
      <div className="workspace-sidebar-heading">{label}</div>
      <nav aria-label={`${label} 관리`}>
        {items.map((item) => <Link key={item.id} to={item.to} aria-current={active === item.id ? "page" : undefined}
          className={`workspace-nav-link${active === item.id ? " is-active" : ""}`} onClick={() => setOpen(false)}>{item.label}</Link>)}
      </nav>
      <Link className="workspace-back" to={backTo} onClick={() => setOpen(false)}>{backLabel}</Link>
    </div>
  </aside>;
}

export function WorkspaceShell({ label, title, description, displayName, sidebarLabel, items, active, backTo, backLabel, children, className = "" }) {
  return <FirebaseV2PageShell className={`workspace-surface ${className}`} label={label} title={title} description={description} displayName={displayName}>
    <div className="workspace-layout">
      <LocalSidebar label={sidebarLabel} items={items} active={active} backTo={backTo} backLabel={backLabel} />
      <div className="workspace-content">{children}</div>
    </div>
  </FirebaseV2PageShell>;
}
