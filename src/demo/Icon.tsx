const paths: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  building:
    "M4 21V7l8-4 8 4v14 M2 21h20 M8 9h1m6 0h1M8 13h1m6 0h1M8 17h1m6 0h1",
  calendar: "M4 5h16v16H4z M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 4h2",
  spark: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  search: "M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  bell: "M6 8a6 6 0 0 1 12 0v7l2 3H4l2-3zM10 21h4",
  users:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-4-4M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3a4 4 0 0 1 0 8",
  pin: "M12 22s8-8 8-14A8 8 0 0 0 4 8c0 6 8 14 8 14z M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  layers: "m12 3 10 6-10 6L2 9z M2 13l10 6 10-6M2 17l10 6 10-6",
  settings:
    "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  help: "M9 8a3 3 0 1 1 4 3c-1 .4-1 1-1 3m0 3v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  logout: "M9 3H3v18h6m5-14 5 5-5 5m-7-5h15",
  play: "m9 5 11 7-11 7z",
  close: "m6 6 12 12M6 18 18 6",
  filter: "M3 5h18M6 12h12M9 19h6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
  file: "M5 2h9l5 5v15H5zM14 2v6h5M8 12h8m-8 4h8",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  refresh: "M20 8a9 9 0 1 0 1 8M20 2v6h-6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-5 10 3 3 7-7",
  menu: "M4 6h16M4 12h16M4 18h16",
  link: "m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  book: "M3 3h7l2 2 2-2h7v17h-7l-2 2-2-2H3zM12 5v17",
  warning: "m12 3 10 18H2zM12 9v5m0 3v.1",
};
export default function Icon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}
