const demoOrigin = "https://demo.invalid";

function normalizePath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/index.html" ? "/" : path;
}

export function matchesDemoDestination(destination, location) {
  const expected = new URL(destination, demoOrigin);
  if (normalizePath(expected.pathname) !== normalizePath(location.pathname)) return false;

  const incoming = new URLSearchParams(location.search);
  return [...expected.searchParams].every(([key, value]) => incoming.get(key) === value);
}
