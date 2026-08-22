/**
 * BrandMark — HyperTransfer 品牌标(C3): 金边盾形里的 "H" 字标。
 * 用于 Shell / 员工后台 / Landing 头部, 深浅主题自适应。
 */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20 2.5 36 9v11c0 8.6-6.6 14.9-16 17.5C10.6 34.9 4 28.6 4 20V9L20 2.5Z"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14 13.5v13M14 20h12M26 13.5v13"
        stroke="var(--gold)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
