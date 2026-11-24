import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { FirebaseV2PageShell } from "./FirebaseV2PageShell.jsx";

function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;
  return (
    <nav className="workspace-breadcrumbs" aria-label="현재 위치">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 && <ChevronRight aria-hidden="true" size={14} />}
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FlatNavigation({ items, active, closeMenu }) {
  return items.map((item) => (
    <Link key={item.id} to={item.to} aria-current={active === item.id ? "page" : undefined}
      className={`workspace-nav-link${active === item.id ? " is-active" : ""}`} onClick={closeMenu}>{item.label}</Link>
  ));
}

function GroupedNavigation({ groups, active, activeGroup, closeMenu }) {
  const [openGroups, setOpenGroups] = useState(() => new Set(activeGroup ? [activeGroup] : []));

  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((current) => {
      if (current.has(activeGroup)) return current;
      return new Set([...current, activeGroup]);
    });
  }, [activeGroup]);

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return groups.map((group) => {
    const isOpen = openGroups.has(group.id);
    const regionId = `workspace-group-${group.id}`;
    return (
      <div className={`workspace-nav-group${activeGroup === group.id ? " is-current" : ""}`} key={group.id}>
        <button type="button" className="workspace-group-toggle" aria-expanded={isOpen} aria-controls={regionId} onClick={() => toggleGroup(group.id)}>
          <span>{group.label}</span>
          <ChevronDown aria-hidden="true" size={16} className={isOpen ? "is-open" : ""} />
        </button>
        <div className="workspace-group-items" id={regionId} hidden={!isOpen}>
          {group.items.map((item) => item.to ? (
            <Link key={item.id} to={item.to} aria-current={active === item.id ? "page" : undefined}
              className={`workspace-nav-link workspace-nav-child${active === item.id ? " is-active" : ""}`} onClick={closeMenu}>
              <span>{item.label}</span>
              {item.description && <small>{item.description}</small>}
            </Link>
          ) : (
            <div className="workspace-nav-planned" key={item.id} aria-disabled="true">
              <span>{item.label}</span><small>{item.statusLabel}</small>
            </div>
          ))}
        </div>
      </div>
    );
  });
}

export function LocalSidebar({ label, items = [], groups = [], homeItem, active, activeGroup, currentGroupLabel, currentLabel, backTo, backLabel }) {
  const [open, setOpen] = useState(false);
  const menuId = `workspace-menu-${label.replace(/\s/g, "-")}`;
  const closeMenu = () => setOpen(false);

  return <aside className="workspace-sidebar" aria-label={`${label} 메뉴`}>
    <button className="workspace-menu-toggle" type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
      <span><strong>{label}</strong>{currentLabel && <small>{currentGroupLabel ? `${currentGroupLabel} · ${currentLabel}` : currentLabel}</small>}</span><span>{open ? "닫기" : "메뉴"}</span>
    </button>
    <div className={`workspace-sidebar-inner${open ? " is-open" : ""}`} id={menuId}>
      <div className="workspace-sidebar-heading">{label}</div>
      <nav aria-label={`${label} 관리`}>
        {homeItem && <Link to={homeItem.to} aria-current={active === homeItem.id ? "page" : undefined}
          className={`workspace-nav-link workspace-home-link${active === homeItem.id ? " is-active" : ""}`} onClick={closeMenu}>{homeItem.label}</Link>}
        {groups.length > 0
          ? <GroupedNavigation groups={groups} active={active} activeGroup={activeGroup} closeMenu={closeMenu} />
          : <FlatNavigation items={items} active={active} closeMenu={closeMenu} />}
      </nav>
      <Link className="workspace-back" to={backTo} onClick={closeMenu}>{backLabel}</Link>
    </div>
  </aside>;
}

export function WorkspaceShell({ label, title, description, displayName, guide, sidebarLabel, items, groups, homeItem, active, activeGroup, currentGroupLabel, currentLabel, breadcrumbs, backTo, backLabel, showDashboardLink, children, className = "" }) {
  return <FirebaseV2PageShell className={`workspace-surface ${className}`} label={label} title={title} description={description} displayName={displayName} guide={guide} showDashboardLink={showDashboardLink}>
    <div className="workspace-layout">
      <LocalSidebar label={sidebarLabel} items={items} groups={groups} homeItem={homeItem} active={active} activeGroup={activeGroup} currentGroupLabel={currentGroupLabel} currentLabel={currentLabel} backTo={backTo} backLabel={backLabel} />
      <div className="workspace-content"><Breadcrumbs items={breadcrumbs} />{children}</div>
    </div>
  </FirebaseV2PageShell>;
}
