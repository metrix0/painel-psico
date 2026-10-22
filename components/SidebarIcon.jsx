"use client";

// Compact Lucide-style navigation icons (24px viewBox, 2px stroke).
const paths = {
  "calendar-days": <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </>,
  "user-round": <>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </>,
  "message-circle": <>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    <path d="M8 10h8M8 14h5" />
  </>,
  clock: <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>,
  brain: <>
    <path d="M12 18V5" />
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
    <path d="M17.6 6.5A3 3 0 0 0 12 5a3 3 0 0 0-5.6 1.5 4 4 0 0 0-1.4 7.2A4 4 0 0 0 8 21h.5a3.5 3.5 0 0 0 3.5-3.5A3.5 3.5 0 0 0 15.5 21h.5a4 4 0 0 0 3-7.3 4 4 0 0 0-1.4-7.2Z" />
  </>,
  "clipboard-list": <>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M8 12h.01M12 12h4M8 16h.01M12 16h4" />
  </>,
  "notebook-pen": <>
    <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4" />
    <path d="m16 5 3 3M14 10l-1 4 4-1 5-5a2.12 2.12 0 0 0-3-3Z" />
  </>,
  "clipboard-check": <>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4" />
  </>,
  "file-text": <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M8 13h8M8 17h8" />
  </>,
  settings: <>
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.6 1.6-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.52V20h-2.3v-.09a1.65 1.65 0 0 0-1-1.52 1.65 1.65 0 0 0-1.82.33l-.06.06-1.6-1.6.06-.06A1.65 1.65 0 0 0 8.92 15a1.65 1.65 0 0 0-1.52-1H7.3v-2.3h.09a1.65 1.65 0 0 0 1.52-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06 1.6-1.6.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.52V6h2.3v.09a1.65 1.65 0 0 0 1 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06 1.6 1.6-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.52 1H21v2.3h-.09a1.65 1.65 0 0 0-1.52 1Z" transform="translate(-2 -1)" />
  </>,
  "triangle-alert": <>
    <path d="M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
  "log-out": <>
    <path d="M10 17l5-5-5-5M15 12H3" />
    <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
  </>
};

export default function SidebarIcon({ name, className = "sidebar-nav-icon" }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg"
    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    focusable="false">
    {paths[name] || null}
  </svg>;
}
