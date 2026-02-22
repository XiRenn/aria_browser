import React from "react";

function Icon({ children, className = "h-4 w-4", viewBox = "0 0 24 24" }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ArrowLeftIcon({ className }) {
  return <Icon className={className}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Icon>;
}
export function ArrowRightIcon({ className }) {
  return <Icon className={className}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>;
}
export function ChevronUpIcon({ className }) {
  return <Icon className={className}><path d="m18 15-6-6-6 6" /></Icon>;
}
export function ChevronDownIcon({ className }) {
  return <Icon className={className}><path d="m6 9 6 6 6-6" /></Icon>;
}
export function ReloadIcon({ className }) {
  return <Icon className={className}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Icon>;
}
export function ChevronLeftIcon({ className }) {
  return <Icon className={className}><path d="m15 18-6-6 6-6" /></Icon>;
}
export function DownloadIcon({ className }) {
  return <Icon className={className}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Icon>;
}
export function EditIcon({ className }) {
  return <Icon className={className}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></Icon>;
}
export function EyeIcon({ className }) {
  return <Icon className={className}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>;
}
export function EyeOffIcon({ className }) {
  return <Icon className={className}><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6 0 10 8 10 8a18.8 18.8 0 0 1-4 5.2" /><path d="M6.6 6.6A18.6 18.6 0 0 0 2 12s4 8 10 8a10.7 10.7 0 0 0 5.4-1.4" /></Icon>;
}
export function FolderIcon({ className }) {
  return <Icon className={className}><path d="M3 6h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Icon>;
}
export function FolderPlusIcon({ className }) {
  return <Icon className={className}><path d="M3 6h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v6" /><path d="M9 14h6" /></Icon>;
}
export function MaximizeIcon({ className }) {
  return <Icon className={className}><path d="M8 3H3v5" /><path d="M16 3h5v5" /><path d="M3 16v5h5" /><path d="M21 16v5h-5" /></Icon>;
}
export function MinusIcon({ className }) {
  return <Icon className={className}><path d="M5 12h14" /></Icon>;
}
export function PlusIcon({ className }) {
  return <Icon className={className}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
}
export function SearchIcon({ className }) {
  return <Icon className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>;
}
export function StarIcon({ className }) {
  return <Icon className={className}><path d="m12 2.5 3.1 6.3 7 .9-5 4.9 1.2 6.9L12 18.2 5.7 21.5 7 14.6 2 9.7l7-.9Z" /></Icon>;
}
export function TrashIcon({ className }) {
  return <Icon className={className}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></Icon>;
}
export function UploadIcon({ className }) {
  return <Icon className={className}><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></Icon>;
}
export function CloseIcon({ className }) {
  return <Icon className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
}
export function PinIcon({ className }) {
  return <Icon className={className}><path d="M15 3 9 9l-2 6 6-2 6-6-4-4Z" /><path d="M12 12v9" /></Icon>;
}
export function PinOffIcon({ className }) {
  return <Icon className={className}><path d="M3 3l18 18" /><path d="M15 3 9 9l-2 6 6-2 6-6-4-4Z" /></Icon>;
}
export function AlwaysOnTopOnIcon({ className }) {
  return <Icon className={className}><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M12 15V9" /><path d="m9.5 11.5 2.5-2.5 2.5 2.5" /></Icon>;
}
export function AlwaysOnTopOffIcon({ className }) {
  return <Icon className={className}><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M8 15h8" /></Icon>;
}
export function SidebarToggleIcon({ className, open = false }) {
  return (
    <Icon className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 4v16" />
      {open ? <path d="m7 12 2-2m-2 2 2 2" /> : <path d="m7 12-2-2m2 2-2 2" />}
    </Icon>
  );
}
export function HistoryIcon({ className }) {
  return <Icon className={className}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v5h5" /><path d="M12 7v6l4 2" /></Icon>;
}
export function VolumeIcon({ className }) {
  return <Icon className={className}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15 9a5 5 0 0 1 0 6" /><path d="M17.5 6.5a8.5 8.5 0 0 1 0 11" /></Icon>;
}
export function VolumeOffIcon({ className }) {
  return <Icon className={className}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></Icon>;
}
export function PopoutPlayerIcon({ className }) {
  return <Icon className={className}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M13 9h5v5" /><path d="m18 9-6 6" /></Icon>;
}
