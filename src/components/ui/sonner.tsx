'use client';

import type { ReactNode } from 'react';

interface ToasterProps {
  richColors?: boolean;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  children?: ReactNode;
}

/**
 * Fallback Toaster component.
 *
 * NOTE:
 * The project standard recommends Sonner, but in environments where
 * `sonner` package resolution is unavailable we render a no-op placeholder
 * to keep build/typecheck healthy.
 */
const AppToaster = (props: ToasterProps) => {
  void props;
  return null;
};

export { AppToaster as Toaster };
