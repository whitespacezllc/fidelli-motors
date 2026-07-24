// Íconos propios del sistema: trazo 1.8, 24px, heredan currentColor.
// Sin librería de íconos: son pocos y así siguen los tokens.

type Props = { className?: string };

function base(props: Props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: props.className ?? "size-6",
  };
}

export function IconoInicio(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.75V21h14V9.75" />
    </svg>
  );
}

export function IconoReloj(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconoClientes(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8" />
      <path d="M17.5 14.7c1.8.7 3 2.3 3 4.8" />
    </svg>
  );
}

export function IconoPlus(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconoMas(props: Props) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function IconoOjo(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconoOjoCerrado(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .4 4.3 1M21.5 12S18 18.5 12 18.5c-1.6 0-3-.4-4.3-1" />
      <path d="M4 4l16 16" />
    </svg>
  );
}
