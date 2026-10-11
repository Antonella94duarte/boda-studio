/**
 * ---------------------------------------------------------------------------
 * Piezas comunes de la invitación: revelado al hacer scroll, títulos de
 * sección y un botón de enlace reutilizable.
 * ---------------------------------------------------------------------------
 * Las animaciones se hacen con IntersectionObserver (nada de librerías) y se
 * respetan las preferencias de accesibilidad del teléfono.
 */

import { useEffect, useRef, type ReactNode } from 'react';

/** true si el usuario pidió reducir el movimiento en su sistema. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Agrega la clase `is-visible` al contenedor cuando entra en pantalla.
 * Se usa desde un efecto en el contenedor de la invitación, así una sola
 * observación cubre todas las secciones sin un observer por componente.
 */
export function useRevealOnScroll(deps: readonly unknown[] = []): void {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (nodes.length === 0) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      for (const node of nodes) node.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    for (const node of nodes) {
      // Lo que ya está en pantalla al abrir (la portada) aparece sin esperar.
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) node.classList.add('is-visible');
      else observer.observe(node);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export interface RevealProps {
  children: ReactNode;
  /** Retardo en milisegundos para escalonar la aparición. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'figure';
}

export function Reveal({ children, delay = 0, className = '', as = 'div' }: RevealProps): JSX.Element {
  const Tag = as;
  return (
    <Tag
      className={`reveal ${className}`.trim()}
      data-reveal=""
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export interface SectionShellProps {
  id: string;
  title?: string | undefined;
  eyebrow?: string | undefined;
  className?: string;
  children: ReactNode;
}

/** Contenedor estándar de sección: respira igual en todas partes. */
export function SectionShell({
  id,
  title,
  eyebrow,
  className = '',
  children,
}: SectionShellProps): JSX.Element {
  return (
    <section id={id} className={`section ${className}`.trim()}>
      <div className="section__inner">
        {eyebrow ? <p className="section__eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="section__title">{title}</h2> : null}
        {title ? <span className="ornament" aria-hidden="true" /> : null}
        {children}
      </div>
    </section>
  );
}

/** Botón/enlace con estilo de contorno, usado en eventos y regalos. */
export function OutlineLink({
  href,
  children,
  block = false,
}: {
  href: string;
  children: ReactNode;
  block?: boolean;
}): JSX.Element {
  const isExternal = /^https?:/i.test(href);
  return (
    <a
      className={`invite-btn${block ? ' invite-btn--block' : ''}`}
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
