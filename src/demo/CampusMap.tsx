import { useState } from "react";
import type { Venue, Booking } from "./model";
export default function CampusMap({
  venues,
  bookings,
  selected,
  onSelect,
  date,
  hour = 14,
  large = false,
}: {
  venues: Venue[];
  bookings: Booking[];
  selected?: string;
  onSelect: (id: string) => void;
  date: string;
  hour?: number;
  large?: boolean;
}) {
  const [flat, setFlat] = useState(false);
  const [zoom, setZoom] = useState(1);
  const time = String(hour).padStart(2, "0") + ":00";
  return (
    <div className={"campus-map " + (large ? "large" : "")}>
      <div className="map-top">
        <span>
          <i className="live-dot" /> 示例校区 · 场地示意
        </span>
        <button onClick={() => setFlat(!flat)}>
          {flat ? "立体视角" : "平面视角"}
        </button>
      </div>
      <svg
        className="campus-svg"
        viewBox="0 0 780 530"
        role="img"
        aria-label="可交互校园场地示意图，非真实测绘地图"
      >
        <defs>
          <pattern
            id="grid"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M28 0H0V28"
              fill="none"
              stroke="#d6e0d6"
              strokeWidth=".6"
            />
          </pattern>
          <filter id="shadow">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="9"
              floodColor="#274b37"
              floodOpacity=".13"
            />
          </filter>
        </defs>
        <rect width="780" height="530" fill="#eef2e9" />
        <rect width="780" height="530" fill="url(#grid)" />
        <g
          transform={`translate(${390 - 390 * zoom} ${265 - 265 * zoom}) scale(${zoom})`}
        >
          <path
            d="m75 275 270-200 350 170-255 225Z"
            fill="#dce7d5"
            stroke="#c9d7c4"
            strokeWidth="2"
          />
          <path
            d="m113 280 233-168 303 136-216 185Z"
            fill="#e8eddf"
            stroke="#fafbf4"
            strokeWidth="17"
          />
          <path
            d="m340 115 70 38-205 216m32-144 307 143M130 292l214 100m110-225-72 233"
            stroke="#fffdf3"
            strokeWidth="12"
            fill="none"
          />
          <path
            d="m447 279c22-37 96-44 129-22 22 15-13 38-43 45-19 5-54 30-75 18-15-7-22-22-11-41Z"
            fill="#aacbc5"
            stroke="#d1e2d5"
            strokeWidth="8"
          />
          <text
            x="494"
            y="282"
            fill="#608b83"
            fontSize="12"
            transform="rotate(-22 494 282)"
          >
            静 湖
          </text>
          {Array.from({ length: 28 }, (_, i) => {
            const x = 110 + ((i * 71) % 520),
              y = 170 + ((i * 47) % 245);
            return (
              <g key={i}>
                <ellipse cx={x} cy={y + 8} rx="10" ry="5" fill="#c5d4ba" />
                <path
                  d={`M${x} ${y + 8}v-16`}
                  stroke="#a0b294"
                  strokeWidth="3"
                />
                <ellipse
                  cx={x}
                  cy={y - 4}
                  rx="9"
                  ry="13"
                  fill={i % 2 ? "#9fbb8e" : "#b5cba5"}
                />
              </g>
            );
          })}
          {venues.map((v, i) => {
            const occupied = bookings.some(
              (b) =>
                b.status === "APPROVED" &&
                b.venueId === v.id &&
                b.date === date &&
                b.start <= time &&
                b.end > time,
            );
            const fill = !v.enabled
              ? "#b6bab4"
              : occupied
                ? "#d6af6e"
                : v.id === selected
                  ? "#2b7060"
                  : "#8bb4a4";
            const h = flat ? 0 : 35 + (i % 3) * 10;
            return (
              <g
                key={v.id}
                role="button"
                tabIndex={0}
                aria-label={v.name}
                onClick={() => onSelect(v.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(v.id);
                  }
                }}
                className="map-building"
                filter="url(#shadow)"
              >
                <path
                  d={`M${v.x - 48} ${v.y}l53-28 58 28-53 30Z`}
                  fill="#c8d7c5"
                />
                {!flat && (
                  <>
                    <path
                      d={`M${v.x - 41} ${v.y - 8 - h}v${h}l47 24v-${h}Z`}
                      fill={fill}
                    />
                    <path
                      d={`M${v.x + 6} ${v.y + 16 - h}v${h}l50-25v-${h}Z`}
                      fill={occupied ? "#bd934e" : "#639686"}
                    />
                  </>
                )}
                <path
                  d={`M${v.x - 41} ${v.y - 8 - h}l48-24 49 23-50 25Z`}
                  fill={v.id === selected ? "#4e9882" : "#e6eee2"}
                  stroke={fill}
                  strokeWidth="3"
                />
                {!flat &&
                  Array.from({ length: 4 }, (_, n) => (
                    <path
                      key={n}
                      d={`M${v.x - 31 + n * 10} ${v.y - h + 3 + n * 5}v${h - 14}`}
                      stroke="#e5eee5"
                      strokeWidth="3"
                      opacity=".7"
                    />
                  ))}
                <rect
                  x={v.x - 58}
                  y={v.y + 28}
                  width="131"
                  height="24"
                  rx="5"
                  fill="white"
                  opacity=".95"
                />
                <circle cx={v.x - 47} cy={v.y + 40} r="3" fill={fill} />
                <text x={v.x - 37} y={v.y + 44} fontSize="11" fill="#42584b">
                  {v.building}
                </text>
              </g>
            );
          })}
        </g>
        <g transform="translate(714 420)">
          <path d="m0-25-9 27 9-6 9 6Z" fill="#315c4b" />
          <text x="-5" y="-34" fontSize="12" fill="#315c4b">
            N
          </text>
        </g>
      </svg>
      <div className="map-bottom">
        <span>
          <b className="dot green" />
          可申请 <b className="dot amber" />
          已占用 <b className="dot gray" />
          暂停
        </span>
        <div>
          <button
            aria-label="缩小地图"
            onClick={() => setZoom(Math.max(0.8, zoom - 0.15))}
          >
            −
          </button>
          <button onClick={() => setZoom(1)} aria-label="重置视角">
            ⌖
          </button>
          <button
            aria-label="放大地图"
            onClick={() => setZoom(Math.min(1.5, zoom + 0.15))}
          >
            ＋
          </button>
        </div>
      </div>
    </div>
  );
}
