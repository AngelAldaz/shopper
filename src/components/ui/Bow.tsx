interface Props {
  size?: number
  className?: string
}

/** Moño de la marca. Aparece en los estados vacíos y como sello de la app. */
export function Bow({ size = 48, className }: Props) {
  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 100 62"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M50 31C36 8 5 3 2 22c-3 19 27 27 48 9Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="M50 31c14-23 45-28 48-9 3 19-27 27-48 9Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path d="M44 34c-4 9-9 17-15 24" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M56 34c4 9 9 17 15 24" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="50" cy="31" r="9" fill="currentColor" />
    </svg>
  )
}
