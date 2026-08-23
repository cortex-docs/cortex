'use client';

import * as React from 'react';
import {
  DirectionProvider as RadixDirectionProvider,
  useDirection,
} from '@radix-ui/react-direction';

function DirectionProvider({
  dir,
  direction,
  children,
}: React.ComponentProps<typeof RadixDirectionProvider> & {
  direction?: React.ComponentProps<typeof RadixDirectionProvider>['dir'];
}) {
  return <RadixDirectionProvider dir={direction ?? dir}>{children}</RadixDirectionProvider>;
}

export { DirectionProvider, useDirection };
